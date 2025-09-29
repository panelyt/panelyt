from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

from sqlalchemy import insert, select, update
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
        if match_config.id:
            clauses.append(models.LabBiomarker.external_id == str(match_config.id))
        if match_config.slug:
            clauses.append(models.LabBiomarker.slug == match_config.slug)
        if len(clauses) <= 1:
            return None
        statement = select(models.LabBiomarker.id).where(*clauses)
        lab_biomarker_id = await self._session.scalar(statement)
        return int(lab_biomarker_id) if lab_biomarker_id is not None else None


def _normalize_identifier(value: str | None) -> str:
    if not value:
        return ""
    text = value.lower()
    text = re.sub(r"[^a-z0-9ąęółśżźćń]+", "-", text)
    return text.strip("-")


__all__ = ["MatchingSynchronizer"]
