#!/usr/bin/env python3
"""
Import biomarker aliases from a JSON file.

Usage: uv run scripts/import_aliases.py <aliases_file.json>

The JSON file should have the following format:
{
  "biomarker_name_or_elab_code": {
    "aliases": [
      {"alias": "alternative_name", "type": "common_name", "priority": 1},
      {"alias": "another_name", "type": "translation", "priority": 2}
    ]
  },
  ...
}
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from panelyt_api.core.settings import get_settings
from panelyt_api.db.session import get_session
from panelyt_api.db.models import Biomarker, BiomarkerAlias


async def find_biomarker(session: AsyncSession, identifier: str) -> Biomarker | None:
    """Find biomarker by name or elab_code."""
    # First try exact matches
    stmt = select(Biomarker).where(
        (Biomarker.name == identifier)
        | (Biomarker.elab_code == identifier)
        | (Biomarker.slug == identifier)
    )
    result = await session.execute(stmt)
    biomarkers = result.scalars().all()

    if len(biomarkers) == 1:
        return biomarkers[0]
    elif len(biomarkers) > 1:
        print(f"  Warning: Multiple exact matches for '{identifier}': {[b.name for b in biomarkers[:3]]}{'...' if len(biomarkers) > 3 else ''}")
        # Return the first exact match
        return biomarkers[0]

    # If no exact match, try case-insensitive exact matches
    stmt = select(Biomarker).where(
        (Biomarker.name.ilike(identifier))
        | (Biomarker.elab_code.ilike(identifier))
        | (Biomarker.slug.ilike(identifier))
    )
    result = await session.execute(stmt)
    biomarkers = result.scalars().all()

    if len(biomarkers) == 1:
        return biomarkers[0]
    elif len(biomarkers) > 1:
        print(f"  Warning: Multiple biomarkers found for '{identifier}': {[b.name for b in biomarkers[:3]]}{'...' if len(biomarkers) > 3 else ''}")
        # Return the first exact name match if available
        for biomarker in biomarkers:
            if biomarker.name.lower() == identifier.lower():
                return biomarker
        # Otherwise return the first match
        return biomarkers[0]

    return None


async def import_aliases_for_biomarker(
    session: AsyncSession, biomarker: Biomarker, aliases_data: List[Dict[str, Any]]
) -> None:
    """Import aliases for a specific biomarker."""
    for alias_data in aliases_data:
        alias_text = alias_data["alias"]
        alias_type = alias_data.get("type", "common_name")
        priority = alias_data.get("priority", 1)

        # Check if alias already exists
        existing_stmt = select(BiomarkerAlias).where(
            (BiomarkerAlias.biomarker_id == biomarker.id)
            & (BiomarkerAlias.alias == alias_text)
        )
        existing = await session.execute(existing_stmt)
        if existing.scalar_one_or_none():
            print(f"  Alias '{alias_text}' already exists for {biomarker.name}, skipping")
            continue

        # Create new alias
        new_alias = BiomarkerAlias(
            biomarker_id=biomarker.id,
            alias=alias_text,
            alias_type=alias_type,
            priority=priority,
        )
        session.add(new_alias)
        print(f"  Added alias '{alias_text}' ({alias_type}) for {biomarker.name}")


async def import_aliases(aliases_file: Path) -> None:
    """Import aliases from JSON file."""
    if not aliases_file.exists():
        print(f"Error: File {aliases_file} does not exist")
        sys.exit(1)

    try:
        with open(aliases_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON file: {e}")
        sys.exit(1)

    async with get_session() as session:
        total_processed = 0
        total_added = 0

        for biomarker_identifier, biomarker_data in data.items():
            biomarker = await find_biomarker(session, biomarker_identifier)
            if not biomarker:
                print(f"Warning: Biomarker '{biomarker_identifier}' not found, skipping")
                continue

            print(f"Processing aliases for {biomarker.name} (ID: {biomarker.id})")
            aliases_data = biomarker_data.get("aliases", [])

            if not aliases_data:
                print(f"  No aliases defined for {biomarker.name}")
                continue

            await import_aliases_for_biomarker(session, biomarker, aliases_data)
            total_processed += 1
            total_added += len(aliases_data)

        print(f"\nSuccess! Processed {total_processed} biomarkers, added {total_added} aliases")


async def main() -> None:
    """Main entry point."""
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    aliases_file = Path(sys.argv[1])
    await import_aliases(aliases_file)


if __name__ == "__main__":
    asyncio.run(main())