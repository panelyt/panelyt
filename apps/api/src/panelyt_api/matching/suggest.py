from __future__ import annotations

import difflib
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db import models


async def suggest_lab_matches(
    session: AsyncSession,
    lab_code: str,
    *,
    limit: int = 5,
) -> list[dict[str, Any]]:
    lab_id = await session.scalar(
        select(models.Lab.id).where(func.lower(models.Lab.code) == lab_code.lower())
    )
    if lab_id is None:
        raise ValueError(f"Unknown lab code: {lab_code}")

    unmatched_stmt = (
        select(models.LabBiomarker.id, models.LabBiomarker.name)
        .outerjoin(
            models.BiomarkerMatch,
            models.BiomarkerMatch.lab_biomarker_id == models.LabBiomarker.id,
        )
        .where(models.LabBiomarker.lab_id == lab_id)
        .where(models.BiomarkerMatch.id.is_(None))
    )
    unmatched_rows = (await session.execute(unmatched_stmt)).all()

    candidate_labels = await _load_candidate_labels(session)

    suggestions: list[dict[str, Any]] = []
    for lab_biomarker_id, lab_name in unmatched_rows:
        ranked = _rank_candidates(lab_name, candidate_labels, limit)
        suggestions.append(
            {
                "lab_biomarker_id": lab_biomarker_id,
                "lab_name": lab_name,
                "candidates": ranked,
            }
        )
    return suggestions


async def _load_candidate_labels(session: AsyncSession) -> list[tuple[int, str]]:
    biomarker_stmt = select(models.Biomarker.id, models.Biomarker.name)
    alias_stmt = select(models.BiomarkerAlias.biomarker_id, models.BiomarkerAlias.alias)

    biomarker_rows = (await session.execute(biomarker_stmt)).all()
    alias_rows = (await session.execute(alias_stmt)).all()

    candidates: list[tuple[int, str]] = []
    for biomarker_id, name in biomarker_rows:
        candidates.append((int(biomarker_id), name))
    for biomarker_id, alias in alias_rows:
        candidates.append((int(biomarker_id), alias))
    return candidates


def _rank_candidates(
    lab_name: str,
    candidates: list[tuple[int, str]],
    limit: int,
) -> list[dict[str, Any]]:
    scores: list[tuple[float, tuple[int, str]]] = []
    base = lab_name.lower()
    for biomarker_id, candidate_label in candidates:
        ratio = difflib.SequenceMatcher(None, base, candidate_label.lower()).ratio()
        if ratio > 0:
            scores.append((ratio, (biomarker_id, candidate_label)))
    scores.sort(reverse=True, key=lambda item: item[0])
    ranked: list[dict[str, Any]] = []
    for score, (biomarker_id, label) in scores[:limit]:
        ranked.append({"biomarker_id": biomarker_id, "label": label, "score": round(score, 4)})
    return ranked


__all__ = ["suggest_lab_matches"]
