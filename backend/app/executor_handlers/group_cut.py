from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult

class GroupCutOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "CUT_GROUP"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        track_type = operation.parameters.get("track_type", "video")
        # timestamp is expected to be in frames already
        timestamp_frames = operation.parameters.get("timestamp")
        if timestamp_frames is None:
            return ExecutionResult(False, "Missing timestamp for group cut operation.")
        frame_rate = executor.timeline.frame_rate
        # Find all clip names of the specified track_type, and their relative track index, where the timestamp is within the clip
        all_clip_names = []
        rel_indices = []
        rel_idx = 0
        for track in executor.timeline.tracks:
            if track.track_type == track_type:
                rel_indices.append((track, rel_idx))
                rel_idx += 1
        for track, rel_index in rel_indices:
            for clip in track.clips:
                if clip.start < timestamp_frames < clip.end:
                    all_clip_names.append((clip.name, rel_index))
        if not all_clip_names:
            return ExecutionResult(False, f"No clips found for track type '{track_type}' containing timestamp {timestamp_frames}.")
        # Now perform the cuts by name
        results = []
        for clip_name, track_index in all_clip_names:
            cut_op = EditOperation(type_="CUT", target=clip_name, parameters={"timestamp": timestamp_frames, "track_type": track_type, "track_index": track_index})
            result = executor.execute(cut_op)
            results.append((clip_name, result.success, result.message))
        # Summarize
        success_count = sum(1 for _, success, _ in results if success)
        fail_count = len(results) - success_count
        summary = f"Group CUT: {success_count} succeeded, {fail_count} failed. "
        details = "; ".join([f"{name}: {msg}" for name, _, msg in results])
        debug = f" | DEBUG: {[msg for _, _, msg in results]}"
        return ExecutionResult(success_count == len(results), summary + details + debug) 