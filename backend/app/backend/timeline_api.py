from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.command_parser import CommandParser
from app.command_executor import CommandExecutor
from app.timeline import Timeline
from .command_api import save_timeline_to_db

router = APIRouter()

# Request model for CUT
class CutRequest(BaseModel):
    clip_name: str
    timestamp: str  # Accepts time string or frames
    track_type: str = "video"

# Request model for adding a clip
class AddClipRequest(BaseModel):
    name: str
    start: float  # in seconds
    end: float    # in seconds
    track_type: str = "video"

# Request model for TRIM
class TrimRequest(BaseModel):
    clip_name: str
    timestamp: str  # Accepts time string or frames
    track_type: str = "video"

# Request model for JOIN
class JoinRequest(BaseModel):
    first_clip_name: str
    second_clip_name: str
    track_type: str = "video"

# Request model for REMOVE
class RemoveClipRequest(BaseModel):
    clip_name: str
    track_type: str = "video"

# Request model for ADD_TEXT
class AddTextRequest(BaseModel):
    clip_name: str
    text: str
    position: str = "top"
    start: str
    end: str
    track_type: str = "video"

# Request model for OVERLAY
class OverlayRequest(BaseModel):
    asset: str
    position: str
    start: str
    end: str
    track_type: str = "video"

# Request model for FADE
class FadeRequest(BaseModel):
    clip_name: str
    direction: str
    start: str
    end: str
    track_type: str = "video"

# Request model for GROUP_CUT
class GroupCutRequest(BaseModel):
    target_type: str
    timestamp: str
    track_type: str = "video"

class TimelineSaveRequest(BaseModel):
    asset_path: str
    timeline: dict

class TimelineSaveResponse(BaseModel):
    status: str

# In-memory timeline for demo (replace with persistent storage as needed)
timeline = Timeline()
parser = CommandParser()
executor = CommandExecutor(timeline)

@router.post("/timeline/cut")
def cut_clip(req: CutRequest):
    # Build command string for parser
    command = f"cut {req.clip_name} at {req.timestamp}"
    op = parser.parse_command(command)
    if op.type != "CUT":
        raise HTTPException(status_code=400, detail="Invalid CUT command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/add_clip")
def add_clip(req: AddClipRequest):
    # Find the appropriate track
    track = next((t for t in timeline.tracks if t.track_type == req.track_type), None)
    if not track:
        raise HTTPException(status_code=400, detail=f"Track type '{req.track_type}' not found.")
    # Check for name collision
    if any(c.name == req.name for c in track.clips):
        raise HTTPException(status_code=400, detail=f"Clip with name '{req.name}' already exists in {req.track_type} track.")
    # Add the clip
    from app.timeline import VideoClip, Effect
    if req.track_type == "video":
        clip = VideoClip(
            name=req.name,
            start_frame=int(req.start * timeline.frame_rate),
            end_frame=int(req.end * timeline.frame_rate)
        )
    elif req.track_type == "effect":
        clip = Effect(effect_type=req.name, params={}, start=int(req.start * timeline.frame_rate), end=int(req.end * timeline.frame_rate))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported track type: {req.track_type}")
    track.clips.append(clip)
    return {"success": True, "message": f"Clip '{req.name}' added to {req.track_type} track.", "timeline": timeline.to_dict()}

@router.post("/timeline/trim")
def trim_clip(req: TrimRequest):
    command = f"trim {req.clip_name} at {req.timestamp}"
    op = parser.parse_command(command)
    if op.type != "TRIM":
        raise HTTPException(status_code=400, detail="Invalid TRIM command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/join")
def join_clips(req: JoinRequest):
    command = f"join {req.first_clip_name} and {req.second_clip_name}"
    op = parser.parse_command(command)
    # If CompoundOperation, try to extract the first operation
    if hasattr(op, "operations"):
        if len(op.operations) == 1:
            op = op.operations[0]
        else:
            raise HTTPException(status_code=400, detail="Ambiguous or multiple operations in join command.")
    if not hasattr(op, "type") or op.type != "JOIN":
        raise HTTPException(status_code=400, detail="Invalid JOIN command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/remove_clip")
def remove_clip(req: RemoveClipRequest):
    command = f"remove {req.clip_name}"
    op = parser.parse_command(command)
    if hasattr(op, "operations"):
        if len(op.operations) == 1:
            op = op.operations[0]
        else:
            raise HTTPException(status_code=400, detail="Ambiguous or multiple operations in remove command.")
    if not hasattr(op, "type") or op.type != "REMOVE":
        raise HTTPException(status_code=400, detail="Invalid REMOVE command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/add_text")
def add_text(req: AddTextRequest):
    command = f'add text "{req.text}" to {req.clip_name} at the {req.position} from {req.start} to {req.end}'
    op = parser.parse_command(command)
    if op.type != "ADD_TEXT":
        raise HTTPException(status_code=400, detail="Invalid ADD_TEXT command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/overlay")
def overlay_asset(req: OverlayRequest):
    command = f'overlay {req.asset} at the {req.position} from {req.start} to {req.end}'
    op = parser.parse_command(command)
    if op.type != "OVERLAY":
        raise HTTPException(status_code=400, detail="Invalid OVERLAY command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/fade")
def fade_clip(req: FadeRequest):
    command = f'fade {req.direction} {req.clip_name} from {req.start} to {req.end}'
    op = parser.parse_command(command)
    if op.type != "FADE":
        raise HTTPException(status_code=400, detail="Invalid FADE command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/group_cut")
def group_cut(req: GroupCutRequest):
    command = f'cut all {req.target_type} at {req.timestamp}'
    op = parser.parse_command(command)
    if op.type != "CUT_GROUP":
        raise HTTPException(status_code=400, detail="Invalid CUT_GROUP command.")
    op.parameters["track_type"] = req.track_type
    result = executor.execute(op)
    return {
        "success": result.success,
        "message": result.message,
        "timeline": timeline.to_dict()
    }

@router.post("/timeline/save", response_model=TimelineSaveResponse)
async def save_timeline(payload: TimelineSaveRequest):
    try:
        save_timeline_to_db(payload.asset_path, payload.timeline)
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 