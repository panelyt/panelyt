from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.matching.config import BiomarkerConfig, LabMatchConfig, MatchingConfig

logger = logging.getLogger(__name__)


class MatchingSynchronizer:
    def __init__(self, session: AsyncSession, config: MatchingConfig) -> None:
        self._session = session
        self._config = config

    async def apply(self) -> None:
        lab_ids = await self._load_lab_ids()
        for biomarker_config in self._config.biomarkers:
            biomarker_id = await self._ensure_biomarker(biomarker_config)
            await self._merge_replacements(biomarker_id, biomarker_config)
            await self._sync_aliases(biomarker_id, biomarker_config)
            await self._sync_lab_matches(biomarker_id, biomarker_config, lab_ids)

    async def _load_lab_ids(self) -> dict[str, int]:
        statement = select(models.Lab.code, models.Lab.id)
        rows = await self._session.execute(statement)
        return {code: lab_id for code, lab_id in rows.all()}

    async def _ensure_biomarker(self, config: BiomarkerConfig) -> int:
        slug = config.slug or _normalize_identifier(config.code) or config.code
        candidate = await self._session.scalar(
            select(models.Biomarker).where(models.Biomarker.slug == slug)
        )

        if candidate is None:
            stmt = (
                insert(models.Biomarker)
                .values(
                    slug=slug,
                    name=config.name,
                )
                .returning(models.Biomarker.id)
            )
            return int(await self._session.scalar(stmt))

        update_values: dict[str, str | None] = {}
        if candidate.slug != slug:
            update_values["slug"] = slug
        if candidate.name != config.name:
            update_values["name"] = config.name
        if update_values:
            update_stmt = (
                update(models.Biomarker)
                .where(models.Biomarker.id == candidate.id)
                .values(**update_values)
            )
            await self._session.execute(update_stmt)
        return int(candidate.id)

    async def _merge_replacements(self, biomarker_id: int, config: BiomarkerConfig) -> None:
        if not config.replaces:
            return
        for entry in config.replaces:
            slug_hint = (entry or "").strip()
            if not slug_hint:
                continue
            replacement = await self._session.scalar(
                select(models.Biomarker).where(models.Biomarker.slug == slug_hint)
            )
            if replacement is None:
                normalized = _normalize_identifier(slug_hint)
                if normalized:
                    replacement = await self._session.scalar(
                        select(models.Biomarker).where(models.Biomarker.slug == normalized)
                    )
            if replacement is None:
                logger.debug(
                    "Merge target '%s' for biomarker '%s' not found; skipping",
                    slug_hint,
                    config.code,
                )
                continue
            if int(replacement.id) == biomarker_id:
                continue

            await self._reassign_biomarker(replacement, biomarker_id)
            await self._session.execute(
                delete(models.Biomarker).where(models.Biomarker.id == replacement.id)
            )

    async def _reassign_biomarker(
        self, source: models.Biomarker, target_id: int
    ) -> None:
        source_id = int(source.id)
        tables = [
            (models.ItemBiomarker, models.ItemBiomarker.biomarker_id),
            (models.BiomarkerMatch, models.BiomarkerMatch.biomarker_id),
            (models.SavedListEntry, models.SavedListEntry.biomarker_id),
            (models.BiomarkerListTemplateEntry, models.BiomarkerListTemplateEntry.biomarker_id),
        ]
        for table, column in tables:
            stmt = update(table).where(column == source_id).values({column: target_id})
            await self._session.execute(stmt)

        alias_rows = (
            await self._session.execute(
                select(models.BiomarkerAlias.id, models.BiomarkerAlias.alias).where(
                    models.BiomarkerAlias.biomarker_id == source_id
                )
            )
        ).all()
        for alias_id, alias_text in alias_rows:
            if not alias_text:
                await self._session.execute(
                    delete(models.BiomarkerAlias).where(models.BiomarkerAlias.id == alias_id)
                )
                continue
            existing = await self._session.scalar(
                select(models.BiomarkerAlias.id).where(
                    models.BiomarkerAlias.biomarker_id == target_id,
                    func.lower(models.BiomarkerAlias.alias) == alias_text.lower(),
                )
            )
            if existing is not None:
                await self._session.execute(
                    delete(models.BiomarkerAlias).where(models.BiomarkerAlias.id == alias_id)
                )
            else:
                await self._session.execute(
                    update(models.BiomarkerAlias)
                    .where(models.BiomarkerAlias.id == alias_id)
                    .values(biomarker_id=target_id)
                )

        await self._add_alias_if_missing(target_id, source.name, alias_type="merge-name")
        await self._add_alias_if_missing(target_id, source.slug, alias_type="merge-slug")
        if source.elab_code:
            await self._add_alias_if_missing(target_id, source.elab_code, alias_type="merge-elab")

    async def _add_alias_if_missing(
        self, biomarker_id: int, alias: str | None, *, alias_type: str = "merge"
    ) -> None:
        if not alias:
            return
        cleaned = alias.strip()
        if not cleaned:
            return
        exists = await self._session.scalar(
            select(models.BiomarkerAlias.id).where(
                models.BiomarkerAlias.biomarker_id == biomarker_id,
                func.lower(models.BiomarkerAlias.alias) == cleaned.lower(),
            )
        )
        if exists is not None:
            return
        stmt = insert(models.BiomarkerAlias).values(
            {
                "biomarker_id": biomarker_id,
                "alias": cleaned,
                "alias_type": alias_type,
                "priority": 1,
            }
        )
        await self._session.execute(stmt)

    async def _sync_aliases(self, biomarker_id: int, config: BiomarkerConfig) -> None:
        if not config.aliases:
            return
        statement = select(models.BiomarkerAlias.alias).where(
            models.BiomarkerAlias.biomarker_id == biomarker_id
        )
        existing = {alias for (alias,) in (await self._session.execute(statement)).all()}
        new_aliases = [alias for alias in config.aliases if alias not in existing]
        if not new_aliases:
            return
        insert_stmt = insert(models.BiomarkerAlias).values(
            [
                {
                    "biomarker_id": biomarker_id,
                    "alias": alias,
                    "alias_type": "manual",
                    "priority": 1,
                }
                for alias in new_aliases
            ]
        )
        await self._session.execute(insert_stmt)

    async def _sync_lab_matches(
        self,
        biomarker_id: int,
        config: BiomarkerConfig,
        lab_ids: dict[str, int],
    ) -> None:
        for lab_code, matches in config.labs.items():
            lab_id = lab_ids.get(lab_code)
            if lab_id is None:
                logger.warning("Skipping matches for unknown lab '%s'", lab_code)
                continue
            for match_config in matches:
                await self._apply_match(biomarker_id, lab_id, lab_code, match_config)

    async def _apply_match(
        self,
        biomarker_id: int,
        lab_id: int,
        lab_code: str,
        match_config: LabMatchConfig,
    ) -> None:
        lab_biomarker_id = await self._resolve_lab_biomarker_id(lab_id, match_config)
        if lab_biomarker_id is None:
            logger.warning(
                "Unable to match biomarker %s for lab %s: no lab biomarker found",
                biomarker_id,
                lab_code,
            )
            return

        existing_id = await self._session.scalar(
            select(models.BiomarkerMatch.id).where(
                models.BiomarkerMatch.lab_biomarker_id == lab_biomarker_id
            )
        )

        payload = {
            "biomarker_id": biomarker_id,
            "match_type": "manual-config",
            "status": "accepted",
            "confidence": 1.0,
            "notes": None,
            "updated_at": datetime.now(UTC),
        }

        if existing_id is None:
            insert_stmt = insert(models.BiomarkerMatch).values(
                {
                    **payload,
                    "lab_biomarker_id": lab_biomarker_id,
                    "created_at": datetime.now(UTC),
                }
            )
            await self._session.execute(insert_stmt)
        else:
            update_stmt = (
                update(models.BiomarkerMatch)
                .where(models.BiomarkerMatch.id == existing_id)
                .values(payload)
            )
            await self._session.execute(update_stmt)

    async def _resolve_lab_biomarker_id(
        self, lab_id: int, match_config: LabMatchConfig
    ) -> int | None:
        clauses = [models.LabBiomarker.lab_id == lab_id]

        # Try the most specific keys first so we prefer explicit identifiers, but
        # gracefully fall back when a lab rotates item IDs without touching slugs.
        candidate_clauses = []
        if match_config.id:
            candidate_clauses.append(
                models.LabBiomarker.external_id == str(match_config.id)
            )
        if match_config.slug:
            candidate_clauses.append(models.LabBiomarker.slug == match_config.slug)

        for extra_clause in candidate_clauses:
            statement = select(models.LabBiomarker.id).where(*clauses, extra_clause)
            lab_biomarker_id = await self._session.scalar(statement)
            if lab_biomarker_id is not None:
                return int(lab_biomarker_id)

        return None


def _normalize_identifier(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"[^a-z0-9ąęółśżźćń]+", "-", text)
    return text.strip("-")


__all__ = ["MatchingSynchronizer"]
