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
    is_ges_available,
    get_ges_status
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
        
        # Convert request clips to service clips with proper error handling
        timeline_clips = []
        for clip in request.clips:
            try:
                # Validate the URI format
                uri = clip.file_path
                if not uri:
                    logger.warning(f"Skipping clip {clip.name}: empty file_path")
                    continue
                    
                # Log the URI we're trying to use
                logger.info(f"Processing clip {clip.name} with URI: {uri}")
                
                # Basic URI validation without creating GES objects
                if is_ges_available():
                    # Just check if it's a valid file path/URI format
                    if uri.startswith('file://'):
                        file_path = uri[7:]  # Remove 'file://' prefix
                        if not os.path.exists(file_path):
                            logger.error(f"❌ File does not exist: {file_path}")
                            raise HTTPException(
                                status_code=400,
                                detail=f"File not found for {clip.name}: {file_path}"
                            )
                    elif not uri.startswith(('http://', 'https://', 'rtsp://')):
                        # Assume it's a local file path, check if it exists
                        if not os.path.exists(uri):
                            logger.error(f"❌ File does not exist: {uri}")
                            raise HTTPException(
                                status_code=400,
                                detail=f"File not found for {clip.name}: {uri}"
                            )
                    
                    logger.info(f"✅ URI validated for {clip.name}")
                
                timeline_clips.append(TimelineClip(
                    id=clip.id,
                    name=clip.name,
                    start=clip.start,
                    end=clip.end,
                    duration=clip.duration,
                    file_path=uri,  # Use the URI directly - no downloads needed!
                    type=clip.type,
                    in_point=clip.in_point
                ))
                
            except HTTPException:
                raise  # Re-raise HTTP exceptions
            except Exception as e:
                logger.error(f"Error processing clip {clip.name}: {e}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Error processing clip {clip.name}: {str(e)}"
                )
        
        timeline_data = TimelineData(
            clips=timeline_clips,
            frame_rate=request.frame_rate,
            width=request.width,
            height=request.height,
            sample_rate=request.sample_rate,
            channels=request.channels
        )
        
        # Get GES service and create timeline
        try:
            ges_service = get_ges_service()
            
            # Clean up any existing timeline before creating a new one
            logger.info("Cleaning up existing timeline before creating new one")
            ges_service.cleanup()
            
            success = ges_service.create_timeline_from_data(timeline_data)
            
            if not success:
                raise HTTPException(status_code=500, detail="Failed to create GES timeline")
            
            duration = ges_service.get_timeline_duration()
                
            logger.info(f"✅ Successfully created GES timeline with {len(timeline_clips)} clips, duration: {duration}s")
            
            return GESResponse(
                success=True,
                message="Timeline created successfully",
                data={
                    "timeline_duration": duration,
                    "clips_count": len(timeline_clips)
                }
            )
            
        except Exception as ges_service_error:
            logger.error(f"❌ GES service error: {ges_service_error}")
            raise HTTPException(
                status_code=500, 
                detail=f"GES service error: {str(ges_service_error)}"
            )
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions with proper status codes
    except Exception as e:
        logger.error(f"❌ Unexpected error creating timeline: {e}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

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
        # Check status from ges_service module without initializing
        status_info = get_ges_status()
        
        if not status_info.get("available", False):
            return GESResponse(
                success=False,
                message="GES not available",
                data={
                    "has_timeline": False,
                    "is_running": False,
                    "timeline_duration": 0,
                    "ges_available": False,
                    "ges_initialized": False,
                    "has_imports": status_info.get("has_imports", False)
                }
            )
        
        # Only get service if GES is available and initialized
        ges_service = get_ges_service()
        
        data = {
            "has_timeline": ges_service.timeline is not None,
            "is_running": ges_service.is_running,
            "timeline_duration": ges_service.get_timeline_duration(),
            "ges_available": True,
            "ges_initialized": status_info.get("initialized", False),
            "has_imports": status_info.get("has_imports", False)
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
    Clean up GES resources and force memory cleanup
    """
    try:
        logger.info("🧹 Starting comprehensive GES cleanup...")
        
        # Get current status before cleanup
        try:
            status_before = get_ges_status()
            logger.info(f"Status before cleanup: initialized={status_before.get('initialized', False)}, available={status_before.get('available', False)}")
        except:
            logger.info("Could not get status before cleanup")
        
        # Always cleanup regardless of initialization state
        # Don't call is_ges_available() as it would initialize GStreamer just to clean it up
        cleanup_ges_service()
        
        # Force garbage collection after cleanup
        import gc
        gc.collect()
        
        # Get status after cleanup
        try:
            status_after = get_ges_status()
            logger.info(f"Status after cleanup: initialized={status_after.get('initialized', False)}, available={status_after.get('available', False)}")
        except:
            logger.info("Could not get status after cleanup")
        
        logger.info("✅ GES cleanup completed successfully")
        
        return GESResponse(
            success=True,
            message="GES resources cleaned up successfully",
            data={
                "cleanup_completed": True,
                "memory_freed": True
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Error during GES cleanup: {e}")
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

class SnapRequest(BaseModel):
    target_position: float
    clips: List[TimelineClipRequest] 
    track_filter: Optional[int] = None  # Optional: only snap to clips on specific track
    snap_threshold: float = 2.0  # Snap distance threshold in seconds
    include_timeline_markers: bool = True  # Include 0.0 and timeline end

@router.post("/ges/snap-to-clips", response_model=GESResponse)
async def snap_position_to_clips(request: SnapRequest):
    """
    Calculate optimal snap position for timeline clips during drag operations.
    Provides enhanced snapping logic for professional video editing workflow.
    """
    try:
        logger.info(f"Calculating snap position for {request.target_position}s with {len(request.clips)} clips")
        
        # Collect all snap points from clips
        snap_points = []
        
        # Add timeline markers if requested
        if request.include_timeline_markers:
            snap_points.append(0.0)  # Timeline start
        
        # Process clips to find snap points
        for clip in request.clips:
            # Skip clips on different tracks if track filter is specified
            if request.track_filter is not None and hasattr(clip, 'track') and getattr(clip, 'track', 0) != request.track_filter:
                continue
                
            # Add clip boundaries as snap points
            snap_points.append(clip.start)  # Clip start
            snap_points.append(clip.end)    # Clip end
            
            # Add clip midpoint for fine positioning
            midpoint = clip.start + (clip.duration / 2)
            snap_points.append(midpoint)
        
        # Add timeline end if we have clips
        if request.clips and request.include_timeline_markers:
            timeline_end = max(clip.end for clip in request.clips)
            snap_points.append(timeline_end)
        
        # Remove duplicates and sort
        snap_points = sorted(set(snap_points))
        
        # Find the best snap point within threshold
        eligible_points = [
            point for point in snap_points 
            if abs(point - request.target_position) <= request.snap_threshold
        ]
        
        if eligible_points:
            # Find the closest point within threshold
            nearest_point = min(eligible_points, key=lambda x: abs(x - request.target_position))
            snap_distance = abs(nearest_point - request.target_position)
            snapped = True
            
            # Determine snap type for better UX feedback
            snap_type = "unknown"
            for clip in request.clips:
                if abs(nearest_point - clip.start) < 0.01:
                    snap_type = "clip_start"
                    break
                elif abs(nearest_point - clip.end) < 0.01:
                    snap_type = "clip_end"
                    break
                elif abs(nearest_point - (clip.start + clip.duration / 2)) < 0.01:
                    snap_type = "clip_center"
                    break
            
            if nearest_point == 0.0:
                snap_type = "timeline_start"
            elif request.clips and nearest_point == max(clip.end for clip in request.clips):
                snap_type = "timeline_end"
                
        else:
            # No snap point within threshold - return original position
            nearest_point = request.target_position
            snap_distance = 0.0
            snapped = False
            snap_type = "none"
        
        # Calculate insertion index for clip reordering
        target_track = request.track_filter or 0
        track_clips = [clip for clip in request.clips if getattr(clip, 'track', 0) == target_track]
        sorted_clips = sorted(track_clips, key=lambda c: c.start)
        
        insertion_index = 0
        for i, clip in enumerate(sorted_clips):
            if nearest_point < clip.start:
                insertion_index = i
                break
            elif i == len(sorted_clips) - 1:
                insertion_index = len(sorted_clips)
                
        result_data = {
            "original_position": request.target_position,
            "snapped_position": nearest_point,
            "snap_distance": snap_distance,
            "snapped": snapped,
            "snap_type": snap_type,
            "insertion_index": insertion_index,
            "all_snap_points": snap_points[:20],  # Limit for performance
            "snap_threshold": request.snap_threshold
        }
        
        logger.debug(f"Snap calculation: {request.target_position}s → {nearest_point}s ({snap_type})")
        
        return GESResponse(
            success=True,
            message=f"Position snapped to {snap_type}" if snapped else "No snap applied",
            data=result_data
        )
        
    except Exception as e:
        logger.error(f"Error calculating snap position: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate snap: {str(e)}") 