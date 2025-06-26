from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
import tempfile
import os
from app.timeline import Timeline
from app.video_backend.ffmpeg_pipeline import FFMpegPipeline

router = APIRouter()

class TimelinePayload(BaseModel):
    timeline: dict  # Timeline JSON/dict

def remove_file(path: str):
    try:
        os.remove(path)
    except Exception:
        pass

@router.post("/preview", response_class=FileResponse)
async def generate_preview(payload: TimelinePayload, background_tasks: BackgroundTasks):
    """
    Generate a low-res/fast preview video for the given timeline state.
    Returns the preview video file for UI playback.
    """
    # Try to reconstruct the timeline and pipeline; return 400 for any failure
    try:
        timeline = Timeline.from_dict(payload.timeline)
        # Validate: must have at least one video clip
        video_clips = timeline.get_all_clips(track_type="video")
        if not video_clips:
            raise ValueError("Timeline must contain at least one valid video clip.")
        # Validate supported video file types (for preview too)
        supported_video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".m4v", ".mpg", ".mpeg", ".wmv"}
        for clip in video_clips:
            _, ext = os.path.splitext(clip.file_path or "")
            if ext.lower() not in supported_video_exts:
                raise HTTPException(status_code=400, detail=f"Invalid timeline: unsupported video file type '{ext}' for clip '{clip.name}'")
        pipeline = FFMpegPipeline(timeline)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid timeline or pipeline: {e}")

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmpfile:
        preview_path = tmpfile.name
    try:
        pipeline.render_preview(preview_path)
    except Exception as e:
        # Clean up temp file if render fails
        remove_file(preview_path)
        raise HTTPException(status_code=500, detail=f"Failed to render preview: {e}")
    # Schedule file for deletion after response
    background_tasks.add_task(remove_file, preview_path)
    return FileResponse(preview_path, media_type="video/mp4", filename="preview.mp4")

@router.post("/export", response_class=FileResponse)
async def export_video(payload: TimelinePayload, background_tasks: BackgroundTasks, quality: str = "high"):
    """
    Export the given timeline to a high-quality video file using ffmpeg.
    Returns the exported video file for download or further processing.
    Args:
        payload (TimelinePayload): The timeline state as a dict/JSON.
        background_tasks (BackgroundTasks): FastAPI background tasks for file cleanup.
        quality (str): Export quality ('high', 'medium', 'low').
    Returns:
        FileResponse: The exported video file.
    Raises:
        HTTPException: 400 for invalid timeline, 500 for export errors.
    """
    try:
        timeline = Timeline.from_dict(payload.timeline)
        video_clips = timeline.get_all_clips(track_type="video")
        if not video_clips:
            raise ValueError("Timeline must contain at least one valid video clip.")
        # Validate supported video file types
        supported_video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".m4v", ".mpg", ".mpeg", ".wmv"}
        for clip in video_clips:
            _, ext = os.path.splitext(clip.file_path or "")
            if ext.lower() not in supported_video_exts:
                raise HTTPException(status_code=400, detail=f"Invalid timeline: unsupported video file type '{ext}' for clip '{clip.name}'")
        pipeline = FFMpegPipeline(timeline)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid timeline or pipeline: {e}")

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmpfile:
        export_path = tmpfile.name
    try:
        pipeline.render_export(export_path, quality=quality)
    except Exception as e:
        remove_file(export_path)
        raise HTTPException(status_code=500, detail=f"Failed to export video: {e}")
    background_tasks.add_task(remove_file, export_path)
    return FileResponse(export_path, media_type="video/mp4", filename="export.mp4") 