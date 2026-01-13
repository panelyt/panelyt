from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy import insert, update

from panelyt_api.db import models
from panelyt_api.services.institutions import DEFAULT_INSTITUTION_ID


def ensure_session(client: TestClient) -> str:
    response = client.post("/users/session")
    assert response.status_code == 200
    body = response.json()
    assert "user_id" in body
    assert body["is_admin"] is False
    return body["user_id"]


async def ensure_session_async(client: AsyncClient) -> str:
    response = await client.post("/users/session")
    assert response.status_code == 200
    body = response.json()
    assert "user_id" in body
    assert body["is_admin"] is False
    return body["user_id"]


async def seed_biomarkers_with_items(session) -> None:
    secondary_institution_id = DEFAULT_INSTITUTION_ID + 1
    await session.execute(
        insert(models.Biomarker).values(
            [
                {"id": 1, "name": "ALT", "elab_code": "ALT", "slug": "alt"},
                {"id": 2, "name": "AST", "elab_code": "AST", "slug": "ast"},
            ]
        )
    )
    now = datetime.now(timezone.utc)
    await session.execute(
        insert(models.Institution).values(
            [
                {"id": DEFAULT_INSTITUTION_ID, "name": "Institution 1135"},
                {"id": secondary_institution_id, "name": "Institution 1136"},
            ]
        )
    )
    await session.execute(
        insert(models.Item).values(
            [
                {
                    "id": 1,
                    "external_id": "item-1",
                    "kind": "single",
                    "name": "ALT Test",
                    "slug": "alt-test",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 1000,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                },
                {
                    "id": 2,
                    "external_id": "item-2",
                    "kind": "single",
                    "name": "AST Test",
                    "slug": "ast-test",
                    "price_now_grosz": 1200,
                    "price_min30_grosz": 1200,
                    "currency": "PLN",
                    "is_available": True,
                    "fetched_at": now,
                },
            ]
        )
    )
    await session.execute(
        insert(models.InstitutionItem).values(
            [
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 1,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1000,
                    "price_min30_grosz": 1000,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
                {
                    "institution_id": DEFAULT_INSTITUTION_ID,
                    "item_id": 2,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1200,
                    "price_min30_grosz": 1200,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
                {
                    "institution_id": secondary_institution_id,
                    "item_id": 1,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1500,
                    "price_min30_grosz": 1500,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
                {
                    "institution_id": secondary_institution_id,
                    "item_id": 2,
                    "is_available": True,
                    "currency": "PLN",
                    "price_now_grosz": 1900,
                    "price_min30_grosz": 1900,
                    "sale_price_grosz": None,
                    "regular_price_grosz": None,
                    "fetched_at": now,
                },
            ]
        )
    )
    await session.execute(
        insert(models.ItemBiomarker).values(
            [
                {"item_id": 1, "biomarker_id": 1},
                {"item_id": 2, "biomarker_id": 2},
            ]
        )
    )
    await session.commit()


def test_session_reuse(client: TestClient) -> None:
    ensure_session(client)

    response = client.post("/users/session")
    assert response.status_code == 200
    first_body = response.json()
    assert first_body["registered"] is False
    assert first_body["is_admin"] is False

    username = f"user-{uuid4().hex[:8]}"
    password = "Password123"

    response = client.post(
        "/users/register",
        json={"username": username, "password": password},
    )
    assert response.status_code == 201
    register_payload = response.json()
    assert register_payload["is_admin"] is False

    response = client.post("/users/session")
    assert response.status_code == 200
    registered_body = response.json()
    assert registered_body["registered"] is True
    assert registered_body["username"] == username
    assert registered_body["is_admin"] is False

    response = client.post("/users/logout")
    assert response.status_code == 204

    response = client.post(
        "/users/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    second_body = response.json()
    assert second_body["username"] == username
    assert second_body["is_admin"] is False


def test_saved_list_flow(client: TestClient) -> None:
    ensure_session(client)

    response = client.get("/lists")
    assert response.status_code == 200
    assert response.json() == {"lists": []}

    payload = {
        "name": "Morning panel",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
            {"code": "CRP", "name": "C-reactive protein"},
        ],
    }
    response = client.post("/lists", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Morning panel"
    assert len(created["biomarkers"]) == 2
    assert created["notify_on_price_drop"] is True

    list_id = created["id"]

    updated_payload = {
        "name": "Follow-up panel",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
        ],
    }
    response = client.put(f"/lists/{list_id}", json=updated_payload)
    assert response.status_code == 200
    updated = response.json()
    assert updated["name"] == "Follow-up panel"
    assert [entry["code"] for entry in updated["biomarkers"]] == ["ALT"]

    response = client.post(
        f"/lists/{list_id}/share",
        json={"regenerate": False},
    )
    assert response.status_code == 200
    share_payload = response.json()
    assert share_payload["list_id"] == list_id
    assert share_payload["share_token"]
    assert share_payload["shared_at"]

    share_token = share_payload["share_token"]

    response = client.get(f"/biomarker-lists/shared/{share_token}")
    assert response.status_code == 200
    shared = response.json()
    assert shared["id"] == list_id
    assert shared["share_token"] == share_token

    response = client.post(
        f"/lists/{list_id}/share",
        json={"regenerate": True},
    )
    assert response.status_code == 200
    rotated = response.json()
    assert rotated["share_token"] != share_token
    new_share_token = rotated["share_token"]

    response = client.delete(f"/lists/{list_id}/share")
    assert response.status_code == 204

    response = client.get(f"/biomarker-lists/shared/{new_share_token}")
    assert response.status_code == 404

    response = client.get("/lists")
    assert response.status_code == 200
    lists_payload = response.json()
    assert len(lists_payload["lists"]) == 1
    assert lists_payload["lists"][0]["name"] == "Follow-up panel"

    response = client.delete(f"/lists/{list_id}")
    assert response.status_code == 204

    response = client.get("/lists")
    assert response.status_code == 200
    assert response.json() == {"lists": []}


def test_create_overwrites_existing_with_same_name(client: TestClient) -> None:
    ensure_session(client)

    payload = {
        "name": "Morning panel",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
        ],
    }
    response = client.post("/lists", json=payload)
    assert response.status_code == 201
    created = response.json()
    list_id = created["id"]
    assert [entry["code"] for entry in created["biomarkers"]] == ["ALT"]

    overwrite_payload = {
        "name": "Morning panel",
        "biomarkers": [
            {"code": "CRP", "name": "C-reactive protein"},
            {"code": "TSH", "name": "Thyroid stimulating hormone"},
        ],
    }
    response = client.post("/lists", json=overwrite_payload)
    assert response.status_code == 201
    overwritten = response.json()
    assert overwritten["id"] == list_id
    assert [entry["code"] for entry in overwritten["biomarkers"]] == ["CRP", "TSH"]
    assert overwritten["name"] == "Morning panel"

    response = client.get("/lists")
    assert response.status_code == 200
    lists_payload = response.json()["lists"]
    assert len(lists_payload) == 1
    assert lists_payload[0]["id"] == list_id
    assert [entry["code"] for entry in lists_payload[0]["biomarkers"]] == ["CRP", "TSH"]


def test_missing_session_rejected(client: TestClient) -> None:
    response = client.get("/lists")
    assert response.status_code == 200
    assert response.json() == {"lists": []}


def test_duplicate_codes_rejected(client: TestClient) -> None:
    ensure_session(client)
    payload = {
        "name": "Panel",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
            {"code": "ALT", "name": "Alanine"},
        ],
    }
    response = client.post("/lists", json=payload)
    assert response.status_code == 400
    assert "Duplicate biomarker code" in response.json()["detail"]


def test_notifications_toggle(client: TestClient) -> None:
    ensure_session(client)
    payload = {
        "name": "Night Panel",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
        ],
    }
    response = client.post("/lists", json=payload)
    assert response.status_code == 201
    created = response.json()
    list_id = created["id"]
    assert created["notify_on_price_drop"] is True

    response = client.post(
        f"/lists/{list_id}/notifications",
        json={"notify_on_price_drop": False},
    )
    assert response.status_code == 200
    assert response.json()["notify_on_price_drop"] is False

    response = client.get("/lists")
    assert response.status_code == 200
    lists_payload = response.json()["lists"]
    assert lists_payload[0]["notify_on_price_drop"] is False

    response = client.post(
        f"/lists/{list_id}/notifications",
        json={"notify_on_price_drop": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["list_id"] == list_id
    assert body["notify_on_price_drop"] is True

    response = client.get("/lists")
    assert response.status_code == 200
    lists_payload = response.json()["lists"]
    assert lists_payload[0]["notify_on_price_drop"] is True


def test_notifications_toggle_bulk(client: TestClient) -> None:
    ensure_session(client)

    payload_one = {
        "name": "Panel One",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
        ],
    }
    payload_two = {
        "name": "Panel Two",
        "biomarkers": [
            {"code": "CRP", "name": "C-reactive protein"},
        ],
    }

    response = client.post("/lists", json=payload_one)
    assert response.status_code == 201
    first_created = response.json()
    first_id = first_created["id"]
    assert first_created["notify_on_price_drop"] is True

    response = client.post("/lists", json=payload_two)
    assert response.status_code == 201
    second_created = response.json()
    second_id = second_created["id"]
    assert second_created["notify_on_price_drop"] is True

    # Disable notifications for a single list to ensure mixed initial state.
    response = client.post(
        f"/lists/{first_id}/notifications",
        json={"notify_on_price_drop": False},
    )
    assert response.status_code == 200
    assert response.json()["notify_on_price_drop"] is False

    response = client.post(
        "/lists/notifications",
        json={"notify_on_price_drop": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert {item["list_id"] for item in body["lists"]} == {first_id, second_id}
    assert all(item["notify_on_price_drop"] is True for item in body["lists"])

    response = client.get("/lists")
    assert response.status_code == 200
    lists = response.json()["lists"]
    assert len(lists) == 2
    assert all(item["notify_on_price_drop"] is True for item in lists)

    response = client.post(
        "/lists/notifications",
        json={"notify_on_price_drop": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert {item["list_id"] for item in body["lists"]} == {first_id, second_id}
    assert all(item["notify_on_price_drop"] is False for item in body["lists"])

    response = client.get("/lists")
    assert response.status_code == 200
    lists = response.json()["lists"]
    assert len(lists) == 2
    assert all(item["notify_on_price_drop"] is False for item in lists)


@pytest.mark.asyncio
async def test_list_totals_set_on_create(
    async_client: AsyncClient, db_session
) -> None:
    await seed_biomarkers_with_items(db_session)
    user_id = await ensure_session_async(async_client)
    secondary_institution_id = DEFAULT_INSTITUTION_ID + 1
    await db_session.execute(
        update(models.UserAccount)
        .where(models.UserAccount.id == user_id)
        .values(preferred_institution_id=secondary_institution_id)
    )
    await db_session.commit()

    payload = {
        "name": "Morning panel",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
            {"code": "AST", "name": "Aspartate"},
        ],
    }
    response = await async_client.post("/lists", json=payload)
    assert response.status_code == 201
    created = response.json()

    assert created["last_known_total_grosz"] == 3400
    assert created["last_total_updated_at"] is not None


@pytest.mark.asyncio
async def test_list_totals_update_on_edit(
    async_client: AsyncClient, db_session
) -> None:
    await seed_biomarkers_with_items(db_session)
    user_id = await ensure_session_async(async_client)

    payload = {
        "name": "Starter panel",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
            {"code": "AST", "name": "Aspartate"},
        ],
    }
    response = await async_client.post("/lists", json=payload)
    assert response.status_code == 201
    created = response.json()
    list_id = created["id"]
    assert created["last_known_total_grosz"] == 2200

    secondary_institution_id = DEFAULT_INSTITUTION_ID + 1
    await db_session.execute(
        update(models.UserAccount)
        .where(models.UserAccount.id == user_id)
        .values(preferred_institution_id=secondary_institution_id)
    )
    await db_session.commit()

    update_payload = {
        "name": "ALT only",
        "biomarkers": [
            {"code": "ALT", "name": "Alanine"},
        ],
    }
    response = await async_client.put(f"/lists/{list_id}", json=update_payload)
    assert response.status_code == 200
    updated = response.json()

    assert updated["last_known_total_grosz"] == 1500
    assert updated["last_total_updated_at"] is not None
