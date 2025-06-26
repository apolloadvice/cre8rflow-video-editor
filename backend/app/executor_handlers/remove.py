from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult

class RemoveOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "REMOVE"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        clip_name = operation.target
        clip_id = operation.parameters.get("clip_id")
        track_type = operation.parameters.get("track_type", "video")
        track_index = operation.parameters.get("track_index", 0)
        result = executor.timeline.remove_clip(clip_name, track_type=track_type, track_index=track_index, clip_id=clip_id)
        if result:
            return ExecutionResult(True, f"Removed clip '{clip_name or clip_id}' from {track_type} track.")
        else:
            return ExecutionResult(False, f"Clip '{clip_name or clip_id}' not found in {track_type} track.") 