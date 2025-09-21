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

# Start the API server
echo "🌟 Starting API server..."
exec uv run uvicorn panelyt_api.main:app --host 0.0.0.0 --port 8000