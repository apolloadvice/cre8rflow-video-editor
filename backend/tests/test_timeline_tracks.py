import pytest
from app.timeline import Timeline, TrackType, Track, VideoClip
from app.timeline import Timeline, TrackType, Track
from app.timeline import Track, VideoClip, TrackType
from app.timeline import Timeline, VideoClip
from app.timeline import Timeline, VideoClip
from app.timeline import Timeline, VideoClip
from app.timeline import Timeline, TrackType
from app.timeline import Timeline, TrackType
from app.timeline import VideoClip, Effect

def test_timeline_initializes_with_all_track_types():
    from app.timeline import Timeline, TrackType, Track
    timeline = Timeline()
    assert len(timeline.tracks) == 4
    track_types = {t.track_type for t in timeline.tracks}
    assert TrackType.VIDEO.value in track_types
    assert TrackType.AUDIO.value in track_types
    assert TrackType.SUBTITLE.value in track_types
    assert TrackType.EFFECT.value in track_types
    # Check names
    names = {t.name for t in timeline.tracks}
    assert "Video 1" in names
    assert "Audio 1" in names
    assert "Subtitles" in names
    assert "Effects" in names
    # Check all are Track instances
    for t in timeline.tracks:
        assert isinstance(t, Track)

def test_track_add_clip_sequential_enforcement():
    from app.timeline import Track, VideoClip, TrackType
    track = Track(name="Video 1", track_type=TrackType.VIDEO.value)
    # First clip
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=300)  # 10s at 30fps
    track.add_clip(clip1)
    assert clip1.start == 0
    assert clip1.end == 300
    # Second clip (no position specified)
    clip2 = VideoClip(name="clip2", start_frame=0, end_frame=150)  # 5s
    track.add_clip(clip2)
    assert clip2.start == 300
    assert clip2.end == 450
    # Third clip (position specified, correct)
    clip3 = VideoClip(name="clip3", start_frame=0, end_frame=210)  # 7s
    track.add_clip(clip3, position=450)
    assert clip3.start == 450
    assert clip3.end == 660
    # Fourth clip (position specified, non-sequential)
    clip4 = VideoClip(name="clip4", start_frame=0, end_frame=90)  # 3s
    try:
        track.add_clip(clip4, position=600)  # Should raise
        assert False, "Expected ValueError for non-sequential position"
    except ValueError as e:
        assert "sequential" in str(e)
    # Check order and times
    assert [c.name for c in track.clips] == ["clip1", "clip2", "clip3"]
    assert [c.start for c in track.clips] == [0, 300, 450]

def test_timeline_add_clip_sequential_enforcement():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add two clips to the first track (Video 1)
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=300)
    timeline.add_clip(clip1, track_index=0)
    clip2 = VideoClip(name="clip2", start_frame=0, end_frame=150)
    timeline.add_clip(clip2, track_index=0)
    track = timeline.tracks[0]
    assert [c.name for c in track.clips] == ["clip1", "clip2"]
    assert [c.start for c in track.clips] == [0, 300]
    assert [c.end for c in track.clips] == [300, 450]
    # Add a third clip at the correct sequential position
    clip3 = VideoClip(name="clip3", start_frame=0, end_frame=210)
    timeline.add_clip(clip3, track_index=0, position=450)
    assert [c.name for c in track.clips] == ["clip1", "clip2", "clip3"]
    assert [c.start for c in track.clips] == [0, 300, 450]
    assert [c.end for c in track.clips] == [300, 450, 660]
    # Add a fourth clip at a non-sequential position (should raise)
    clip4 = VideoClip(name="clip4", start_frame=0, end_frame=90)
    try:
        timeline.add_clip(clip4, track_index=0, position=600)
        assert False, "Expected ValueError for non-sequential position"
    except ValueError as e:
        assert "sequential" in str(e)

def test_timeline_remove_clip_by_name_and_index():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add clips to all track types
    video_clip = VideoClip(name="v1", start_frame=0, end_frame=150, track_type="video")
    audio_clip = VideoClip(name="a1", start_frame=0, end_frame=150, track_type="audio")
    subtitle_clip = VideoClip(name="s1", start_frame=0, end_frame=150, track_type="subtitle")
    effect_clip = VideoClip(name="e1", start_frame=0, end_frame=150, track_type="effect")
    timeline.add_clip(video_clip, track_index=0)
    timeline.add_clip(audio_clip, track_index=1)
    timeline.add_clip(subtitle_clip, track_index=2)
    timeline.add_clip(effect_clip, track_index=3)
    # Remove by name
    assert timeline.remove_clip("v1", track_type="video", track_index=0) is True
    assert timeline.get_track("video").clips == []
    assert timeline.remove_clip("a1", track_type="audio", track_index=0) is True
    assert timeline.get_track("audio").clips == []
    assert timeline.remove_clip("s1", track_type="subtitle", track_index=0) is True
    assert timeline.get_track("subtitle").clips == []
    assert timeline.remove_clip("e1", track_type="effect", track_index=0) is True
    assert timeline.get_track("effect").clips == []
    # Remove non-existent
    assert timeline.remove_clip("notfound", track_type="video", track_index=0) is False
    # Add again for index test
    timeline.add_clip(video_clip, track_index=0)
    timeline.add_clip(audio_clip, track_index=1)
    timeline.add_clip(subtitle_clip, track_index=2)
    timeline.add_clip(effect_clip, track_index=3)
    # Remove by index
    assert timeline.remove_clip_by_index(0, track_type="video", track_index=0) is True
    assert timeline.get_track("video").clips == []
    assert timeline.remove_clip_by_index(0, track_type="audio", track_index=0) is True
    assert timeline.get_track("audio").clips == []
    assert timeline.remove_clip_by_index(0, track_type="subtitle", track_index=0) is True
    assert timeline.get_track("subtitle").clips == []
    assert timeline.remove_clip_by_index(0, track_type="effect", track_index=0) is True
    assert timeline.get_track("effect").clips == []
    # Remove out-of-range
    assert timeline.remove_clip_by_index(0, track_type="video", track_index=0) is False

def test_timeline_move_clip_between_tracks():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add one clip to each track
    video_clip = VideoClip(name="v1", start_frame=0, end_frame=150, track_type="video")
    audio_clip = VideoClip(name="a1", start_frame=0, end_frame=150, track_type="audio")
    subtitle_clip = VideoClip(name="s1", start_frame=0, end_frame=150, track_type="subtitle")
    effect_clip = VideoClip(name="e1", start_frame=0, end_frame=150, track_type="effect")
    timeline.add_clip(video_clip, track_index=0)
    timeline.add_clip(audio_clip, track_index=1)
    timeline.add_clip(subtitle_clip, track_index=2)
    timeline.add_clip(effect_clip, track_index=3)
    # Move video -> audio
    assert timeline.move_clip("v1", source_track_type="video", source_track_index=0, dest_track_type="audio", dest_track_index=0) is True
    assert timeline.get_track("video").clips == []
    assert timeline.get_track("audio").clips[-1].name == "v1"
    assert timeline.get_track("audio").clips[-1].track_type == "audio"
    # Move audio -> subtitle
    assert timeline.move_clip("a1", source_track_type="audio", source_track_index=0, dest_track_type="subtitle", dest_track_index=0) is True
    assert timeline.get_track("audio").clips[0].name == "v1"  # Only v1 left
    assert timeline.get_track("subtitle").clips[-1].name == "a1"
    assert timeline.get_track("subtitle").clips[-1].track_type == "subtitle"
    # Move subtitle -> effect
    assert timeline.move_clip("s1", source_track_type="subtitle", source_track_index=0, dest_track_type="effect", dest_track_index=0) is True
    assert timeline.get_track("subtitle").clips[-1].name == "a1"  # Only a1 left
    assert timeline.get_track("effect").clips[-1].name == "s1"
    assert timeline.get_track("effect").clips[-1].track_type == "effect"
    # Move effect -> video
    assert timeline.move_clip("e1", source_track_type="effect", source_track_index=0, dest_track_type="video", dest_track_index=0) is True
    assert timeline.get_track("effect").clips[-1].name == "s1"  # Only s1 left
    assert timeline.get_track("video").clips[-1].name == "e1"
    assert timeline.get_track("video").clips[-1].track_type == "video"
    # Move non-existent
    assert timeline.move_clip("notfound", source_track_type="video", source_track_index=0, dest_track_type="audio", dest_track_index=0) is False

def test_timeline_add_track():
    from app.timeline import Timeline, TrackType
    timeline = Timeline()
    initial_count = len(timeline.tracks)
    # Add a new video track at the end
    t1 = timeline.add_track(name="Video 2", track_type=TrackType.VIDEO.value)
    assert t1.name == "Video 2"
    assert t1.track_type == TrackType.VIDEO.value
    assert timeline.tracks[-1] is t1
    # Add a new audio track at index 1
    t2 = timeline.add_track(name="Audio 2", track_type=TrackType.AUDIO.value, index=1)
    assert t2.name == "Audio 2"
    assert t2.track_type == TrackType.AUDIO.value
    assert timeline.tracks[1] is t2
    # Add a new subtitle track at index 0
    t3 = timeline.add_track(name="Sub 2", track_type=TrackType.SUBTITLE.value, index=0)
    assert t3.name == "Sub 2"
    assert t3.track_type == TrackType.SUBTITLE.value
    assert timeline.tracks[0] is t3
    # Add a new effect track at the end
    t4 = timeline.add_track(name="FX 2", track_type=TrackType.EFFECT.value)
    assert t4.name == "FX 2"
    assert t4.track_type == TrackType.EFFECT.value
    assert timeline.tracks[-1] is t4
    # Check total count
    assert len(timeline.tracks) == initial_count + 4
    # Invalid type
    try:
        timeline.add_track(name="Bad", track_type="notatype")
        assert False, "Expected ValueError for invalid track type"
    except ValueError as e:
        assert "Invalid track_type" in str(e)

def test_timeline_remove_track():
    from app.timeline import Timeline, TrackType
    timeline = Timeline()
    # Add extra tracks for testing
    t_video2 = timeline.add_track(name="Video 2", track_type=TrackType.VIDEO.value)
    t_audio2 = timeline.add_track(name="Audio 2", track_type=TrackType.AUDIO.value)
    t_sub2 = timeline.add_track(name="Sub 2", track_type=TrackType.SUBTITLE.value)
    t_fx2 = timeline.add_track(name="FX 2", track_type=TrackType.EFFECT.value)
    initial_count = len(timeline.tracks)
    # Remove by index
    assert timeline.remove_track(index=0) is True
    assert len(timeline.tracks) == initial_count - 1
    # Remove by (track_type, track_index)
    assert timeline.remove_track(track_type=TrackType.AUDIO.value, track_index=1) is True  # Remove "Audio 2"
    assert all(t.name != "Audio 2" for t in timeline.tracks)
    assert timeline.remove_track(track_type=TrackType.SUBTITLE.value, track_index=1) is True  # Remove "Sub 2"
    assert all(t.name != "Sub 2" for t in timeline.tracks)
    assert timeline.remove_track(track_type=TrackType.EFFECT.value, track_index=1) is True  # Remove "FX 2"
    assert all(t.name != "FX 2" for t in timeline.tracks)
    # Remove non-existent
    assert timeline.remove_track(index=100) is False
    assert timeline.remove_track(track_type=TrackType.VIDEO.value, track_index=100) is False
    # Must provide index or track_type
    try:
        timeline.remove_track()
        assert False, "Expected ValueError for missing arguments"
    except ValueError as e:
        assert "Must provide either index or track_type" in str(e)

def test_videoclip_add_and_remove_effects():
    from app.timeline import VideoClip, Effect
    clip = VideoClip(name="c1", start_frame=0, end_frame=300)
    # Add effects
    e1 = Effect("speed", {"factor": 2.0})
    e2 = Effect("color_correction", {"brightness": 1.2})
    e3 = Effect("blur", {"radius": 5})
    clip.add_effect(e1)
    clip.add_effect(e2)
    clip.add_effect(e3)
    assert len(clip.effects) == 3
    assert any(e.effect_type == "speed" for e in clip.effects)
    assert any(e.effect_type == "color_correction" for e in clip.effects)
    assert any(e.effect_type == "blur" for e in clip.effects)
    # Remove one type
    clip.remove_effect("color_correction")
    assert len(clip.effects) == 2
    assert all(e.effect_type != "color_correction" for e in clip.effects)
    # Remove non-existent type (should do nothing)
    clip.remove_effect("notfound")
    assert len(clip.effects) == 2
    # Remove all of a type
    clip.add_effect(Effect("speed", {"factor": 1.5}))
    assert sum(e.effect_type == "speed" for e in clip.effects) == 2
    clip.remove_effect("speed")
    assert all(e.effect_type != "speed" for e in clip.effects)
    # Effects are independent per clip
    clip2 = VideoClip(name="c2", start_frame=0, end_frame=150)
    clip2.add_effect(Effect("blur", {"radius": 2}))
    assert len(clip2.effects) == 1
    assert clip2.effects[0].effect_type == "blur"
    assert len(clip.effects) == 1  # Only blur left in clip1 