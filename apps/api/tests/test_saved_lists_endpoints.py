from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def ensure_session(client: TestClient) -> None:
    response = client.post("/users/session")
    assert response.status_code == 200
    body = response.json()
    assert "user_id" in body
    assert body["is_admin"] is False


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
    list_id = response.json()["id"]

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

    response = client.post(
        f"/lists/{list_id}/notifications",
        json={"notify_on_price_drop": False},
    )
    assert response.status_code == 200
    assert response.json()["notify_on_price_drop"] is False
