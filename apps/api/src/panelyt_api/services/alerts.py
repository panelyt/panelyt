from __future__ import annotations

import html
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from panelyt_api.core.settings import Settings, get_settings
from panelyt_api.db.models import SavedList, UserAccount
from panelyt_api.optimization.service import OptimizationService
from panelyt_api.schemas.common import ItemOut
from panelyt_api.schemas.optimize import OptimizeRequest
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID

logger = logging.getLogger(__name__)

_MIN_DROP_GROSZ = 100  # notify when the list gets at least 1 PLN cheaper


def tg_html(text: str) -> str:
    return html.escape(text, quote=False)


def tg_attr(text: str) -> str:
    return html.escape(text, quote=True)


@dataclass(slots=True)
class AlertCandidate:
    saved_list: SavedList
    chat_id: str


@dataclass(slots=True)
class AlertPayload:
    saved_list: SavedList
    chat_id: str
    previous_total: int
    new_total: int
    items: Sequence[ItemOut]


class TelegramPriceAlertService:
    """Send Telegram notifications when saved lists become cheaper."""

    def __init__(
        self,
        session: AsyncSession,
        settings: Settings | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._session = session
        self._settings = settings or get_settings()
        self._optimizer = OptimizationService(session)
        self._http_client = http_client

    async def run(self) -> None:
        bot_token = self._settings.telegram_bot_token
        if not bot_token:
            logger.debug("Telegram bot token missing; skipping alerts")
            return

        candidates = await self._fetch_candidates()
        if not candidates:
            logger.debug("No saved lists eligible for Telegram alerts")
            return

        timestamp = datetime.now(UTC)
        alerts = await self._prepare_alerts(candidates, timestamp)

        await self._session.flush()

        if not alerts:
            logger.debug("No price drops detected for Telegram alerts")
            return

        if self._http_client is None:
            async with httpx.AsyncClient(timeout=10) as client:
                await self._deliver_alerts(bot_token, alerts, client, timestamp)
        else:
            await self._deliver_alerts(bot_token, alerts, self._http_client, timestamp)

        await self._session.flush()

    async def _prepare_alerts(
        self,
        candidates: Sequence[AlertCandidate],
        timestamp: datetime,
    ) -> list[AlertPayload]:
        alerts: list[AlertPayload] = []
        for candidate in candidates:
            alert = await self._evaluate_candidate(candidate, timestamp)
            if alert is not None:
                alerts.append(alert)
        return alerts

    async def _evaluate_candidate(
        self,
        candidate: AlertCandidate,
        timestamp: datetime,
    ) -> AlertPayload | None:
        saved_list = candidate.saved_list
        codes = self._biomarker_codes(saved_list)
        previous_total = saved_list.last_known_total_grosz

        if not codes:
            self._update_saved_list(saved_list, timestamp, total_grosz=None)
            return None

        institution_id = (
            saved_list.user.preferred_institution_id or DEFAULT_INSTITUTION_ID
        )
        response = await self._optimizer.solve(
            OptimizeRequest(biomarkers=codes),
            institution_id,
        )
        if response.uncovered:
            self._update_saved_list(saved_list, timestamp, total_grosz=None)
            return None

        total_grosz = self._sum_price(response.items)
        self._update_saved_list(saved_list, timestamp, total_grosz=total_grosz)

        if previous_total is None:
            return None

        if not self._should_notify(
            previous_total,
            total_grosz,
            saved_list.last_notified_total_grosz,
        ):
            return None

        return AlertPayload(
            saved_list=saved_list,
            chat_id=candidate.chat_id,
            previous_total=previous_total,
            new_total=total_grosz,
            items=response.items,
        )

    async def _fetch_candidates(self) -> list[AlertCandidate]:
        stmt = (
            select(SavedList)
            .options(selectinload(SavedList.entries), selectinload(SavedList.user))
            .where(
                SavedList.notify_on_price_drop.is_(True),
                SavedList.user.has(UserAccount.telegram_chat_id.is_not(None)),
            )
        )
        result = await self._session.execute(stmt)
        candidates: list[AlertCandidate] = []
        for saved_list in result.scalars():
            chat_id = saved_list.user.telegram_chat_id if saved_list.user else None
            if not chat_id:
                continue
            candidates.append(AlertCandidate(saved_list=saved_list, chat_id=chat_id))
        return candidates

    async def _deliver_alerts(
        self,
        bot_token: str,
        alerts: Sequence[AlertPayload],
        client: httpx.AsyncClient,
        timestamp: datetime,
    ) -> None:
        for alert in alerts:
            try:
                await self._send_alert(bot_token, alert, client)
            except Exception as exc:  # pragma: no cover - network failure
                logger.exception(
                    "Failed to send Telegram alert for list %s: %s",
                    alert.saved_list.id,
                    exc,
                )
                continue

            alert.saved_list.last_notified_total_grosz = alert.new_total
            alert.saved_list.last_notified_at = timestamp

    async def _send_alert(
        self,
        bot_token: str,
        alert: AlertPayload,
        client: httpx.AsyncClient,
    ) -> None:
        message = self._build_message(alert)
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": alert.chat_id,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        response = await client.post(url, json=payload)
        response.raise_for_status()

    def _build_message(self, alert: AlertPayload) -> str:
        drop_pln = self._format_price(alert.previous_total - alert.new_total)
        new_total = self._format_price(alert.new_total)
        previous_total = self._format_price(alert.previous_total)
        list_name = tg_html(alert.saved_list.name)
        lines = [
            f"📉 <b>{list_name}</b> is cheaper!",
            f"New total: <b>{new_total}</b> (was {previous_total}, drop {drop_pln}).",
        ]
        if alert.items:
            lines.append("Top picks:")
            for item in alert.items[:3]:
                item_name = tg_html(item.name)
                lines.append(f"• {item_name} — {self._format_price(item.price_now_grosz)}")
        lines.append("Manage alerts from your Panelyt lists.")
        return "\n".join(lines)

    @staticmethod
    def _format_price(total_grosz: int) -> str:
        return f"{total_grosz / 100:.2f} PLN"

    @staticmethod
    def _biomarker_codes(saved_list: SavedList) -> list[str]:
        return [entry.code for entry in saved_list.entries]

    @staticmethod
    def _sum_price(items: Sequence[ItemOut]) -> int:
        return sum(item.price_now_grosz for item in items)

    @staticmethod
    def _update_saved_list(
        saved_list: SavedList,
        timestamp: datetime,
        *,
        total_grosz: int | None,
    ) -> None:
        saved_list.last_known_total_grosz = total_grosz
        saved_list.last_total_updated_at = timestamp

    @staticmethod
    def _should_notify(
        previous_total: int,
        new_total: int,
        last_notified_total: int | None,
    ) -> bool:
        drop = previous_total - new_total
        if drop < _MIN_DROP_GROSZ:
            return False
        if last_notified_total is not None and new_total >= last_notified_total:
            return False
        return True


__all__ = ["TelegramPriceAlertService"]
