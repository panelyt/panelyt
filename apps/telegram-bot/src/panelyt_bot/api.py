from __future__ import annotations

import logging
from typing import Any, cast

import httpx

from panelyt_bot.config import Settings

logger = logging.getLogger(__name__)


class PanelytAPIError(RuntimeError):
    """Raised when the Panelyt API responds with an error."""


class PanelytClient:
    """HTTP client that talks to the Panelyt API."""

    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.panelyt_api_base_url.rstrip("/")
        self._secret = settings.telegram_api_secret
        self._timeout = settings.panelyt_timeout_seconds

    async def link_chat(
        self,
        *,
        token: str,
        chat_id: str,
        user_payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Attach a Telegram chat to a Panelyt user account."""

        url = f"{self._base_url}/telegram/link"
        payload = {"token": token, "chat_id": chat_id, **user_payload}
        return await self._post(url, payload)

    async def unlink_chat(self, *, chat_id: str) -> None:
        """Detach a Telegram chat from any associated Panelyt user."""

        url = f"{self._base_url}/telegram/unlink"
        await self._post(url, {"chat_id": chat_id})

    async def _post(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"X-Telegram-Bot-Secret": self._secret},
                )
        except httpx.HTTPError as exc:
            logger.exception("Panelyt API request failed: %s", exc)
            raise PanelytAPIError("panelyt api request failed") from exc

        if response.status_code >= 400:
            detail = _extract_detail(response)
            logger.warning("Panelyt API error %s: %s", response.status_code, detail)
            raise PanelytAPIError(detail)

        if response.status_code == 204:
            return {}

        body = response.json()
        return cast(dict[str, Any], body)


def _extract_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text or f"HTTP {response.status_code}"

    detail = body.get("detail") if isinstance(body, dict) else None
    if isinstance(detail, str):
        return detail
    return response.text or f"HTTP {response.status_code}"


__all__ = ["PanelytAPIError", "PanelytClient"]
