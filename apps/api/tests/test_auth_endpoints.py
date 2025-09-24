from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient


def unique_credentials() -> tuple[str, str]:
    username = f"auth-{uuid4().hex[:10]}"
    password = "TopSecret123"
    return username, password


def test_register_and_login_flow(client: TestClient) -> None:
    username, password = unique_credentials()

    response = client.post(
        "/users/register",
        json={"username": username, "password": password},
    )
    assert response.status_code == 201
    register_body = response.json()
    assert register_body["username"] == username
    assert register_body["is_admin"] is False

    response = client.post("/users/session")
    assert response.status_code == 200
    session_body = response.json()
    assert session_body["username"] == username
    assert session_body["registered"] is True
    assert session_body["is_admin"] is False

    response = client.post("/users/logout")
    assert response.status_code == 204

    response = client.post("/users/session")
    assert response.status_code == 200
    session_after_logout = response.json()
    assert session_after_logout["registered"] is False
    assert session_after_logout["is_admin"] is False

    response = client.post(
        "/users/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    login_body = response.json()
    assert login_body["username"] == username
    assert login_body["is_admin"] is False


def test_duplicate_username_rejected(client: TestClient) -> None:
    username, password = unique_credentials()

    first = client.post(
        "/users/register",
        json={"username": username, "password": password},
    )
    assert first.status_code == 201

    duplicate = client.post(
        "/users/register",
        json={"username": username, "password": password},
    )
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "Username already taken"


def test_login_with_wrong_password_fails(client: TestClient) -> None:
    username, password = unique_credentials()
    register = client.post(
        "/users/register",
        json={"username": username, "password": password},
    )
    assert register.status_code == 201

    login = client.post(
        "/users/login",
        json={"username": username, "password": "wrong-pass"},
    )
    assert login.status_code == 401
    assert login.json()["detail"] == "Invalid credentials"
