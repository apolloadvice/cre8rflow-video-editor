import pytest
from app.timeline import Timeline, VideoClip, Effect, Transition, TrackType, CompoundClip

def test_timeline_json_serialization():
    # Create a timeline with one video and one audio clip, one effect, and one transition
    timeline = Timeline(frame_rate=24)
    video_clip = VideoClip(name="clip1", start_frame=0, end_frame=240, track_type="video")
    video_clip.effects.append(Effect(effect_type="color_correction", params={"brightness": 1.1}))
    audio_clip = VideoClip(name="audio1", start_frame=0, end_frame=240, track_type="audio")
    timeline.add_clip(video_clip, track_index=0)
    timeline.add_clip(audio_clip, track_index=1)
    transition = Transition(from_clip="clip1", to_clip="audio1", transition_type="crossfade", duration=24)
    timeline.transitions.append(transition)

    # Serialize to JSON
    json_str = timeline.to_json()
    # Deserialize
    loaded = Timeline.from_json(json_str)

    # Check version
    assert hasattr(loaded, "version")
    assert loaded.version == "1.0"
    # Check frame rate
    assert loaded.frame_rate == 24
    # Check tracks and clips
    assert len(loaded.tracks) == 4
    video_track = next(t for t in loaded.tracks if t.track_type == TrackType.VIDEO.value)
    audio_track = next(t for t in loaded.tracks if t.track_type == TrackType.AUDIO.value)
    assert len(video_track.clips) == 1
    assert len(audio_track.clips) == 1
    assert video_track.clips[0].name == "clip1"
    assert audio_track.clips[0].name == "audio1"
    # Check effects
    assert len(video_track.clips[0].effects) == 1
    assert video_track.clips[0].effects[0].effect_type == "color_correction"
    assert video_track.clips[0].effects[0].params["brightness"] == 1.1
    # Check transitions
    assert len(loaded.transitions) == 1
    t = loaded.transitions[0]
    assert t.from_clip == "clip1"
    assert t.to_clip == "audio1"
    assert t.transition_type == "crossfade"
    assert t.duration == 24

def test_timeline_extensible_custom_effect():
    from app.timeline import Timeline, VideoClip, BaseEffect, Effect, Transition, TrackType
    import json

    class CustomEffect(Effect):
        def __init__(self, effect_type, params=None, custom_field=None):
            super().__init__(effect_type, params)
            self.custom_field = custom_field
        def to_dict(self):
            d = super().to_dict()
            d["custom_field"] = self.custom_field
            d["_type"] = "CustomEffect"
            return d
        @staticmethod
        def from_dict(data):
            return CustomEffect(
                effect_type=data["effect_type"],
                params=data.get("params", {}),
                custom_field=data.get("custom_field")
            )

    # Patch VideoClip.from_dict to support CustomEffect for this test
    orig_from_dict = VideoClip.from_dict
    def custom_from_dict(data):
        clip = VideoClip(
            name=data["name"],
            start_frame=data["start"],
            end_frame=data["end"],
            track_type=data.get("track_type", "video")
        )
        effects = []
        for e in data.get("effects", []):
            if e.get("_type") == "CustomEffect":
                effects.append(CustomEffect.from_dict(e))
            else:
                effects.append(Effect.from_dict(e))
        clip.effects = effects
        return clip
    VideoClip.from_dict = staticmethod(custom_from_dict)

    # Create a timeline with a custom effect
    timeline = Timeline(frame_rate=30)
    video_clip = VideoClip(name="clip1", start_frame=0, end_frame=60, track_type="video")
    custom_effect = CustomEffect(effect_type="sparkle", params={"intensity": 5}, custom_field="rainbow")
    video_clip.effects.append(custom_effect)
    timeline.add_clip(video_clip, track_index=0)
    # Serialize and deserialize
    json_str = timeline.to_json()
    loaded = Timeline.from_json(json_str)
    video_track = next(t for t in loaded.tracks if t.track_type == TrackType.VIDEO.value)
    loaded_clip = video_track.clips[0]
    loaded_effect = loaded_clip.effects[0]
    # Check that the custom effect is preserved
    assert isinstance(loaded_effect, CustomEffect)
    assert loaded_effect.effect_type == "sparkle"
    assert loaded_effect.params["intensity"] == 5
    assert loaded_effect.custom_field == "rainbow"
    # Restore original from_dict
    VideoClip.from_dict = orig_from_dict

def test_compound_clip_basic():
    # Create two video clips
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=30, track_type="video")
    clip2 = VideoClip(name="clip2", start_frame=30, end_frame=60, track_type="video")
    # Create a compound clip containing them
    compound = CompoundClip(name="group1", start_frame=0, end_frame=60, track_type="video", clips=[clip1, clip2])
    # Check children
    assert len(compound.clips) == 2
    assert compound.clips[0].name == "clip1"
    assert compound.clips[1].name == "clip2"
    # Bounds should match children
    assert compound.start == 0
    assert compound.end == 60
    # Add another clip and check bounds update
    clip3 = VideoClip(name="clip3", start_frame=60, end_frame=90, track_type="video")
    compound.add_clip(clip3)
    assert len(compound.clips) == 3
    assert compound.end == 90
    # Remove a clip and check bounds update
    compound.remove_clip(clip1)
    assert len(compound.clips) == 2
    assert compound.start == 30
    assert compound.end == 90

def test_compound_clip_nested_and_serialization():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Nest compound clips
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Check structure
    assert len(outer.clips) == 2
    assert isinstance(outer.clips[1], CompoundClip)
    assert outer.clips[1].name == "inner"
    # Serialization
    d = outer.to_dict()
    assert d["_type"] == "CompoundClip"
    assert d["clips"][1]["_type"] == "CompoundClip"
    # Deserialization
    loaded = CompoundClip.from_dict(d)
    assert loaded.name == "outer"
    assert len(loaded.clips) == 2
    assert isinstance(loaded.clips[1], CompoundClip)
    assert loaded.clips[1].name == "inner"
    assert len(loaded.clips[1].clips) == 2
    assert loaded.clips[1].clips[0].name == "c2"
    assert loaded.clips[1].clips[1].name == "c3"
    # Bounds
    assert loaded.start == 0
    assert loaded.end == 30
    assert loaded.clips[1].start == 10
    assert loaded.clips[1].end == 30

def test_timeline_with_compound_clip_serialization():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create a compound clip
    compound = CompoundClip(name="group1", start_frame=0, end_frame=30, track_type="video", clips=[c1, c2, c3])
    # Create a timeline and add the compound clip to the video track
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    video_track.add_clip(compound)
    # Serialize and deserialize the timeline
    json_str = timeline.to_json()
    loaded = Timeline.from_json(json_str)
    loaded_video_track = next(t for t in loaded.tracks if t.track_type == TrackType.VIDEO.value)
    # There should be one compound clip in the video track
    assert len(loaded_video_track.clips) == 1
    loaded_compound = loaded_video_track.clips[0]
    assert isinstance(loaded_compound, CompoundClip)
    assert loaded_compound.name == "group1"
    assert len(loaded_compound.clips) == 3
    assert loaded_compound.clips[0].name == "c1"
    assert loaded_compound.clips[1].name == "c2"
    assert loaded_compound.clips[2].name == "c3"
    # Bounds
    assert loaded_compound.start == 0
    assert loaded_compound.end == 30

def test_timeline_with_nested_compound_clip_serialization():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create nested compound clips
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Create a timeline and add the outer compound clip
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    video_track.add_clip(outer)
    # Serialize and deserialize the timeline
    json_str = timeline.to_json()
    loaded = Timeline.from_json(json_str)
    loaded_video_track = next(t for t in loaded.tracks if t.track_type == TrackType.VIDEO.value)
    # There should be one outer compound clip
    assert len(loaded_video_track.clips) == 1
    loaded_outer = loaded_video_track.clips[0]
    assert isinstance(loaded_outer, CompoundClip)
    assert loaded_outer.name == "outer"
    assert len(loaded_outer.clips) == 2
    assert loaded_outer.clips[0].name == "c1"
    assert isinstance(loaded_outer.clips[1], CompoundClip)
    assert loaded_outer.clips[1].name == "inner"
    assert len(loaded_outer.clips[1].clips) == 2
    assert loaded_outer.clips[1].clips[0].name == "c2"
    assert loaded_outer.clips[1].clips[1].name == "c3"
    # Bounds
    assert loaded_outer.start == 0
    assert loaded_outer.end == 30
    assert loaded_outer.clips[1].start == 10
    assert loaded_outer.clips[1].end == 30

def test_trim_nested_clip_in_compound():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create a compound clip with c2 and c3
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    # Create an outer compound with c1 and inner
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Add to timeline
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    video_track.add_clip(outer)
    # Trim c2 at frame 15 (should split c2 into c2_part1 and c2_part2 inside inner)
    trimmed = timeline.trim_clip("c2", 15, track_type="video", track_index=0)
    assert trimmed
    # Find the inner compound again
    loaded_outer = video_track.clips[0]
    loaded_inner = loaded_outer.clips[1]
    # c2 should be split into two clips inside inner
    assert isinstance(loaded_inner, CompoundClip)
    assert len(loaded_inner.clips) == 3
    assert loaded_inner.clips[0].name == "c2_part1"
    assert loaded_inner.clips[1].name == "c2_part2"
    assert loaded_inner.clips[2].name == "c3"
    # Check bounds
    assert loaded_inner.start == 10
    assert loaded_inner.end == 30
    assert loaded_outer.start == 0
    assert loaded_outer.end == 30

def test_remove_nested_clip_in_compound():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create a compound clip with c2 and c3
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    # Create an outer compound with c1 and inner
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Add to timeline
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    video_track.add_clip(outer)
    # Remove c2 (should remove c2 from inner)
    removed = timeline.remove_clip("c2", track_type="video", track_index=0)
    assert removed
    # Find the inner compound again
    loaded_outer = video_track.clips[0]
    loaded_inner = loaded_outer.clips[1]
    # c2 should be gone, only c3 remains in inner
    assert isinstance(loaded_inner, CompoundClip)
    assert len(loaded_inner.clips) == 1
    assert loaded_inner.clips[0].name == "c3"
    # Check bounds
    assert loaded_inner.start == 20
    assert loaded_inner.end == 30
    assert loaded_outer.start == 0
    assert loaded_outer.end == 30

def test_join_nested_clips_in_compound():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create a compound clip with c2 and c3
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    # Create an outer compound with c1 and inner
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Add to timeline
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    video_track.add_clip(outer)
    # Join c2 and c3 (should join them inside inner)
    joined = timeline.join_clips("c2", "c3", track_type="video", track_index=0)
    assert joined
    # Find the inner compound again
    loaded_outer = video_track.clips[0]
    loaded_inner = loaded_outer.clips[1]
    # c2 and c3 should be replaced by a single joined clip
    assert isinstance(loaded_inner, CompoundClip)
    assert len(loaded_inner.clips) == 1
    joined_clip = loaded_inner.clips[0]
    assert joined_clip.name == "c2_joined_c3"
    assert joined_clip.start == 10
    assert joined_clip.end == 30
    # Check bounds
    assert loaded_inner.start == 10
    assert loaded_inner.end == 30
    assert loaded_outer.start == 0
    assert loaded_outer.end == 30

def test_add_transition_between_nested_clips_in_compound():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create a compound clip with c2 and c3
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    # Create an outer compound with c1 and inner
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Add to timeline
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    video_track.add_clip(outer)
    # Add a transition between c2 and c3 (should work inside inner)
    added = timeline.add_transition("c2", "c3", transition_type="crossfade", duration=2.0, track_type="video", track_index=0)
    assert added
    # Check that the transition is present in the timeline
    assert len(timeline.transitions) == 1
    t = timeline.transitions[0]
    assert t.from_clip == "c2"
    assert t.to_clip == "c3"
    assert t.transition_type == "crossfade"
    assert t.duration == 2.0

def test_move_nested_clip_to_another_track():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create a compound clip with c2 and c3
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    # Create an outer compound with c1 and inner
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Add to timeline
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    audio_track = next(t for t in timeline.tracks if t.track_type == TrackType.AUDIO.value)
    video_track.add_clip(outer)
    # Move c2 from inside inner to the audio track
    moved = timeline.move_clip("c2", source_track_type="video", source_track_index=0, dest_track_type="audio", dest_track_index=0)
    assert moved
    # c2 should be removed from inner, only c3 remains
    loaded_outer = video_track.clips[0]
    loaded_inner = loaded_outer.clips[1]
    assert isinstance(loaded_inner, CompoundClip)
    assert len(loaded_inner.clips) == 1
    assert loaded_inner.clips[0].name == "c3"
    # c2 should now be in the audio track
    assert len(audio_track.clips) == 1
    moved_clip = audio_track.clips[0]
    assert moved_clip.name == "c2"
    assert moved_clip.track_type == "audio"
    # Check bounds
    assert loaded_inner.start == 20
    assert loaded_inner.end == 30
    assert loaded_outer.start == 0
    assert loaded_outer.end == 30

def test_remove_clip_by_index_nested():
    # Create base clips
    c1 = VideoClip(name="c1", start_frame=0, end_frame=10, track_type="video")
    c2 = VideoClip(name="c2", start_frame=10, end_frame=20, track_type="video")
    c3 = VideoClip(name="c3", start_frame=20, end_frame=30, track_type="video")
    # Create a compound clip with c2 and c3
    inner = CompoundClip(name="inner", start_frame=10, end_frame=30, track_type="video", clips=[c2, c3])
    # Create an outer compound with c1 and inner
    outer = CompoundClip(name="outer", start_frame=0, end_frame=30, track_type="video", clips=[c1, inner])
    # Add to timeline
    timeline = Timeline(frame_rate=24)
    video_track = next(t for t in timeline.tracks if t.track_type == TrackType.VIDEO.value)
    video_track.add_clip(outer)
    # The depth-first order is: outer, c1, inner, c2, c3
    # Indices: 0     1   2     3   4
    # Remove c2 by index (index 3)
    removed = timeline.remove_clip_by_index(3, track_type="video", track_index=0)
    assert removed
    # Find the inner compound again
    loaded_outer = video_track.clips[0]
    loaded_inner = loaded_outer.clips[1]
    # c2 should be gone, only c3 remains in inner
    assert isinstance(loaded_inner, CompoundClip)
    assert len(loaded_inner.clips) == 1
    assert loaded_inner.clips[0].name == "c3"
    # Check bounds
    assert loaded_inner.start == 20
    assert loaded_inner.end == 30
    assert loaded_outer.start == 0
    assert loaded_outer.end == 30

def test_timeline_on_change_callback():
    """
    Test that the Timeline on_change callback is called after each edit, as a placeholder for UI updates.
    """
    from app.timeline import Timeline, VideoClip, Transition
    callback_calls = []
    def on_change_cb(tl):
        callback_calls.append(tl)
    timeline = Timeline(frame_rate=30, on_change=on_change_cb)
    # Add a clip
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=30)
    timeline.add_clip(clip1, track_index=0)
    # Trim the clip
    timeline.trim_clip("clip1", 15, track_type="video", track_index=0)
    # Add another clip and join
    clip2 = VideoClip(name="clip2", start_frame=0, end_frame=30)
    timeline.add_clip(clip2, track_index=0)
    timeline.join_clips("clip1_part2", "clip2", track_type="video", track_index=0)
    # Add a transition
    timeline.add_transition("clip1_part1", "clip1_part2_joined_clip2", transition_type="crossfade", duration=2, track_type="video", track_index=0)
    # Remove a clip
    timeline.remove_clip("clip1_part1", track_type="video", track_index=0)
    # Move a clip (move to audio track)
    timeline.move_clip("clip1_part2_joined_clip2", source_track_type="video", dest_track_type="audio", dest_track_index=0)
    # Add and remove a track
    new_track = timeline.add_track("Extra Video", "video")
    timeline.remove_track(track_type="video", track_index=1)  # Remove the extra video track
    # There should be a callback call for each edit
    assert len(callback_calls) == 9
    # All calls should receive the timeline instance
    for tl in callback_calls:
        assert isinstance(tl, Timeline)
