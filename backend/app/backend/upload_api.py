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
    asset_data = {
        "path": payload.path,
        "original_name": payload.originalName,
        "duration": duration,
        "width": width,
        "height": height,
        "size": payload.size,
        "mimetype": payload.mimetype,
        # TODO: Add user_id from auth if available
    }
    # Insert into assets table
    try:
        result = supabase.table("assets").insert(asset_data).execute()
        if result.data and len(result.data) > 0:
            asset_id = result.data[0]["id"]
            return RegisterAssetResponse(id=asset_id, status="registered")
        else:
            raise HTTPException(status_code=500, detail="Failed to insert asset metadata.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase error: {e}")

@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    file_location = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_location, "wb") as f:
        f.write(await file.read())
    # Return a relative path for use in the asset store and timeline
    return JSONResponse({"file_path": f"{UPLOAD_DIR}/{file.filename}"}) 