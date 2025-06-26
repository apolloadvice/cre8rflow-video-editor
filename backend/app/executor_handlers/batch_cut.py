from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult
import logging
import random

class BatchCutHandler(BaseOperationHandler):
    """
    Handler for batch cut operations that affect multiple clips.
    Processes commands with target="each_clip" for cutting operations.
    """
    
    def can_handle(self, operation: EditOperation) -> bool:
        return (operation.type == "BATCH_CUT" or 
                (operation.type == "CUT" and operation.parameters.get("target") == "each_clip"))

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        """
        Execute batch cut operation on all clips in the timeline.
        For demo purposes, this trims each clip by the specified amounts with slight randomization.
        """
        timeline = executor.timeline
        frame_rate = timeline.frame_rate
        
        # Get batch cut parameters
        trim_start = operation.parameters.get("trim_start", 0.0)
        trim_end = operation.parameters.get("trim_end", 0.0)
        
        if trim_start == 0.0 and trim_end == 0.0:
            return ExecutionResult(False, "No trim amounts specified for batch cut operation.")
        
        # Get all video clips from all tracks
        all_clips = []
        for track in timeline.tracks:
            if track.track_type == "video":
                all_clips.extend(track.clips)
        
        if not all_clips:
            return ExecutionResult(False, "No video clips found to apply batch cut operation.")
        
        processed_clips = []
        
        for clip in all_clips:
            # Add slight randomization for demo realism (±20% of specified amount)
            actual_trim_start = trim_start * random.uniform(0.8, 1.2)
            actual_trim_end = trim_end * random.uniform(0.8, 1.2)
            
            # Convert to frames
            trim_start_frames = int(actual_trim_start * frame_rate)
            trim_end_frames = int(actual_trim_end * frame_rate)
            
            # Get current clip duration
            clip_duration_frames = clip.end - clip.start
            min_duration_frames = int(1.0 * frame_rate)  # Minimum 1 second
            
            # Ensure we don't trim more than the clip duration (leave at least 1 second)
            max_trim_total = clip_duration_frames - min_duration_frames
            actual_trim_total = trim_start_frames + trim_end_frames
            
            if actual_trim_total > max_trim_total:
                # Scale down proportionally
                scale = max_trim_total / actual_trim_total if actual_trim_total > 0 else 0
                trim_start_frames = int(trim_start_frames * scale)
                trim_end_frames = int(trim_end_frames * scale)
            
            # Apply trimming
            original_start = clip.start
            original_end = clip.end
            
            clip.start = original_start + trim_start_frames
            clip.end = original_end - trim_end_frames
            
            # Ensure clip bounds are valid
            if clip.start >= clip.end:
                clip.start = original_start + min_duration_frames // 2
                clip.end = original_end - min_duration_frames // 2
            
            processed_clips.append({
                'name': clip.name,
                'trimmed_start': trim_start_frames / frame_rate,
                'trimmed_end': trim_end_frames / frame_rate,
                'new_duration': (clip.end - clip.start) / frame_rate
            })
            
            logging.info(f"[BatchCutHandler] Trimmed clip '{clip.name}': start={trim_start_frames/frame_rate:.2f}s, end={trim_end_frames/frame_rate:.2f}s")
        
        # Notify timeline of changes
        timeline._notify_change()
        
        summary = f"Applied batch cut to {len(processed_clips)} clips (trim_start={trim_start}s, trim_end={trim_end}s with randomization)"
        
        return ExecutionResult(
            True, 
            summary,
            data={
                'processed_clips': processed_clips,
                'logs': [f"Processed {len(processed_clips)} clips with batch cut operation"]
            }
        ) 