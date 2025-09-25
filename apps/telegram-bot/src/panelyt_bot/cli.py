from __future__ import annotations

import logging
import signal

from telegram.ext import AIORateLimiter, ApplicationBuilder, CommandHandler

from panelyt_bot.api import PanelytClient
from panelyt_bot.config import Settings
from panelyt_bot.handlers import (
    handle_chat_id,
    handle_error,
    handle_help,
    handle_link,
    handle_start,
    handle_unlink,
)

logger = logging.getLogger(__name__)


def main() -> None:
    """Entry point for the Panelyt Telegram bot."""

    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(name)s: %(message)s")
    settings = Settings()  # type: ignore[call-arg]
    client = PanelytClient(settings)

    application = (
        ApplicationBuilder()
        .token(settings.telegram_bot_token)
        .rate_limiter(AIORateLimiter())
        .concurrent_updates(True)
        .build()
    )
    application.bot_data["client"] = client

    application.add_handler(CommandHandler("start", handle_start))
    application.add_handler(CommandHandler("help", handle_help))
    application.add_handler(CommandHandler("link", handle_link))
    application.add_handler(CommandHandler("unlink", handle_unlink))
    application.add_handler(CommandHandler(["chatid", "chat_id"], handle_chat_id))
    application.add_error_handler(handle_error)

    logger.info("Starting Panelyt Telegram bot")
    try:
        application.run_polling(
            allowed_updates=None,
            stop_signals=(signal.SIGINT, signal.SIGTERM),
            drop_pending_updates=True,
        )
    finally:
        logger.info("Panelyt Telegram bot stopped")


if __name__ == "__main__":
    main()
