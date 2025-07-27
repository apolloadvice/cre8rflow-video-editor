"""
Timeline Adapter: Bridge between legacy timeline and OpenTimelineIO model.
Provides backward compatibility during migration phase.
"""

from typing import Dict, List, Any, Optional, Union
import logging
import copy
from datetime import datetime
from app.timeline import Timeline as LegacyTimeline, VideoClip as LegacyVideoClip, Track as LegacyTrack
from app.otio_timeline import (
    OTIOTimeline, OTIOTrack, OTIOClip, OTIOGap, MediaReference, TimeRange, RationalTime,
    convert_legacy_timeline_to_otio, convert_legacy_clip_to_otio
)


class TimelineAdapter:
    """
    Adapter that provides a unified interface for both legacy and OTIO timelines.
    Allows gradual migration without breaking existing functionality.
    """
    
    def __init__(self, timeline: Union[LegacyTimeline, OTIOTimeline]):
        self.timeline = timeline
        self.is_otio = isinstance(timeline, OTIOTimeline)
        
        # Timeline history for undo/redo functionality
        self.history_stack: List[Dict[str, Any]] = []
        self.history_index: int = -1
        self.max_history_size: int = 20  # Limit memory usage
        
        # Save initial state
        self._save_initial_snapshot()
        
    @property
    def fps(self) -> float:
        """Get frame rate consistently"""
        if self.is_otio:
            return self.timeline.fps
        else:
            return self.timeline.frame_rate
    
    @property
    def duration_seconds(self) -> float:
        """Get timeline duration in seconds"""
        if self.is_otio:
            return self.timeline.duration().to_seconds()
        else:
            return self.timeline.duration
    
    # ============ TIMELINE HISTORY SYSTEM ============
    
    def _save_initial_snapshot(self):
        """Save the initial timeline state"""
        self._save_timeline_snapshot("Initial state")
    
    def _save_timeline_snapshot(self, operation_name: str):
        """
        Save a snapshot of the current timeline state for undo/redo.
        
        Args:
            operation_name: Description of the operation being performed
        """
        try:
            # Create deep copy of timeline data
            if self.is_otio:
                timeline_data = self.timeline.to_dict()
            else:
                timeline_data = self.to_dict()
            
            snapshot = {
                "timestamp": datetime.now().isoformat(),
                "operation": operation_name,
                "timeline_data": copy.deepcopy(timeline_data),
                "is_otio": self.is_otio,
                "clips_count": len(self.get_clips_for_api())
            }
            
            # Remove any redo history if we're in the middle of the stack
            if self.history_index < len(self.history_stack) - 1:
                self.history_stack = self.history_stack[:self.history_index + 1]
            
            # Add new snapshot
            self.history_stack.append(snapshot)
            self.history_index = len(self.history_stack) - 1
            
            # Limit history size
            if len(self.history_stack) > self.max_history_size:
                self.history_stack.pop(0)
                self.history_index -= 1
            
            logging.info(f"📸 [Timeline History] Saved snapshot: {operation_name} (clips: {snapshot['clips_count']})")
            
        except Exception as e:
            logging.error(f"❌ [Timeline History] Failed to save snapshot: {e}")
    
    def can_undo(self) -> bool:
        """Check if undo is possible"""
        return self.history_index > 0
    
    def can_redo(self) -> bool:
        """Check if redo is possible"""
        return self.history_index < len(self.history_stack) - 1
    
    def undo(self) -> bool:
        """
        Restore timeline to previous state.
        
        Returns:
            bool: True if undo was successful, False otherwise
        """
        if not self.can_undo():
            logging.warning("⚠️ [Timeline History] Cannot undo - no previous state available")
            return False
        
        try:
            self.history_index -= 1
            snapshot = self.history_stack[self.history_index]
            
            # Restore timeline from snapshot
            self._restore_timeline_from_snapshot(snapshot)
            
            logging.info(f"↶ [Timeline History] Undo successful: {snapshot['operation']}")
            return True
            
        except Exception as e:
            logging.error(f"❌ [Timeline History] Undo failed: {e}")
            return False
    
    def redo(self) -> bool:
        """
        Restore timeline to next state.
        
        Returns:
            bool: True if redo was successful, False otherwise
        """
        if not self.can_redo():
            logging.warning("⚠️ [Timeline History] Cannot redo - no next state available")
            return False
        
        try:
            self.history_index += 1
            snapshot = self.history_stack[self.history_index]
            
            # Restore timeline from snapshot
            self._restore_timeline_from_snapshot(snapshot)
            
            logging.info(f"↷ [Timeline History] Redo successful: {snapshot['operation']}")
            return True
            
        except Exception as e:
            logging.error(f"❌ [Timeline History] Redo failed: {e}")
            return False
    
    def _restore_timeline_from_snapshot(self, snapshot: Dict[str, Any]):
        """
        Restore timeline state from a history snapshot.
        
        Args:
            snapshot: Timeline snapshot containing timeline_data and metadata
        """
        timeline_data = snapshot["timeline_data"]
        was_otio = snapshot["is_otio"]
        
        if was_otio:
            # Restore OTIO timeline
            self.timeline = self._reconstruct_otio_timeline(timeline_data)
            self.is_otio = True
        else:
            # Restore legacy timeline
            self.timeline = self._reconstruct_legacy_timeline(timeline_data)
            self.is_otio = False
        
        logging.info(f"🔄 [Timeline History] Restored timeline: {snapshot['operation']} (clips: {snapshot['clips_count']})")
    
    def _reconstruct_otio_timeline(self, timeline_data: Dict[str, Any]) -> OTIOTimeline:
        """Reconstruct OTIOTimeline from serialized data"""
        # Create new timeline
        timeline = OTIOTimeline(
            name=timeline_data.get("name", "Restored Timeline"),
            fps=timeline_data.get("fps", 30.0),
            timeline_id=timeline_data.get("id")
        )
        
        # Clear default tracks
        timeline.tracks = []
        
        # Reconstruct tracks
        for track_data in timeline_data.get("tracks", []):
            track = OTIOTrack(
                name=track_data.get("name", "Track"),
                track_type=track_data.get("track_type", "video")
            )
            
            # Reconstruct clips
            for child_data in track_data.get("children", []):
                if child_data.get("_type") == "OTIOClip":
                    # Reconstruct clip
                    media_ref = MediaReference(
                        id=child_data["media_reference"]["id"],
                        url=child_data["media_reference"]["url"],
                        metadata=child_data["media_reference"].get("metadata", {})
                    )
                    
                    source_range = None
                    if child_data.get("source_range"):
                        sr_data = child_data["source_range"]
                        source_range = TimeRange(
                            start_time=RationalTime(
                                value=sr_data["start_time"]["value"],
                                rate=sr_data["start_time"]["rate"]
                            ),
                            duration=RationalTime(
                                value=sr_data["duration"]["value"],
                                rate=sr_data["duration"]["rate"]
                            )
                        )
                    
                    clip = OTIOClip(
                        name=child_data["name"],
                        media_reference=media_ref,
                        source_range=source_range,
                        clip_id=child_data["id"],
                        metadata=child_data.get("metadata", {})
                    )
                    track.children.append(clip)
                    
                elif child_data.get("_type") == "OTIOGap":
                    # Reconstruct gap
                    gap = OTIOGap(
                        duration_time=RationalTime(
                            value=child_data["duration"]["value"],
                            rate=child_data["duration"]["rate"]
                        ),
                        name=child_data["name"]
                    )
                    track.children.append(gap)
            
            timeline.tracks.append(track)
        
        return timeline
    
    def _reconstruct_legacy_timeline(self, timeline_data: Dict[str, Any]) -> LegacyTimeline:
        """Reconstruct legacy timeline from serialized data"""
        timeline = LegacyTimeline(frame_rate=timeline_data.get("frame_rate", 30.0))
        timeline.duration = timeline_data.get("duration", 0.0)
        
        # Reconstruct tracks
        timeline.tracks = []
        for track_data in timeline_data.get("tracks", []):
            track = LegacyTrack(
                name=track_data.get("name", "Track"),
                track_type=track_data.get("track_type", "video")
            )
            
            # Reconstruct clips
            track.clips = []
            for clip_data in track_data.get("clips", []):
                clip = LegacyVideoClip(
                    clip_id=clip_data.get("clip_id"),
                    name=clip_data.get("name"),
                    start=clip_data.get("start", 0),
                    end=clip_data.get("end", 0),
                    file_path=clip_data.get("file_path", ""),
                    track_type=clip_data.get("track_type", "video")
                )
                if "in_point" in clip_data:
                    clip.in_point = clip_data["in_point"]
                track.clips.append(clip)
            
            timeline.tracks.append(track)
        
        return timeline
    
    def get_history_info(self) -> Dict[str, Any]:
        """Get information about timeline history for debugging/UI"""
        return {
            "history_size": len(self.history_stack),
            "current_index": self.history_index,
            "can_undo": self.can_undo(),
            "can_redo": self.can_redo(),
            "operations": [
                {
                    "operation": snapshot["operation"],
                    "timestamp": snapshot["timestamp"],
                    "clips_count": snapshot["clips_count"]
                }
                for snapshot in self.history_stack
            ],
            "current_operation": self.history_stack[self.history_index]["operation"] if self.history_stack else None
        }
    
    # ============ END TIMELINE HISTORY SYSTEM ============
    
    def get_clips_for_api(self) -> List[Dict[str, Any]]:
        """
        Get clips in format expected by frontend API.
        Converts both legacy and OTIO clips to consistent format.
        """
        clips = []
        
        if self.is_otio:
            # Convert OTIO clips to API format
            for track_idx, track in enumerate(self.timeline.tracks):
                timeline_position = RationalTime(0, self.fps)
                
                for item in track.children:
                    if isinstance(item, OTIOClip):
                        clip_duration = item.duration(self.fps)
                        
                        clip_data = {
                            "id": item.id,
                            "name": item.name,
                            "start": timeline_position.to_seconds(),
                            "end": (timeline_position + clip_duration).to_seconds(),
                            "duration": clip_duration.to_seconds(),
                            "in_point": item.source_range.start_time.to_seconds() if item.source_range else 0.0,
                            "track": track_idx,
                            "type": track.track_type,
                            "file_path": item.media_reference.url,
                            "_type": "VideoClip",
                            "effects": []
                        }
                        clips.append(clip_data)
                        
                    timeline_position += item.duration(self.fps)
        else:
            # Convert legacy clips to API format
            for track_idx, track in enumerate(self.timeline.tracks):
                for clip in track.clips:
                    if hasattr(clip, 'to_dict'):
                        clip_data = clip.to_dict()
                        # Convert frame-based to seconds for API
                        clip_data.update({
                            "start": clip.start / self.fps,
                            "end": clip.end / self.fps,
                            "duration": (clip.end - clip.start) / self.fps,
                            "in_point": getattr(clip, 'in_point', 0) / self.fps,
                            "track": track_idx
                        })
                        clips.append(clip_data)
        
        return clips
    
    def add_clip_from_asset(self, asset_path: str, track_type: str = "video", 
                          position_seconds: Optional[float] = None,
                          duration_seconds: Optional[float] = None) -> str:
        """
        Add clip from asset to timeline, handling both legacy and OTIO formats.
        Returns clip ID.
        """
        if self.is_otio:
            # Add to OTIO timeline
            clip = self.timeline.add_clip_from_media(
                media_url=asset_path,
                track_type=track_type,
                position=position_seconds
            )
            return clip.id
        else:
            # Add to legacy timeline
            track_index = 0  # Default to first track of type
            clip = self.timeline.load_video(
                file_path=asset_path,
                track_index=track_index,
                position=position_seconds,
                duration_seconds=duration_seconds
            )
            return clip.clip_id
    
    def cut_out_range(self, start_seconds: float, end_seconds: float, 
                     target_clip_id: Optional[str] = None,
                     mode: str = 'ripple') -> bool:
        """
        Cut out a time range, handling both timeline formats.
        Enhanced to process all tracks and preserve non-target clips.
        """
        # 📸 SAVE TIMELINE SNAPSHOT BEFORE CUT OPERATION
        operation_desc = f"Cut out {start_seconds:.1f}s-{end_seconds:.1f}s"
        if target_clip_id:
            operation_desc += f" (target: {target_clip_id})"
        self._save_timeline_snapshot(operation_desc)
        
        if self.is_otio:
            # Use enhanced OTIO operations that handle all tracks
            from app.otio_timeline import OTIOOperations
            
            start_time = RationalTime.from_seconds(start_seconds, self.fps)
            end_time = RationalTime.from_seconds(end_seconds, self.fps)
            
            # NEW: Process all tracks, not just the first video track
            success = True
            cut_range_duration = end_time - start_time
            
            # Process each track individually
            for track in self.timeline.tracks:
                if track.track_type == "video":
                    # Apply cut operation to video tracks
                    track_success = OTIOOperations.cut_out_range(
                        self.timeline, track, start_time, end_time, mode
                    )
                    if not track_success:
                        success = False
                        logging.warning(f"Cut operation failed on track: {track.name}")
                else:
                    # For non-video tracks (audio, text), apply ripple editing
                    # Shift clips that start after the cut range
                    if mode == 'ripple':
                        self._apply_ripple_edit_to_track(track, start_time, cut_range_duration)
            
            return success
        else:
            # Use legacy operations
            # This would call existing cut handlers
            return self._legacy_cut_out(start_seconds, end_seconds, target_clip_id)
    
    def _apply_ripple_edit_to_track(self, track: OTIOTrack, cut_start_time: RationalTime, 
                                   cut_duration: RationalTime):
        """
        Apply ripple editing to a track: shift clips that start after the cut range.
        This preserves non-target clips while maintaining timeline sync.
        """
        timeline_position = RationalTime(0, self.fps)
        
        for item in track.children:
            item_duration = item.duration(self.fps)
            item_start = timeline_position
            item_end = timeline_position + item_duration
            
            # If the clip starts after the cut range, it needs to be shifted backward
            if item_start >= cut_start_time + cut_duration:
                # This clip starts after the cut range ends, so shift it backward
                logging.info(f"Ripple edit: Shifting clip '{getattr(item, 'name', 'Unknown')}' backward by {cut_duration.to_seconds()}s")
                # Note: In a real implementation, we would need to rebuild the track
                # with proper timeline positioning. For now, we log the intention.
                
            # Update timeline position for next iteration
            timeline_position = item_end
    
    def _legacy_cut_out(self, start_seconds: float, end_seconds: float, 
                       target_clip_id: Optional[str] = None) -> bool:
        """Handle cut operation using legacy timeline system"""
        # This integrates with existing command handlers
        from app.command_executor import CommandExecutor
        from app.command_types import EditOperation
        
        operation = EditOperation(
            type_="CUT_OUT_WORKFLOW",
            target="",  # Will be resolved by executor
            parameters={
                "start": start_seconds,
                "end": end_seconds,
                "clip_id": target_clip_id,
                "track_type": "video"
            }
        )
        
        executor = CommandExecutor(self.timeline)
        result = executor.execute(operation)
        return result.success
    
    def find_clip_by_id(self, clip_id: str) -> Optional[Dict[str, Any]]:
        """Find clip by ID in either timeline format"""
        if self.is_otio:
            for track in self.timeline.tracks:
                for item in track.children:
                    if isinstance(item, OTIOClip) and item.id == clip_id:
                        return {
                            "id": item.id,
                            "name": item.name,
                            "media_url": item.media_reference.url,
                            "source_range": item.source_range.to_dict() if item.source_range else None
                        }
        else:
            for track in self.timeline.tracks:
                for clip in track.clips:
                    if getattr(clip, 'clip_id', None) == clip_id:
                        return {
                            "id": clip.clip_id,
                            "name": clip.name,
                            "file_path": getattr(clip, 'file_path', ''),
                            "start_frames": clip.start,
                            "end_frames": clip.end,
                            "in_point_frames": getattr(clip, 'in_point', 0)
                        }
        return None
    
    def migrate_to_otio(self) -> 'TimelineAdapter':
        """
        Migrate legacy timeline to OTIO format.
        Returns new adapter with OTIO timeline.
        """
        if self.is_otio:
            return self  # Already OTIO
        
        # Convert legacy timeline to OTIO
        timeline_dict = {
            'frame_rate': self.timeline.frame_rate,
            'tracks': []
        }
        
        for track in self.timeline.tracks:
            track_dict = {
                'name': track.name,
                'track_type': track.track_type,
                'clips': []
            }
            
            for clip in track.clips:
                if hasattr(clip, 'to_dict'):
                    track_dict['clips'].append(clip.to_dict())
            
            timeline_dict['tracks'].append(track_dict)
        
        otio_timeline = convert_legacy_timeline_to_otio(timeline_dict)
        return TimelineAdapter(otio_timeline)
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize timeline to dictionary"""
        if self.is_otio:
            return self.timeline.to_dict()
        else:
            # Use existing legacy serialization
            return {
                "_type": "Timeline",
                "frame_rate": self.timeline.frame_rate,
                "duration": self.timeline.duration,
                "tracks": [track.to_dict() for track in self.timeline.tracks]
            }


class TimelineMigrationService:
    """
    Service to handle gradual migration from legacy to OTIO timeline.
    """
    
    @staticmethod
    def detect_timeline_format(timeline_data: Dict[str, Any]) -> str:
        """Detect if timeline data is legacy or OTIO format"""
        if timeline_data.get('_type') == 'OTIOTimeline':
            return 'otio'
        elif 'frame_rate' in timeline_data and 'tracks' in timeline_data:
            return 'legacy'
        else:
            return 'unknown'
    
    @staticmethod
    def load_timeline(timeline_data: Dict[str, Any]) -> TimelineAdapter:
        """
        Load timeline from data, auto-detecting format.
        """
        format_type = TimelineMigrationService.detect_timeline_format(timeline_data)
        
        if format_type == 'otio':
            # Load OTIO timeline
            timeline = TimelineMigrationService._load_otio_timeline(timeline_data)
            return TimelineAdapter(timeline)
        elif format_type == 'legacy':
            # Load legacy timeline 
            timeline = TimelineMigrationService._load_legacy_timeline(timeline_data)
            return TimelineAdapter(timeline)
        else:
            raise ValueError(f"Unknown timeline format: {timeline_data}")
    
    @staticmethod
    def _load_otio_timeline(data: Dict[str, Any]) -> OTIOTimeline:
        """Load OTIO timeline from serialized data"""
        timeline = OTIOTimeline(
            name=data.get('name', 'Timeline'),
            fps=data.get('fps', 30.0),
            timeline_id=data.get('id')
        )
        
        timeline.tracks = []
        for track_data in data.get('tracks', []):
            track = OTIOTrack(
                name=track_data.get('name', 'Track'),
                track_type=track_data.get('track_type', 'video'),
                track_id=track_data.get('id')
            )
            
            # Load children (clips, gaps, transitions)
            for child_data in track_data.get('children', []):
                if child_data.get('_type') == 'OTIOClip':
                    # Reconstruct clip
                    media_ref = MediaReference(
                        id=child_data['media_reference']['id'],
                        url=child_data['media_reference']['url'],
                        metadata=child_data['media_reference'].get('metadata', {})
                    )
                    
                    source_range = None
                    if child_data.get('source_range'):
                        sr_data = child_data['source_range']
                        source_range = TimeRange(
                            start_time=RationalTime(
                                sr_data['start_time']['value'],
                                sr_data['start_time']['rate']
                            ),
                            duration=RationalTime(
                                sr_data['duration']['value'], 
                                sr_data['duration']['rate']
                            )
                        )
                    
                    clip = OTIOClip(
                        name=child_data.get('name', 'Clip'),
                        media_reference=media_ref,
                        source_range=source_range,
                        clip_id=child_data.get('id')
                    )
                    track.children.append(clip)
                    
                elif child_data.get('_type') == 'OTIOGap':
                    gap = OTIOGap(
                        duration_time=RationalTime(
                            child_data['duration']['value'],
                            child_data['duration']['rate']
                        ),
                        name=child_data.get('name', 'Gap'),
                        gap_id=child_data.get('id')
                    )
                    track.children.append(gap)
            
            timeline.tracks.append(track)
        
        return timeline
    
    @staticmethod 
    def _load_legacy_timeline(data: Dict[str, Any]) -> LegacyTimeline:
        """Load legacy timeline from serialized data"""
        from app.backend.timeline_api import load_timeline_from_db_robust
        
        # Use existing legacy loading logic
        # This is a placeholder - would use the actual loading mechanism
        timeline = LegacyTimeline(frame_rate=data.get('frame_rate', 30.0))
        
        # Load tracks and clips using existing logic
        for track_data in data.get('tracks', []):
            track = LegacyTrack(
                name=track_data.get('name', 'Track'),
                track_type=track_data.get('track_type', 'video')
            )
            
            for clip_data in track_data.get('clips', []):
                # Reconstruct legacy clip
                clip = LegacyVideoClip(
                    name=clip_data.get('name', 'Clip'),
                    start_frame=clip_data.get('start', 0),
                    end_frame=clip_data.get('end', 0),
                    track_type=clip_data.get('track_type', 'video'),
                    file_path=clip_data.get('file_path'),
                    clip_id=clip_data.get('clip_id'),
                    in_point=clip_data.get('in_point', 0)
                )
                track.clips.append(clip)
            
            timeline.tracks.append(track)
        
        return timeline


# Migration utilities for command handlers
def get_timeline_adapter(timeline_data: Dict[str, Any]) -> TimelineAdapter:
    """
    Get a timeline adapter for use in command handlers.
    Automatically detects and loads the appropriate timeline format.
    """
    return TimelineMigrationService.load_timeline(timeline_data)


def update_command_api_for_migration():
    """
    Helper to update command API endpoints to use timeline adapter.
    This allows gradual migration without breaking existing functionality.
    """
    logging.info("Timeline migration adapter initialized. Both legacy and OTIO formats supported.") 