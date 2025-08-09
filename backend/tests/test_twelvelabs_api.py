import os
import json
import types
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.backend.twelvelabs_api import router as tl_router, TL_API_BASE


class DummyResponse:
    def __init__(self, status_code: int, data: dict | None = None, text: str | None = None):
        self.status_code = status_code
        self._data = data or {}
        self.text = text if text is not None else json.dumps(self._data)

    def json(self):
        return self._data


class DummyAsyncClient:
    """Minimal async context manager to replace httpx.AsyncClient in tests."""
    def __init__(self, *args, **kwargs):
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    # Capture GET/POST/DELETE with params
    async def get(self, url, headers=None, params=None):
        self.calls.append(("GET", url, headers, params))
        # Return success echo
        return DummyResponse(200, {"method": "GET", "url": url, "params": params or {}, "ok": True})

    async def post(self, url, json=None, headers=None):
        self.calls.append(("POST", url, headers, json))
        # Echo back payload
        return DummyResponse(200, {"method": "POST", "url": url, "json": json or {}, "ok": True})

    async def delete(self, url, headers=None):
        self.calls.append(("DELETE", url, headers, None))
        return DummyResponse(200, {"method": "DELETE", "url": url, "ok": True})


@pytest.fixture()
def client(monkeypatch) -> TestClient:
    # Ensure API key is set for tests
    monkeypatch.setenv("TWELVELABS_API_KEY", "dummy_key")

    # Patch httpx.AsyncClient with our dummy
    import httpx  # type: ignore
    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)

    app = FastAPI()
    app.include_router(tl_router, prefix="/api")
    return TestClient(app)


def test_list_indexes_success(client: TestClient):
    res = client.get("/api/tl/indexes")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["method"] == "GET"
    assert data["url"] == f"{TL_API_BASE}/indexes"


def test_create_index_forwards_body(client: TestClient):
    payload = {"name": "my-index", "engine": "pegasus1"}
    res = client.post("/api/tl/indexes", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["method"] == "POST"
    assert data["url"] == f"{TL_API_BASE}/indexes"
    assert data["json"] == payload


def test_delete_index_success(client: TestClient):
    res = client.delete("/api/tl/indexes/abc123")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["method"] == "DELETE"
    assert data["url"] == f"{TL_API_BASE}/indexes/abc123"


def test_upload_video_echo(client: TestClient):
    payload = {"index_id": "abc123", "input_type": "url", "video_url": "https://example.com/v.mp4"}
    res = client.post("/api/tl/videos", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["method"] == "POST"
    assert data["url"] == f"{TL_API_BASE}/videos"
    assert data["json"]["index_id"] == "abc123"


def test_search_query_params_forwarded(client: TestClient):
    res = client.get("/api/tl/search", params={"q": "find cats", "index_id": "abc123", "limit": 5})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["method"] == "GET"
    assert data["url"] == f"{TL_API_BASE}/search"
    assert data["params"]["q"] == "find cats"
    assert data["params"]["index_id"] == "abc123"
    assert data["params"]["limit"] == 5


def test_missing_api_key_returns_500(monkeypatch):
    # Build a client with missing env
    monkeypatch.delenv("TWELVELABS_API_KEY", raising=False)

    import httpx  # type: ignore
    monkeypatch.setattr(httpx, "AsyncClient", DummyAsyncClient)

    app = FastAPI()
    app.include_router(tl_router, prefix="/api")
    c = TestClient(app)

    res = c.get("/api/tl/indexes")
    assert res.status_code == 500
    assert "TWELVELABS_API_KEY" in res.text 