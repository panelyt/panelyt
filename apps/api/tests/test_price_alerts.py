from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import insert, select

from panelyt_api.db import models
from panelyt_api.schemas.common import ItemOut
from panelyt_api.services.alerts import AlertPayload, TelegramPriceAlertService


class StubTelegramClient:
    def __init__(self) -> None:
        self.requests: list[tuple[str, dict[str, object]]] = []

    async def post(self, url: str, json: dict[str, object]) -> "StubResponse":
        self.requests.append((url, json))
        return StubResponse()


class StubResponse:
    def raise_for_status(self) -> None:
        return None


@pytest.mark.asyncio
async def test_price_alert_sent_on_drop(db_session, test_settings) -> None:
    test_settings.telegram_bot_token = "token"

    biomarker_id = await _create_biomarker(db_session, "ALT")
    user_id = await _create_user(db_session, telegram_chat_id="12345")
    saved_list_id = await _create_saved_list(
        db_session,
        user_id=user_id,
        biomarker_code="ALT",
        previous_total=4500,
    )
    await _create_item_with_biomarker(db_session, biomarker_id=biomarker_id, item_id=1, price=3000)
    await db_session.commit()

    client = StubTelegramClient()
    service = TelegramPriceAlertService(db_session, settings=test_settings, http_client=client)
    await service.run()

    assert len(client.requests) == 1
    url, payload = client.requests[0]
    assert url == "https://api.telegram.org/bottoken/sendMessage"
    assert payload["chat_id"] == "12345"
    assert "New total" in str(payload["text"])

    saved_list = await db_session.scalar(
        select(models.SavedList).where(models.SavedList.id == saved_list_id)
    )
    assert saved_list is not None
    assert saved_list.last_known_total_grosz == 3000
    assert saved_list.last_notified_total_grosz == 3000
    assert saved_list.last_notified_at is not None
    assert saved_list.last_total_updated_at is not None


@pytest.mark.asyncio
async def test_no_alert_for_small_drop(db_session, test_settings) -> None:
    test_settings.telegram_bot_token = "token"

    biomarker_id = await _create_biomarker(db_session, "ALT")
    user_id = await _create_user(db_session, telegram_chat_id="999")
    saved_list_id = await _create_saved_list(
        db_session,
        user_id=user_id,
        biomarker_code="ALT",
        previous_total=3050,
    )
    await _create_item_with_biomarker(db_session, biomarker_id=biomarker_id, item_id=1, price=3000)
    await db_session.commit()

    client = StubTelegramClient()
    service = TelegramPriceAlertService(db_session, settings=test_settings, http_client=client)
    await service.run()

    assert client.requests == []

    saved_list = await db_session.scalar(
        select(models.SavedList).where(models.SavedList.id == saved_list_id)
    )
    assert saved_list is not None
    assert saved_list.last_known_total_grosz == 3000
    assert saved_list.last_notified_total_grosz is None


@pytest.mark.asyncio
async def test_no_alert_when_tokens_uncovered(db_session, test_settings) -> None:
    test_settings.telegram_bot_token = "token"

    user_id = await _create_user(db_session, telegram_chat_id="555")
    saved_list_id = await _create_saved_list(
        db_session,
        user_id=user_id,
        biomarker_code="ALT",
        previous_total=4500,
    )
    await db_session.commit()

    client = StubTelegramClient()
    service = TelegramPriceAlertService(db_session, settings=test_settings, http_client=client)
    await service.run()

    assert client.requests == []

    saved_list = await db_session.scalar(
        select(models.SavedList).where(models.SavedList.id == saved_list_id)
    )
    assert saved_list is not None
    assert saved_list.last_known_total_grosz is None


@pytest.mark.asyncio
async def test_no_alert_when_not_lower_than_last_notified(db_session, test_settings) -> None:
    test_settings.telegram_bot_token = "token"

    biomarker_id = await _create_biomarker(db_session, "ALT")
    user_id = await _create_user(db_session, telegram_chat_id="888")
    previous_total = 4800
    saved_list_id = await _create_saved_list(
        db_session,
        user_id=user_id,
        biomarker_code="ALT",
        previous_total=previous_total,
        last_notified_total=3000,
        last_notified_at=datetime(2024, 1, 1, tzinfo=UTC),
    )
    await _create_item_with_biomarker(db_session, biomarker_id=biomarker_id, item_id=5, price=3000)
    await db_session.commit()

    client = StubTelegramClient()
    service = TelegramPriceAlertService(db_session, settings=test_settings, http_client=client)
    await service.run()

    assert client.requests == []

    saved_list = await db_session.scalar(
        select(models.SavedList).where(models.SavedList.id == saved_list_id)
    )
    assert saved_list is not None
    assert saved_list.last_known_total_grosz == 3000
    assert saved_list.last_notified_total_grosz == 3000


@pytest.mark.asyncio
async def test_alert_message_escapes_list_name(db_session, test_settings) -> None:
    service = TelegramPriceAlertService(db_session, settings=test_settings)
    saved_list = models.SavedList(user_id="user-1", name='Bad <b>&"Name"')
    alert = AlertPayload(
        saved_list=saved_list,
        chat_id="123",
        previous_total=2000,
        new_total=1500,
        items=[],
    )

    message = service._build_message(alert)

    assert '<b>Bad &lt;b&gt;&amp;"Name"</b>' in message


@pytest.mark.asyncio
async def test_alert_message_escapes_item_name(db_session, test_settings) -> None:
    service = TelegramPriceAlertService(db_session, settings=test_settings)
    saved_list = models.SavedList(user_id="user-2", name="List")
    item = ItemOut(
        id=1,
        kind="single",
        name='Item <a href="https://bad.example">link</a>',
        slug="item",
        price_now_grosz=1200,
        price_min30_grosz=1200,
        currency="PLN",
        biomarkers=["ALT"],
        url="https://bad.example",
        on_sale=False,
    )
    alert = AlertPayload(
        saved_list=saved_list,
        chat_id="123",
        previous_total=2000,
        new_total=1500,
        items=[item],
    )

    message = service._build_message(alert)

    assert "&lt;a href=" in message
    assert "<a href=" not in message
async def _create_biomarker(db_session, code: str) -> int:
    result = await db_session.execute(
        insert(models.Biomarker)
        .values({"name": code, "elab_code": code, "slug": code.lower()})
        .returning(models.Biomarker.id)
    )
    return int(result.scalar_one())


async def _create_user(db_session, *, telegram_chat_id: str) -> str:
    result = await db_session.execute(
        insert(models.UserAccount)
        .values({
            "username": None,
            "telegram_chat_id": telegram_chat_id,
            "telegram_linked_at": datetime.now(UTC),
        })
        .returning(models.UserAccount.id)
    )
    return str(result.scalar_one())


async def _create_saved_list(
    db_session,
    *,
    user_id: str,
    biomarker_code: str,
    previous_total: int,
    last_notified_total: int | None = None,
    last_notified_at: datetime | None = None,
) -> str:
    result = await db_session.execute(
        insert(models.SavedList)
        .values({
            "user_id": user_id,
            "name": "Liver panel",
            "notify_on_price_drop": True,
            "last_known_total_grosz": previous_total,
            "last_total_updated_at": datetime.now(UTC),
            "last_notified_total_grosz": last_notified_total,
            "last_notified_at": last_notified_at,
        })
        .returning(models.SavedList.id)
    )
    list_id = str(result.scalar_one())
    await db_session.execute(
        insert(models.SavedListEntry).values({
            "list_id": list_id,
            "code": biomarker_code,
            "display_name": biomarker_code,
            "sort_order": 0,
        })
    )
    return list_id


async def _create_item_with_biomarker(
    db_session,
    *,
    biomarker_id: int,
    item_id: int,
    price: int,
) -> None:
    await db_session.execute(
        insert(models.Item).values({
            "id": item_id,
            "external_id": str(item_id),
            "kind": "single",
            "name": "ALT Test",
            "slug": "alt-test",
            "price_now_grosz": price,
            "price_min30_grosz": price,
            "currency": "PLN",
            "is_available": True,
            "fetched_at": datetime.now(UTC),
        })
    )
    await db_session.execute(
        insert(models.ItemBiomarker).values({
            "item_id": item_id,
            "biomarker_id": biomarker_id,
        })
    )
