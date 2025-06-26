from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult

class JoinOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "JOIN"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        first_clip = operation.target
        second_clip = operation.parameters.get("second")
        first_clip_id = operation.parameters.get("clip_id")
        second_clip_id = operation.parameters.get("second_clip_id")
        effect = operation.parameters.get("effect")
        if (not first_clip and not first_clip_id) or (not second_clip and not second_clip_id):
            return ExecutionResult(False, "Missing one or both clip names/ids for JOIN operation.")
        track_type = operation.parameters.get("track_type", "video")
        track_index = operation.parameters.get("track_index")
        if track_index is None:
            # Try to find the track index for either first_clip or second_clip
            found_index = executor.find_track_index_for_clip(first_clip, track_type)
            if found_index is None:
                found_index = executor.find_track_index_for_clip(second_clip, track_type)
            if found_index is None:
                return ExecutionResult(False, f"Neither '{first_clip or first_clip_id}' nor '{second_clip or second_clip_id}' found in any {track_type} track.")
            track_index = found_index
        else:
            track_index = int(track_index)
        result = executor.timeline.join_clips(
            first_clip_name=first_clip,
            second_clip_name=second_clip,
            track_type=track_type,
            track_index=track_index,
            first_clip_id=first_clip_id,
            second_clip_id=second_clip_id
        )
        effect_msg = f" with effect '{effect}'" if effect else ""
        return ExecutionResult(result, f"Joined {first_clip or first_clip_id} and {second_clip or second_clip_id}{effect_msg}: {result}") 