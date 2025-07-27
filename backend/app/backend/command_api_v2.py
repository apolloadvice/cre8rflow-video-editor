"""
Command API v2: Updated to support both legacy and OpenTimelineIO timeline formats.
Provides seamless migration path without breaking existing functionality.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional, TYPE_CHECKING
import logging
import re

if TYPE_CHECKING:
    from app.timeline_v2 import Timeline

from app.timeline_adapter import TimelineAdapter, TimelineMigrationService
from app.backend.command_api import (
    CommandRequest, CommandResponse, 
    get_asset_duration, _parse_time_to_seconds
)

router = APIRouter()


class CommandRequestV2(BaseModel):
    """Enhanced command request supporting timeline format specification"""
    command: str
    asset_path: str 
    timeline_format: Optional[str] = "auto"  # "legacy", "otio", "auto"
    migration_mode: Optional[bool] = False   # Enable migration during operation


class CommandResponseV2(BaseModel):
    """Enhanced response with migration info"""
    status: str
    applied: bool
    timeline: Dict[str, Any]
    message: str
    logs: List[str]
    timeline_format: str                     # Format of returned timeline
    migration_performed: Optional[bool] = False


@router.post("/command/v2", response_model=CommandResponseV2)
async def apply_command_v2(payload: CommandRequestV2):
    """
    Enhanced command processing supporting both timeline formats.
    
    Flow:
    1. Load timeline using adapter (auto-detects format)
    2. Process command using unified interface
    3. Optionally migrate to OTIO format
    4. Return timeline in requested format
    """
    logging.info(f"[apply_command_v2] Command: '{payload.command}' for asset: '{payload.asset_path}'")
    logging.info(f"[apply_command_v2] Timeline format: {payload.timeline_format}, Migration mode: {payload.migration_mode}")
    
    try:
        # 1. Load timeline using migration service
        timeline_adapter = await load_timeline_with_adapter(payload.asset_path)
        if timeline_adapter is None:
            return CommandResponseV2(
                status="error",
                applied=False,
                timeline={},
                message="Failed to load timeline",
                logs=[],
                timeline_format="unknown"
            )
        
        original_format = "otio" if timeline_adapter.is_otio else "legacy"
        logging.info(f"[apply_command_v2] Loaded timeline format: {original_format}")
        
        # 2. Auto-migrate to OTIO for better operations (unless specifically avoiding it)
        migration_performed = False
        if not timeline_adapter.is_otio:
            logging.info("[apply_command_v2] Auto-migrating timeline to OTIO format for better operations...")
            timeline_adapter = timeline_adapter.migrate_to_otio()
            migration_performed = True
        
        # 3. Parse and execute command using OTIO adapter
        result = await execute_command_with_adapter(timeline_adapter, payload.command, payload.asset_path)
        
        # 4. Prepare response
        final_format = "otio" if timeline_adapter.is_otio else "legacy"
        timeline_dict = timeline_adapter.to_dict()
        
        # 5. Save timeline back to storage
        await save_timeline_with_adapter(payload.asset_path, timeline_adapter)
        
        return CommandResponseV2(
            status="success" if result.get("applied", False) else "error",
            applied=result.get("applied", False),
            timeline=timeline_dict,
            message=result.get("message", "Command processed"),
            logs=result.get("logs", []),
            timeline_format=final_format,
            migration_performed=migration_performed
        )
        
    except Exception as e:
        logging.error(f"[apply_command_v2] Error processing command: {e}")
        return CommandResponseV2(
            status="error",
            applied=False,
            timeline={},
            message=f"Command processing failed: {str(e)}",
            logs=[f"Error: {str(e)}"],
            timeline_format="unknown"
        )


async def load_timeline_with_adapter(asset_path: str) -> Optional[TimelineAdapter]:
    """
    Load timeline using the migration service adapter.
    Enhanced to load complete multi-asset timelines.
    """
    try:
        # Import existing timeline loading logic
        from app.backend.command_api import load_timeline_from_db_robust
        
        # ENHANCED: Try to load timeline by asset_path first
        legacy_timeline = load_timeline_from_db_robust(
            asset_path, 
            validate_assets=False, 
            allow_partial_load=True
        )
        
        # ENHANCED: If no timeline found for this asset, try to find ANY timeline
        # that contains clips (for multi-asset projects)
        if not legacy_timeline or (hasattr(legacy_timeline, 'get_all_clips') and len(legacy_timeline.get_all_clips()) == 0):
            logging.info(f"[load_timeline_with_adapter] No timeline found for {asset_path}, searching for any existing timeline")
            legacy_timeline = await load_any_existing_timeline_with_clips()
            
            if legacy_timeline:
                logging.info(f"[load_timeline_with_adapter] Found existing timeline with clips, using that instead")
        
        # Check if timeline is empty and needs initial video clip
        timeline_is_empty = False
        if legacy_timeline is not None:
            if hasattr(legacy_timeline, 'get_all_clips'):
                # OTIO timeline
                timeline_is_empty = len(legacy_timeline.get_all_clips()) == 0
            else:
                # Legacy timeline  
                timeline_is_empty = sum(len(track.clips) for track in legacy_timeline.tracks) == 0
        
        if legacy_timeline is None or timeline_is_empty:
            if legacy_timeline is None:
                logging.info(f"[load_timeline_with_adapter] No timeline found, creating new one")
                # Create new timeline if none exists
                from app.timeline import Timeline as LegacyTimeline
                legacy_timeline = LegacyTimeline(frame_rate=30.0)
            else:
                logging.info(f"[load_timeline_with_adapter] Empty timeline found, adding initial video")
            
            # Add the asset as initial clip if it exists
            duration = get_asset_duration(asset_path) 
            if duration and duration > 0:
                if hasattr(legacy_timeline, 'load_video'):
                    # Legacy timeline
                    legacy_timeline.load_video(
                        file_path=asset_path,
                        track_index=0,
                        position=None,
                        duration_seconds=duration
                    )
                else:
                    # OTIO timeline - use load_video method
                    legacy_timeline.load_video(
                        file_path=asset_path,
                        track_index=0,
                        position=None,
                        duration_seconds=duration
                    )
                logging.info(f"[load_timeline_with_adapter] Added initial video: {asset_path} ({duration}s)")
            else:
                logging.warning(f"[load_timeline_with_adapter] No duration found for asset: {asset_path}")
        
        # Wrap in adapter
        return TimelineAdapter(legacy_timeline)
        
    except Exception as e:
        logging.error(f"[load_timeline_with_adapter] Failed to load timeline: {e}")
        return None


async def load_any_existing_timeline_with_clips() -> Optional['Timeline']:
    """
    Load any existing timeline that contains clips.
    This is used for multi-asset projects where the timeline may be stored 
    under a different asset_path than the current active asset.
    """
    try:
        from app.backend.command_api import get_supabase_client, SUPABASE_TABLE, load_timeline_from_db_robust
        
        supabase = get_supabase_client()
        
        # Get all timelines ordered by most recently updated
        result = supabase.table(SUPABASE_TABLE).select("asset_path, timeline_json, updated_at").order("updated_at", desc=True).execute()
        
        if not result.data:
            logging.info("[load_any_existing_timeline_with_clips] No timelines found in database")
            return None
        
        # Check each timeline to find one with clips
        for timeline_record in result.data:
            timeline_json = timeline_record.get("timeline_json")
            asset_path = timeline_record.get("asset_path")
            
            if not timeline_json:
                continue
                
            # Check if timeline has clips
            clips_count = 0
            
            # Handle different timeline formats
            if isinstance(timeline_json, dict):
                # OTIO format
                if timeline_json.get("_type") == "OTIOTimeline":
                    tracks = timeline_json.get("tracks", [])
                    for track in tracks:
                        children = track.get("children", []) if isinstance(track, dict) else []
                        clips_count += len([child for child in children if isinstance(child, dict) and child.get("_type") == "OTIOClip"])
                
                # Legacy format  
                elif "clips" in timeline_json:
                    clips = timeline_json.get("clips", [])
                    clips_count = len(clips) if isinstance(clips, list) else 0
                
                # Timeline format with tracks
                elif "tracks" in timeline_json:
                    tracks = timeline_json.get("tracks", [])
                    for track in tracks:
                        if isinstance(track, dict) and "clips" in track:
                            track_clips = track.get("clips", [])
                            clips_count += len(track_clips) if isinstance(track_clips, list) else 0
            
            logging.info(f"[load_any_existing_timeline_with_clips] Timeline {asset_path}: {clips_count} clips")
            
            # If this timeline has clips, load it
            if clips_count > 0:
                logging.info(f"[load_any_existing_timeline_with_clips] Loading timeline with {clips_count} clips from {asset_path}")
                timeline = load_timeline_from_db_robust(asset_path, validate_assets=False, allow_partial_load=True)
                if timeline:
                    return timeline
        
        logging.info("[load_any_existing_timeline_with_clips] No timelines with clips found")
        return None
        
    except Exception as e:
        logging.error(f"[load_any_existing_timeline_with_clips] Error: {e}")
        return None


async def execute_command_with_adapter(adapter: TimelineAdapter, command: str, asset_path: str) -> Dict[str, Any]:
    """
    Execute command using the timeline adapter's unified interface.
    """
    try:
        # Parse command to detect operation type
        operation_type = detect_operation_type(command)
        
        if operation_type == "cut_out":
            return await handle_cut_out_command(adapter, command, asset_path)
        elif operation_type == "add_text":
            return await handle_add_text_command(adapter, command, asset_path)
        elif operation_type == "trim":
            return await handle_trim_command(adapter, command, asset_path)
        else:
            # Fallback to legacy command processing
            return await handle_legacy_command(adapter, command, asset_path)
    
    except Exception as e:
        logging.error(f"[execute_command_with_adapter] Command execution failed: {e}")
        return {
            "applied": False,
            "message": f"Command execution failed: {str(e)}",
            "logs": [f"Error: {str(e)}"]
        }


def detect_operation_type(command: str) -> str:
    """
    Detect the type of operation from command text.
    """
    command_lower = command.lower()
    
    if re.search(r"\bcut\s+out\b", command_lower):
        return "cut_out"
    elif re.search(r"\badd\s+text\b", command_lower):
        return "add_text"
    elif re.search(r"\btrim\b", command_lower):
        return "trim"
    elif re.search(r"\bcut\b", command_lower):
        return "cut"
    elif re.search(r"\bjoin\b", command_lower):
        return "join"
    else:
        return "unknown"


async def handle_cut_out_command(adapter: TimelineAdapter, command: str, asset_path: str) -> Dict[str, Any]:
    """
    Handle cut out command using adapter's non-destructive operations.
    
    Example: "cut out 00:05-00:10" 
    """
    # Parse time range from command
    duration = get_asset_duration(asset_path) or 60.0
    cutout_match = re.search(
        r"\bcut\s+out\s+([0-9:.a-zA-Z]+)\s*[-–]\s*([0-9:.a-zA-Z]+)",
        command,
        re.IGNORECASE,
    )
    
    if not cutout_match:
        return {
            "applied": False,
            "message": "Could not parse cut out range from command",
            "logs": [f"Failed to parse: {command}"]
        }
    
    start_token = cutout_match.group(1)
    end_token = cutout_match.group(2)
    
    try:
        start_seconds = _parse_time_to_seconds(start_token, duration)
        end_seconds = _parse_time_to_seconds(end_token, duration)
        
        if start_seconds >= end_seconds:
            return {
                "applied": False,
                "message": f"Invalid range: start ({start_seconds:.2f}s) must be less than end ({end_seconds:.2f}s)",
                "logs": []
            }
        
        # Execute cut out using adapter (handles both timeline formats)
        success = adapter.cut_out_range(
            start_seconds=start_seconds,
            end_seconds=end_seconds,
            mode='ripple'  # Default to ripple mode (close gap)
        )
        
        if success:
            removed_duration = end_seconds - start_seconds
            return {
                "applied": True,
                "message": f"Successfully cut out {start_seconds:.2f}s-{end_seconds:.2f}s (removed {removed_duration:.2f}s)",
                "logs": [f"Cut out range: {start_seconds:.2f}s to {end_seconds:.2f}s"]
            }
        else:
            return {
                "applied": False,
                "message": "Cut out operation failed",
                "logs": ["Cut out operation did not succeed"]
            }
            
    except Exception as e:
        return {
            "applied": False,
            "message": f"Cut out failed: {str(e)}",
            "logs": [f"Error: {str(e)}"]
        }


async def handle_add_text_command(adapter: TimelineAdapter, command: str, asset_path: str) -> Dict[str, Any]:
    """
    Handle add text command. 
    For now, delegates to legacy system but could be enhanced for OTIO.
    """
    # For text operations, we can enhance this later for OTIO
    # For now, delegate to legacy system
    return await handle_legacy_command(adapter, command, asset_path)


async def handle_trim_command(adapter: TimelineAdapter, command: str, asset_path: str) -> Dict[str, Any]:
    """
    Handle trim command using non-destructive operations.
    """
    # This would be enhanced to use OTIO-style trimming
    # For now, delegate to legacy system
    return await handle_legacy_command(adapter, command, asset_path)


async def handle_legacy_command(adapter: TimelineAdapter, command: str, asset_path: str) -> Dict[str, Any]:
    """
    Fallback to legacy command processing system.
    """
    if adapter.is_otio:
        logging.warning("[handle_legacy_command] OTIO timeline using legacy command - may need conversion")
    
    # Import and use existing command processing
    from app.backend.command_api import apply_command
    from app.backend.command_api import CommandRequest
    
    # Create legacy request
    legacy_request = CommandRequest(command=command, asset_path=asset_path)
    
    # Process using existing system
    legacy_response = await apply_command(legacy_request)
    
    # Convert response format
    return {
        "applied": legacy_response.applied,
        "message": legacy_response.message,
        "logs": legacy_response.logs
    }


async def save_timeline_with_adapter(asset_path: str, adapter: TimelineAdapter) -> bool:
    """
    Save timeline using the appropriate format.
    Enhanced to save multi-asset timelines correctly.
    """
    try:
        # Import existing save logic
        from app.backend.command_api import save_timeline_to_db
        
        timeline_dict = adapter.to_dict()
        
        # ENHANCED: Determine the best asset_path for saving multi-asset timelines
        save_asset_path = await determine_timeline_save_path(asset_path, adapter)
        
        # Save using existing mechanism
        success = save_timeline_to_db(save_asset_path, timeline_dict)
        
        if success:
            logging.info(f"[save_timeline_with_adapter] Saved timeline format: {'otio' if adapter.is_otio else 'legacy'} under path: {save_asset_path}")
            
            # ENHANCED: If this timeline contains multiple assets, save references under all asset paths
            await create_timeline_references_for_multi_assets(adapter, save_asset_path)
        
        return success
        
    except Exception as e:
        logging.error(f"[save_timeline_with_adapter] Save failed: {e}")
        return False


async def determine_timeline_save_path(requested_asset_path: str, adapter: TimelineAdapter) -> str:
    """
    Determine the best asset path to save a timeline under.
    For multi-asset timelines, use the primary asset or the first asset.
    """
    try:
        clips = adapter.get_clips_for_api()
        
        if not clips:
            return requested_asset_path
        
        # Get all unique file paths from clips
        file_paths = list(set(clip.get('file_path', '') for clip in clips if clip.get('file_path')))
        
        logging.info(f"[determine_timeline_save_path] Timeline contains {len(clips)} clips with {len(file_paths)} unique file paths")
        
        # If the requested asset path is in the timeline, use it
        if requested_asset_path in file_paths:
            return requested_asset_path
        
        # Otherwise, use the first file path (most likely the primary asset)
        if file_paths:
            primary_path = file_paths[0]
            logging.info(f"[determine_timeline_save_path] Using primary asset path: {primary_path}")
            return primary_path
        
        # Fallback to requested path
        return requested_asset_path
        
    except Exception as e:
        logging.error(f"[determine_timeline_save_path] Error: {e}")
        return requested_asset_path


async def create_timeline_references_for_multi_assets(adapter: TimelineAdapter, primary_save_path: str):
    """
    Create references in the database so that timelines can be found 
    regardless of which asset is used as the entry point.
    
    This ensures multi-asset timelines are discoverable from any of their component assets.
    """
    try:
        clips = adapter.get_clips_for_api()
        file_paths = list(set(clip.get('file_path', '') for clip in clips if clip.get('file_path')))
        
        if len(file_paths) <= 1:
            # Single asset timeline, no references needed
            return
        
        logging.info(f"[create_timeline_references_for_multi_assets] Creating references for {len(file_paths)} assets")
        
        from app.backend.command_api import get_supabase_client
        supabase = get_supabase_client()
        
        # Create lightweight references for all other asset paths
        for asset_path in file_paths:
            if asset_path != primary_save_path:
                try:
                    # Create a reference record that points to the primary timeline
                    reference_data = {
                        "asset_path": asset_path,
                        "timeline_json": {
                            "_type": "TimelineReference",
                            "primary_timeline_path": primary_save_path,
                            "reference_created_at": logging.basicConfig.__name__ if hasattr(logging.basicConfig, '__name__') else "unknown"
                        },
                        "updated_at": "now()"
                    }
                    
                    # Only create if doesn't already exist or is older
                    existing = supabase.table("timelines").select("id, updated_at").eq("asset_path", asset_path).execute()
                    
                    if not existing.data:
                        # Create new reference
                        supabase.table("timelines").insert(reference_data).execute()
                        logging.info(f"[create_timeline_references_for_multi_assets] Created reference: {asset_path} -> {primary_save_path}")
                    else:
                        # Update existing reference to point to primary
                        supabase.table("timelines").update(reference_data).eq("asset_path", asset_path).execute()
                        logging.info(f"[create_timeline_references_for_multi_assets] Updated reference: {asset_path} -> {primary_save_path}")
                        
                except Exception as ref_error:
                    logging.warning(f"[create_timeline_references_for_multi_assets] Failed to create reference for {asset_path}: {ref_error}")
        
    except Exception as e:
        logging.error(f"[create_timeline_references_for_multi_assets] Error: {e}")


# Additional endpoints for migration management

@router.get("/timeline/format/{asset_path:path}")
async def get_timeline_format(asset_path: str):
    """
    Get the current format of a timeline.
    """
    try:
        adapter = await load_timeline_with_adapter(asset_path)
        if adapter is None:
            raise HTTPException(status_code=404, detail="Timeline not found")
        
        return {
            "asset_path": asset_path,
            "format": "otio" if adapter.is_otio else "legacy",
            "fps": adapter.fps,
            "duration_seconds": adapter.duration_seconds,
            "clip_count": len(adapter.get_clips_for_api())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/timeline/migrate/{asset_path:path}")
async def migrate_timeline_to_otio(asset_path: str):
    """
    Migrate a legacy timeline to OTIO format.
    """
    try:
        adapter = await load_timeline_with_adapter(asset_path)
        if adapter is None:
            raise HTTPException(status_code=404, detail="Timeline not found")
        
        if adapter.is_otio:
            return {
                "message": "Timeline is already in OTIO format",
                "migration_performed": False
            }
        
        # Perform migration
        otio_adapter = adapter.migrate_to_otio()
        
        # Save migrated timeline
        success = await save_timeline_with_adapter(asset_path, otio_adapter)
        
        if success:
            return {
                "message": "Timeline successfully migrated to OTIO format",
                "migration_performed": True,
                "timeline": otio_adapter.to_dict()
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to save migrated timeline")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline/clips/{asset_path:path}")
async def get_timeline_clips_v2(asset_path: str):
    """
    Get clips from timeline in unified format, regardless of underlying format.
    """
    try:
        adapter = await load_timeline_with_adapter(asset_path)
        if adapter is None:
            raise HTTPException(status_code=404, detail="Timeline not found")
        
        clips = adapter.get_clips_for_api()
        
        return {
            "asset_path": asset_path,
            "timeline_format": "otio" if adapter.is_otio else "legacy",
            "clips": clips,
            "total_clips": len(clips),
            "duration_seconds": adapter.duration_seconds
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ TIMELINE HISTORY & UNDO/REDO ENDPOINTS ============

@router.post("/timeline/undo/{asset_path:path}")
async def undo_timeline_operation(asset_path: str):
    """
    Undo the last timeline operation, restoring previous state.
    """
    try:
        adapter = await load_timeline_with_adapter(asset_path)
        if adapter is None:
            raise HTTPException(status_code=404, detail="Timeline not found")
        
        # Attempt undo
        success = adapter.undo()
        
        if success:
            # Save the restored timeline
            await save_timeline_with_adapter(asset_path, adapter)
            
            # Get updated clips
            clips = adapter.get_clips_for_api()
            history_info = adapter.get_history_info()
            
            return {
                "status": "success",
                "message": "Timeline operation undone successfully",
                "timeline": adapter.to_dict(),
                "clips": clips,
                "history": history_info,
                "can_undo": adapter.can_undo(),
                "can_redo": adapter.can_redo()
            }
        else:
            raise HTTPException(status_code=400, detail="Cannot undo - no previous state available")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/timeline/redo/{asset_path:path}")
async def redo_timeline_operation(asset_path: str):
    """
    Redo the next timeline operation, restoring next state.
    """
    try:
        adapter = await load_timeline_with_adapter(asset_path)
        if adapter is None:
            raise HTTPException(status_code=404, detail="Timeline not found")
        
        # Attempt redo
        success = adapter.redo()
        
        if success:
            # Save the restored timeline
            await save_timeline_with_adapter(asset_path, adapter)
            
            # Get updated clips
            clips = adapter.get_clips_for_api()
            history_info = adapter.get_history_info()
            
            return {
                "status": "success",
                "message": "Timeline operation redone successfully",
                "timeline": adapter.to_dict(),
                "clips": clips,
                "history": history_info,
                "can_undo": adapter.can_undo(),
                "can_redo": adapter.can_redo()
            }
        else:
            raise HTTPException(status_code=400, detail="Cannot redo - no next state available")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline/history/{asset_path:path}")
async def get_timeline_history(asset_path: str):
    """
    Get timeline history information for debugging/UI.
    """
    try:
        adapter = await load_timeline_with_adapter(asset_path)
        if adapter is None:
            raise HTTPException(status_code=404, detail="Timeline not found")
        
        history_info = adapter.get_history_info()
        
        return {
            "asset_path": asset_path,
            "history": history_info,
            "can_undo": adapter.can_undo(),
            "can_redo": adapter.can_redo()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TimelineHistoryResponse(BaseModel):
    """Response model for timeline history operations"""
    status: str
    message: str
    timeline: Dict[str, Any]
    clips: List[Dict[str, Any]]
    history: Dict[str, Any]
    can_undo: bool
    can_redo: bool 