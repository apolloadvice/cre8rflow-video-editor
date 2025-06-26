from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult
import logging

class CutOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "CUT"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        clip_name = operation.target
        clip_id = operation.parameters.get("clip_id")
        start_sec = operation.parameters.get("start")
        end_sec = operation.parameters.get("end")
        track_type = operation.parameters.get("track_type", "video")
        track_index = operation.parameters.get("track_index")
        if track_index is None:
            found_index = executor.find_track_index_for_clip(clip_name, track_type)
            if found_index is None:
                return ExecutionResult(False, f"Clip '{clip_name or clip_id}' not found in any {track_type} track.")
            track_index = found_index
        else:
            track_index = int(track_index)
        timeline = executor.timeline
        frame_rate = timeline.frame_rate

        # Validate input
        if (not clip_name and not clip_id) or start_sec is None or end_sec is None:
            return ExecutionResult(False, "Missing clip name/id or start/end for CUT operation.")

        # Find the clip and its duration
        track = timeline.get_track(track_type, track_index)
        parent, idx, clip = timeline._find_clip_recursive(track.clips, target_name=clip_name, target_id=clip_id)
        if clip is None:
            return ExecutionResult(False, f"Clip '{clip_name or clip_id}' not found.")
        clip_start_sec = clip.start / frame_rate
        clip_end_sec = clip.end / frame_rate
        clip_duration = clip_end_sec - clip_start_sec

        # Normalize start/end relative to the clip
        cut_start = max(float(start_sec), clip_start_sec)
        cut_end = min(float(end_sec), clip_end_sec)

        # Case 1: Trim from start (cut out the first N seconds)
        if abs(cut_start - clip_start_sec) < 1e-3 and cut_end < clip_end_sec:
            new_start_frame = int(round(cut_end * frame_rate))
            clip.start = new_start_frame
            timeline._notify_change()
            return ExecutionResult(True, f"Trimmed start of '{clip.name}' to {cut_end}s.")
        # Case 2: Trim from end (cut out the last N seconds)
        elif cut_start > clip_start_sec and abs(cut_end - clip_end_sec) < 1e-3:
            new_end_frame = int(round(cut_start * frame_rate))
            clip.end = new_end_frame
            timeline._notify_change()
            return ExecutionResult(True, f"Trimmed end of '{clip.name}' to {cut_start}s.")
        # Case 3: Cut out a middle segment (leave a gap)
        elif cut_start > clip_start_sec and cut_end < clip_end_sec:
            # Split into two clips, remove the segment, and leave a gap
            first = type(clip)(
                name=clip.name + "_part1",
                start_frame=clip.start,
                end_frame=int(round(cut_start * frame_rate)),
                track_type=clip.track_type,
                file_path=clip.file_path
            )
            second = type(clip)(
                name=clip.name + "_part2",
                start_frame=int(round(cut_end * frame_rate)),
                end_frame=clip.end,
                track_type=clip.track_type,
                file_path=clip.file_path
            )
            # Remove the original clip
            parent.pop(idx)
            # Insert the two new clips, with a gap in between (represented by nothing)
            parent.insert(idx, second)
            parent.insert(idx, first)
            timeline._update_ancestor_bounds(track, parent)
            timeline._notify_change()
            return ExecutionResult(True, f"Cut out segment {cut_start}-{cut_end}s from '{clip.name}', leaving a gap.")
        else:
            logging.warning(f"[CutOperationHandler] No valid cut/trim performed: start={cut_start}, end={cut_end}, clip=({clip_start_sec}, {clip_end_sec})")
            return ExecutionResult(False, f"Invalid cut/trim range for '{clip.name}'.") 