from __future__ import annotations

import asyncio

from sqlalchemy import delete, select

from panelyt_api.db import models
from panelyt_api.db.session import get_session
from panelyt_api.matching import load_config


def _allowed_slugs() -> set[str]:
    config = load_config()
    slugs: set[str] = set()
    for biom in config.biomarkers:
        if biom.slug:
            slugs.add(biom.slug.lower())
    return slugs


async def purge_unknown() -> None:
    allowed = _allowed_slugs()
    async with get_session() as session:
        rows = await session.execute(
            select(models.Biomarker.id, models.Biomarker.slug)
            .where(models.Biomarker.slug.is_not(None))
        )
        extras = [row for row in rows.all() if row.slug.lower() not in allowed]

        if not extras:
            print("No extraneous biomarkers found.")
            return

        print(f"Deleting {len(extras)} extraneous biomarkers…")
        for row in extras[:25]:
            print(f" - {row.id}: {row.slug}")
        if len(extras) > 25:
            print(" …")

        ids = [row.id for row in extras]
        await session.execute(
            delete(models.Biomarker).where(models.Biomarker.id.in_(ids))
        )
        await session.commit()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(purge_unknown())
