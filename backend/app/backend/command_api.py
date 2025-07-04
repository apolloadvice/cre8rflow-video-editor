from fastapi import APIRouter, HTTPException, status, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.command_parser import CommandParser
from app.command_executor import CommandExecutor
from app.timeline import Timeline, VideoClip, Effect
from .schemas import CommandRequest, CommandResponse
import logging
from supabase import create_client, Client
import os
import json
from app.llm_parser import parse_command_with_llm
from datetime import datetime

logging.basicConfig(level=logging.DEBUG)

# Timeline schema version for GES compatibility
TIMELINE_SCHEMA_VERSION = "2.0"

def create_timeline_json_schema(clips: List[VideoClip], timeline: Timeline) -> dict:
    """
    Create a GES-compatible JSON schema for timeline data.
    This schema is designed for persistent storage in Supabase and provides
    a standardized format for timeline serialization.
    
    Args:
        clips (List[VideoClip]): List of video clips in the timeline
        timeline (Timeline): Timeline instance for frame rate and metadata
        
    Returns:
        dict: GES-compatible timeline schema
    """
    return {
        "version": TIMELINE_SCHEMA_VERSION,
        "timeline": {
            "frame_rate": timeline.frame_rate,
            "width": 1920,  # Default resolution
            "height": 1080,
            "sample_rate": 48000,  # Audio sample rate
            "channels": 2,  # Stereo audio
            "duration": timeline.get_duration_seconds() if hasattr(timeline, 'get_duration_seconds') else get_timeline_duration_seconds(clips, timeline)
        },
        "clips": [
            {
                "id": clip.clip_id,
                "name": clip.name,
                "file_path": clip.file_path,
                "timeline_start": clip.get_timeline_start_seconds(timeline),
                "timeline_end": clip.get_timeline_end_seconds(timeline),
                "duration": clip.get_duration_seconds(timeline),
                "in_point": clip.get_source_in_point_seconds(timeline),
                "track": getattr(clip, 'track_index', 0),
                "type": clip.track_type,
                "effects": [effect.to_dict() for effect in clip.effects]
            }
            for clip in clips
        ],
        "transitions": [],  # Future transitions support
        "metadata": {
            "created_at": datetime.utcnow().isoformat() + "Z",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "schema_version": TIMELINE_SCHEMA_VERSION
        }
    }

def get_timeline_duration_seconds(clips: List[VideoClip], timeline: Timeline) -> float:
    """
    Calculate timeline duration in seconds from clips.
    Fallback function if timeline doesn't have get_duration_seconds method.
    
    Args:
        clips (List[VideoClip]): List of clips to calculate duration from
        timeline (Timeline): Timeline for frame rate conversion
        
    Returns:
        float: Duration in seconds
    """
    if not clips:
        return 0.0
    
    max_end_seconds = 0.0
    for clip in clips:
        clip_end_seconds = clip.get_timeline_end_seconds(timeline)
        max_end_seconds = max(max_end_seconds, clip_end_seconds)
    
    return max_end_seconds

def create_video_clip_from_json(clip_data: dict, timeline: Timeline) -> VideoClip:
    """
    Create a VideoClip instance from JSON schema data.
    Supports both version 1.0 and 2.0 schema formats.
    
    Args:
        clip_data (dict): Clip data from JSON schema
        timeline (Timeline): Timeline for frame conversion
        
    Returns:
        VideoClip: Created VideoClip instance
    """
    # Convert seconds to frames for internal representation
    start_seconds = clip_data.get("timeline_start", clip_data.get("start", 0))
    end_seconds = clip_data.get("timeline_end", clip_data.get("end", 0))
    in_point_seconds = clip_data.get("in_point", 0)
    
    start_frame = timeline.seconds_to_frames(start_seconds)
    end_frame = timeline.seconds_to_frames(end_seconds)
    in_point_frame = timeline.seconds_to_frames(in_point_seconds)
    
    clip = VideoClip(
        name=clip_data["name"],
        start_frame=start_frame,
        end_frame=end_frame,
        track_type=clip_data.get("type", "video"),
        file_path=clip_data.get("file_path"),
        clip_id=clip_data.get("id"),
        in_point=in_point_frame,
        track_index=clip_data.get("track", 0)
    )
    
    # Add effects if present
    if "effects" in clip_data and isinstance(clip_data["effects"], list):
        clip.effects = [Effect.from_dict(effect_data) for effect_data in clip_data["effects"]]
    
    return clip

def migrate_timeline_schema(timeline_json: dict) -> dict:
    """
    Migrate older timeline schema to version 2.0 format.
    Handles backward compatibility for existing timeline data.
    
    Args:
        timeline_json (dict): Legacy timeline data
        
    Returns:
        dict: Migrated timeline data in version 2.0 format
    """
    current_version = timeline_json.get("version", "1.0")
    
    if current_version == "2.0":
        return timeline_json
    
    logging.info(f"Migrating timeline schema from {current_version} to {TIMELINE_SCHEMA_VERSION}")
    
    # Version 1.0 to 2.0 migration
    if current_version == "1.0":
        # Extract clips from track structure
        clips = []
        tracks = timeline_json.get("tracks", [])
        
        for track in tracks:
            track_clips = track.get("clips", [])
            for clip in track_clips:
                # Convert frame-based to seconds-based for schema
                if isinstance(clip, dict) and clip.get("_type") == "VideoClip":
                    migrated_clip = {
                        "id": clip.get("clip_id", clip.get("id")),
                        "name": clip.get("name", ""),
                        "file_path": clip.get("file_path", ""),
                        "timeline_start": clip.get("start", 0) / timeline_json.get("frame_rate", 30.0),
                        "timeline_end": clip.get("end", 0) / timeline_json.get("frame_rate", 30.0),
                        "duration": (clip.get("end", 0) - clip.get("start", 0)) / timeline_json.get("frame_rate", 30.0),
                        "in_point": clip.get("in_point", 0) / timeline_json.get("frame_rate", 30.0),
                        "track": clip.get("track_index", 0),
                        "type": clip.get("track_type", "video"),
                        "effects": clip.get("effects", [])
                    }
                    clips.append(migrated_clip)
        
        # Create new schema structure
        migrated_timeline = {
            "version": TIMELINE_SCHEMA_VERSION,
            "timeline": {
                "frame_rate": timeline_json.get("frame_rate", 30.0),
                "width": 1920,
                "height": 1080,
                "sample_rate": 48000,
                "channels": 2,
                "duration": max([clip["timeline_end"] for clip in clips]) if clips else 0.0
            },
            "clips": clips,
            "transitions": timeline_json.get("transitions", []),
            "metadata": {
                "created_at": datetime.utcnow().isoformat() + "Z",
                "updated_at": datetime.utcnow().isoformat() + "Z",
                "schema_version": TIMELINE_SCHEMA_VERSION,
                "migrated_from": current_version
            }
        }
        
        return migrated_timeline
    
    # For unknown versions, return as-is with warning
    logging.warning(f"Unknown timeline schema version: {current_version}")
    return timeline_json

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://fgvyotgowmcwcphsctlc.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndnlvdGdvd21jd2NwaHNjdGxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTczMjU5MCwiZXhwIjoyMDYxMzA4NTkwfQ.3JXr_BUDFs0c2cvNog2-igf_UWQ2H7CAp3WJL_JJLSM")
SUPABASE_TABLE = "timelines"

def get_supabase_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def load_timeline_from_db(asset_path: str):
    supabase = get_supabase_client()
    try:
        result = supabase.table(SUPABASE_TABLE).select("timeline_json").eq("asset_path", asset_path).single().execute()
        if result.data:
            return result.data["timeline_json"]
    except Exception as e:
        # If no row is found, just return None (expected for new assets)
        if hasattr(e, 'args') and e.args and 'PGRST116' in str(e.args[0]):
            return None
        # Otherwise, re-raise
        raise
    return None

def load_timeline_from_db_enhanced(asset_path: str) -> Optional[Timeline]:
    """
    Enhanced timeline loader with schema migration and error handling.
    Supports loading both legacy (v1.0) and new (v2.0) timeline formats.
    
    Args:
        asset_path (str): Path to the asset
        
    Returns:
        Optional[Timeline]: Loaded timeline or None if creation fails
    """
    timeline_json = load_timeline_from_db(asset_path)
    if not timeline_json:
        return create_default_timeline(asset_path)
    
    try:
        # Check schema version and migrate if necessary
        schema_version = timeline_json.get("version", "1.0")
        if schema_version < "2.0":
            logging.info(f"Migrating timeline schema from {schema_version} to {TIMELINE_SCHEMA_VERSION}")
            timeline_json = migrate_timeline_schema(timeline_json)
        
        # Extract timeline metadata
        timeline_data = timeline_json.get("timeline", {})
        timeline = Timeline(frame_rate=timeline_data.get("frame_rate", 30.0))
        
        # Load clips from JSON schema
        for clip_data in timeline_json.get("clips", []):
            video_clip = create_video_clip_from_json(clip_data, timeline)
            track_index = clip_data.get("track", 0)
            timeline.add_clip(video_clip, track_index=track_index)
        
        logging.info(f"Successfully loaded timeline with {len(timeline_json.get('clips', []))} clips")
        return timeline
        
    except Exception as e:
        logging.error(f"Failed to load timeline from enhanced schema: {e}")
        # Fallback to legacy loading method
        try:
            timeline = Timeline.from_dict(timeline_json)
            logging.info("Fallback to legacy timeline loading successful")
            return timeline
        except Exception as fallback_error:
            logging.error(f"Legacy fallback also failed: {fallback_error}")
            return create_default_timeline(asset_path)

def load_timeline_from_db_robust(asset_path: str, validate_assets: bool = True, 
                                 allow_partial_load: bool = True) -> Optional[Timeline]:
    """
    Robust timeline loader with comprehensive validation, error recovery, and asset checking.
    Provides detailed error reporting and handles edge cases gracefully.
    
    Args:
        asset_path (str): Path to the asset
        validate_assets (bool): Whether to validate referenced media files exist
        allow_partial_load (bool): Whether to continue loading if some clips fail
        
    Returns:
        Optional[Timeline]: Loaded timeline with detailed loading status
    """
    loading_stats = {
        "total_clips": 0,
        "loaded_clips": 0,
        "failed_clips": 0,
        "missing_assets": 0,
        "validation_errors": [],
        "performance_metrics": {}
    }
    
    start_time = datetime.utcnow()
    
    try:
        # Step 1: Load and validate timeline JSON
        timeline_json = load_timeline_from_db(asset_path)
        if not timeline_json:
            logging.info(f"No existing timeline found for {asset_path}, creating default")
            return create_default_timeline(asset_path)
        
        # Step 2: Validate timeline JSON structure
        validation_result = validate_timeline_json_structure(timeline_json)
        if not validation_result["valid"]:
            loading_stats["validation_errors"].extend(validation_result["errors"])
            if not allow_partial_load:
                logging.error(f"Timeline validation failed: {validation_result['errors']}")
                return create_default_timeline(asset_path)
        
        # Step 3: Schema migration if needed
        schema_version = timeline_json.get("version", "1.0")
        if schema_version < "2.0":
            logging.info(f"Migrating timeline schema from {schema_version} to {TIMELINE_SCHEMA_VERSION}")
            timeline_json = migrate_timeline_schema(timeline_json)
            
            # Re-validate after migration
            validation_result = validate_timeline_json_structure(timeline_json)
            if not validation_result["valid"]:
                loading_stats["validation_errors"].extend(validation_result["errors"])
        
        # Step 4: Create timeline with validated metadata
        timeline_data = timeline_json.get("timeline", {})
        frame_rate = timeline_data.get("frame_rate", 30.0)
        
        # Validate frame rate
        if not (1.0 <= frame_rate <= 120.0):
            logging.warning(f"Invalid frame rate {frame_rate}, using default 30.0")
            frame_rate = 30.0
            loading_stats["validation_errors"].append(f"Invalid frame rate corrected to 30.0")
        
        timeline = Timeline(frame_rate=frame_rate)
        
        # Step 5: Load clips with robust error handling
        clips_data = timeline_json.get("clips", [])
        loading_stats["total_clips"] = len(clips_data)
        
        for i, clip_data in enumerate(clips_data):
            try:
                # Validate individual clip data
                clip_validation = validate_clip_data(clip_data, timeline)
                if not clip_validation["valid"]:
                    loading_stats["validation_errors"].extend(clip_validation["errors"])
                    if not allow_partial_load:
                        raise ValueError(f"Clip {i} validation failed: {clip_validation['errors']}")
                
                # Check asset availability if requested
                if validate_assets and clip_data.get("file_path"):
                    asset_exists = check_asset_availability(clip_data["file_path"])
                    if not asset_exists:
                        loading_stats["missing_assets"] += 1
                        loading_stats["validation_errors"].append(f"Missing asset: {clip_data['file_path']}")
                        if not allow_partial_load:
                            raise FileNotFoundError(f"Asset not found: {clip_data['file_path']}")
                
                # Create and add clip
                video_clip = create_video_clip_from_json_robust(clip_data, timeline)
                track_index = clip_data.get("track", 0)
                
                # Validate track index
                if track_index < 0:
                    loading_stats["validation_errors"].append(f"Invalid track index {track_index}, using 0")
                    track_index = 0
                
                timeline.add_clip(video_clip, track_index=track_index)
                loading_stats["loaded_clips"] += 1
                
            except Exception as clip_error:
                loading_stats["failed_clips"] += 1
                error_msg = f"Failed to load clip {i}: {str(clip_error)}"
                loading_stats["validation_errors"].append(error_msg)
                logging.warning(error_msg)
                
                if not allow_partial_load:
                    raise clip_error
        
        # Step 6: Post-load validation and optimization
        timeline_validation = validate_timeline_integrity(timeline)
        if not timeline_validation["valid"]:
            loading_stats["validation_errors"].extend(timeline_validation["errors"])
        
        # Step 7: Performance metrics
        end_time = datetime.utcnow()
        loading_stats["performance_metrics"] = {
            "load_time_ms": (end_time - start_time).total_seconds() * 1000,
            "clips_per_second": loading_stats["loaded_clips"] / max((end_time - start_time).total_seconds(), 0.001)
        }
        
        # Step 8: Log results
        success_rate = loading_stats["loaded_clips"] / max(loading_stats["total_clips"], 1) * 100
        logging.info(f"Timeline loaded: {loading_stats['loaded_clips']}/{loading_stats['total_clips']} clips "
                    f"({success_rate:.1f}% success rate) in {loading_stats['performance_metrics']['load_time_ms']:.1f}ms")
        
        if loading_stats["validation_errors"]:
            logging.warning(f"Timeline loading completed with {len(loading_stats['validation_errors'])} warnings: "
                          f"{loading_stats['validation_errors'][:3]}{'...' if len(loading_stats['validation_errors']) > 3 else ''}")
        
        # Store loading stats for debugging
        timeline.loading_stats = loading_stats
        
        return timeline
        
    except Exception as e:
        loading_stats["performance_metrics"]["load_time_ms"] = (datetime.utcnow() - start_time).total_seconds() * 1000
        logging.error(f"Robust timeline loading failed after {loading_stats['performance_metrics']['load_time_ms']:.1f}ms: {e}")
        
        # Enhanced fallback strategy
        if allow_partial_load:
            # Try to load with the basic enhanced loader
            fallback_timeline = load_timeline_from_db_enhanced(asset_path)
            if fallback_timeline:
                fallback_timeline.loading_stats = loading_stats
                logging.info("Fallback to basic enhanced loader successful")
                return fallback_timeline
        
        # Final fallback to default timeline
        default_timeline = create_default_timeline(asset_path)
        default_timeline.loading_stats = loading_stats
        return default_timeline

def create_default_timeline(asset_path: str) -> Timeline:
    """
    Create a default timeline for new assets.
    Auto-creates timeline with primary asset if it exists.
    
    Args:
        asset_path (str): Path to the primary asset
        
    Returns:
        Timeline: New timeline instance
    """
    timeline = Timeline(frame_rate=30.0)
    
    # Try to get asset duration and create initial clip
    duration = get_asset_duration(asset_path)
    if duration is not None:
        logging.info(f"Creating default timeline with primary asset: {asset_path} (duration: {duration}s)")
        timeline.load_video(asset_path, duration_seconds=duration)
    else:
        logging.info(f"Creating empty timeline for asset: {asset_path}")
    
    return timeline

def get_asset_duration(asset_path: str) -> float:
    """
    Fetch the duration (in seconds) for the asset from the assets table in Supabase.
    Returns None if not found or not available. Uses the latest version if multiple exist.
    """
    supabase = get_supabase_client()
    try:
        # Fetch all rows for the asset path, order by updated_at descending, and use the latest
        result = supabase.table("assets").select("duration,updated_at").eq("path", asset_path).order("updated_at", desc=True).limit(1).execute()
        if result.data and len(result.data) > 0 and result.data[0].get("duration"):
            return float(result.data[0]["duration"])
    except Exception as e:
        logging.warning(f"[get_asset_duration] Could not fetch duration for {asset_path}: {e}")
    return None

def save_timeline_to_db(asset_path: str, timeline_dict: dict):
    supabase = get_supabase_client()
    # Try to fetch the existing row's id
    result = supabase.table(SUPABASE_TABLE).select("id").eq("asset_path", asset_path).execute()
    upsert_payload = {
        "asset_path": asset_path,
        "timeline_json": timeline_dict,
        "updated_at": "now()"
    }
    if result.data and len(result.data) > 0 and "id" in result.data[0]:
        upsert_payload["id"] = result.data[0]["id"]
    try:
        logging.info(f"[save_timeline_to_db] Upserting timeline for asset_path={asset_path}. Payload keys: {list(upsert_payload.keys())}")
        logging.debug(f"[save_timeline_to_db] Timeline JSON: {json.dumps(timeline_dict)[:500]}... (truncated)")
        upsert_result = supabase.table(SUPABASE_TABLE).upsert(upsert_payload).execute()
        logging.info(f"[save_timeline_to_db] Upsert result: {upsert_result}")
    except Exception as e:
        logging.error(f"[save_timeline_to_db] Supabase upsert error: {e}")
        raise

def save_timeline_to_db_enhanced(asset_path: str, timeline: Timeline):
    """
    Enhanced timeline saving using the new v2.0 schema format.
    Creates GES-compatible JSON schema for persistent storage.
    
    Args:
        asset_path (str): Path to the asset
        timeline (Timeline): Timeline instance to save
    """
    try:
        # Get all clips from timeline
        all_clips = timeline.get_all_clips("video")  # Start with video clips
        
        # Add clips from other track types
        for track_type in ["audio", "subtitle", "effect"]:
            try:
                track_clips = timeline.get_all_clips(track_type)
                all_clips.extend(track_clips)
            except Exception:
                # Track type might not exist, continue
                pass
        
        # Create GES-compatible schema
        timeline_schema = create_timeline_json_schema(all_clips, timeline)
        
        # Save to database
        save_timeline_to_db(asset_path, timeline_schema)
        
        logging.info(f"Successfully saved timeline with {len(all_clips)} clips using enhanced schema v{TIMELINE_SCHEMA_VERSION}")
        
    except Exception as e:
        logging.error(f"Enhanced timeline save failed, falling back to legacy format: {e}")
        # Fallback to legacy format
        save_timeline_to_db(asset_path, timeline.to_dict())

@router.post("/command", response_model=CommandResponse)
async def apply_command(payload: CommandRequest):
    """
    Receives an NLP command and the storage path of the asset.
    Loads or creates a Timeline, parses the command, mutates the timeline, and returns the updated timeline.
    Now uses LLM parser directly for better batch operation support.
    """
    logging.info(f"[apply_command] Received command: '{payload.command}' for asset_path: '{payload.asset_path}'")
    
    # 1. Load timeline from DB using robust loader for better error handling
    timeline = load_timeline_from_db_robust(payload.asset_path, validate_assets=False, allow_partial_load=True)
    if timeline is None:
        logging.error(f"[apply_command] Failed to load or create timeline for asset_path={payload.asset_path}")
        return {
            "status": "error",
            "applied": False,
            "timeline": {},
            "message": "Failed to load timeline",
            "logs": [],
        }
    
    # 2. Parse command using LLM parser directly
    duration = get_asset_duration(payload.asset_path) or 60.0
    parsed_llm, error = parse_command_with_llm(payload.command, duration=duration)
    
    if error:
        logging.warning(f"[apply_command] LLM parsing error: {error}")
        return {
            "status": "error",
            "applied": False,
            "timeline": timeline.to_dict(),
            "message": f"Failed to parse command: {error}",
            "logs": [],
        }
    
    if not parsed_llm:
        logging.warning(f"[apply_command] No parsed result from LLM")
        return {
            "status": "error", 
            "applied": False,
            "timeline": timeline.to_dict(),
            "message": "Could not understand the command. Please try rephrasing.",
            "logs": [],
        }
    
    # 3. Convert LLM output to EditOperation(s)
    operations = []
    
    # Handle both single operations and arrays
    llm_operations = parsed_llm if isinstance(parsed_llm, list) else [parsed_llm]
    
    for llm_op in llm_operations:
        try:
            operation = convert_llm_to_operation(llm_op)
            operations.append(operation)
        except Exception as e:
            logging.error(f"[apply_command] Error converting LLM operation {llm_op}: {e}")
            return {
                "status": "error",
                "applied": False, 
                "timeline": timeline.to_dict(),
                "message": f"Failed to process operation: {e}",
                "logs": [],
            }
    
    # 4. Execute operations
    executor = CommandExecutor(timeline)
    all_results = []
    
    for operation in operations:
        logging.debug(f"[apply_command] Executing operation: {operation.type}, target: {operation.target}, parameters: {operation.parameters}")
        exec_result = executor.execute(operation, command_text=payload.command)
        all_results.append(exec_result)
        logging.info(f"[apply_command] Execution result: success={exec_result.success}, message={exec_result.message}")
        
        if not exec_result.success:
            # If any operation fails, return error
            error_logs = []
            if hasattr(exec_result, 'data') and exec_result.data and isinstance(exec_result.data, dict):
                error_logs = exec_result.data.get('logs', [])
            
            return {
                "status": "error",
                "applied": False,
                "timeline": timeline.to_dict(), 
                "message": f"Operation failed: {exec_result.message}",
                "logs": error_logs,
            }
    
    # 5. Save updated timeline to DB using enhanced saver
    try:
        save_timeline_to_db_enhanced(payload.asset_path, timeline)
    except Exception as e:
        logging.error(f"[apply_command] Error saving timeline to DB: {e}")
        raise
    
    # 6. Return updated timeline
    all_messages = [result.message for result in all_results if result.message]
    all_logs = []
    for result in all_results:
        # Extract logs from result.data since ExecutionResult doesn't have logs attribute
        if hasattr(result, 'data') and result.data and isinstance(result.data, dict):
            logs_from_data = result.data.get('logs', [])
            if logs_from_data:
                all_logs.extend(logs_from_data)
    
    # 6. Create enhanced response with GES-compatible timeline data
    try:
        all_clips = timeline.get_all_clips("video")
        for track_type in ["audio", "subtitle", "effect"]:
            try:
                track_clips = timeline.get_all_clips(track_type)
                all_clips.extend(track_clips)
            except Exception:
                pass
        
        # Return both legacy format and enhanced schema for compatibility
        timeline_response = {
            "legacy": timeline.to_dict(),
            "enhanced": create_timeline_json_schema(all_clips, timeline)
        }
    except Exception as e:
        logging.warning(f"Failed to create enhanced timeline response: {e}")
        timeline_response = timeline.to_dict()
    
    return {
        "status": "ok",
        "applied": True,
        "timeline": timeline_response,
        "message": "; ".join(all_messages) if all_messages else "Commands applied successfully.",
        "logs": all_logs,
    }

def convert_llm_to_operation(llm_op: dict) -> 'EditOperation':
    """
    Convert LLM parser output to EditOperation object.
    Handles both single-clip and batch operations.
    Enhanced to support tracking text operations.
    """
    from app.command_types import EditOperation
    
    action = llm_op.get("action", "").lower()
    target = llm_op.get("target", "single_clip")
    
    # Determine operation type and parameters based on action and target
    if action == "cut":
        if target == "each_clip":
            # Batch cut operation
            operation_type = "BATCH_CUT"
            parameters = {
                "target": target,
                "trim_start": llm_op.get("trim_start", 0.0),
                "trim_end": llm_op.get("trim_end", 0.0),
            }
            operation_target = "all_clips"
        else:
            # Single clip cut operation
            operation_type = "CUT"
            parameters = {
                "start": llm_op.get("start"),
                "end": llm_op.get("end"),
                "track_type": "video",
            }
            operation_target = llm_op.get("clip_name", "main_clip")
    
    elif action == "add_text":
        if target == "each_clip":
            # Batch text operation
            operation_type = "BATCH_TEXT"
            parameters = {
                "target": target,
                "text": llm_op.get("text", "AUTO_GENERATE"),
                "style": llm_op.get("style", "subtitle"),
                "position": llm_op.get("position", "center"),
            }
            operation_target = "all_clips"
        elif target == "viral_captions":
            # Viral caption operation
            operation_type = "VIRAL_CAPTIONS"
            parameters = {
                "target": target,
                "interval": llm_op.get("interval", 3),
                "caption_style": llm_op.get("caption_style", "viral"),
                "style": llm_op.get("style", "viral"),
            }
            operation_target = "all_clips"
        else:
            # Single clip text operation
            operation_type = "ADD_TEXT"
            parameters = {
                "text": llm_op.get("text", ""),
                "start": llm_op.get("start"),
                "end": llm_op.get("end"),
                "position": llm_op.get("position", "center"),
                "style": llm_op.get("style", "subtitle"),
            }
            operation_target = llm_op.get("clip_name", "main_clip")
    
    elif action == "add_tracking_text":
        # Tracking text operation
        operation_type = "TRACKING_TEXT"
        parameters = {
            "target": target,
            "tracking_text": llm_op.get("tracking_text", ""),
            "text": llm_op.get("tracking_text", ""),  # Also store as 'text' for compatibility
            "target_context": llm_op.get("target_context", ""),
            "style": llm_op.get("style", "tracking"),
            "position": llm_op.get("position", "center"),
        }
        
        # Handle timeframe if provided
        timeframe = llm_op.get("timeframe")
        if timeframe and isinstance(timeframe, dict):
            parameters["start"] = timeframe.get("start", 0)
            parameters["end"] = timeframe.get("end", 3)
        else:
            # Default 3-second duration as specified
            parameters["start"] = llm_op.get("start", 0)
            parameters["end"] = llm_op.get("end", 3)
        
        operation_target = llm_op.get("clip_name", "main_clip")
    
    else:
        # Fallback for other operations
        operation_type = action.upper()
        parameters = {k: v for k, v in llm_op.items() if k not in ["action", "target"]}
        operation_target = llm_op.get("clip_name", "main_clip")
    
    return EditOperation(
        type_=operation_type,
        target=operation_target,
        parameters=parameters
    )

class ParseCommandRequest(BaseModel):
    command: str
    asset_path: str = None

class ParseCommandResponse(BaseModel):
    parsed: Any
    error: str = None

@router.post("/parseCommand", response_model=ParseCommandResponse)
async def parse_command(payload: ParseCommandRequest):
    """
    Receives a natural language command and returns the parsed intent JSON using the LLM parser.
    """
    logging.info(f"[parse_command] Received command: '{payload.command}'")
    duration = None
    if payload.asset_path:
        duration = get_asset_duration(payload.asset_path)
    if duration is None:
        duration = 60.0  # fallback default
    logging.info(f"[parse_command] Using duration={duration} for asset_path={payload.asset_path}")
    parsed, error = parse_command_with_llm(payload.command, duration=duration)
    # Clamp cut command times if present
    if parsed and isinstance(parsed, dict) and parsed.get("action") == "cut":
        start = parsed.get("start")
        end = parsed.get("end")
        # Clamp to [0, duration]
        if start is not None and end is not None:
            start = max(0, min(float(start), duration))
            end = max(0, min(float(end), duration))
            if start >= end:
                return ParseCommandResponse(parsed=None, error=f"Invalid cut range: start ({start}) must be less than end ({end}) and within video duration ({duration}s). Please rephrase your command.")
            parsed["start"] = start
            parsed["end"] = end
    if error:
        logging.warning(f"[parse_command] Error: {error}")
        return ParseCommandResponse(parsed=None, error=error)
    logging.info(f"[parse_command] Parsed result: {parsed}")
    return ParseCommandResponse(parsed=parsed) 

class UpdateAssetDurationRequest(BaseModel):
    asset_path: str
    duration: float

@router.post("/asset/updateDuration")
async def update_asset_duration(payload: UpdateAssetDurationRequest):
    """
    Update the duration for a given asset in the assets table.
    """
    supabase = get_supabase_client()
    try:
        result = supabase.table("assets").update({"duration": payload.duration}).eq("path", payload.asset_path).execute()
        return {"status": "ok", "message": f"Updated duration for {payload.asset_path} to {payload.duration} seconds."}
    except Exception as e:
        logging.error(f"[update_asset_duration] Error updating duration: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update asset duration: {str(e)}")

# Enhanced Timeline Schema API Endpoints

class TimelineLoadRequest(BaseModel):
    asset_path: str

class TimelineLoadResponse(BaseModel):
    status: str
    timeline_json: Optional[dict] = None
    message: str = ""
    schema_version: str = ""

@router.post("/timeline/load", response_model=TimelineLoadResponse)
async def load_timeline_enhanced(payload: TimelineLoadRequest):
    """
    Load timeline using enhanced schema with automatic migration support.
    Returns GES-compatible timeline data in version 2.0 format.
    """
    try:
        timeline = load_timeline_from_db_enhanced(payload.asset_path)
        if timeline is None:
            return TimelineLoadResponse(
                status="error",
                message="Failed to load timeline",
                schema_version=TIMELINE_SCHEMA_VERSION
            )
        
        # Get all clips for schema generation
        all_clips = timeline.get_all_clips("video")
        for track_type in ["audio", "subtitle", "effect"]:
            try:
                track_clips = timeline.get_all_clips(track_type)
                all_clips.extend(track_clips)
            except Exception:
                pass
        
        # Create enhanced schema response
        timeline_schema = create_timeline_json_schema(all_clips, timeline)
        
        return TimelineLoadResponse(
            status="ok",
            timeline_json=timeline_schema,
            message=f"Successfully loaded timeline with {len(all_clips)} clips",
            schema_version=TIMELINE_SCHEMA_VERSION
        )
        
    except Exception as e:
        logging.error(f"Enhanced timeline loading failed: {e}")
        return TimelineLoadResponse(
            status="error",
            message=f"Timeline loading failed: {str(e)}",
            schema_version=TIMELINE_SCHEMA_VERSION
        )

class TimelineSaveRequest(BaseModel):
    asset_path: str
    timeline_json: dict

class TimelineSaveResponse(BaseModel):
    status: str
    message: str = ""
    schema_version: str = ""

@router.post("/timeline/save", response_model=TimelineSaveResponse)
async def save_timeline_enhanced(payload: TimelineSaveRequest):
    """
    Save timeline using enhanced schema format.
    Accepts GES-compatible timeline data and stores in Supabase.
    """
    try:
        # Validate schema version
        provided_version = payload.timeline_json.get("version", "1.0")
        if provided_version < "2.0":
            logging.info(f"Migrating provided timeline from {provided_version} to {TIMELINE_SCHEMA_VERSION}")
            payload.timeline_json = migrate_timeline_schema(payload.timeline_json)
        
        # Save directly to database with enhanced format
        save_timeline_to_db(payload.asset_path, payload.timeline_json)
        
        clip_count = len(payload.timeline_json.get("clips", []))
        
        return TimelineSaveResponse(
            status="ok",
            message=f"Successfully saved timeline with {clip_count} clips",
            schema_version=TIMELINE_SCHEMA_VERSION
        )
        
    except Exception as e:
        logging.error(f"Enhanced timeline saving failed: {e}")
        return TimelineSaveResponse(
            status="error",
            message=f"Timeline saving failed: {str(e)}",
            schema_version=TIMELINE_SCHEMA_VERSION
        )

class TimelineSchemaRequest(BaseModel):
    asset_path: str

class TimelineSchemaResponse(BaseModel):
    status: str
    timeline_schema: Optional[dict] = None
    message: str = ""

@router.post("/timeline/schema", response_model=TimelineSchemaResponse)
async def get_timeline_schema(payload: TimelineSchemaRequest):
    """
    Get the current timeline schema structure for an asset.
    Useful for frontend to understand the expected data format.
    """
    try:
        timeline = load_timeline_from_db_enhanced(payload.asset_path)
        if timeline is None:
            # Return empty schema structure
            empty_schema = create_timeline_json_schema([], Timeline())
            return TimelineSchemaResponse(
                status="ok",
                timeline_schema=empty_schema,
                message="Returned empty timeline schema"
            )
        
        # Get all clips for schema generation
        all_clips = timeline.get_all_clips("video")
        for track_type in ["audio", "subtitle", "effect"]:
            try:
                track_clips = timeline.get_all_clips(track_type)
                all_clips.extend(track_clips)
            except Exception:
                pass
        
        # Create schema
        timeline_schema = create_timeline_json_schema(all_clips, timeline)
        
        return TimelineSchemaResponse(
            status="ok",
            timeline_schema=timeline_schema,
            message=f"Timeline schema with {len(all_clips)} clips"
        )
        
    except Exception as e:
        logging.error(f"Timeline schema generation failed: {e}")
        return TimelineSchemaResponse(
            status="error",
            message=f"Schema generation failed: {str(e)}"
        )

def validate_timeline_json_structure(timeline_json: dict) -> dict:
    """
    Validate the structure and required fields of timeline JSON data.
    
    Args:
        timeline_json (dict): Timeline JSON data to validate
        
    Returns:
        dict: Validation result with 'valid' flag and 'errors' list
    """
    errors = []
    
    # Check version
    if "version" not in timeline_json:
        errors.append("Missing version field")
    elif not isinstance(timeline_json["version"], str):
        errors.append("Version must be a string")
    
    # Check timeline metadata
    if "timeline" not in timeline_json:
        errors.append("Missing timeline metadata")
    else:
        timeline_data = timeline_json["timeline"]
        
        # Frame rate validation
        frame_rate = timeline_data.get("frame_rate")
        if frame_rate is None:
            errors.append("Missing frame_rate in timeline metadata")
        elif not isinstance(frame_rate, (int, float)) or frame_rate <= 0:
            errors.append(f"Invalid frame_rate: {frame_rate}")
        
        # Duration validation
        duration = timeline_data.get("duration")
        if duration is not None and (not isinstance(duration, (int, float)) or duration < 0):
            errors.append(f"Invalid duration: {duration}")
    
    # Check clips array
    if "clips" not in timeline_json:
        errors.append("Missing clips array")
    elif not isinstance(timeline_json["clips"], list):
        errors.append("Clips must be an array")
    
    # Basic structure validation
    required_fields = ["version"]
    for field in required_fields:
        if field not in timeline_json:
            errors.append(f"Missing required field: {field}")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }

def validate_clip_data(clip_data: dict, timeline: Timeline) -> dict:
    """
    Validate individual clip data for consistency and required fields.
    
    Args:
        clip_data (dict): Clip data to validate
        timeline (Timeline): Timeline for frame rate reference
        
    Returns:
        dict: Validation result with 'valid' flag and 'errors' list
    """
    errors = []
    
    # Required fields
    required_fields = ["id", "name"]
    for field in required_fields:
        if field not in clip_data:
            errors.append(f"Missing required field: {field}")
        elif not clip_data[field]:
            errors.append(f"Empty required field: {field}")
    
    # Timeline position validation
    timeline_start = clip_data.get("timeline_start")
    timeline_end = clip_data.get("timeline_end")
    
    if timeline_start is not None:
        if not isinstance(timeline_start, (int, float)):
            errors.append(f"Invalid timeline_start type: {type(timeline_start)}")
        elif timeline_start < 0:
            errors.append(f"Negative timeline_start: {timeline_start}")
    
    if timeline_end is not None:
        if not isinstance(timeline_end, (int, float)):
            errors.append(f"Invalid timeline_end type: {type(timeline_end)}")
        elif timeline_end < 0:
            errors.append(f"Negative timeline_end: {timeline_end}")
    
    if timeline_start is not None and timeline_end is not None:
        if timeline_end <= timeline_start:
            errors.append(f"timeline_end ({timeline_end}) must be greater than timeline_start ({timeline_start})")
    
    # Duration validation
    duration = clip_data.get("duration")
    if duration is not None:
        if not isinstance(duration, (int, float)):
            errors.append(f"Invalid duration type: {type(duration)}")
        elif duration <= 0:
            errors.append(f"Non-positive duration: {duration}")
        
        # Check duration consistency
        if timeline_start is not None and timeline_end is not None:
            expected_duration = timeline_end - timeline_start
            if abs(duration - expected_duration) > 0.01:  # Allow small float precision errors
                errors.append(f"Duration {duration} doesn't match timeline positions (expected {expected_duration})")
    
    # In-point validation
    in_point = clip_data.get("in_point")
    if in_point is not None:
        if not isinstance(in_point, (int, float)):
            errors.append(f"Invalid in_point type: {type(in_point)}")
        elif in_point < 0:
            errors.append(f"Negative in_point: {in_point}")
    
    # Track validation
    track = clip_data.get("track")
    if track is not None:
        if not isinstance(track, int):
            errors.append(f"Invalid track type: {type(track)} (must be int)")
        elif track < 0:
            errors.append(f"Negative track index: {track}")
    
    # Type validation
    clip_type = clip_data.get("type")
    if clip_type is not None:
        valid_types = ["video", "audio", "subtitle", "effect", "image", "text"]
        if clip_type not in valid_types:
            errors.append(f"Invalid clip type: {clip_type} (must be one of {valid_types})")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }

def check_asset_availability(file_path: str) -> bool:
    """
    Check if the referenced asset file exists and is accessible.
    
    Args:
        file_path (str): Path to the asset file
        
    Returns:
        bool: True if asset is available, False otherwise
    """
    if not file_path:
        return False
    
    try:
        # For Supabase storage, check if the asset exists in the assets table
        supabase = get_supabase_client()
        result = supabase.table("assets").select("id").eq("path", file_path).limit(1).execute()
        
        # Return True only if we found data
        return bool(result.data and len(result.data) > 0)
        
    except Exception as e:
        logging.warning(f"Failed to check asset availability for {file_path}: {e}")
        return False

def validate_timeline_integrity(timeline: Timeline) -> dict:
    """
    Validate the overall integrity and consistency of a loaded timeline.
    
    Args:
        timeline (Timeline): Timeline to validate
        
    Returns:
        dict: Validation result with 'valid' flag and 'errors' list
    """
    errors = []
    
    try:
        # Check for clip overlaps on same track
        for track in timeline.tracks:
            clips = []
            for clip in track.clips:
                if hasattr(clip, 'start') and hasattr(clip, 'end'):
                    clips.append((clip.start, clip.end, clip.name))
            
            # Sort clips by start time
            clips.sort(key=lambda x: x[0])
            
            # Check for overlaps
            for i in range(len(clips) - 1):
                current_end = clips[i][1]
                next_start = clips[i + 1][0]
                
                if current_end > next_start:
                    errors.append(f"Clip overlap detected on track {track.track_type}: "
                                f"{clips[i][2]} ends at {current_end} but {clips[i + 1][2]} starts at {next_start}")
        
        # Check timeline duration consistency
        calculated_duration = timeline.get_duration_seconds()
        if calculated_duration < 0:
            errors.append(f"Negative timeline duration: {calculated_duration}")
        
        # Check for clips with invalid timing
        all_clips = []
        for track in timeline.tracks:
            all_clips.extend(track.clips)
        
        for clip in all_clips:
            if hasattr(clip, 'start') and hasattr(clip, 'end'):
                if clip.end <= clip.start:
                    errors.append(f"Invalid clip timing: {clip.name} ends ({clip.end}) before or at start ({clip.start})")
                
                # Check for extremely long clips (potential data corruption)
                clip_duration_frames = clip.end - clip.start
                clip_duration_hours = clip_duration_frames / timeline.frame_rate / 3600
                if clip_duration_hours > 24:  # More than 24 hours
                    errors.append(f"Suspiciously long clip: {clip.name} duration is {clip_duration_hours:.1f} hours")
        
    except Exception as e:
        errors.append(f"Timeline integrity check failed: {str(e)}")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors
    }

def create_video_clip_from_json_robust(clip_data: dict, timeline: Timeline) -> VideoClip:
    """
    Create a VideoClip instance from JSON schema data with enhanced error handling.
    
    Args:
        clip_data (dict): Clip data from JSON schema
        timeline (Timeline): Timeline for frame conversion
        
    Returns:
        VideoClip: Created VideoClip instance
    """
    try:
        # Extract and validate timing data
        start_seconds = clip_data.get("timeline_start", clip_data.get("start", 0))
        end_seconds = clip_data.get("timeline_end", clip_data.get("end", 0))
        in_point_seconds = clip_data.get("in_point", 0)
        
        # Ensure valid timing
        if start_seconds < 0:
            logging.warning(f"Negative start time {start_seconds} for clip {clip_data.get('name', 'unknown')}, using 0")
            start_seconds = 0
        
        if end_seconds <= start_seconds:
            logging.warning(f"Invalid end time {end_seconds} for clip {clip_data.get('name', 'unknown')}, adding 1 second")
            end_seconds = start_seconds + 1
        
        if in_point_seconds < 0:
            logging.warning(f"Negative in_point {in_point_seconds} for clip {clip_data.get('name', 'unknown')}, using 0")
            in_point_seconds = 0
        
        # Convert seconds to frames for internal representation
        start_frame = timeline.seconds_to_frames(start_seconds)
        end_frame = timeline.seconds_to_frames(end_seconds)
        in_point_frame = timeline.seconds_to_frames(in_point_seconds)
        
        # Create clip with validated data
        clip = VideoClip(
            name=clip_data.get("name", "Unknown Clip"),
            start_frame=start_frame,
            end_frame=end_frame,
            track_type=clip_data.get("type", "video"),
            file_path=clip_data.get("file_path"),
            clip_id=clip_data.get("id"),
            in_point=in_point_frame,
            track_index=clip_data.get("track", 0)
        )
        
        # Add effects if present
        if "effects" in clip_data and isinstance(clip_data["effects"], list):
            for effect_data in clip_data["effects"]:
                try:
                    effect = Effect.from_dict(effect_data)
                    clip.effects.append(effect)
                except Exception as effect_error:
                    logging.warning(f"Failed to load effect for clip {clip.name}: {effect_error}")
        
        return clip
        
    except Exception as e:
        logging.error(f"Failed to create VideoClip from data: {e}")
        # Create a minimal fallback clip
        return VideoClip(
            name=clip_data.get("name", "Error Clip"),
            start_frame=0,
            end_frame=30,  # 1 second at 30fps
            file_path=clip_data.get("file_path"),
            clip_id=clip_data.get("id")
        ) 

class TimelineLoadRobustRequest(BaseModel):
    asset_path: str
    validate_assets: bool = True
    allow_partial_load: bool = True

class TimelineLoadRobustResponse(BaseModel):
    status: str
    timeline_json: Optional[dict] = None
    loading_stats: Optional[dict] = None
    message: str = ""
    schema_version: str = ""

@router.post("/timeline/load-robust", response_model=TimelineLoadRobustResponse)
async def load_timeline_robust_endpoint(payload: TimelineLoadRobustRequest):
    """
    Load timeline using robust loader with comprehensive validation and error recovery.
    Provides detailed loading statistics and handles edge cases gracefully.
    """
    try:
        timeline = load_timeline_from_db_robust(
            payload.asset_path,
            validate_assets=payload.validate_assets,
            allow_partial_load=payload.allow_partial_load
        )
        
        if timeline is None:
            return TimelineLoadRobustResponse(
                status="error",
                message="Failed to load timeline with robust loader",
                schema_version=TIMELINE_SCHEMA_VERSION
            )
        
        # Get all clips for schema generation
        all_clips = timeline.get_all_clips("video")
        for track_type in ["audio", "subtitle", "effect"]:
            try:
                track_clips = timeline.get_all_clips(track_type)
                all_clips.extend(track_clips)
            except Exception:
                pass
        
        # Create enhanced schema response
        timeline_schema = create_timeline_json_schema(all_clips, timeline)
        
        # Extract loading stats if available
        loading_stats = getattr(timeline, 'loading_stats', {})
        
        return TimelineLoadRobustResponse(
            status="ok",
            timeline_json=timeline_schema,
            loading_stats=loading_stats,
            message=f"Successfully loaded timeline with {len(all_clips)} clips using robust loader",
            schema_version=TIMELINE_SCHEMA_VERSION
        )
        
    except Exception as e:
        logging.error(f"Robust timeline loading endpoint failed: {e}")
        return TimelineLoadRobustResponse(
            status="error",
            message=f"Robust timeline loading failed: {str(e)}",
            schema_version=TIMELINE_SCHEMA_VERSION
        )

class BatchTimelineLoadRequest(BaseModel):
    asset_paths: List[str]
    validate_assets: bool = True
    allow_partial_load: bool = True

class BatchTimelineLoadResponse(BaseModel):
    status: str
    timelines: dict = {}  # asset_path -> timeline_data
    loading_summary: dict = {}
    message: str = ""

@router.post("/timeline/batch-load", response_model=BatchTimelineLoadResponse)
async def batch_load_timelines(payload: BatchTimelineLoadRequest):
    """
    Load multiple timelines in batch for improved performance.
    Useful for loading related timelines or preloading multiple projects.
    """
    timelines = {}
    loading_summary = {
        "total_requested": len(payload.asset_paths),
        "successfully_loaded": 0,
        "failed_to_load": 0,
        "total_clips": 0,
        "total_load_time_ms": 0,
        "errors": []
    }
    
    start_time = datetime.utcnow()
    
    for asset_path in payload.asset_paths:
        try:
            timeline = load_timeline_from_db_robust(
                asset_path,
                validate_assets=payload.validate_assets,
                allow_partial_load=payload.allow_partial_load
            )
            
            if timeline:
                # Get all clips for schema generation
                all_clips = timeline.get_all_clips("video")
                for track_type in ["audio", "subtitle", "effect"]:
                    try:
                        track_clips = timeline.get_all_clips(track_type)
                        all_clips.extend(track_clips)
                    except Exception:
                        pass
                
                # Create schema
                timeline_schema = create_timeline_json_schema(all_clips, timeline)
                
                timelines[asset_path] = {
                    "timeline_json": timeline_schema,
                    "loading_stats": getattr(timeline, 'loading_stats', {}),
                    "clip_count": len(all_clips)
                }
                
                loading_summary["successfully_loaded"] += 1
                loading_summary["total_clips"] += len(all_clips)
            else:
                loading_summary["failed_to_load"] += 1
                loading_summary["errors"].append(f"Failed to load timeline for {asset_path}")
                
        except Exception as e:
            loading_summary["failed_to_load"] += 1
            error_msg = f"Error loading {asset_path}: {str(e)}"
            loading_summary["errors"].append(error_msg)
            logging.error(error_msg)
    
    end_time = datetime.utcnow()
    loading_summary["total_load_time_ms"] = (end_time - start_time).total_seconds() * 1000
    
    success_rate = loading_summary["successfully_loaded"] / max(loading_summary["total_requested"], 1) * 100
    
    return BatchTimelineLoadResponse(
        status="ok" if loading_summary["successfully_loaded"] > 0 else "error",
        timelines=timelines,
        loading_summary=loading_summary,
        message=f"Batch loaded {loading_summary['successfully_loaded']}/{loading_summary['total_requested']} timelines "
               f"({success_rate:.1f}% success rate) with {loading_summary['total_clips']} total clips "
               f"in {loading_summary['total_load_time_ms']:.1f}ms"
    )

class TimelineValidationRequest(BaseModel):
    asset_path: str

class TimelineValidationResponse(BaseModel):
    status: str
    validation_result: dict = {}
    message: str = ""

@router.post("/timeline/validate", response_model=TimelineValidationResponse)
async def validate_timeline_endpoint(payload: TimelineValidationRequest):
    """
    Validate timeline data without loading it into a Timeline object.
    Useful for checking data integrity before processing.
    """
    try:
        # Load raw timeline JSON
        timeline_json = load_timeline_from_db(payload.asset_path)
        if not timeline_json:
            return TimelineValidationResponse(
                status="error",
                message="No timeline data found for validation"
            )
        
        # Perform validation
        structure_validation = validate_timeline_json_structure(timeline_json)
        
        # If structure is valid, validate individual clips
        clip_validations = []
        if structure_validation["valid"] and "clips" in timeline_json:
            # Create temporary timeline for frame rate reference
            frame_rate = timeline_json.get("timeline", {}).get("frame_rate", 30.0)
            temp_timeline = Timeline(frame_rate=frame_rate)
            
            for i, clip_data in enumerate(timeline_json["clips"]):
                clip_validation = validate_clip_data(clip_data, temp_timeline)
                if not clip_validation["valid"]:
                    clip_validations.append({
                        "clip_index": i,
                        "clip_name": clip_data.get("name", "unknown"),
                        "errors": clip_validation["errors"]
                    })
        
        # Aggregate results
        validation_result = {
            "structure_validation": structure_validation,
            "clip_validations": clip_validations,
            "overall_valid": structure_validation["valid"] and len(clip_validations) == 0,
            "schema_version": timeline_json.get("version", "unknown")
        }
        
        success_message = "Timeline validation passed" if validation_result["overall_valid"] else "Timeline validation found issues"
        
        return TimelineValidationResponse(
            status="ok",
            validation_result=validation_result,
            message=success_message
        )
        
    except Exception as e:
        logging.error(f"Timeline validation failed: {e}")
        return TimelineValidationResponse(
            status="error",
            message=f"Timeline validation failed: {str(e)}"
        ) 