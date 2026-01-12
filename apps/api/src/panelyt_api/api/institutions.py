from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from panelyt_api.api.deps import SessionDep
from panelyt_api.db import models
from panelyt_api.ingest.client import DiagClient
from panelyt_api.schemas.institutions import (
    InstitutionOut,
    InstitutionSearchResponse,
)

router = APIRouter()


@router.get("/institutions/search", response_model=InstitutionSearchResponse)
async def search_institutions(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
) -> InstitutionSearchResponse:
    client = DiagClient()
    try:
        institutions = await client.search_institutions(q, page=page, limit=limit)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502, detail="Upstream institution search failed"
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503, detail="Institution search unavailable"
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503, detail="Institution search unavailable"
        ) from exc
    finally:
        await client.close()

    return InstitutionSearchResponse(
        results=[
            InstitutionOut(
                id=entry.id,
                name=entry.name,
                city=entry.city,
                address=entry.address,
            )
            for entry in institutions
        ]
    )


@router.get("/institutions/{institution_id}", response_model=InstitutionOut)
async def get_institution(
    institution_id: int,
    session: SessionDep,
) -> InstitutionOut:
    result = await session.execute(
        select(models.Institution).where(models.Institution.id == institution_id)
    )
    institution = result.scalar_one_or_none()
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")

    return InstitutionOut(
        id=institution.id,
        name=institution.name,
        city=institution.city,
        address=institution.address,
    )
