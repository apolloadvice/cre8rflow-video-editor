"""
OpenTimelineIO-inspired timeline model for non-destructive video editing.
Based on https://opentimelineio.readthedocs.io/en/v0.14/tutorials/otio-timeline-structure.html
"""

from dataclasses import dataclass, field
from typing import List, Optional, Union, Dict, Any
from abc import ABC, abstractmethod
import uuid
import logging
from enum import Enum


@dataclass
class RationalTime:
    """
    Represents time as integer frames at a specific rate.
    Avoids floating-point precision issues.
    """
    value: int      # Frame number (integer)
    rate: float     # Frame rate (e.g., 30.0)
    
    def to_seconds(self) -> float:
        """Convert to seconds (for UI display)"""
        return self.value / self.rate
    
    def to_frames(self, target_rate: float) -> int:
        """Convert to frames at different rate"""
        seconds = self.to_seconds()
        return int(round(seconds * target_rate))
    
    @classmethod
    def from_seconds(cls, seconds: float, rate: float) -> 'RationalTime':
        """Create from seconds"""
        return cls(value=int(round(seconds * rate)), rate=rate)
    
    def __add__(self, other: 'RationalTime') -> 'RationalTime':
        """Add two times (must be same rate)"""
        if self.rate != other.rate:
            raise ValueError(f"Cannot add times with different rates: {self.rate} vs {other.rate}")
        return RationalTime(self.value + other.value, self.rate)
    
    def __sub__(self, other: 'RationalTime') -> 'RationalTime':
        """Subtract two times (must be same rate)"""
        if self.rate != other.rate:
            raise ValueError(f"Cannot subtract times with different rates: {self.rate} vs {other.rate}")
        return RationalTime(self.value - other.value, self.rate)
    
    def __eq__(self, other: 'RationalTime') -> bool:
        """Check equality"""
        return self.value == other.value and self.rate == other.rate
    
    def __lt__(self, other: 'RationalTime') -> bool:
        """Less than comparison"""
        if self.rate != other.rate:
            # Convert to same rate for comparison
            return self.to_seconds() < other.to_seconds()
        return self.value < other.value
    
    def __le__(self, other: 'RationalTime') -> bool:
        """Less than or equal comparison"""
        return self < other or self == other
    
    def __gt__(self, other: 'RationalTime') -> bool:
        """Greater than comparison"""
        return not (self <= other)
    
    def __ge__(self, other: 'RationalTime') -> bool:
        """Greater than or equal comparison"""
        return not (self < other)


@dataclass
class TimeRange:
    """
    Represents a time range with start and duration.
    """
    start_time: RationalTime
    duration: RationalTime
    
    @property
    def end_time(self) -> RationalTime:
        """Calculate end time"""
        return self.start_time + self.duration
    
    def contains(self, time: RationalTime) -> bool:
        """Check if time falls within this range"""
        return self.start_time.value <= time.value < self.end_time.value
    
    def intersects(self, other: 'TimeRange') -> bool:
        """Check if this range intersects with another"""
        return (self.start_time.value < other.end_time.value and 
                other.start_time.value < self.end_time.value)


@dataclass  
class MediaReference:
    """
    Reference to source media file with available content range.
    """
    id: str
    url: str                          # File path or network URL
    available_range: Optional[TimeRange] = None  # What's available in file
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


class ComposableItem(ABC):
    """
    Base class for items that can be placed on tracks.
    """
    def __init__(self, name: str, item_id: str = None):
        self.id = item_id or str(uuid.uuid4())
        self.name = name
    
    @abstractmethod
    def duration(self, rate: float) -> RationalTime:
        """Get the duration of this item"""
        pass
    
    @abstractmethod
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary"""
        pass


@dataclass
class OTIOClip(ComposableItem):
    """
    Represents a clip with non-destructive media reference.
    """
    media_reference: MediaReference
    source_range: Optional[TimeRange] = None  # Trimmed portion, None = use all available
    metadata: Dict[str, Any] = field(default_factory=dict)  # For preserving original clip data
    
    def __init__(self, name: str, media_reference: MediaReference, 
                 source_range: Optional[TimeRange] = None, clip_id: str = None,
                 metadata: Dict[str, Any] = None):
        super().__init__(name, clip_id)
        self.media_reference = media_reference
        self.source_range = source_range
        self.metadata = metadata or {}
    
    def duration(self, rate: float) -> RationalTime:
        """Get trimmed duration of this clip"""
        if self.source_range:
            return self.source_range.duration
        elif self.media_reference.available_range:
            return self.media_reference.available_range.duration
        else:
            # Fallback: assume some default duration
            return RationalTime.from_seconds(10.0, rate)
    
    def trimmed_range(self) -> Optional[TimeRange]:
        """Get the effective range of media used by this clip"""
        return self.source_range or self.media_reference.available_range
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "_type": "OTIOClip",
            "id": self.id,
            "name": self.name,
            "media_reference": {
                "id": self.media_reference.id,
                "url": self.media_reference.url,
                "available_range": {
                    "start_time": {
                        "value": self.media_reference.available_range.start_time.value,
                        "rate": self.media_reference.available_range.start_time.rate
                    } if self.media_reference.available_range else None,
                    "duration": {
                        "value": self.media_reference.available_range.duration.value,
                        "rate": self.media_reference.available_range.duration.rate
                    } if self.media_reference.available_range else None
                } if self.media_reference.available_range else None,
                "metadata": self.media_reference.metadata
            },
            "source_range": {
                "start_time": {
                    "value": self.source_range.start_time.value,
                    "rate": self.source_range.start_time.rate
                },
                "duration": {
                    "value": self.source_range.duration.value,
                    "rate": self.source_range.duration.rate
                }
            } if self.source_range else None,
            "metadata": self.metadata
        }


@dataclass
class OTIOGap(ComposableItem):
    """
    Represents empty time on a track (transparent).
    """
    duration_time: RationalTime
    
    def __init__(self, duration_time: RationalTime, name: str = "Gap", gap_id: str = None):
        super().__init__(name, gap_id)
        self.duration_time = duration_time
    
    def duration(self, rate: float) -> RationalTime:
        """Get duration of this gap"""
        return self.duration_time
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "_type": "OTIOGap", 
            "id": self.id,
            "name": self.name,
            "duration": {
                "value": self.duration_time.value,
                "rate": self.duration_time.rate
            }
        }


class OTIOTrack:
    """
    Represents a track containing composable items.
    """
    def __init__(self, name: str, track_type: str, track_id: str = None):
        self.id = track_id or str(uuid.uuid4()) 
        self.name = name
        self.track_type = track_type  # 'video', 'audio', 'text'
        self.children: List[ComposableItem] = []
        
    def add_item(self, item: ComposableItem, position: Optional[RationalTime] = None):
        """Add item to track at specified position or end"""
        if position is None:
            # Append to end
            self.children.append(item)
        else:
            # Insert at specific position (may require gaps)
            self._insert_at_position(item, position)
        
    def _insert_at_position(self, item: ComposableItem, position: RationalTime):
        """Insert item at specific timeline position, creating gaps as needed"""
        current_time = RationalTime(0, position.rate)
        
        for i, existing_item in enumerate(self.children):
            item_duration = existing_item.duration(position.rate)
            item_end = current_time + item_duration
            
            if current_time.value <= position.value < item_end.value:
                # Insert here, may need to split existing item
                raise NotImplementedError("Splitting existing items not yet implemented")
            
            if position.value == current_time.value:
                # Insert at exact position
                self.children.insert(i, item)
                return
                
            current_time = item_end
            
        # If we get here, append to end with gap if needed
        if position.value > current_time.value:
            gap_duration = position - current_time
            gap = OTIOGap(gap_duration)
            self.children.append(gap)
        
        self.children.append(item)
    
    def duration(self, rate: float) -> RationalTime:
        """Calculate total duration of track"""
        total = RationalTime(0, rate)
        for item in self.children:
            total = total + item.duration(rate)
        return total
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "_type": "OTIOTrack",
            "id": self.id,
            "name": self.name, 
            "track_type": self.track_type,
            "children": [item.to_dict() for item in self.children]
        }


class OTIOTimeline:
    """
    OpenTimelineIO-inspired timeline with non-destructive editing.
    """
    def __init__(self, name: str = "Timeline", fps: float = 30.0, timeline_id: str = None):
        self.id = timeline_id or str(uuid.uuid4())
        self.name = name
        self.fps = fps
        self.tracks: List[OTIOTrack] = []
        
        # Create default tracks
        self.tracks.append(OTIOTrack("Video 1", "video"))
        self.tracks.append(OTIOTrack("Audio 1", "audio"))
        self.tracks.append(OTIOTrack("Text 1", "text"))
    
    def get_track(self, track_type: str, index: int = 0) -> Optional[OTIOTrack]:
        """Get track by type and index"""
        matching_tracks = [t for t in self.tracks if t.track_type == track_type]
        if index < len(matching_tracks):
            return matching_tracks[index]
        return None
    
    def add_clip_from_media(self, media_url: str, track_type: str = "video", 
                          position: Optional[float] = None, 
                          trim_in: Optional[float] = None,
                          trim_out: Optional[float] = None) -> OTIOClip:
        """
        Add a clip from media file to timeline.
        Non-destructive: creates MediaReference and Clip with source_range.
        """
        # Create media reference
        media_ref = MediaReference(
            id=str(uuid.uuid4()),
            url=media_url,
            available_range=None,  # Will be populated when media is analyzed
            metadata={}
        )
        
        # Create source range if trimming specified
        source_range = None
        if trim_in is not None or trim_out is not None:
            start_time = RationalTime.from_seconds(trim_in or 0.0, self.fps)
            if trim_out is not None:
                duration = RationalTime.from_seconds(trim_out - (trim_in or 0.0), self.fps)
            else:
                # Use available range or default
                duration = RationalTime.from_seconds(60.0, self.fps)  # Default fallback
            source_range = TimeRange(start_time, duration)
        
        # Create clip
        clip = OTIOClip(
            name=media_url.split('/')[-1],  # Use filename as name
            media_reference=media_ref,
            source_range=source_range
        )
        
        # Add to track
        track = self.get_track(track_type, 0)
        if track:
            timeline_position = RationalTime.from_seconds(position or 0.0, self.fps) if position else None
            track.add_item(clip, timeline_position)
        
        return clip
    
    def duration(self) -> RationalTime:
        """Calculate timeline duration (longest track)"""
        max_duration = RationalTime(0, self.fps)
        for track in self.tracks:
            track_duration = track.duration(self.fps)
            if track_duration.value > max_duration.value:
                max_duration = track_duration
        return max_duration
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "_type": "OTIOTimeline",
            "id": self.id,
            "name": self.name,
            "fps": self.fps,
            "tracks": [track.to_dict() for track in self.tracks]
        }


# Core non-destructive operations
class OTIOOperations:
    """
    Core operations for non-destructive timeline editing.
    """
    
    @staticmethod
    def split_clip(timeline: OTIOTimeline, clip: OTIOClip, cut_time: RationalTime) -> tuple[OTIOClip, OTIOClip]:
        """
        Split a clip at cut_time, creating two clips that reference the same media.
        Non-destructive: only changes source_range, never modifies source media.
        """
        if not clip.trimmed_range():
            raise ValueError("Cannot split clip without defined range")
        
        clip_range = clip.trimmed_range()
        
        # Validate cut time is within clip
        if not clip_range.contains(cut_time):
            raise ValueError(f"Cut time {cut_time.value} is outside clip range")
        
        # Calculate offset within the clip's source range
        offset_from_clip_start = cut_time - clip_range.start_time
        media_cut_point = clip_range.start_time + offset_from_clip_start
        
        # Create first clip (before cut)
        first_clip = OTIOClip(
            name=f"{clip.name}_part1",
            media_reference=clip.media_reference,  # Same media reference
            source_range=TimeRange(
                start_time=clip_range.start_time,
                duration=offset_from_clip_start
            )
        )
        
        # Create second clip (after cut) 
        remaining_duration = clip_range.end_time - media_cut_point
        second_clip = OTIOClip(
            name=f"{clip.name}_part2", 
            media_reference=clip.media_reference,  # Same media reference
            source_range=TimeRange(
                start_time=media_cut_point,
                duration=remaining_duration
            )
        )
        
        return first_clip, second_clip
    
    @staticmethod
    def cut_out_range(timeline: OTIOTimeline, track: OTIOTrack, 
                     range_start: RationalTime, range_end: RationalTime,
                     mode: str = 'ripple') -> bool:
        """
        Enhanced cut out operation that properly preserves all clips.
        
        Three-category approach:
        1. Items before cut range: Keep unchanged
        2. Items intersecting cut range: Split around cut
        3. Items after cut range: Preserve and shift backward (ripple mode)
        
        mode='ripple': close gap by shifting subsequent items
        mode='lift': leave gap in place
        """
        if mode not in ['ripple', 'lift']:
            raise ValueError(f"Invalid mode: {mode}. Must be 'ripple' or 'lift'")
        
        removed_duration = range_end - range_start
        logging.info(f"🔧 [OTIO Cut] Starting cut operation: {range_start.to_seconds()}s-{range_end.to_seconds()}s, mode: {mode}")
        
        # STEP 1: Categorize all items by their relationship to cut range
        current_time = RationalTime(0, timeline.fps)
        items_before_cut = []      # Keep unchanged
        items_intersecting_cut = []  # Need to be split
        items_after_cut = []       # Need to be repositioned
        
        for i, item in enumerate(track.children):
            item_duration = item.duration(timeline.fps)
            item_start = current_time
            item_end = current_time + item_duration
            
            logging.info(f"🔍 [OTIO Cut] Analyzing item '{getattr(item, 'name', 'Unknown')}': {item_start.to_seconds()}s-{item_end.to_seconds()}s")
            
            # Categorize based on relationship to cut range
            if item_end <= range_start:
                # Item ends before cut starts - keep unchanged
                items_before_cut.append((i, item, item_start))
                logging.info(f"  ✅ Before cut range - will preserve")
            elif item_start >= range_end:
                # Item starts after cut ends - preserve and reposition
                items_after_cut.append((i, item, item_start))
                logging.info(f"  ⏭️ After cut range - will preserve and shift backward")
            else:
                # Item intersects with cut range - needs splitting
                items_intersecting_cut.append((i, item, item_start))
                logging.info(f"  ✂️ Intersects cut range - will split")
            
            current_time = item_end
        
        logging.info(f"📊 [OTIO Cut] Categories: {len(items_before_cut)} before, {len(items_intersecting_cut)} intersecting, {len(items_after_cut)} after")
        
        # STEP 2: Build new track with all preserved and modified items
        new_track_children = []
        
        # Add items before cut (unchanged)
        for _, item, _ in items_before_cut:
            new_track_children.append(item)
            logging.info(f"  ✅ Preserved item before cut: '{getattr(item, 'name', 'Unknown')}'")
        
        # Add split parts of intersecting items
        for _, item, item_start in items_intersecting_cut:
            if isinstance(item, OTIOClip):
                item_duration = item.duration(timeline.fps)
                item_end = item_start + item_duration
                
                # Calculate intersection with cut range
                cut_start_in_timeline = max(range_start, item_start)
                cut_end_in_timeline = min(range_end, item_end)
                
                # Convert to clip-relative positions
                cut_start_in_clip = cut_start_in_timeline - item_start
                cut_end_in_clip = cut_end_in_timeline - item_start
                
                logging.info(f"  ✂️ Splitting '{item.name}': cut {cut_start_in_clip.to_seconds()}s-{cut_end_in_clip.to_seconds()}s from clip")
                
                clip_parts = []
                
                # Part before the cut (if any)
                if cut_start_in_clip > RationalTime(0, timeline.fps):
                    before_duration = cut_start_in_clip
                    if item.source_range:
                        before_source = TimeRange(
                            start_time=item.source_range.start_time,
                            duration=before_duration
                        )
                    else:
                        before_source = TimeRange(
                            start_time=RationalTime(0, timeline.fps),
                            duration=before_duration
                        )
                    
                    # Preserve original clip data for undo/redo functionality
                    original_source_range_dict = None
                    if item.source_range:
                        original_source_range_dict = {
                            "start_time": {
                                "value": item.source_range.start_time.value,
                                "rate": item.source_range.start_time.rate
                            },
                            "duration": {
                                "value": item.source_range.duration.value,
                                "rate": item.source_range.duration.rate
                            }
                        }
                    
                    original_metadata = {
                        "original_clip_id": item.id,
                        "original_name": item.name,
                        "original_source_range": original_source_range_dict,
                        "segment_type": "before_cut",
                        "segment_index": 0,
                        "cut_operation": {
                            "cut_start": range_start.to_seconds(),
                            "cut_end": range_end.to_seconds(),
                            "cut_duration": (range_end - range_start).to_seconds()
                        }
                    }
                    # Merge with existing metadata
                    combined_metadata = {**item.metadata, **original_metadata}
                    
                    before_clip = OTIOClip(
                        name=f"{item.name}_part1",
                        media_reference=item.media_reference,
                        source_range=before_source,
                        clip_id=f"{item.id}_part1",  # Deterministic ID based on original
                        metadata=combined_metadata
                    )
                    clip_parts.append(before_clip)
                    logging.info(f"    ✅ Created part1: 0s-{before_duration.to_seconds()}s")
                
                # Part after the cut (if any)
                if cut_end_in_clip < item_duration:
                    after_duration = item_duration - cut_end_in_clip
                    
                    if item.source_range:
                        # The after part starts at original_start + cut_end_in_clip
                        after_source_start = item.source_range.start_time + cut_end_in_clip
                    else:
                        after_source_start = cut_end_in_clip
                    
                    after_source = TimeRange(
                        start_time=after_source_start,
                        duration=after_duration
                    )
                    
                    # Preserve original clip data for undo/redo functionality  
                    after_source_range_dict = None
                    if item.source_range:
                        after_source_range_dict = {
                            "start_time": {
                                "value": item.source_range.start_time.value,
                                "rate": item.source_range.start_time.rate
                            },
                            "duration": {
                                "value": item.source_range.duration.value,
                                "rate": item.source_range.duration.rate
                            }
                        }
                    
                    after_metadata = {
                        "original_clip_id": item.id,
                        "original_name": item.name,
                        "original_source_range": after_source_range_dict,
                        "segment_type": "after_cut",
                        "segment_index": 1,
                        "cut_operation": {
                            "cut_start": range_start.to_seconds(),
                            "cut_end": range_end.to_seconds(),
                            "cut_duration": (range_end - range_start).to_seconds()
                        }
                    }
                    # Merge with existing metadata
                    combined_after_metadata = {**item.metadata, **after_metadata}
                    
                    after_clip = OTIOClip(
                        name=f"{item.name}_part2",
                        media_reference=item.media_reference,
                        source_range=after_source,
                        clip_id=f"{item.id}_part2",  # Deterministic ID based on original
                        metadata=combined_after_metadata
                    )
                    clip_parts.append(after_clip)
                    logging.info(f"    ✅ Created part2: {cut_end_in_clip.to_seconds()}s-{item_duration.to_seconds()}s (source starts at {after_source_start.to_seconds()}s)")
                
                # Add split parts to new track
                new_track_children.extend(clip_parts)
                logging.info(f"  ✅ Split '{item.name}' into {len(clip_parts)} parts")
            else:
                # For non-clip items, just preserve them
                new_track_children.append(item)
        
        # Add items after cut (preserved and repositioned in ripple mode)
        for _, item, _ in items_after_cut:
            new_track_children.append(item)
            logging.info(f"  ✅ Preserved item after cut: '{getattr(item, 'name', 'Unknown')}' (will be repositioned)")
        
        # Handle gaps for lift mode
        if mode == 'lift':
            # Insert gap to preserve timeline length
            gap = OTIOGap(removed_duration, f"Gap_{removed_duration.to_seconds()}s")
            # Insert gap at appropriate position in the new track
            # For now, we'll add it where the cut was made
            logging.info(f"  ➕ Added gap: {removed_duration.to_seconds()}s")
            # TODO: Insert gap at precise position
            new_track_children.append(gap)
        
        # STEP 3: Replace track children with new structure
        track.children = new_track_children
        
        logging.info(f"✅ [OTIO Cut] Completed cut operation:")
        logging.info(f"   - Original items: {len(items_before_cut) + len(items_intersecting_cut) + len(items_after_cut)}")
        logging.info(f"   - Final items: {len(new_track_children)}")
        logging.info(f"   - Items preserved: {len(items_before_cut) + len(items_after_cut)}")
        logging.info(f"   - Items split: {len(items_intersecting_cut)}")
        
        return True


# Utility functions for migration
def convert_legacy_clip_to_otio(legacy_clip: Dict[str, Any], timeline_fps: float) -> OTIOClip:
    """Convert legacy VideoClip to OTIOClip"""
    # Create media reference
    media_ref = MediaReference(
        id=str(uuid.uuid4()),
        url=legacy_clip.get('file_path', ''),
        available_range=None,  # Will be populated from actual media
        metadata={}
    )
    
    # Create source range from in_point
    in_point = legacy_clip.get('in_point', 0)
    start_frames = legacy_clip.get('start', 0)
    end_frames = legacy_clip.get('end', 0)
    duration_frames = end_frames - start_frames
    
    source_range = TimeRange(
        start_time=RationalTime(in_point, timeline_fps),
        duration=RationalTime(duration_frames, timeline_fps) 
    )
    
    return OTIOClip(
        name=legacy_clip.get('name', 'Clip'),
        media_reference=media_ref,
        source_range=source_range,
        clip_id=legacy_clip.get('clip_id')
    )


def convert_legacy_timeline_to_otio(legacy_timeline: Dict[str, Any]) -> OTIOTimeline:
    """Convert legacy Timeline to OTIOTimeline with smart track merging"""
    fps = legacy_timeline.get('frame_rate', 30.0)
    
    # Start with default timeline structure
    from app.timeline_v2 import Timeline
    otio_timeline = Timeline.create_default(fps)
    
    # Convert clips and merge into existing tracks by type
    for track_data in legacy_timeline.get('tracks', []):
        track_type = track_data.get('track_type', 'video')
        
        # Find existing track of this type or create new one
        existing_track = None
        for track in otio_timeline.tracks:
            if track.track_type == track_type:
                existing_track = track
                break
        
        if not existing_track:
            # Create new track if type doesn't exist
            existing_track = OTIOTrack(
                name=track_data.get('name', f'{track_type.title()} Track'),
                track_type=track_type
            )
            otio_timeline.tracks.append(existing_track)
        
        # Convert and add clips to the existing track
        for clip_data in track_data.get('clips', []):
            otio_clip = convert_legacy_clip_to_otio(clip_data, fps)
            existing_track.children.append(otio_clip)
    
    return otio_timeline 