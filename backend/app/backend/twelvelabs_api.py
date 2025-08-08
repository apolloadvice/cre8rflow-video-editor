from fastapi import APIRouter, HTTPException, Query
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


class ProxyPayload(BaseModel):
    payload: Optional[Dict[str, Any]] = None


@router.get("/indexes")
async def list_indexes():
    """List TwelveLabs indexes (GET /v1.3/indexes)."""
    api_key = _get_api_key()
    url = f"{TL_API_BASE}/indexes"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {api_key}"})
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.post("/indexes")
async def create_index(body: Dict[str, Any]):
    """Create a TwelveLabs index (POST /v1.3/indexes). Body is forwarded as-is.
    Refer to docs: https://docs.twelvelabs.io/api-reference/indexes
    """
    api_key = _get_api_key()
    url = f"{TL_API_BASE}/indexes"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=body, headers={"Authorization": f"Bearer {api_key}"})
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.delete("/indexes/{index_id}")
async def delete_index(index_id: str):
    api_key = _get_api_key()
    url = f"{TL_API_BASE}/indexes/{index_id}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.delete(url, headers={"Authorization": f"Bearer {api_key}"})
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json() if resp.text else {"success": True}


@router.post("/videos")
async def upload_video(body: Dict[str, Any]):
    """Upload/index a video with TwelveLabs (POST /v1.3/videos). Body is forwarded as-is.
    See API docs for required fields (e.g., index_id, input_type, video_url/file, etc.).
    """
    api_key = _get_api_key()
    url = f"{TL_API_BASE}/videos"
    async with httpx.AsyncClient(timeout=None) as client:
        resp = await client.post(url, json=body, headers={"Authorization": f"Bearer {api_key}"})
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@router.get("/search")
async def search(q: str = Query(..., description="Query text"), index_id: Optional[str] = None, **kwargs):
    """Search videos (GET /v1.3/search) with query params passed through. Provide q and optionally index_id."""
    api_key = _get_api_key()
    url = f"{TL_API_BASE}/search"
    params: Dict[str, Any] = {"q": q}
    if index_id:
        params["index_id"] = index_id
    # include any extra query params
    for k, v in kwargs.items():
        params[k] = v
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.get(url, params=params, headers={"Authorization": f"Bearer {api_key}"})
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json() 