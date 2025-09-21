#!/usr/bin/env python3
"""Script to manually run data ingestion from diag.pl API."""

import asyncio
import logging

from panelyt_api.core.settings import get_settings
from panelyt_api.ingest.service import IngestionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    """Run the ingestion process."""
    logger.info("Starting manual ingestion run...")

    settings = get_settings()
    service = IngestionService(settings)

    try:
        await service.run(reason="manual_initial_setup")
        logger.info("Ingestion completed successfully!")
    except Exception as e:
        logger.error("Ingestion failed: %s", e)
        raise


if __name__ == "__main__":
    asyncio.run(main())