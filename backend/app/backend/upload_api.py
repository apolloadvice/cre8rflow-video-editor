from fastapi import APIRouter, File, UploadFile, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
import os
import re
import unicodedata
from fastapi.responses import JSONResponse
from supabase import create_client, Client
import tempfile
import subprocess
import shutil
import asyncio
import logging

# Import TwelveLabs service
from .twelvelabs_service import twelvelabs_service

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = "uploaded_videos"
os.makedirs(UPLOAD_DIR, exist_ok=True)

SUPABASE_URL = "https://fgvyotgowmcwcphsctlc.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndnlvdGdvd21jd2NwaHNjdGxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTczMjU5MCwiZXhwIjoyMDYxMzA4NTkwfQ.3JXr_BUDFs0c2cvNog2-igf_UWQ2H7CAp3WJL_JJLSM"
SUPABASE_BUCKET = "assets"  # Change if your bucket is named differently

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename for safe storage by:
    1. Normalizing Unicode characters
    2. Removing or replacing problematic characters
    3. Ensuring safe filename for Supabase Storage
    """
    # Normalize Unicode characters (NFD decomposition then recomposition)
    filename = unicodedata.normalize('NFKC', filename)
    
    # Replace problematic characters with safe alternatives
    # Non-breaking spaces and other special spaces -> regular space
    filename = re.sub(r'[\u00A0\u2000-\u200F\u202F\u205F\u3000]', ' ', filename)
    
    # Multiple spaces -> single space
    filename = re.sub(r'\s+', ' ', filename)
    
    # Remove or replace other problematic characters for storage
    # Keep alphanumeric, basic punctuation, spaces, and common video file chars
    filename = re.sub(r'[^\w\s\-_\.\(\)]+', '_', filename)
    
    # Trim spaces from start/end
    filename = filename.strip()
    
    # Ensure we don't have empty filename
    if not filename:
        filename = "video_file"
    
    return filename

class UploadUrlRequest(BaseModel):
    filename: str
    folder: Optional[str] = None

class UploadUrlResponse(BaseModel):
    signedUrl: str
    path: str

class AssetResponse(BaseModel):
    id: str
    path: str
    original_name: str
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    size: Optional[int] = None
    mimetype: Optional[str] = None
    created_at: str
    updated_at: str
    # TwelveLabs indexing fields
    indexing_status: Optional[str] = "not_started"
    indexing_progress: Optional[int] = 0
    indexing_error: Optional[str] = None
    indexing_started_at: Optional[str] = None
    indexing_completed_at: Optional[str] = None
    twelvelabs_task_id: Optional[str] = None
    twelvelabs_video_id: Optional[str] = None
    user_index_id: Optional[str] = None

@router.get("/assets/list", response_model=List[AssetResponse])
async def list_assets(request: Request):
    """
    List all registered assets from the Supabase assets table.
    """
    supabase = get_supabase_client()
    try:
        result = supabase.table("assets").select("*").order("updated_at", desc=True).execute()
        if result.data:
            return [AssetResponse(**asset) for asset in result.data]
        else:
            return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase error: {e}")

@router.post("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(payload: UploadUrlRequest, request: Request):
    """
    Issue a signed upload URL for direct upload to Supabase Storage.
    Sanitizes filename to prevent upload errors caused by special characters.
    """
    supabase = get_supabase_client()
    
    # Sanitize the filename to prevent special character issues
    sanitized_filename = sanitize_filename(payload.filename)
    
    # Compose the storage path
    folder = payload.folder or ""
    if folder and not folder.endswith("/"):
        folder += "/"
    path = f"{folder}{sanitized_filename}"
    
    # Generate signed upload URL (public API does not support signed upload, so we use create_signed_url for download, but for upload, use upload API directly)
    # For direct upload, the frontend can use the Storage API, but for security, you may want to generate a signed policy or use RLS.
    # Here, we return the storage path for the frontend to use with supabase-js.
    # If you want to restrict uploads, consider using a backend proxy or presigned POST (not natively supported by supabase-py yet).
    # For now, just return the path for the frontend to use with supabase-js Storage client.
    # TODO: For stricter security, implement a proxy upload endpoint or use a custom function.
    return UploadUrlResponse(signedUrl="", path=path)

class RegisterAssetRequest(BaseModel):
    path: str
    originalName: str
    # Optionally, allow frontend to supply duration, width, height, size, mimetype
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    size: Optional[int] = None
    mimetype: Optional[str] = None

class RegisterAssetResponse(BaseModel):
    id: str
    status: str

def extract_video_metadata_ffprobe(filepath: str):
    """
    Extract duration (seconds), width, and height from a video file using ffprobe.
    Returns (duration, width, height) or (None, None, None) on failure.
    """
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            filepath
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split("\n")
        width = int(lines[0]) if len(lines) > 0 else None
        height = int(lines[1]) if len(lines) > 1 else None
        duration = float(lines[2]) if len(lines) > 2 else None
        return duration, width, height
    except Exception as e:
        print(f"ffprobe error: {e}")
        return None, None, None

@router.post("/assets/register", response_model=RegisterAssetResponse)
async def register_asset(payload: RegisterAssetRequest, request: Request):
    """
    Register a newly uploaded asset: extract video metadata and insert into Supabase assets table.
    If any metadata is missing, download the file from Supabase Storage and extract it using ffprobe.
    """
    supabase = get_supabase_client()
    duration = payload.duration
    width = payload.width
    height = payload.height
    # If any required metadata is missing, download and extract
    if duration is None or width is None or height is None:
        # Download file from Supabase Storage to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmpfile:
            tmp_path = tmpfile.name
        try:
            resp = supabase.storage.from_(SUPABASE_BUCKET).download(payload.path)
            if hasattr(resp, 'data') and resp.data:
                with open(tmp_path, "wb") as f:
                    shutil.copyfileobj(resp.data, f)
                duration2, width2, height2 = extract_video_metadata_ffprobe(tmp_path)
                duration = duration or duration2
                width = width or width2
                height = height or height2
            else:
                print(f"Failed to download file from Supabase Storage: {payload.path}")
        except Exception as e:
            print(f"Error downloading or extracting metadata: {e}")
        finally:
            try:
                os.remove(tmp_path)
            except Exception:
                pass
    # TODO: Get actual user_id from authentication
    # For now, use None for database and "user123" for TwelveLabs logic
    db_user_id = None  # Leave as NULL in database (UUID column)
    user_id = "user123"  # Used for TwelveLabs indexing logic
    
    # Get or create the user's TwelveLabs index before creating the asset
    try:
        user_index_id = await twelvelabs_service.ensure_user_index(user_id)
        logger.info(f"📋 [Upload] Using TwelveLabs index {user_index_id} for user {user_id}")
    except Exception as e:
        logger.error(f"❌ [Upload] Failed to ensure user index: {e}")
        user_index_id = None  # Will be set later during background indexing
    
    asset_data = {
        "path": payload.path,
        "original_name": payload.originalName,
        "duration": duration,
        "width": width,
        "height": height,
        "size": payload.size,
        "mimetype": payload.mimetype,
        "user_id": db_user_id,  # Leave as NULL until we have proper auth
        "indexing_status": "not_started",
        "user_index_id": user_index_id  # Pre-populate with user's TwelveLabs index
    }
    
    # Insert into assets table
    try:
        result = supabase.table("assets").insert(asset_data).execute()
        if result.data and len(result.data) > 0:
            asset_id = result.data[0]["id"]
            
            # Start TwelveLabs indexing in background (non-blocking)
            logger.info(f"🚀 [Upload] Starting background TwelveLabs indexing for asset {asset_id}")
            asyncio.create_task(start_background_indexing(asset_id, user_id, payload.path))
            
            return RegisterAssetResponse(id=asset_id, status="registered")
        else:
            raise HTTPException(status_code=500, detail="Failed to insert asset metadata.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase error: {e}")


async def start_background_indexing(asset_id: str, user_id: str, file_path: str):
    """
    Background task to start TwelveLabs indexing for a newly uploaded asset.
    This runs in parallel with the user's upload workflow.
    """
    try:
        logger.info(f"📤 [Background] Starting TwelveLabs indexing for asset {asset_id}")
        
        # Create signed URL with longer expiry for indexing (2 hours)
        supabase = get_supabase_client()
        signed_url_response = supabase.storage.from_("assets").create_signed_url(file_path, 7200)
        
        # Handle different response formats from Supabase client
        if hasattr(signed_url_response, 'error') and signed_url_response.error:
            raise Exception(f"Failed to create signed URL: {signed_url_response.error}")
        elif isinstance(signed_url_response, dict) and signed_url_response.get('error'):
            raise Exception(f"Failed to create signed URL: {signed_url_response['error']}")
        
        # Extract signed URL from response - try multiple possible formats
        video_url = None
        
        # Try different possible response formats
        if hasattr(signed_url_response, 'signed_url'):
            video_url = signed_url_response.signed_url
        elif isinstance(signed_url_response, dict) and 'signed_url' in signed_url_response:
            video_url = signed_url_response['signed_url']
        elif hasattr(signed_url_response, 'signedURL'):
            video_url = signed_url_response.signedURL
        elif isinstance(signed_url_response, dict) and 'signedURL' in signed_url_response:
            video_url = signed_url_response['signedURL']
        elif isinstance(signed_url_response, dict) and 'data' in signed_url_response:
            data = signed_url_response['data']
            if isinstance(data, dict):
                if 'signedUrl' in data:
                    video_url = data['signedUrl']
                elif 'signed_url' in data:
                    video_url = data['signed_url']
        
        if not video_url:
            raise Exception(f"Could not extract signed URL from response. Type: {type(signed_url_response)}, Content: {signed_url_response}")
        logger.info(f"🔗 [Background] Created signed URL for TwelveLabs access")
        
        # Start indexing using the TwelveLabs service
        await twelvelabs_service.start_indexing(asset_id, user_id, video_url)
        
        logger.info(f"✅ [Background] TwelveLabs indexing initiated for asset {asset_id}")
        
    except Exception as e:
        logger.error(f"❌ [Background] Failed to start TwelveLabs indexing for asset {asset_id}: {e}")
        
        # Update asset with error status
        try:
            supabase = get_supabase_client()
            supabase.table("assets").update({
                "indexing_status": "failed",
                "indexing_error": str(e)
            }).eq("id", asset_id).execute()
        except Exception as db_error:
            logger.error(f"❌ [Background] Failed to update error status in database: {db_error}")

# ================== TWELVELABS INDEXING API ENDPOINTS ==================

@router.get("/assets/{asset_id}/indexing-status")
async def get_asset_indexing_status(asset_id: str):
    """Get indexing status for a specific asset."""
    try:
        status = await twelvelabs_service.get_indexing_status(asset_id)
        return status
    except Exception as e:
        logger.error(f"❌ [API] Error getting indexing status for asset {asset_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/assets/{asset_id}/retry-indexing")
async def retry_asset_indexing(asset_id: str):
    """Retry indexing for a failed asset."""
    try:
        user_id = "user123"  # TODO: Get from authentication
        await twelvelabs_service.retry_indexing(asset_id, user_id)
        return {"success": True, "message": "Indexing retry started"}
    except Exception as e:
        logger.error(f"❌ [API] Error retrying indexing for asset {asset_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assets/indexing-progress")
async def get_all_indexing_progress():
    """Get indexing progress for all active indexing tasks."""
    try:
        supabase = get_supabase_client()
        result = supabase.table("assets").select(
            "id, original_name, indexing_status, indexing_progress, indexing_error"
        ).in_("indexing_status", ["starting", "processing"]).execute()
        
        return {"active_indexing": result.data or []}
    except Exception as e:
        logger.error(f"❌ [API] Error getting indexing progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assets/search")
async def search_assets(query: str, user_id: str = "user123"):
    """Search indexed videos using natural language."""
    try:
        logger.info(f"🔍 [API] Search request: '{query}' for user {user_id}")
        results = await twelvelabs_service.search_videos(user_id, query)
        return {"results": results}
    except Exception as e:
        logger.error(f"❌ [API] Error searching assets: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/assets/sync-existing")
async def sync_existing_assets(user_id: str = "user123"):
    """Sync existing unindexed assets for a user."""
    try:
        logger.info(f"🔄 [API] Starting sync for existing assets for user {user_id}")
        await twelvelabs_service.sync_existing_assets(user_id)
        return {"success": True, "message": "Asset sync started"}
    except Exception as e:
        logger.error(f"❌ [API] Error syncing existing assets: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assets/index-stats")
async def get_user_index_stats(user_id: str = "user123"):
    """Get statistics about a user's TwelveLabs index."""
    try:
        stats = await twelvelabs_service.get_user_index_stats(user_id)
        return stats
    except Exception as e:
        logger.error(f"❌ [API] Error getting index stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str):
    """
    Delete an asset by ID: remove from Supabase Storage and delete DB record.
    """
    supabase = get_supabase_client()
    try:
        # Look up asset
        result = supabase.table("assets").select("*").eq("id", asset_id).execute()
        records = result.data or []
        if not records:
            raise HTTPException(status_code=404, detail="Asset not found")
        asset = records[0]
        path = asset.get("path")

        # Best-effort: remove storage object (skip error if missing)
        try:
            if path:
                remove_resp = supabase.storage.from_(SUPABASE_BUCKET).remove(path)
                # Some clients expect list; if above fails, try list form
                if getattr(remove_resp, "error", None):
                    supabase.storage.from_(SUPABASE_BUCKET).remove([path])
        except Exception as e:
            # Log but do not block DB deletion
            logger.warning(f"[Assets] Storage remove failed for {path}: {e}")

        # Delete DB record
        supabase.table("assets").delete().eq("id", asset_id).execute()

        return {"success": True, "deleted_id": asset_id, "deleted_path": path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")

# ================== LEGACY UPLOAD ENDPOINT ==================

@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    file_location = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_location, "wb") as f:
        f.write(await file.read())
    # Return a relative path for use in the asset store and timeline
    return JSONResponse({"file_path": f"{UPLOAD_DIR}/{file.filename}"}) 