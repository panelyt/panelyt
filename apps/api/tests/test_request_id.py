from fastapi.testclient import TestClient


def test_request_id_header_added(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    request_id = response.headers.get("X-Request-Id")
    assert request_id


def test_request_id_passthrough(client: TestClient) -> None:
    response = client.get("/healthz", headers={"X-Request-Id": "req-123"})
    assert response.status_code == 200
    assert response.headers.get("X-Request-Id") == "req-123"
