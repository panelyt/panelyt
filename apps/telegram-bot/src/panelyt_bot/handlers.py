from __future__ import annotations

import logging
from typing import Any

from telegram import Update
from telegram.constants import ParseMode
from telegram.error import TelegramError
from telegram.ext import ContextTypes

from panelyt_bot.api import PanelytAPIError, PanelytClient

logger = logging.getLogger(__name__)

COMMAND_HELP = (
    "👋 *Panelyt Telegram Alerts*\n\n"
    "• Copy your chat ID below and paste it into Panelyt if you prefer manual entry.\n"
    "• Or generate a link token on https://panelyt.com/account and send `/link <token>` here."
)

LINK_SUCCESS = (
    "✅ Chat linked!\n\n"
    "You will now receive price-drop alerts for any lists with notifications enabled."
)

UNLINK_SUCCESS = (
    "🔌 Chat disconnected.\n\n"
    "Re-run `/link <token>` any time to reconnect."
)
CONFIGURATION_ERROR = "⚠️ Bot configuration is missing. Please try again later."


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    args = context.args or []
    if args:
        await _handle_link(update, context, args[0])
        return
    await _send_instructions(update, context)


async def handle_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _send_instructions(update, context)


async def handle_chat_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else None
    if chat_id is None:
        return
    text = (
        "🔎 *Chat ID*\n\n"
        f"Use this value for manual setup if needed: `{chat_id}`.\n"
        "You can also generate a link token on the account page and send `/link <token>` here."
    )
    await _reply(update, context, text, parse_mode=ParseMode.MARKDOWN)


async def handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    args = context.args or []
    if not args:
        await _reply(
            update,
            context,
            "Send `/link <token>` with the token from your Panelyt account page.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return
    await _handle_link(update, context, args[0])


async def handle_unlink(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if chat is None:
        return

    client = await _get_client_or_reply(update, context)
    if client is None:
        return
    chat_id = str(chat.id)
    try:
        await client.unlink_chat(chat_id=chat_id)
    except PanelytAPIError as exc:
        await _reply(update, context, f"⚠️ Failed to unlink: {exc}")
        return

    await _reply(update, context, UNLINK_SUCCESS, parse_mode=ParseMode.MARKDOWN)


async def _handle_link(update: Update, context: ContextTypes.DEFAULT_TYPE, token: str) -> None:
    chat = update.effective_chat
    user = update.effective_user
    if chat is None or user is None:
        return

    token = token.strip()
    if not token:
        await _reply(
            update,
            context,
            "Provide a link token, e.g. `/link AbCdEf`.",
            parse_mode=ParseMode.MARKDOWN,
        )
        return

    client = await _get_client_or_reply(update, context)
    if client is None:
        return
    payload: dict[str, Any] = {
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "language_code": user.language_code,
    }
    filtered = {key: value for key, value in payload.items() if value}

    try:
        await client.link_chat(
            token=token,
            chat_id=str(chat.id),
            user_payload=filtered,
        )
    except PanelytAPIError as exc:
        await _reply(update, context, f"⚠️ Failed to link: {exc}")
        return

    await _reply(update, context, LINK_SUCCESS, parse_mode=ParseMode.MARKDOWN)


async def _send_instructions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else None
    parts = [COMMAND_HELP]
    if chat_id is not None:
        parts.append(f"\nCurrent chat ID: `{chat_id}`")
    await _reply(update, context, "\n".join(parts), parse_mode=ParseMode.MARKDOWN)


def _get_client(context: ContextTypes.DEFAULT_TYPE) -> PanelytClient:
    client = context.application.bot_data.get("client")
    if not isinstance(client, PanelytClient):
        raise RuntimeError("Panelyt client not initialised")
    return client


async def _get_client_or_reply(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> PanelytClient | None:
    try:
        return _get_client(context)
    except RuntimeError:
        await _reply(update, context, CONFIGURATION_ERROR)
        return None


async def _reply(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    text: str,
    *,
    parse_mode: ParseMode | None = None,
) -> None:
    message = update.effective_message
    try:
        if message is not None:
            await message.reply_text(text, parse_mode=parse_mode)
            return
        chat = update.effective_chat
        if chat is None:
            return
        await context.bot.send_message(chat_id=chat.id, text=text, parse_mode=parse_mode)
    except TelegramError as exc:
        logger.warning("Failed to send Telegram message: %s", exc)


async def handle_error(
    update: object,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:  # pragma: no cover
    logger.exception("Unhandled Telegram update: %s", context.error)
