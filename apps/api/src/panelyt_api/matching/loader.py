from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

from sqlalchemy import bindparam, delete, func, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.matching.config import BiomarkerConfig, LabMatchConfig, MatchingConfig

logger = logging.getLogger(__name__)
_MATCHING_CONFIG_SETTING = "matching_config_hash"


class MatchingSynchronizer:
    def __init__(self, session: AsyncSession, config: MatchingConfig) -> None:
        self._session = session
        self._config = config

    async def apply(self) -> None:
        if not self._config.biomarkers:
            return

        lab_ids = await self._load_lab_ids()
        plans = [(config, self._slug_for_config(config)) for config in self._config.biomarkers]
        slugs = [slug for _, slug in plans]
        existing_biomarkers = await self._load_biomarkers(slugs)

        missing_rows = [
            {"slug": slug, "name": config.name}
            for config, slug in plans
            if slug not in existing_biomarkers
        ]
        if missing_rows:
            await self._session.execute(insert(models.Biomarker).values(missing_rows))
            existing_biomarkers = await self._load_biomarkers(slugs)

        update_rows = [
            {"id": biomarker.id, "name": config.name}
            for config, slug in plans
            if (biomarker := existing_biomarkers.get(slug)) is not None
            and biomarker.name != config.name
        ]
        if update_rows:
            update_stmt = (
                update(models.Biomarker)
                .where(models.Biomarker.id == bindparam("id"))
                .values(name=bindparam("name"))
            )
            await self._session.execute(update_stmt, update_rows)

        biomarker_ids = {
            slug: biomarker.id for slug, biomarker in existing_biomarkers.items()
        }
        for config, slug in plans:
            biomarker_id = int(biomarker_ids[slug])
            await self._merge_replacements(biomarker_id, config)

        existing_aliases = await self._load_aliases(list(biomarker_ids.values()))
        alias_rows = []
        for config, slug in plans:
            biomarker_id = int(biomarker_ids[slug])
            for alias in config.aliases:
                alias_key = (biomarker_id, alias.lower())
                if alias_key in existing_aliases:
                    continue
                alias_rows.append(
                    {
                        "biomarker_id": biomarker_id,
                        "alias": alias,
                        "alias_type": "manual",
                        "priority": 1,
                    }
                )
                existing_aliases.add(alias_key)
        if alias_rows:
            await self._session.execute(insert(models.BiomarkerAlias).values(alias_rows))

        desired_matches = await self._build_desired_matches(plans, biomarker_ids, lab_ids)
        if not desired_matches:
            return

        existing_matches = await self._load_existing_matches(list(desired_matches.keys()))
        now = datetime.now(UTC)
        insert_rows = []
        update_rows = []
        for lab_biomarker_id, biomarker_id in desired_matches.items():
            payload = {
                "biomarker_id": biomarker_id,
                "match_type": "manual-config",
                "status": "accepted",
                "confidence": 1.0,
                "notes": None,
                "updated_at": now,
            }
            existing_id = existing_matches.get(lab_biomarker_id)
            if existing_id is None:
                insert_rows.append(
                    {
                        **payload,
                        "lab_biomarker_id": lab_biomarker_id,
                        "created_at": now,
                    }
                )
            else:
                update_rows.append({"id": existing_id, **payload})

        if insert_rows:
            await self._session.execute(insert(models.BiomarkerMatch).values(insert_rows))
        if update_rows:
            update_stmt = (
                update(models.BiomarkerMatch)
                .where(models.BiomarkerMatch.id == bindparam("id"))
                .values(
                    biomarker_id=bindparam("biomarker_id"),
                    match_type="manual-config",
                    status="accepted",
                    confidence=1.0,
                    notes=None,
                    updated_at=bindparam("updated_at"),
                )
            )
            await self._session.execute(update_stmt, update_rows)

    async def _load_lab_ids(self) -> dict[str, int]:
        statement = select(models.Lab.code, models.Lab.id)
        rows = await self._session.execute(statement)
        return {code: lab_id for code, lab_id in rows.all()}

    @staticmethod
    def _slug_for_config(config: BiomarkerConfig) -> str:
        return config.slug or _normalize_identifier(config.code) or config.code

    async def _load_biomarkers(self, slugs: list[str]) -> dict[str, models.Biomarker]:
        if not slugs:
            return {}
        statement = select(models.Biomarker).where(models.Biomarker.slug.in_(slugs))
        rows = (await self._session.execute(statement)).scalars().all()
        return {row.slug: row for row in rows}

    async def _load_aliases(self, biomarker_ids: list[int]) -> set[tuple[int, str]]:
        if not biomarker_ids:
            return set()
        statement = select(models.BiomarkerAlias.biomarker_id, models.BiomarkerAlias.alias).where(
            models.BiomarkerAlias.biomarker_id.in_(biomarker_ids)
        )
        rows = (await self._session.execute(statement)).all()
        return {(int(biomarker_id), alias.lower()) for biomarker_id, alias in rows if alias}

    async def _load_lab_biomarker_index(
        self,
        lab_ids: set[int],
        external_ids: set[str],
        slugs: set[str],
    ) -> tuple[dict[tuple[int, str], int], dict[tuple[int, str], int]]:
        if not lab_ids or (not external_ids and not slugs):
            return {}, {}

        clauses = [models.LabBiomarker.lab_id.in_(lab_ids)]
        if external_ids and slugs:
            clauses.append(
                or_(
                    models.LabBiomarker.external_id.in_(external_ids),
                    models.LabBiomarker.slug.in_(slugs),
                )
            )
        elif external_ids:
            clauses.append(models.LabBiomarker.external_id.in_(external_ids))
        else:
            clauses.append(models.LabBiomarker.slug.in_(slugs))

        statement = select(
            models.LabBiomarker.id,
            models.LabBiomarker.lab_id,
            models.LabBiomarker.external_id,
            models.LabBiomarker.slug,
        ).where(*clauses)
        rows = (await self._session.execute(statement)).all()

        by_external: dict[tuple[int, str], int] = {}
        by_slug: dict[tuple[int, str], int] = {}
        for lab_biomarker_id, lab_id, external_id, slug in rows:
            if external_id:
                by_external[(int(lab_id), str(external_id))] = int(lab_biomarker_id)
            if slug:
                by_slug[(int(lab_id), str(slug))] = int(lab_biomarker_id)
        return by_external, by_slug

    async def _load_existing_matches(self, lab_biomarker_ids: list[int]) -> dict[int, int]:
        if not lab_biomarker_ids:
            return {}
        statement = select(
            models.BiomarkerMatch.id, models.BiomarkerMatch.lab_biomarker_id
        ).where(models.BiomarkerMatch.lab_biomarker_id.in_(lab_biomarker_ids))
        rows = (await self._session.execute(statement)).all()
        return {int(lab_biomarker_id): int(match_id) for match_id, lab_biomarker_id in rows}

    async def _build_desired_matches(
        self,
        plans: list[tuple[BiomarkerConfig, str]],
        biomarker_ids: dict[str, int],
        lab_ids: dict[str, int],
    ) -> dict[int, int]:
        match_plans = []
        external_ids: set[str] = set()
        slugs: set[str] = set()
        used_lab_ids: set[int] = set()

        for config, slug in plans:
            biomarker_id = int(biomarker_ids[slug])
            for lab_code, matches in config.labs.items():
                lab_id = lab_ids.get(lab_code)
                if lab_id is None:
                    logger.warning("Skipping matches for unknown lab '%s'", lab_code)
                    continue

                expanded = list(matches)
                existing_keys = {(entry.id or "", entry.slug or "") for entry in expanded}

                candidate_slugs: set[str] = set()
                if config.slug:
                    candidate_slugs.add(config.slug)
                name_slug = _normalize_identifier(config.name)
                if name_slug:
                    candidate_slugs.add(name_slug)
                for alias in config.aliases:
                    alias_slug = _normalize_identifier(alias)
                    if alias_slug:
                        candidate_slugs.add(alias_slug)

                for candidate_slug in candidate_slugs:
                    if ("", candidate_slug) in existing_keys:
                        continue
                    expanded.append(LabMatchConfig(slug=candidate_slug))
                    existing_keys.add(("", candidate_slug))

                for index, match_config in enumerate(expanded):
                    match_plans.append(
                        (biomarker_id, lab_id, lab_code, match_config, index < len(matches))
                    )
                    used_lab_ids.add(lab_id)
                    if match_config.id:
                        external_ids.add(str(match_config.id))
                    if match_config.slug:
                        slugs.add(match_config.slug)

        by_external, by_slug = await self._load_lab_biomarker_index(
            used_lab_ids, external_ids, slugs
        )

        desired: dict[int, int] = {}
        for biomarker_id, lab_id, lab_code, match_config, log_missing in match_plans:
            lab_biomarker_id = None
            if match_config.id:
                lab_biomarker_id = by_external.get((lab_id, str(match_config.id)))
            if lab_biomarker_id is None and match_config.slug:
                lab_biomarker_id = by_slug.get((lab_id, match_config.slug))
            if lab_biomarker_id is None:
                if log_missing:
                    logger.warning(
                        "Unable to match biomarker %s for lab %s: no lab biomarker found",
                        biomarker_id,
                        lab_code,
                    )
                continue
            desired[int(lab_biomarker_id)] = int(biomarker_id)
        return desired

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
            expanded = list(matches)
            existing_keys = {
                (entry.id or "", entry.slug or "") for entry in expanded
            }

            candidate_slugs: set[str] = set()
            if config.slug:
                candidate_slugs.add(config.slug)
            name_slug = _normalize_identifier(config.name)
            if name_slug:
                candidate_slugs.add(name_slug)
            for alias in config.aliases:
                alias_slug = _normalize_identifier(alias)
                if alias_slug:
                    candidate_slugs.add(alias_slug)

            for slug in candidate_slugs:
                if ("", slug) in existing_keys:
                    continue
                expanded.append(LabMatchConfig(slug=slug))
                existing_keys.add(("", slug))

            for index, match_config in enumerate(expanded):
                await self._apply_match(
                    biomarker_id,
                    lab_id,
                    lab_code,
                    match_config,
                    log_missing=index < len(matches),
                )

    async def _apply_match(
        self,
        biomarker_id: int,
        lab_id: int,
        lab_code: str,
        match_config: LabMatchConfig,
        *,
        log_missing: bool = True,
    ) -> None:
        lab_biomarker_id = await self._resolve_lab_biomarker_id(lab_id, match_config)
        if lab_biomarker_id is None:
            if log_missing:
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


async def apply_matching_if_needed(
    session: AsyncSession,
    config: MatchingConfig,
    config_digest: str,
) -> bool:
    if not config.biomarkers:
        return False

    existing = await session.scalar(
        select(models.AppSetting.value).where(models.AppSetting.name == _MATCHING_CONFIG_SETTING)
    )
    if existing == config_digest:
        return False

    synchronizer = MatchingSynchronizer(session, config)
    await synchronizer.apply()

    now = datetime.now(UTC)
    setting = await session.get(models.AppSetting, _MATCHING_CONFIG_SETTING)
    if setting is None:
        session.add(
            models.AppSetting(name=_MATCHING_CONFIG_SETTING, value=config_digest, updated_at=now)
        )
    else:
        setting.value = config_digest
        setting.updated_at = now
    return True


def _normalize_identifier(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"[^a-z0-9ąęółśżźćń]+", "-", text)
    return text.strip("-")


__all__ = ["MatchingSynchronizer", "apply_matching_if_needed"]
