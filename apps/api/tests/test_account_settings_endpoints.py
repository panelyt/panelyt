from __future__ import annotations

from datetime import datetime

from fastapi.testclient import TestClient


def ensure_session(client: TestClient) -> None:
    response = client.post("/users/session")
    assert response.status_code == 200


def configure_telegram(test_settings) -> None:
    test_settings.telegram_bot_token = "bot-token"
    test_settings.telegram_api_secret = "super-secret"
    test_settings.telegram_bot_username = "panelyt_bot"
    test_settings.telegram_bot_link_url = None
    test_settings.telegram_link_token_ttl_minutes = 60


def test_account_settings_disabled(client: TestClient) -> None:
    ensure_session(client)

    response = client.get("/account/settings")
    assert response.status_code == 200
    payload = response.json()
    assert payload["telegram"]["enabled"] is False
    assert payload["telegram"]["chat_id"] is None


def test_generate_link_token(client: TestClient, test_settings) -> None:
    configure_telegram(test_settings)
    ensure_session(client)

    response = client.post("/account/telegram/link-token")
    assert response.status_code == 200
    payload = response.json()
    telegram = payload["telegram"]
    assert telegram["enabled"] is True
    assert isinstance(telegram["link_token"], str)
    assert telegram["link_token"]
    assert telegram["link_token_expires_at"]
    assert telegram["link_url"].startswith("https://t.me/panelyt_bot")


def test_link_and_unlink_flow(client: TestClient, test_settings) -> None:
    configure_telegram(test_settings)
    ensure_session(client)

    response = client.post("/account/telegram/link-token")
    assert response.status_code == 200
    token = response.json()["telegram"]["link_token"]
    assert token

    response = client.post(
        "/telegram/link",
        json={"token": token, "chat_id": "12345"},
        headers={"X-Telegram-Bot-Secret": test_settings.telegram_api_secret},
    )
    assert response.status_code == 200
    linked = response.json()
    assert linked["user_id"]
    linked_at = datetime.fromisoformat(linked["linked_at"])
    assert linked_at.tzinfo is not None

    settings_response = client.get("/account/settings")
    assert settings_response.status_code == 200
    telegram = settings_response.json()["telegram"]
    assert telegram["chat_id"] == "12345"

    response = client.post("/account/telegram/unlink")
    assert response.status_code == 204

    settings_response = client.get("/account/settings")
    assert settings_response.status_code == 200
    telegram = settings_response.json()["telegram"]
    assert telegram["chat_id"] is None


def test_telegram_secret_enforced(client: TestClient, test_settings) -> None:
    configure_telegram(test_settings)
    ensure_session(client)

    response = client.post("/account/telegram/link-token")
    assert response.status_code == 200
    token = response.json()["telegram"]["link_token"]

    response = client.post(
        "/telegram/link",
        json={"token": token, "chat_id": "999"},
    )
    assert response.status_code == 403

    response = client.post(
        "/telegram/link",
        json={"token": token, "chat_id": "999"},
        headers={"X-Telegram-Bot-Secret": "wrong"},
    )
    assert response.status_code == 403

    response = client.post(
        "/telegram/link",
        json={"token": token, "chat_id": "999"},
        headers={"X-Telegram-Bot-Secret": test_settings.telegram_api_secret},
    )
    assert response.status_code == 200

    response = client.post(
        "/telegram/unlink",
        json={"chat_id": "999"},
        headers={"X-Telegram-Bot-Secret": test_settings.telegram_api_secret},
    )
    assert response.status_code == 204


def test_manual_link(client: TestClient, test_settings) -> None:
    configure_telegram(test_settings)
    ensure_session(client)

    response = client.post(
        "/account/telegram/manual-link",
        json={"chat_id": "manual-100"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["telegram"]["chat_id"] == "manual-100"
    assert body["telegram"]["link_token"] is None

    settings_response = client.get("/account/settings")
    assert settings_response.status_code == 200
    assert settings_response.json()["telegram"]["chat_id"] == "manual-100"

    response = client.post(
        "/account/telegram/manual-link",
        json={"chat_id": "   "},
    )
    assert response.status_code == 400
