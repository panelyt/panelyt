from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def ensure_session(client: TestClient) -> None:
    response = client.post("/users/session")
    assert response.status_code == 200
    body = response.json()
    assert "user_id" in body


def test_session_reuse(client: TestClient) -> None:
    ensure_session(client)

    response = client.post("/users/session")
    assert response.status_code == 200
    first_body = response.json()
    assert first_body["registered"] is False

    username = f"user-{uuid4().hex[:8]}"
    password = "Password123"

    response = client.post(
        "/users/register",
        json={"username": username, "password": password},
    )
    assert response.status_code == 201

    response = client.post("/users/session")
    assert response.status_code == 200
    registered_body = response.json()
    assert registered_body["registered"] is True
    assert registered_body["username"] == username

    response = client.post("/users/logout")
    assert response.status_code == 204

    response = client.post(
        "/users/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    second_body = response.json()
    assert second_body["username"] == username


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
