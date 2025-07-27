"""
Cre8rFlow Timeline System v2 - OpenTimelineIO-based Non-Destructive Editing
This is the new default timeline system replacing the legacy timeline.py

Key Features:
- Non-destructive editing (never modifies source media)
- Frame-accurate operations with RationalTime
- Explicit gap management for ripple/lift operations
- Industry-standard OpenTimelineIO architecture
- Full backward compatibility through adapters
"""

from typing import List, Dict, Optional, Any, Union
import logging
import uuid
import os

# Import the OTIO core system
from app.otio_timeline import (
    OTIOTimeline, OTIOTrack, OTIOClip, OTIOGap, MediaReference, 
    TimeRange, RationalTime, OTIOOperations, ComposableItem
)

# For backward compatibility, re-export legacy types
from app.timeline import TrackType

# Set up logging
logger = logging.getLogger(__name__)


class Timeline(OTIOTimeline):
    """
    Enhanced Timeline class that extends OTIOTimeline with additional convenience methods.
    This is the new default Timeline class for Cre8rFlow.
    """
    
    def __init__(self, name: str = "Timeline", fps: float = 30.0, timeline_id: str = None):
        super().__init__(name, fps, timeline_id)
        logger.info(f"Created new OTIO Timeline: {name} at {fps}fps")
        
    @classmethod
    def create_default(cls, fps: float = 30.0) -> 'Timeline':
        """Create a timeline with default tracks setup"""
        timeline = cls("Default Timeline", fps)
        
        # Ensure we have the standard tracks
        if not any(t.track_type == "video" for t in timeline.tracks):
            timeline.tracks.append(OTIOTrack("Video 1", "video"))
        if not any(t.track_type == "audio" for t in timeline.tracks):
            timeline.tracks.append(OTIOTrack("Audio 1", "audio"))  
        if not any(t.track_type == "text" for t in timeline.tracks):
            timeline.tracks.append(OTIOTrack("Text 1", "text"))
            
        return timeline
    
    def load_video(self, file_path: str, track_index: int = 0, 
                   position: Optional[float] = None, 
                   duration_seconds: Optional[float] = None) -> OTIOClip:
        """
        Load a video file and add it as a clip to the timeline.
        Non-destructive version of the legacy method.
        
        Args:
            file_path: Path to the video file
            track_index: Track to add the clip to (0 = first video track)
            position: Position in seconds (None = append to end)
            duration_seconds: Duration of the video in seconds
            
        Returns:
            OTIOClip: The created video clip
        """
        # Create media reference
        media_ref = MediaReference(
            id=str(uuid.uuid4()),
            url=file_path,
            metadata={"duration_seconds": duration_seconds or 60.0}
        )
        
        # Set available range if duration is known
        if duration_seconds:
            media_ref.available_range = TimeRange(
                start_time=RationalTime(0, self.fps),
                duration=RationalTime(int(duration_seconds * self.fps), self.fps)
            )
        
        # Create clip using full media (non-destructive)
        clip = OTIOClip(
            name=os.path.splitext(os.path.basename(file_path))[0],
            media_reference=media_ref,
            source_range=media_ref.available_range  # Use full available range
        )
        
        # Add to appropriate track
        video_tracks = [t for t in self.tracks if t.track_type == "video"]
        if track_index < len(video_tracks):
            target_track = video_tracks[track_index]
            
            if position is not None:
                timeline_position = RationalTime.from_seconds(position, self.fps)
                target_track.add_item(clip, timeline_position)
            else:
                target_track.add_item(clip)
                
        logger.info(f"Loaded video clip: {clip.name} from {file_path}")
        return clip
    
    def add_clip(self, clip: OTIOClip, track_index: int = 0, 
                 position: Optional[float] = None) -> None:
        """
        Add a clip to the timeline.
        
        Args:
            clip: The clip to add
            track_index: Track index (within track type)
            position: Position in seconds (None = append)
        """
        # Find appropriate track
        video_tracks = [t for t in self.tracks if t.track_type == "video"]
        if track_index < len(video_tracks):
            target_track = video_tracks[track_index]
            
            if position is not None:
                timeline_position = RationalTime.from_seconds(position, self.fps)
                target_track.add_item(clip, timeline_position)
            else:
                target_track.add_item(clip)
    
    def get_track(self, track_type: str, index: int = 0) -> Optional[OTIOTrack]:
        """
        Get track by type and index (backward compatible method).
        
        Args:
            track_type: Type of track ("video", "audio", "text")
            index: Index within that track type
            
        Returns:
            OTIOTrack or None if not found
        """
        matching_tracks = [t for t in self.tracks if t.track_type == track_type]
        if index < len(matching_tracks):
            return matching_tracks[index]
        return None
    
    def get_all_clips(self, track_type: str = None) -> List[OTIOClip]:
        """
        Get all clips from the timeline, optionally filtered by track type.
        
        Args:
            track_type: Filter by track type (None = all tracks)
            
        Returns:
            List of OTIOClip objects
        """
        clips = []
        for track in self.tracks:
            if track_type is None or track.track_type == track_type:
                for item in track.children:
                    if isinstance(item, OTIOClip):
                        clips.append(item)
        return clips
    
    def find_clip_by_id(self, clip_id: str) -> Optional[tuple[OTIOTrack, int, OTIOClip]]:
        """
        Find a clip by ID and return track, index, and clip.
        
        Args:
            clip_id: ID of the clip to find
            
        Returns:
            (track, index, clip) tuple or None if not found
        """
        for track in self.tracks:
            for i, item in enumerate(track.children):
                if isinstance(item, OTIOClip) and item.id == clip_id:
                    return track, i, item
        return None
    
    def find_clip_by_name(self, clip_name: str) -> Optional[tuple[OTIOTrack, int, OTIOClip]]:
        """
        Find a clip by name and return track, index, and clip.
        
        Args:
            clip_name: Name of the clip to find
            
        Returns:
            (track, index, clip) tuple or None if not found
        """
        for track in self.tracks:
            for i, item in enumerate(track.children):
                if isinstance(item, OTIOClip) and item.name == clip_name:
                    return track, i, item
        return None
    
    def cut_out_range(self, start_seconds: float, end_seconds: float, 
                      track_type: str = "video", track_index: int = 0,
                      mode: str = 'ripple') -> bool:
        """
        Cut out a time range from the timeline (non-destructive).
        
        Args:
            start_seconds: Start time in seconds
            end_seconds: End time in seconds  
            track_type: Type of track to cut from
            track_index: Index of track within type
            mode: 'ripple' (close gap) or 'lift' (preserve gap)
            
        Returns:
            True if successful, False otherwise
        """
        track = self.get_track(track_type, track_index)
        if not track:
            logger.error(f"Track {track_type}[{track_index}] not found")
            return False
        
        start_time = RationalTime.from_seconds(start_seconds, self.fps)
        end_time = RationalTime.from_seconds(end_seconds, self.fps)
        
        try:
            success = OTIOOperations.cut_out_range(self, track, start_time, end_time, mode)
            if success:
                logger.info(f"Cut out {start_seconds:.2f}s-{end_seconds:.2f}s from {track_type}[{track_index}] ({mode} mode)")
            return success
        except Exception as e:
            logger.error(f"Failed to cut out range: {e}")
            return False
    
    def split_clip_at(self, clip_id: str, time_seconds: float) -> bool:
        """
        Split a clip at the specified time (non-destructive).
        
        Args:
            clip_id: ID of clip to split
            time_seconds: Time to split at (relative to timeline)
            
        Returns:
            True if successful, False otherwise
        """
        result = self.find_clip_by_id(clip_id)
        if not result:
            logger.error(f"Clip {clip_id} not found")
            return False
        
        track, index, clip = result
        
        try:
            # Convert timeline time to clip-relative time
            cut_time = RationalTime.from_seconds(time_seconds, self.fps)
            
            # Split the clip
            first_clip, second_clip = OTIOOperations.split_clip(self, clip, cut_time)
            
            # Replace original clip with split clips
            track.children.pop(index)
            track.children.insert(index, second_clip)
            track.children.insert(index, first_clip)
            
            logger.info(f"Split clip {clip.name} at {time_seconds:.2f}s")
            return True
            
        except Exception as e:
            logger.error(f"Failed to split clip: {e}")
            return False
    
    def add_text_clip(self, text: str, start_seconds: float, duration_seconds: float,
                      track_index: int = 0, **style_params) -> OTIOClip:
        """
        Add a text clip to the timeline.
        
        Args:
            text: Text content
            start_seconds: Start time in seconds
            duration_seconds: Duration in seconds
            track_index: Text track index
            **style_params: Additional styling parameters
            
        Returns:
            OTIOClip: The created text clip
        """
        # Create a text media reference
        media_ref = MediaReference(
            id=str(uuid.uuid4()),
            url="",  # Text clips don't have URLs
            metadata={
                "type": "text",
                "text": text,
                **style_params
            }
        )
        
        # Create source range for the text duration
        source_range = TimeRange(
            start_time=RationalTime(0, self.fps),
            duration=RationalTime(int(duration_seconds * self.fps), self.fps)
        )
        
        # Create text clip
        text_clip = OTIOClip(
            name=f"Text: {text[:20]}...",
            media_reference=media_ref,
            source_range=source_range
        )
        
        # Add to text track
        text_tracks = [t for t in self.tracks if t.track_type == "text"]
        if track_index < len(text_tracks):
            target_track = text_tracks[track_index]
            timeline_position = RationalTime.from_seconds(start_seconds, self.fps)
            target_track.add_item(text_clip, timeline_position)
        
        logger.info(f"Added text clip: '{text}' at {start_seconds:.2f}s")
        return text_clip
    
    def to_legacy_format(self) -> Dict[str, Any]:
        """
        Convert to legacy timeline format for backward compatibility.
        
        Returns:
            Dictionary in legacy timeline format
        """
        tracks_data = []
        
        for track in self.tracks:
            clips_data = []
            timeline_position = 0.0
            
            for item in track.children:
                if isinstance(item, OTIOClip):
                    clip_duration = item.duration(self.fps).to_seconds()
                    
                    clip_data = {
                        "clip_id": item.id,
                        "name": item.name, 
                        "start": int(timeline_position * self.fps),  # Convert to frames
                        "end": int((timeline_position + clip_duration) * self.fps),
                        "track_type": track.track_type,
                        "file_path": item.media_reference.url,
                        "in_point": item.source_range.start_time.value if item.source_range else 0,
                        "_type": "VideoClip"
                    }
                    clips_data.append(clip_data)
                    timeline_position += clip_duration
                    
                elif isinstance(item, OTIOGap):
                    gap_duration = item.duration(self.fps).to_seconds()
                    timeline_position += gap_duration
            
            track_data = {
                "name": track.name,
                "track_type": track.track_type,
                "clips": clips_data
            }
            tracks_data.append(track_data)
        
        return {
            "_type": "Timeline",
            "frame_rate": self.fps,
            "duration": self.duration().to_seconds(),
            "tracks": tracks_data
        }


# Convenience functions for creating timelines
def create_timeline(fps: float = 30.0, name: str = "Timeline") -> Timeline:
    """Create a new timeline with default setup"""
    return Timeline.create_default(fps)


def load_timeline_from_dict(data: Dict[str, Any]) -> Timeline:
    """
    Load timeline from dictionary data.
    Handles both OTIO and legacy formats.
    """
    if data.get("_type") == "OTIOTimeline":
        # Load OTIO format directly
        from app.timeline_adapter import TimelineMigrationService
        adapter = TimelineMigrationService.load_timeline(data)
        return adapter.timeline
    else:
        # Convert legacy format to OTIO
        from app.timeline_adapter import TimelineMigrationService
        adapter = TimelineMigrationService.load_timeline(data)
        otio_adapter = adapter.migrate_to_otio()
        return otio_adapter.timeline


# Export the main classes for backward compatibility
__all__ = [
    'Timeline', 'OTIOClip', 'OTIOTrack', 'OTIOGap', 'MediaReference',
    'TimeRange', 'RationalTime', 'TrackType', 'create_timeline',
    'load_timeline_from_dict'
] 