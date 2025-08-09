from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from pydantic import BaseModel
from typing import Any, Dict, Optional
import os
import httpx

TL_API_BASE = "https://api.twelvelabs.io/v1.3"

router = APIRouter(prefix="/tl", tags=["twelvelabs"])


def _get_api_key() -> str:
    api_key = os.getenv("TWELVELABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="TWELVELABS_API_KEY is not set")
    return api_key


def _headers() -> Dict[str, str]:
    api_key = _get_api_key()
    # Use TwelveLabs x-api-key header only
    return {
        "x-api-key": api_key,
    }


class ProxyPayload(BaseModel):
    payload: Optional[Dict[str, Any]] = None


# ───────────────────────────── Indexes ─────────────────────────────
@router.get("/indexes")
async def list_indexes():
    """List TwelveLabs indexes (GET /v1.3/indexes)."""
    url = f"{TL_API_BASE}/indexes"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.get("/indexes/{index_id}")
async def get_index(index_id: str):
    """Get an index by ID (GET /v1.3/indexes/{index_id})."""
    url = f"{TL_API_BASE}/indexes/{index_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.post("/indexes")
async def create_index(body: Dict[str, Any]):
    """Create a TwelveLabs index (POST /v1.3/indexes). Body is forwarded as-is.
    Refer to docs: https://docs.twelvelabs.io/api-reference/indexes
    """
    url = f"{TL_API_BASE}/indexes"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.delete("/indexes/{index_id}")
async def delete_index(index_id: str):
    url = f"{TL_API_BASE}/indexes/{index_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.delete(url, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json() if resp.text else {"success": True}


# ───────────────────────────── Videos ─────────────────────────────
@router.get("/videos")
async def list_videos(request: Request):
    """List videos (GET /v1.3/videos). Forwards query params (e.g., index_id, page, size)."""
    url = f"{TL_API_BASE}/videos"
    params = dict(request.query_params)
    # Coerce numeric query params
    for k, v in list(params.items()):
        if isinstance(v, str) and v.isdigit():
            params[k] = int(v)
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, params=params, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.get("/videos/{video_id}")
async def get_video(video_id: str):
    """Get a video by ID (GET /v1.3/videos/{video_id})."""
    url = f"{TL_API_BASE}/videos/{video_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.delete("/videos/{video_id}")
async def delete_video(video_id: str):
    """Delete a video by ID (DELETE /v1.3/videos/{video_id})."""
    url = f"{TL_API_BASE}/videos/{video_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.delete(url, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json() if resp.text else {"success": True}


@router.post("/videos")
async def upload_video(body: Dict[str, Any]):
    """Upload/index a video via URL (POST /v1.3/tasks). Body forwarded as-is.
    Typical keys: index_id, input_type=url, video_url.
    """
    url = f"{TL_API_BASE}/tasks"
    async with httpx.AsyncClient(timeout=None) as client:
        resp = await client.post(url, json=body, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.post("/videos/upload_file")
async def upload_video_file(
    index_id: str = Form(...),
    file: UploadFile = File(...),
):
    """Upload/index a video via file (multipart) if supported by TwelveLabs.
    This constructs a multipart/form-data with required fields and the file blob.
    """
    url = f"{TL_API_BASE}/tasks"
    data: Dict[str, Any] = {"index_id": index_id, "input_type": "file"}
    files = {"file": (file.filename, await file.read(), file.content_type or "application/octet-stream")}
    async with httpx.AsyncClient(timeout=None) as client:
        resp = await client.post(url, data=data, files=files, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


# ───────────────────────────── Search ─────────────────────────────
@router.get("/search")
async def search(request: Request, q: str = Query(..., description="Query text"), index_id: Optional[str] = None):
    """Search videos (GET /v1.3/search) with query params passed through. Provide q and optionally index_id."""
    url = f"{TL_API_BASE}/search"
    # Start with all incoming query params
    incoming = dict(request.query_params)
    # Ensure q is present; already captured but include in forwarded params
    incoming["q"] = q
    if index_id:
        incoming["index_id"] = index_id
    # Coerce common numerics
    for key in list(incoming.keys()):
        val = incoming[key]
        try:
            if isinstance(val, str) and val.isdigit():
                incoming[key] = int(val)
        except Exception:
            pass
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, params=incoming, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.post("/search")
async def search_post(body: Dict[str, Any]):
    """POST search (POST /v1.3/search) to support advanced queries per spec."""
    url = f"{TL_API_BASE}/search"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body, headers=_headers())
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json() 