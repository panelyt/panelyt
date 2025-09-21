#!/bin/bash
set -e

echo "🚀 Starting Panelyt API..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until uv run python -c "
import asyncio
from panelyt_api.db.session import get_session

async def check_db():
    try:
        async with get_session():
            print('Database connection successful')
    except Exception as e:
        raise e

asyncio.run(check_db())
" 2>/dev/null; do
    echo "Database is unavailable - sleeping"
    sleep 1
done

echo "✅ Database connection established"

# Run migrations
echo "🔄 Running database migrations..."
uv run alembic upgrade head

echo "✅ Migrations completed"

# Check if database is empty and run initial ingestion
echo "🔍 Checking if initial data ingestion is needed..."
BIOMARKER_COUNT=$(uv run python -c "
import asyncio
from sqlalchemy import func, select
from panelyt_api.db.session import get_session
from panelyt_api.db.models import Biomarker

async def check():
    try:
        async with get_session() as session:
            result = await session.scalar(select(func.count()).select_from(Biomarker))
            print(result or 0)
    except Exception:
        print(0)

asyncio.run(check())
")

if [ "$BIOMARKER_COUNT" = "0" ]; then
    echo "📥 Database is empty. Running initial data ingestion..."
    uv run scripts/run_ingestion.py
    echo "✅ Initial ingestion completed"
else
    echo "✅ Database already contains $BIOMARKER_COUNT biomarkers"
fi

# Start the API server
echo "🌟 Starting API server..."
exec uv run uvicorn panelyt_api.main:app --host 0.0.0.0 --port 8000