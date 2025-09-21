#!/usr/bin/env python3
"""
Generate complete aliases JSON file with all biomarkers from the database.
"""

import asyncio
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.db.session import get_session
from panelyt_api.db.models import Biomarker


async def generate_complete_aliases() -> None:
    """Generate complete aliases JSON with all biomarkers."""
    async with get_session() as session:
        # Get all biomarkers
        stmt = select(Biomarker).order_by(Biomarker.name)
        result = await session.execute(stmt)
        biomarkers = result.scalars().all()

        # Create aliases dict
        aliases_dict = {}
        for biomarker in biomarkers:
            aliases_dict[biomarker.name] = {"aliases": []}

        print(f"Found {len(biomarkers)} biomarkers")

        # Write to file
        output_path = Path("data/core_aliases.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(aliases_dict, f, ensure_ascii=False, indent=2)

        print(f"Generated complete aliases file with {len(biomarkers)} biomarkers at {output_path}")


if __name__ == "__main__":
    asyncio.run(generate_complete_aliases())