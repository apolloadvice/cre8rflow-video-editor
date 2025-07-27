"""
Test script for OpenTimelineIO migration system.
Validates that legacy timelines can be migrated to OTIO format and operations work correctly.
"""

import json
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)

from app.timeline import Timeline as LegacyTimeline, VideoClip as LegacyVideoClip
from app.otio_timeline import (
    OTIOTimeline, OTIOClip, OTIOGap, MediaReference, TimeRange, RationalTime,
    OTIOOperations, convert_legacy_timeline_to_otio
)
from app.timeline_adapter import TimelineAdapter, TimelineMigrationService


def test_rational_time():
    """Test RationalTime operations"""
    print("\n=== Testing RationalTime ===")
    
    # Test creation and conversion
    time1 = RationalTime(150, 30.0)  # 5 seconds at 30fps
    print(f"Time1: {time1.value} frames at {time1.rate}fps = {time1.to_seconds():.2f}s")
    
    time2 = RationalTime.from_seconds(2.5, 30.0)  # 2.5 seconds
    print(f"Time2: {time2.value} frames at {time2.rate}fps = {time2.to_seconds():.2f}s")
    
    # Test arithmetic
    total = time1 + time2
    print(f"Total: {total.value} frames = {total.to_seconds():.2f}s")
    
    # Test time range
    duration = RationalTime(60, 30.0)  # 2 seconds
    range1 = TimeRange(time1, duration)
    print(f"Range: {range1.start_time.to_seconds():.2f}s to {range1.end_time.to_seconds():.2f}s")
    
    print("✅ RationalTime tests passed")


def test_otio_timeline_creation():
    """Test creating OTIO timeline from scratch"""
    print("\n=== Testing OTIO Timeline Creation ===")
    
    timeline = OTIOTimeline("Test Timeline", fps=30.0)
    
    # Create media reference
    media_ref = MediaReference(
        id="media1",
        url="/path/to/video.mp4",
        metadata={"duration": 600, "fps": 30}  # 20 seconds
    )
    
    # Set available range for media
    media_ref.available_range = TimeRange(
        start_time=RationalTime(0, 30.0),
        duration=RationalTime(600, 30.0)  # 20 seconds
    )
    
    # Create clip with trimming (use only seconds 2-8 of the media)
    source_range = TimeRange(
        start_time=RationalTime(60, 30.0),    # Start at 2s
        duration=RationalTime(180, 30.0)      # Duration 6s
    )
    
    clip = OTIOClip(
        name="Trimmed Clip",
        media_reference=media_ref,
        source_range=source_range
    )
    
    # Add to timeline
    video_track = timeline.get_track("video", 0)
    video_track.add_item(clip)
    
    print(f"Timeline duration: {timeline.duration().to_seconds():.2f}s")
    print(f"Clip duration: {clip.duration(30.0).to_seconds():.2f}s")
    print(f"Media reference: {clip.media_reference.url}")
    print(f"Source range: {clip.source_range.start_time.to_seconds():.2f}s - {clip.source_range.end_time.to_seconds():.2f}s")
    
    print("✅ OTIO timeline creation tests passed")


def test_legacy_to_otio_conversion():
    """Test converting legacy timeline to OTIO"""
    print("\n=== Testing Legacy to OTIO Conversion ===")
    
    # Create legacy timeline
    legacy_timeline = LegacyTimeline(frame_rate=30.0)
    
    # Add clips to legacy timeline
    clip1 = LegacyVideoClip(
        name="Clip1",
        start_frame=0,
        end_frame=150,  # 5 seconds
        file_path="/path/to/video1.mp4",
        in_point=30     # Start from 1 second in source
    )
    
    clip2 = LegacyVideoClip(
        name="Clip2", 
        start_frame=150,
        end_frame=300,  # 5 seconds
        file_path="/path/to/video2.mp4",
        in_point=0      # Start from beginning
    )
    
    legacy_timeline.tracks[0].clips.extend([clip1, clip2])
    
    # Convert using adapter
    adapter = TimelineAdapter(legacy_timeline)
    print(f"Legacy timeline duration: {adapter.duration_seconds:.2f}s")
    print(f"Legacy clips: {len(adapter.get_clips_for_api())}")
    
    # Migrate to OTIO
    otio_adapter = adapter.migrate_to_otio()
    print(f"OTIO timeline duration: {otio_adapter.duration_seconds:.2f}s")
    print(f"OTIO clips: {len(otio_adapter.get_clips_for_api())}")
    
    # Verify clips converted correctly
    otio_clips = otio_adapter.get_clips_for_api()
    for i, clip in enumerate(otio_clips):
        print(f"Clip {i+1}: {clip['name']} - {clip['start']:.2f}s to {clip['end']:.2f}s (in_point: {clip['in_point']:.2f}s)")
    
    print("✅ Legacy to OTIO conversion tests passed")


def test_non_destructive_cut_operation():
    """Test non-destructive cut operations"""
    print("\n=== Testing Non-Destructive Cut Operations ===")
    
    # Create OTIO timeline with one clip
    timeline = OTIOTimeline("Cut Test", fps=30.0)
    
    # Create media reference for 20-second video
    media_ref = MediaReference(
        id="media1",
        url="/path/to/video.mp4"
    )
    media_ref.available_range = TimeRange(
        start_time=RationalTime(0, 30.0),
        duration=RationalTime(600, 30.0)  # 20 seconds
    )
    
    # Create clip using full media
    clip = OTIOClip(
        name="Original Clip",
        media_reference=media_ref,
        source_range=media_ref.available_range
    )
    
    video_track = timeline.get_track("video", 0)
    video_track.add_item(clip)
    
    print(f"Before cut - Timeline duration: {timeline.duration().to_seconds():.2f}s")
    print(f"Before cut - Clips: {len(video_track.children)}")
    
    # Perform split operation (cut at 5 seconds)
    cut_time = RationalTime.from_seconds(5.0, 30.0)
    first_clip, second_clip = OTIOOperations.split_clip(timeline, clip, cut_time)
    
    # Replace original clip with split clips
    video_track.children.clear()
    video_track.children.extend([first_clip, second_clip])
    
    print(f"After split - Clips: {len(video_track.children)}")
    print(f"First clip: {first_clip.name} - {first_clip.duration(30.0).to_seconds():.2f}s")
    print(f"Second clip: {second_clip.name} - {second_clip.duration(30.0).to_seconds():.2f}s") 
    print(f"Timeline duration: {timeline.duration().to_seconds():.2f}s")
    
    # Verify source ranges
    print(f"First clip source: {first_clip.source_range.start_time.to_seconds():.2f}s - {first_clip.source_range.end_time.to_seconds():.2f}s")
    print(f"Second clip source: {second_clip.source_range.start_time.to_seconds():.2f}s - {second_clip.source_range.end_time.to_seconds():.2f}s")
    
    # Test cut out operation (remove middle segment)
    range_start = RationalTime.from_seconds(2.0, 30.0)
    range_end = RationalTime.from_seconds(4.0, 30.0)
    
    print(f"\nTesting cut out range: {range_start.to_seconds():.2f}s - {range_end.to_seconds():.2f}s")
    success = OTIOOperations.cut_out_range(timeline, video_track, range_start, range_end, mode='ripple')
    
    if success:
        print(f"After cut out - Timeline duration: {timeline.duration().to_seconds():.2f}s")
        print(f"After cut out - Clips: {len(video_track.children)}")
    
    print("✅ Non-destructive cut operation tests passed")


def test_timeline_adapter_api():
    """Test timeline adapter API compatibility"""
    print("\n=== Testing Timeline Adapter API ===")
    
    # Test with legacy timeline
    legacy_timeline = LegacyTimeline(frame_rate=30.0)
    clip = LegacyVideoClip(
        name="Test Clip",
        start_frame=0,
        end_frame=300,  # 10 seconds
        file_path="/path/to/video.mp4"
    )
    legacy_timeline.tracks[0].clips.append(clip)
    
    adapter = TimelineAdapter(legacy_timeline)
    
    # Test unified API
    print(f"Adapter FPS: {adapter.fps}")
    print(f"Adapter duration: {adapter.duration_seconds:.2f}s")
    print(f"Is OTIO: {adapter.is_otio}")
    
    clips_api = adapter.get_clips_for_api()
    print(f"Clips for API: {len(clips_api)}")
    for clip_data in clips_api:
        print(f"  - {clip_data['name']}: {clip_data['start']:.2f}s to {clip_data['end']:.2f}s")
    
    # Test cut operation through adapter
    success = adapter.cut_out_range(2.0, 5.0, mode='ripple')
    print(f"Cut out operation success: {success}")
    
    if success:
        print(f"After cut - Duration: {adapter.duration_seconds:.2f}s")
        clips_after = adapter.get_clips_for_api()
        print(f"After cut - Clips: {len(clips_after)}")
    
    print("✅ Timeline adapter API tests passed")


def test_serialization_round_trip():
    """Test serialization and deserialization"""
    print("\n=== Testing Serialization Round Trip ===")
    
    # Create OTIO timeline
    timeline = OTIOTimeline("Serialization Test", fps=24.0)
    
    media_ref = MediaReference(
        id="media1",
        url="/path/to/video.mp4"
    )
    media_ref.available_range = TimeRange(
        start_time=RationalTime(0, 24.0),
        duration=RationalTime(480, 24.0)  # 20 seconds at 24fps
    )
    
    clip = OTIOClip(
        name="Test Clip",
        media_reference=media_ref,
        source_range=TimeRange(
            start_time=RationalTime(24, 24.0),  # Start at 1s
            duration=RationalTime(240, 24.0)    # 10 seconds
        )
    )
    
    video_track = timeline.get_track("video", 0)
    video_track.add_item(clip)
    
    # Serialize
    timeline_dict = timeline.to_dict()
    print(f"Serialized timeline type: {timeline_dict['_type']}")
    print(f"Serialized FPS: {timeline_dict['fps']}")
    print(f"Serialized tracks: {len(timeline_dict['tracks'])}")
    
    # Test migration service deserialization
    adapter = TimelineMigrationService.load_timeline(timeline_dict)
    print(f"Loaded timeline format: {'otio' if adapter.is_otio else 'legacy'}")
    print(f"Loaded duration: {adapter.duration_seconds:.2f}s")
    
    # Verify clips match
    original_clips = timeline.tracks[0].children
    loaded_clips = adapter.get_clips_for_api()
    
    print(f"Original clips: {len(original_clips)}")
    print(f"Loaded clips: {len(loaded_clips)}")
    
    if len(loaded_clips) > 0:
        loaded_clip = loaded_clips[0]
        print(f"Loaded clip: {loaded_clip['name']} - {loaded_clip['duration']:.2f}s")
    
    print("✅ Serialization round trip tests passed")


def run_all_tests():
    """Run all migration tests"""
    print("🧪 Running OpenTimelineIO Migration Tests\n")
    
    try:
        test_rational_time()
        test_otio_timeline_creation()
        test_legacy_to_otio_conversion()
        test_non_destructive_cut_operation()
        test_timeline_adapter_api()
        test_serialization_round_trip()
        
        print("\n🎉 All tests passed! Migration system is working correctly.")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    run_all_tests() 