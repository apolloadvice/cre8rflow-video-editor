from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging
import os
import tempfile
import json
from pathlib import Path

from .ges_service import (
    get_ges_service, 
    cleanup_ges_service,
    TimelineClip,
    TimelineData,
    is_ges_available
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Request/Response Models
class TimelineClipRequest(BaseModel):
    id: str
    name: str
    start: float  # seconds
    end: float    # seconds
    duration: float  # seconds
    file_path: str
    type: str
    in_point: float = 0.0  # seconds

class CreateTimelineRequest(BaseModel):
    clips: List[TimelineClipRequest]
    frame_rate: float = 30.0
    width: int = 1920
    height: int = 1080
    sample_rate: int = 48000
    channels: int = 2

class SeekRequest(BaseModel):
    position: float  # seconds

class ExportRequest(BaseModel):
    output_path: str
    format_string: str = "video/x-h264+audio/mpeg"

class GESResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

def check_ges_availability():
    """Check if GES is available and raise HTTPException if not"""
    if not is_ges_available():
        raise HTTPException(
            status_code=503, 
            detail="GStreamer Editing Services not available. Install with: ./install_ges.sh (macOS) or apt-get install python3-gi (Ubuntu)"
        )

@router.get("/ges/availability", response_model=GESResponse)
async def check_availability():
    """
    Check if GES is available on this system
    """
    available = is_ges_available()
    
    return GESResponse(
        success=available,
        message="GES is available" if available else "GES is not installed",
        data={
            "ges_available": available,
            "install_command_macos": "./install_ges.sh",
            "install_command_ubuntu": "apt-get install python3-gi gstreamer1.0-tools libges-1.0-dev"
        }
    )

@router.post("/ges/create-timeline", response_model=GESResponse)
async def create_timeline(request: CreateTimelineRequest):
    """
    Create a GES timeline from clip data
    """
    check_ges_availability()
    
    try:
        logger.info(f"Creating GES timeline with {len(request.clips)} clips")
        
        # Convert request clips to service clips
        timeline_clips = [
            TimelineClip(
                id=clip.id,
                name=clip.name,
                start=clip.start,
                end=clip.end,
                duration=clip.duration,
                file_path=clip.file_path,
                type=clip.type,
                in_point=clip.in_point
            )
            for clip in request.clips
        ]
        
        timeline_data = TimelineData(
            clips=timeline_clips,
            frame_rate=request.frame_rate,
            width=request.width,
            height=request.height,
            sample_rate=request.sample_rate,
            channels=request.channels
        )
        
        # Get GES service and create timeline
        ges_service = get_ges_service()
        success = ges_service.create_timeline_from_data(timeline_data)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to create GES timeline")
        
        duration = ges_service.get_timeline_duration()
        
        return GESResponse(
            success=True,
            message="Timeline created successfully",
            data={
                "timeline_duration": duration,
                "clips_count": len(timeline_clips)
            }
        )
        
    except Exception as e:
        logger.error(f"Error creating timeline: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create timeline: {str(e)}")

@router.post("/ges/start-preview", response_model=GESResponse)
async def start_preview(port: int = 8554):
    """
    Start GES preview server
    """
    check_ges_availability()
    
    try:
        logger.info(f"Starting GES preview on port {port}")
        
        ges_service = get_ges_service()
        success = ges_service.start_preview_server(port)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to start preview server")
        
        return GESResponse(
            success=True,
            message="Preview server started",
            data={"port": port}
        )
        
    except Exception as e:
        logger.error(f"Error starting preview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start preview: {str(e)}")

@router.post("/ges/stop-preview", response_model=GESResponse)
async def stop_preview():
    """
    Stop GES preview server
    """
    check_ges_availability()
    
    try:
        logger.info("Stopping GES preview")
        
        ges_service = get_ges_service()
        ges_service.stop_preview()
        
        return GESResponse(
            success=True,
            message="Preview server stopped"
        )
        
    except Exception as e:
        logger.error(f"Error stopping preview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to stop preview: {str(e)}")

@router.post("/ges/seek", response_model=GESResponse)
async def seek_to_position(request: SeekRequest):
    """
    Seek to a specific position in the timeline
    """
    check_ges_availability()
    
    try:
        logger.info(f"Seeking to position {request.position}s")
        
        ges_service = get_ges_service()
        success = ges_service.seek_to_position(request.position)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to seek")
        
        return GESResponse(
            success=True,
            message=f"Seeked to position {request.position}s"
        )
        
    except Exception as e:
        logger.error(f"Error seeking: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to seek: {str(e)}")

@router.post("/ges/export", response_model=GESResponse)
async def export_timeline(request: ExportRequest, background_tasks: BackgroundTasks):
    """
    Export timeline to video file
    """
    check_ges_availability()
    
    try:
        logger.info(f"Starting export to {request.output_path}")
        
        # Ensure output directory exists
        output_dir = os.path.dirname(request.output_path)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        ges_service = get_ges_service()
        
        # Run export in background task
        def run_export():
            try:
                success = ges_service.export_timeline(
                    request.output_path, 
                    request.format_string
                )
                if success:
                    logger.info(f"Export completed: {request.output_path}")
                else:
                    logger.error(f"Export failed: {request.output_path}")
            except Exception as e:
                logger.error(f"Export error: {e}")
        
        background_tasks.add_task(run_export)
        
        return GESResponse(
            success=True,
            message="Export started",
            data={
                "output_path": request.output_path,
                "format": request.format_string
            }
        )
        
    except Exception as e:
        logger.error(f"Error starting export: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start export: {str(e)}")

@router.get("/ges/status", response_model=GESResponse)
async def get_status():
    """
    Get GES service status
    """
    try:
        # Always allow status check, even if GES is not available
        if not is_ges_available():
            return GESResponse(
                success=False,
                message="GES not available",
                data={
                    "has_timeline": False,
                    "is_running": False,
                    "timeline_duration": 0,
                    "ges_available": False
                }
            )
        
        ges_service = get_ges_service()
        
        data = {
            "has_timeline": ges_service.timeline is not None,
            "is_running": ges_service.is_running,
            "timeline_duration": ges_service.get_timeline_duration(),
            "ges_available": True
        }
        
        return GESResponse(
            success=True,
            message="Status retrieved",
            data=data
        )
        
    except Exception as e:
        logger.error(f"Error getting status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")

@router.post("/ges/cleanup", response_model=GESResponse)
async def cleanup():
    """
    Clean up GES resources
    """
    try:
        logger.info("Cleaning up GES resources")
        
        if is_ges_available():
            cleanup_ges_service()
        
        return GESResponse(
            success=True,
            message="GES resources cleaned up"
        )
        
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup: {str(e)}")

# Command API mappings for common NLP intents
@router.post("/ges/commands/cut-clip", response_model=GESResponse)
async def cut_clip(clip_id: str, cut_position: float):
    """
    Cut a clip at the specified position
    NLP Intent: "cut dead space" / "split clip at 30 seconds"
    """
    check_ges_availability()
    
    try:
        # This would require extending the GES service to support clip editing
        # For now, return a placeholder response
        return GESResponse(
            success=False,
            message="Clip cutting not yet implemented in GES service"
        )
        
    except Exception as e:
        logger.error(f"Error cutting clip: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cut clip: {str(e)}")

@router.post("/ges/commands/move-clip", response_model=GESResponse)
async def move_clip(clip_id: str, new_start_time: float):
    """
    Move a clip to a new position
    NLP Intent: "move clip to 0:30"
    """
    check_ges_availability()
    
    try:
        # This would require extending the GES service to support clip repositioning
        # For now, return a placeholder response
        return GESResponse(
            success=False,
            message="Clip moving not yet implemented in GES service"
        )
        
    except Exception as e:
        logger.error(f"Error moving clip: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to move clip: {str(e)}")

@router.post("/ges/commands/add-text", response_model=GESResponse)
async def add_text_overlay(text: str, start_time: float, duration: float):
    """
    Add text overlay to timeline
    NLP Intent: "add text overlay"
    """
    check_ges_availability()
    
    try:
        # This would add a text clip to the timeline
        # For now, return a placeholder response
        return GESResponse(
            success=False,
            message="Text overlay addition not yet implemented in GES service"
        )
        
    except Exception as e:
        logger.error(f"Error adding text overlay: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add text overlay: {str(e)}") 