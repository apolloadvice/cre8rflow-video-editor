from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult

class TrimOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "TRIM"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        clip_name = operation.target
        clip_id = operation.parameters.get("clip_id")
        # timestamp is expected to be in frames already
        timestamp_frames = operation.parameters.get("timestamp")
        if (not clip_name and not clip_id) or timestamp_frames is None:
            return ExecutionResult(False, "Missing clip name/id or timestamp for TRIM operation.")
        frame_rate = executor.timeline.frame_rate
        track_type = operation.parameters.get("track_type", "video")
        track_index = operation.parameters.get("track_index")
        if track_index is None:
            found_index = executor.find_track_index_for_clip(clip_name, track_type)
            if found_index is None:
                return ExecutionResult(False, f"Clip '{clip_name or clip_id}' not found in any {track_type} track.")
            track_index = found_index
        else:
            track_index = int(track_index)
        result = executor.timeline.trim_clip(clip_name, timestamp_frames, track_type=track_type, track_index=track_index, clip_id=clip_id)
        return ExecutionResult(result, f"Trimmed {clip_name or clip_id} at {timestamp_frames} frames: {result}") 