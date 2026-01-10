from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models
from panelyt_api.optimization.context import ResolvedBiomarker
from panelyt_api.utils.normalization import normalize_token


@dataclass(slots=True)
class NormalizedInput:
    raw: str
    normalized: str


class _CodeEntry(Protocol):
    code: str


class BiomarkerResolver:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def resolve_tokens(
        self, inputs: Sequence[str]
    ) -> tuple[list[ResolvedBiomarker], list[str]]:
        normalized_inputs = self._normalize_inputs(inputs)
        if not normalized_inputs:
            return [], []

        search_tokens = {entry.normalized for entry in normalized_inputs}
        rows = await self._fetch_biomarkers(search_tokens)
        token_index = self._build_biomarker_token_index(rows, search_tokens)

        resolved: list[ResolvedBiomarker] = []
        unresolved: list[str] = []
        for entry in normalized_inputs:
            biomarker = self._pick_biomarker(token_index, entry.normalized)
            if biomarker is None:
                unresolved.append(entry.raw)
                continue
            resolved.append(self._build_resolved_biomarker(biomarker, entry.raw))

        return resolved, unresolved

    async def resolve_for_list_entries(self, entries: Sequence[_CodeEntry]) -> dict[str, int]:
        codes = [entry.code for entry in entries]
        resolved, _ = await self.resolve_tokens(codes)
        mapping: dict[str, int] = {}
        for entry in resolved:
            normalized = normalize_token(entry.original)
            if normalized:
                mapping[normalized] = entry.id
        return mapping

    @staticmethod
    def _normalize_inputs(inputs: Sequence[str]) -> list[NormalizedInput]:
        normalized: list[NormalizedInput] = []
        for raw in inputs:
            token = normalize_token(raw)
            if token:
                normalized.append(NormalizedInput(raw=raw, normalized=token))
        return normalized

    async def _fetch_biomarkers(
        self, search_tokens: set[str]
    ) -> list[tuple[models.Biomarker, str | None]]:
        if not search_tokens:
            return []
        statement = (
            select(models.Biomarker, models.BiomarkerAlias.alias)
            .outerjoin(
                models.BiomarkerAlias,
                models.BiomarkerAlias.biomarker_id == models.Biomarker.id,
            )
            .where(
                or_(
                    func.lower(models.Biomarker.elab_code).in_(search_tokens),
                    func.lower(models.Biomarker.slug).in_(search_tokens),
                    func.lower(models.Biomarker.name).in_(search_tokens),
                    func.lower(models.BiomarkerAlias.alias).in_(search_tokens),
                )
            )
        )
        rows = (await self._session.execute(statement)).all()
        return [(row[0], row[1]) for row in rows]

    def _build_biomarker_token_index(
        self,
        rows: Sequence[tuple[models.Biomarker, str | None]],
        search_tokens: set[str],
    ) -> dict[str, list[tuple[int, models.Biomarker]]]:
        token_index: dict[str, list[tuple[int, models.Biomarker]]] = {}
        seen: set[tuple[str, int, int]] = set()
        for biomarker, alias in rows:
            candidate_sources = (
                (0, biomarker.elab_code),
                (1, biomarker.slug),
                (2, alias),
                (3, biomarker.name),
            )
            for priority, candidate in candidate_sources:
                normalized = normalize_token(candidate)
                if not normalized or normalized not in search_tokens:
                    continue
                key = (normalized, int(biomarker.id), priority)
                if key in seen:
                    continue
                token_index.setdefault(normalized, []).append((priority, biomarker))
                seen.add(key)

        for candidates in token_index.values():
            candidates.sort(key=lambda item: (item[0], item[1].id))
        return token_index

    @staticmethod
    def _pick_biomarker(
        token_index: dict[str, list[tuple[int, models.Biomarker]]],
        token: str,
    ) -> models.Biomarker | None:
        candidates = token_index.get(token)
        if not candidates:
            return None
        return candidates[0][1]

    @staticmethod
    def _build_resolved_biomarker(
        biomarker: models.Biomarker, original: str
    ) -> ResolvedBiomarker:
        token = biomarker.elab_code or biomarker.slug or biomarker.name
        return ResolvedBiomarker(
            id=int(biomarker.id),
            token=token or original,
            display_name=biomarker.name,
            original=original,
        )


__all__ = ["BiomarkerResolver"]
