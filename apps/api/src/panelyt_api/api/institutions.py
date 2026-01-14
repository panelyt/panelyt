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
                slug=entry.slug,
                city_slug=entry.city_slug,
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
    should_refresh = institution is None or not institution.city
    if should_refresh:
        client = DiagClient()
        fetched: InstitutionOut | None = None
        try:
            external = await client.get_institution(institution_id)
            if external is not None:
                fetched = InstitutionOut(
                    id=external.id,
                    name=external.name,
                    city=external.city,
                    address=external.address,
                )
        except httpx.HTTPStatusError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                if institution is None:
                    raise HTTPException(
                        status_code=404, detail="Institution not found"
                    ) from exc
            elif institution is None:
                raise HTTPException(
                    status_code=502, detail="Upstream institution lookup failed"
                ) from exc
        except httpx.HTTPError as exc:
            if institution is None:
                raise HTTPException(
                    status_code=503, detail="Institution lookup unavailable"
                ) from exc
        finally:
            await client.close()

        if fetched is not None:
            if institution is None:
                institution = models.Institution(
                    id=fetched.id,
                    name=fetched.name,
                    city=fetched.city,
                    address=fetched.address,
                )
                session.add(institution)
            else:
                institution.name = fetched.name
                institution.city = fetched.city
                institution.address = fetched.address
            await session.flush()

    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")

    return InstitutionOut(
        id=institution.id,
        name=institution.name,
        city=institution.city,
        address=institution.address,
        slug=None,
        city_slug=None,
    )
