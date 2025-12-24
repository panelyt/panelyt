# Panelyt Telegram Bot

Handles `/start`, `/link <token>`, and `/unlink` commands. Links Telegram chat IDs with Panelyt accounts for price-drop alerts.

## Setup

From the repository root:

```bash
make install-bot
```

## Configuration

Environment variables (see `.env.example`):

- `TELEGRAM_BOT_TOKEN` – Bot token from @BotFather
- `TELEGRAM_API_SECRET` – Shared secret with the Panelyt API
- `PANELYT_API_BASE_URL` – API base URL (default `http://localhost:8000`)

## Development

```bash
make dev-bot        # Run with long polling
make lint-bot       # Lint with ruff
make typecheck-bot  # Type check with mypy
```

Uses long polling; deploy anywhere you can run a persistent process.
