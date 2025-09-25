# Panelyt Telegram Bot

Minimal worker that handles `/start`, `/link <token>`, and `/unlink` commands for the Panelyt
platform. It receives updates from Telegram, relays link tokens to the Panelyt API, and informs
users of their chat ID so they can opt into price-drop alerts.

## Requirements

- Python 3.11+
- Environment variables:
  - `TELEGRAM_BOT_TOKEN` – Bot token from @BotFather
  - `TELEGRAM_API_SECRET` – Must match `TELEGRAM_API_SECRET` on the Panelyt API service
  - `PANELYT_API_BASE_URL` – Base URL of the Panelyt API (default `http://localhost:8000`)
  - `PANELYT_TIMEOUT_SECONDS` – Optional HTTP timeout (default `10`)

## Install dependencies

```bash
make install-bot
```

## Run locally

```bash
cd apps/telegram-bot
uv run panelyt-telegram-bot
```

The worker uses long polling; deploy it anywhere you can run a persistent process (Docker, systemd,
serverless cron, etc.).
