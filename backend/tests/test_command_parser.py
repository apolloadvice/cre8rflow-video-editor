import pytest
from app.command_parser import CommandParser, EditOperation

@pytest.fixture
def parser():
    return CommandParser()

# Helper for frame conversion
FRAME_RATE = 30

def to_frames(time_str):
    if isinstance(time_str, (int, float)):
        return int(float(time_str) * FRAME_RATE)
    if ":" in time_str:
        parts = [int(p) for p in time_str.split(":")]
        if len(parts) == 2:
            return parts[0] * 60 * FRAME_RATE + parts[1] * FRAME_RATE
        elif len(parts) == 3:
            return parts[0] * 3600 * FRAME_RATE + parts[1] * 60 * FRAME_RATE + parts[2] * FRAME_RATE
    if time_str.endswith("s"):
        return int(float(time_str[:-1]) * FRAME_RATE)
    return int(float(time_str) * FRAME_RATE)

def test_cut_command(parser):
    op = parser.parse_command("Cut clip1 at 00:30", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == to_frames("00:30")

def test_cut_natural_references(parser):
    # 'this clip' (contextual)
    op = parser.parse_command("Cut this clip at 00:10", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target.lower() == "this clip"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["timestamp"] == to_frames("00:10")

    # 'the clip before that one' (relative)
    op = parser.parse_command("Cut the clip before that one at 00:20", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target.lower() == "the clip before that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "before"
    assert op.parameters["timestamp"] == to_frames("00:20")

    # 'the clip after that one' (relative)
    op = parser.parse_command("Cut the clip after that one at 00:25", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target.lower() == "the clip after that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "after"
    assert op.parameters["timestamp"] == to_frames("00:25")

    # 'the clip that starts at 00:15' (by_start_time)
    op = parser.parse_command("Cut the clip that starts at 00:15 at 00:20", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target.lower().startswith("the clip that starts at")
    assert op.parameters["reference_type"] == "by_start_time"
    assert op.parameters["start_time"] == "00:15"
    assert op.parameters["timestamp"] == to_frames("00:20")

def test_cut_natural_time_expression(parser):
    op = parser.parse_command("Cut clip1 at thirty seconds", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == 30 * FRAME_RATE
    op2 = parser.parse_command("Cut at five minutes", FRAME_RATE)
    assert op2.type == "CUT"
    assert op2.target == "current"
    assert op2.parameters["timestamp"] == 5 * 60 * FRAME_RATE

def test_add_text_command_full(parser):
    op = parser.parse_command("Add text 'Intro' at the top from 0:05 to 0:15", FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.target is None
    assert op.parameters["text"] == "Intro"
    assert op.parameters["position"] == "top"
    assert op.parameters["start"] == "0:05"
    assert op.parameters["end"] == "0:15"

def test_add_text_command_simple(parser):
    op = parser.parse_command("Add Hello from 20 to 30 seconds", FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.parameters["text"] == "Hello"
    assert op.parameters["start"] == str(20 * FRAME_RATE)
    assert op.parameters["end"] == str(30 * FRAME_RATE)

def test_unknown_command(parser):
    op = parser.parse_command("Make it blue", FRAME_RATE)
    assert op.type == "UNKNOWN"
    assert "raw" in op.parameters

def test_timeline_load_video():
    from app.timeline import Timeline
    timeline = Timeline()
    clip = timeline.load_video("/videos/sample_video.mp4")
    assert clip.name == "sample_video"
    assert clip.start == 0
    assert clip.end == 60.0  # This will need to be updated to frames if load_video is updated
    assert clip in timeline.get_track("video").clips

def test_timeline_trim_clip():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    clip = VideoClip(name="clip1", start_frame=0, end_frame=600)  # 20s at 30fps
    timeline.add_clip(clip, track_index=0)
    trimmed = timeline.trim_clip(clip.name, 300, track_type="video", track_index=0)  # trim at 10s (300 frames)
    assert trimmed is True
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 2
    assert video_clips[0].name == "clip1_part1"
    assert video_clips[0].start == 0
    assert video_clips[0].end == 300
    assert video_clips[1].name == "clip1_part2"
    assert video_clips[1].start == 300
    assert video_clips[1].end == 600

def test_timeline_join_clips():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=300)
    clip2 = VideoClip(name="clip2", start_frame=300, end_frame=600)
    timeline.add_clip(clip1, track_index=0)
    timeline.add_clip(clip2, track_index=0)
    joined = timeline.join_clips("clip1", "clip2", track_type="video", track_index=0)
    assert joined is True
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 1
    joined_clip = video_clips[0]
    assert joined_clip.name == "clip1_joined_clip2"
    assert joined_clip.start == 0
    assert joined_clip.end == 600

def test_timeline_add_transition():
    from app.timeline import Timeline
    timeline = Timeline()
    clip = timeline.load_video("/videos/sample_video.mp4")
    timeline.trim_clip(clip.name, 30.0)
    added = timeline.add_transition("sample_video_part1", "sample_video_part2", transition_type="crossfade", duration=2.0)
    assert added is True
    transitions = timeline.transitions
    assert len(transitions) == 1
    t = transitions[0]
    assert t.from_clip == "sample_video_part1"
    assert t.to_clip == "sample_video_part2"
    assert t.transition_type == "crossfade"
    assert t.duration == 2.0

def test_intent_recognition(parser):
    assert parser.recognize_intent("Cut clip1 at 00:30", FRAME_RATE) == "CUT"
    assert parser.recognize_intent("Trim the start of clip2 to 00:10", FRAME_RATE) == "TRIM"
    assert parser.recognize_intent("Join clip1 and clip2 with a crossfade", FRAME_RATE) == "JOIN"
    assert parser.recognize_intent("Add text 'Intro' at the top from 0:05 to 0:15", FRAME_RATE) == "ADD_TEXT"
    assert parser.recognize_intent("Overlay logo.png at the top right from 10s to 20s", FRAME_RATE) == "OVERLAY"
    assert parser.recognize_intent("Fade out audio at the end of the timeline", FRAME_RATE) == "FADE"
    assert parser.recognize_intent("Speed up the middle section by 2x", FRAME_RATE) == "SPEED"
    assert parser.recognize_intent("Reverse clip4", FRAME_RATE) == "REVERSE"
    assert parser.recognize_intent("Apply color correction to clip3", FRAME_RATE) == "COLOR_CORRECTION"
    assert parser.recognize_intent("Export the project as mp4", FRAME_RATE) == "EXPORT"
    assert parser.recognize_intent("Make it sparkle!", FRAME_RATE) == "UNKNOWN"

def test_entity_extraction(parser):
    entities = parser.extract_entities("Cut clip1 at 00:30", FRAME_RATE)
    assert entities["clip_names"] == ["clip1"]
    assert entities["timecodes"] == [to_frames("00:30")]
    assert entities["effects"] == []

    entities = parser.extract_entities("Join clip1 and clip2 with a crossfade", FRAME_RATE)
    assert set(entities["clip_names"]) == {"clip1", "clip2"}
    assert "crossfade" in entities["effects"]

    entities = parser.extract_entities("Add text 'Intro' at the top from 0:05 to 0:15", FRAME_RATE)
    assert entities["timecodes"] == [to_frames("0:05"), to_frames("0:15")]

    entities = parser.extract_entities("Apply color correction to clip3", FRAME_RATE)
    assert entities["clip_names"] == ["clip3"]
    assert "color correction" in entities["effects"]

def test_validate_command(parser):
    # Valid CUT
    op = parser.parse_command("Cut clip1 at 00:30", FRAME_RATE)
    valid, msg = parser.validate_command(op)
    assert valid
    assert "Valid CUT" in msg

    # Valid CUT (no explicit target, should default to 'current')
    op = parser.parse_command("Cut at 00:30", FRAME_RATE)
    valid, msg = parser.validate_command(op)
    assert valid
    assert op.target == "current"
    assert "Valid CUT" in msg

    # Invalid CUT (missing timestamp)
    op = parser.parse_command("Cut clip1", FRAME_RATE)
    valid, msg = parser.validate_command(op)
    assert not valid
    assert "timestamp" in msg

    # Valid ADD_TEXT
    op = parser.parse_command("Add text 'Intro' at the top from 0:05 to 0:15", FRAME_RATE)
    valid, msg = parser.validate_command(op)
    assert valid
    assert "Valid ADD_TEXT" in msg

    # Invalid ADD_TEXT (missing text)
    op = parser.parse_command("Add text at the top from 0:05 to 0:15", FRAME_RATE)
    valid, msg = parser.validate_command(op)
    assert not valid
    assert "ADD_TEXT command requires text." in msg

    # Invalid ADD_TEXT (missing start/end)
    op = parser.parse_command("Add text 'Intro' at the top", FRAME_RATE)
    valid, msg = parser.validate_command(op)
    assert not valid
    assert "start and end" in msg

    # Unknown command
    op = parser.parse_command("Make it sparkle!", FRAME_RATE)
    valid, msg = parser.validate_command(op)
    assert not valid
    assert "Unknown command" in msg

def test_feedback_for_command(parser):
    # Valid command
    msg = parser.feedback_for_command("Cut clip1 at 00:30", FRAME_RATE)
    assert "✅" in msg and "Command understood" in msg

    # Unclear/unknown command
    msg = parser.feedback_for_command("Make it sparkle!", FRAME_RATE)
    assert "couldn't understand" in msg

    # Valid command (no explicit target, should default to 'current')
    msg = parser.feedback_for_command("Cut at 00:30", FRAME_RATE)
    assert "✅" in msg and "Command understood" in msg

    # Invalid command (missing text)
    msg = parser.feedback_for_command("Add text at the top from 0:05 to 0:15", FRAME_RATE)
    assert "⚠️" in msg and "ADD_TEXT command requires text." in msg

def test_trim_command(parser):
    # Intent recognition
    assert parser.recognize_intent("Trim the start of clip2 to 00:10", FRAME_RATE) == "TRIM"
    # Entity extraction
    entities = parser.extract_entities("Trim the start of clip2 to 00:10", FRAME_RATE)
    assert entities["clip_names"] == ["clip2"]
    assert entities["timecodes"] == [to_frames("00:10")]
    # Parsing (should now return TRIM)
    op = parser.parse_command("Trim the start of clip2 to 00:10", FRAME_RATE)
    assert op.type == "TRIM"
    # Feedback (should indicate missing implementation or validation)
    msg = parser.feedback_for_command("Trim the start of clip2 to 00:10", FRAME_RATE)
    # Accept either valid or invalid feedback depending on validation logic
    assert "TRIM" in msg or "couldn't understand" in msg or "⚠️" in msg

def test_trim_command_negative(parser):
    # Negative: missing target clip name
    op = parser.parse_command("Trim to 00:10", FRAME_RATE)
    # Should return TRIM but fail validation
    assert op.type == "TRIM"
    valid, msg = parser.validate_command(op)
    assert not valid
    # Feedback should indicate missing target
    msg = parser.feedback_for_command("Trim to 00:10", FRAME_RATE)
    assert "target" in msg.lower() or "couldn't understand" in msg or "⚠️" in msg

def test_join_command(parser):
    # Intent recognition
    assert parser.recognize_intent("Join clip1 and clip2 with a crossfade", FRAME_RATE) == "JOIN"
    # Entity extraction
    entities = parser.extract_entities("Join clip1 and clip2 with a crossfade", FRAME_RATE)
    assert set(entities["clip_names"]) == {"clip1", "clip2"}
    assert "crossfade" in entities["effects"]
    # Parsing (should now return JOIN)
    op = parser.parse_command("Join clip1 and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    # Parameters should include second and effect
    assert op.parameters["second"] == "clip2"
    assert op.parameters["effect"] == "crossfade"
    # Validation should pass
    valid, msg = parser.validate_command(op)
    assert valid
    assert "Valid JOIN" in msg

def test_overlay_command(parser):
    # Intent recognition
    assert parser.recognize_intent("Overlay logo.png at the top right from 10s to 20s", FRAME_RATE) == "OVERLAY"
    # Entity extraction
    entities = parser.extract_entities("Overlay logo.png at the top right from 10s to 20s", FRAME_RATE)
    assert "logo.png" not in entities["clip_names"]  # Should not be a clip name
    assert set(entities["timecodes"]) == {to_frames("10s"), to_frames("20s")}
    # Parsing (should now return OVERLAY)
    op = parser.parse_command("Overlay logo.png at the top right from 10s to 20s", FRAME_RATE)
    assert op.type == "OVERLAY"
    # Parameters should include asset, position, start, and end
    assert op.parameters["asset"] == "logo.png"
    assert op.parameters["position"] == "top right"
    assert op.parameters["start"] == to_frames("10s")
    assert op.parameters["end"] == to_frames("20s")


def test_overlay_command_negative(parser):
    # Negative: missing asset
    op = parser.parse_command("Overlay at the top right from 10s to 20s", FRAME_RATE)
    assert op.type == "UNKNOWN"

def test_fade_command(parser):
    # Intent recognition
    assert parser.recognize_intent("Fade out audio at the end of the timeline", FRAME_RATE) == "FADE"
    # Entity extraction
    entities = parser.extract_entities("Fade out audio at the end of the timeline", FRAME_RATE)
    assert "fade" in entities["effects"]
    # Parsing (should now return FADE)
    op = parser.parse_command("Fade out audio at the end of the timeline", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["direction"] == "out"
    assert op.parameters["target"] == "audio"
    # Validation should pass
    valid, msg = parser.validate_command(op)
    assert valid
    assert "Valid FADE" in msg

def test_fade_natural_references(parser):
    # 'this clip' (contextual)
    op = parser.parse_command("Fade in this clip at 00:00 to 00:05", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower() == "this clip"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["direction"] == "in"
    assert op.parameters["start"] == "00:00"
    assert op.parameters["end"] == "00:05"

    # 'the clip before that one' (relative)
    op = parser.parse_command("Fade out the clip before that one at 00:10 to 00:15", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower() == "the clip before that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "before"
    assert op.parameters["direction"] == "out"
    assert op.parameters["start"] == "00:10"
    assert op.parameters["end"] == "00:15"

    # 'the clip after that one' (relative)
    op = parser.parse_command("Fade in the clip after that one at 00:20 to 00:25", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower() == "the clip after that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "after"
    assert op.parameters["direction"] == "in"
    assert op.parameters["start"] == "00:20"
    assert op.parameters["end"] == "00:25"

    # 'the clip that starts at 00:15' (by_start_time)
    op = parser.parse_command("Fade out the clip that starts at 00:15 at 00:30 to 00:35", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower().startswith("the clip that starts at")
    assert op.parameters["reference_type"] == "by_start_time"
    assert op.parameters["start_time"] == "00:15"
    assert op.parameters["direction"] == "out"
    assert op.parameters["start"] == "00:30"
    assert op.parameters["end"] == "00:35"

# --- TRIM command positive and negative tests ---
def test_trim_command_positive(parser):
    # Positive: valid TRIM command (parsing not yet implemented, should return UNKNOWN for now)
    op = parser.parse_command("Trim the start of clip2 to 00:10", FRAME_RATE)
    # Once implemented, this should be: assert op.type == "TRIM"
    assert op.type in ("TRIM", "UNKNOWN")
    # Entities should be extracted correctly
    entities = parser.extract_entities("Trim the start of clip2 to 00:10", FRAME_RATE)
    assert entities["clip_names"] == ["clip2"]
    assert entities["timecodes"] == [to_frames("00:10")]


def test_join_command_positive(parser):
    # Positive: valid JOIN command
    op = parser.parse_command("Join clip1 and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    # Entities should be extracted correctly
    entities = parser.extract_entities("Join clip1 and clip2 with a crossfade", FRAME_RATE)
    assert set(entities["clip_names"]) == {"clip1", "clip2"}
    assert "crossfade" in entities["effects"]
    # Validation should pass
    valid, msg = parser.validate_command(op)
    assert valid
    assert "Valid JOIN" in msg
    # Parameters should include second and effect
    assert op.parameters["second"] == "clip2"
    assert op.parameters["effect"] == "crossfade"


def test_join_command_negative(parser):
    # Negative: missing one or both clip names
    op = parser.parse_command("Join with a crossfade", FRAME_RATE)
    # Should return JOIN but fail validation
    assert op.type == "JOIN" or op.type == "UNKNOWN"
    valid, msg = parser.validate_command(op)
    assert not valid
    # Feedback should indicate missing target(s)
    msg = parser.feedback_for_command("Join with a crossfade", FRAME_RATE)
    assert "clip" in msg.lower() or "couldn't understand" in msg or "⚠️" in msg

# --- FADE command positive and negative tests ---
def test_fade_command_positive(parser):
    # Positive: valid FADE command
    op = parser.parse_command("Fade out audio at the end of the timeline", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["direction"] == "out"
    assert op.parameters["target"] == "audio"
    # With timecodes
    op2 = parser.parse_command("Fade in clip1 from 0:00 to 0:05", FRAME_RATE)
    assert op2.type == "FADE"
    assert op2.parameters["direction"] == "in"
    assert op2.parameters["target"] == "clip1"
    assert op2.parameters["start"] == "0:00"
    assert op2.parameters["end"] == "0:05"


def test_fade_command_negative(parser):
    # Negative: missing direction
    op = parser.parse_command("Fade audio at the end of the timeline", FRAME_RATE)
    assert op.type == "UNKNOWN"

def test_timeline_trim_clip_audio():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add an audio clip to the audio track (track_type='audio', track_index=0)
    audio_clip = VideoClip(name="audio1", start_frame=0, end_frame=600)
    timeline.add_clip(audio_clip, track_index=1)  # Audio 1 is at index 1
    trimmed = timeline.trim_clip("audio1", 300, track_type="audio", track_index=0)
    assert trimmed is True
    audio_clips = timeline.get_track("audio").clips
    assert len(audio_clips) == 2
    assert audio_clips[0].name == "audio1_part1"
    assert audio_clips[0].start == 0
    assert audio_clips[0].end == 300
    assert audio_clips[1].name == "audio1_part2"
    assert audio_clips[1].start == 300
    assert audio_clips[1].end == 600

def test_timeline_trim_clip_subtitle():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add a subtitle clip to the subtitle track (track_type='subtitle', track_index=0)
    subtitle_clip = VideoClip(name="subtitle1", start_frame=0, end_frame=240)
    timeline.add_clip(subtitle_clip, track_index=2)  # Subtitles is at index 2
    trimmed = timeline.trim_clip("subtitle1", 120, track_type="subtitle", track_index=0)
    assert trimmed is True
    subtitle_clips = timeline.get_track("subtitle").clips
    assert len(subtitle_clips) == 2
    assert subtitle_clips[0].name == "subtitle1_part1"
    assert subtitle_clips[0].start == 0
    assert subtitle_clips[0].end == 120
    assert subtitle_clips[1].name == "subtitle1_part2"
    assert subtitle_clips[1].start == 120
    assert subtitle_clips[1].end == 240

def test_timeline_trim_clip_effect():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add an effect clip to the effect track (track_type='effect', track_index=0)
    effect_clip = VideoClip(name="effect1", start_frame=0, end_frame=150)
    timeline.add_clip(effect_clip, track_index=3)  # Effects is at index 3
    trimmed = timeline.trim_clip("effect1", 75, track_type="effect", track_index=0)
    assert trimmed is True
    effect_clips = timeline.get_track("effect").clips
    assert len(effect_clips) == 2
    assert effect_clips[0].name == "effect1_part1"
    assert effect_clips[0].start == 0
    assert effect_clips[0].end == 75
    assert effect_clips[1].name == "effect1_part2"
    assert effect_clips[1].start == 75
    assert effect_clips[1].end == 150

def test_timeline_join_clips_audio():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add two adjacent audio clips to the audio track (track_type='audio', track_index=0)
    clip1 = VideoClip(name="audio1", start_frame=0, end_frame=300)
    clip2 = VideoClip(name="audio2", start_frame=300, end_frame=600)
    timeline.add_clip(clip1, track_index=1)
    timeline.add_clip(clip2, track_index=1)
    joined = timeline.join_clips("audio1", "audio2", track_type="audio", track_index=0)
    assert joined is True
    audio_clips = timeline.get_track("audio").clips
    assert len(audio_clips) == 1
    joined_clip = audio_clips[0]
    assert joined_clip.name == "audio1_joined_audio2"
    assert joined_clip.start == 0
    assert joined_clip.end == 600

def test_timeline_join_clips_subtitle():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add two adjacent subtitle clips to the subtitle track (track_type='subtitle', track_index=0)
    clip1 = VideoClip(name="subtitle1", start_frame=0, end_frame=120)
    clip2 = VideoClip(name="subtitle2", start_frame=120, end_frame=240)
    timeline.add_clip(clip1, track_index=2)
    timeline.add_clip(clip2, track_index=2)
    joined = timeline.join_clips("subtitle1", "subtitle2", track_type="subtitle", track_index=0)
    assert joined is True
    subtitle_clips = timeline.get_track("subtitle").clips
    assert len(subtitle_clips) == 1
    joined_clip = subtitle_clips[0]
    assert joined_clip.name == "subtitle1_joined_subtitle2"
    assert joined_clip.start == 0
    assert joined_clip.end == 240

def test_timeline_join_clips_effect():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add two adjacent effect clips to the effect track (track_type='effect', track_index=0)
    clip1 = VideoClip(name="effect1", start_frame=0, end_frame=75)
    clip2 = VideoClip(name="effect2", start_frame=75, end_frame=150)
    timeline.add_clip(clip1, track_index=3)
    timeline.add_clip(clip2, track_index=3)
    joined = timeline.join_clips("effect1", "effect2", track_type="effect", track_index=0)
    assert joined is True
    effect_clips = timeline.get_track("effect").clips
    assert len(effect_clips) == 1
    joined_clip = effect_clips[0]
    assert joined_clip.name == "effect1_joined_effect2"
    assert joined_clip.start == 0
    assert joined_clip.end == 150

def test_timeline_add_transition_audio():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add two adjacent audio clips to the audio track (track_type='audio', track_index=0)
    clip1 = VideoClip(name="audio1", start_frame=0, end_frame=300)
    clip2 = VideoClip(name="audio2", start_frame=300, end_frame=600)
    timeline.add_clip(clip1, track_index=1)
    timeline.add_clip(clip2, track_index=1)
    added = timeline.add_transition("audio1", "audio2", transition_type="fade", duration=2.0, track_type="audio", track_index=0)
    assert added is True
    transitions = timeline.transitions
    assert len(transitions) == 1
    t = transitions[0]
    assert t.from_clip == "audio1"
    assert t.to_clip == "audio2"
    assert t.transition_type == "fade"
    assert t.duration == 2.0

def test_timeline_add_transition_subtitle():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add two adjacent subtitle clips to the subtitle track (track_type='subtitle', track_index=0)
    clip1 = VideoClip(name="subtitle1", start_frame=0, end_frame=120)
    clip2 = VideoClip(name="subtitle2", start_frame=120, end_frame=240)
    timeline.add_clip(clip1, track_index=2)
    timeline.add_clip(clip2, track_index=2)
    added = timeline.add_transition("subtitle1", "subtitle2", transition_type="slide", duration=1.0, track_type="subtitle", track_index=0)
    assert added is True
    transitions = timeline.transitions
    assert len(transitions) == 1
    t = transitions[0]
    assert t.from_clip == "subtitle1"
    assert t.to_clip == "subtitle2"
    assert t.transition_type == "slide"
    assert t.duration == 1.0

def test_timeline_add_transition_effect():
    from app.timeline import Timeline, VideoClip
    timeline = Timeline()
    # Add two adjacent effect clips to the effect track (track_type='effect', track_index=0)
    clip1 = VideoClip(name="effect1", start_frame=0, end_frame=75)
    clip2 = VideoClip(name="effect2", start_frame=75, end_frame=150)
    timeline.add_clip(clip1, track_index=3)
    timeline.add_clip(clip2, track_index=3)
    added = timeline.add_transition("effect1", "effect2", transition_type="wipe", duration=0.5, track_type="effect", track_index=0)
    assert added is True
    transitions = timeline.transitions
    assert len(transitions) == 1
    t = transitions[0]
    assert t.from_clip == "effect1"
    assert t.to_clip == "effect2"
    assert t.transition_type == "wipe"
    assert t.duration == 0.5

def test_group_cut_command_video(parser):
    op = parser.parse_command("Cut all clips at 00:30", FRAME_RATE)
    assert op.type == "CUT_GROUP"
    assert op.parameters["track_type"] == "video"
    assert op.parameters["timestamp"] == to_frames("00:30")

def test_group_cut_command_audio(parser):
    op = parser.parse_command("Cut all audio clips at 00:10", FRAME_RATE)
    assert op.type == "CUT_GROUP"
    assert op.parameters["track_type"] == "audio"
    assert op.parameters["timestamp"] == to_frames("00:10")

def test_group_cut_command_subtitle(parser):
    op = parser.parse_command("Cut all subtitle clips at 00:05", FRAME_RATE)
    assert op.type == "CUT_GROUP"
    assert op.parameters["track_type"] == "subtitle"
    assert op.parameters["timestamp"] == to_frames("00:05")

def test_group_cut_command_effect(parser):
    op = parser.parse_command("Cut all effect clips at 00:15", FRAME_RATE)
    assert op.type == "CUT_GROUP"
    assert op.parameters["track_type"] == "effect"
    assert op.parameters["timestamp"] == to_frames("00:15")

def test_split_command(parser):
    op = parser.parse_command("Split clip1 at 00:30", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == to_frames("00:30")

def test_divide_command(parser):
    op = parser.parse_command("Divide clip1 at 00:30", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == to_frames("00:30")

def test_slice_command(parser):
    op = parser.parse_command("Slice clip1 at 00:30", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == to_frames("00:30")

def test_merge_command(parser):
    op = parser.parse_command("Merge clip1 and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target == "clip1"
    assert op.parameters["second"] == "clip2"
    assert op.parameters["effect"] == "crossfade"

def test_combine_command(parser):
    op = parser.parse_command("Combine clip1 and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target == "clip1"
    assert op.parameters["second"] == "clip2"
    assert op.parameters["effect"] == "crossfade"

def test_shorten_command(parser):
    op = parser.parse_command("Shorten clip1 to 00:10", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == to_frames("00:10")

def test_crop_command(parser):
    op = parser.parse_command("Crop clip1 to 00:10", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == to_frames("00:10")

def test_reduce_command(parser):
    op = parser.parse_command("Reduce clip1 to 00:10", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == to_frames("00:10")

def test_add_text_multiword_quoted(parser):
    op = parser.parse_command('Add text "Hello world" at the top from 0:05 to 0:15', FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.parameters["text"] == "Hello world"
    assert op.parameters["position"] == "top"
    assert op.parameters["start"] == "0:05"
    assert op.parameters["end"] == "0:15"

def test_add_text_multiword_unquoted(parser):
    op = parser.parse_command('Add Hello world at the top from 0:05 to 0:15', FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.parameters["text"] == "Hello world"
    assert op.parameters["position"] == "top"
    assert op.parameters["start"] == "0:05"
    assert op.parameters["end"] == "0:15"

def test_overlay_command_synonyms(parser):
    # Test all overlay synonyms
    for verb in ["Superimpose", "Place", "Put", "Add overlay"]:
        cmd = f"{verb} logo.png at the top right from 10s to 20s"
        # Intent recognition
        assert parser.recognize_intent(cmd, FRAME_RATE) == "OVERLAY"
        # Parsing
        op = parser.parse_command(cmd, FRAME_RATE)
        assert op.type == "OVERLAY"
        assert op.parameters["asset"] == "logo.png"
        assert op.parameters["position"] == "top right"
        assert op.parameters["start"] == to_frames("10s")
        assert op.parameters["end"] == to_frames("20s")

def test_cut_command_synonyms(parser):
    # Test all cut synonyms
    for verb in ["Split", "Divide", "Slice"]:
        cmd = f"{verb} clip1 at 00:30"
        # Intent recognition
        assert parser.recognize_intent(cmd, FRAME_RATE) == "CUT"
        # Parsing
        op = parser.parse_command(cmd, FRAME_RATE)
        assert op.type == "CUT"
        assert op.target == "clip1"
        assert op.parameters["timestamp"] == to_frames("00:30")

def test_trim_command_synonyms(parser):
    # Test all trim synonyms
    for verb in ["Shorten", "Crop", "Reduce"]:
        cmd = f"{verb} clip1 to 00:10"
        # Intent recognition
        assert parser.recognize_intent(cmd, FRAME_RATE) == "TRIM"
        # Parsing
        op = parser.parse_command(cmd, FRAME_RATE)
        assert op.type == "TRIM"
        assert op.target == "clip1"
        assert op.parameters["timestamp"] == to_frames("00:10")

def test_join_command_synonyms(parser):
    # Test all join synonyms
    for verb in ["Merge", "Combine"]:
        cmd = f"{verb} clip1 and clip2 with a crossfade"
        # Intent recognition
        assert parser.recognize_intent(cmd, FRAME_RATE) == "JOIN"
        # Parsing
        op = parser.parse_command(cmd, FRAME_RATE)
        assert op.type == "JOIN"
        assert op.target == "clip1"
        assert op.parameters["second"] == "clip2"
        assert op.parameters["effect"] == "crossfade"

def test_fade_command_synonyms(parser):
    # Test all fade synonyms
    for verb in ["Dissolve", "Blend"]:
        cmd = f"{verb} in audio at 00:00 to 00:05"
        # Intent recognition
        assert parser.recognize_intent(cmd, FRAME_RATE) == "FADE"
        # Parsing
        op = parser.parse_command(cmd, FRAME_RATE)
        assert op.type == "FADE"
        assert op.parameters["direction"] == "in"
        assert op.parameters["target"] == "audio"
        assert op.parameters["start"] == "00:00"
        assert op.parameters["end"] == "00:05"

def test_trim_natural_references(parser):
    # 'this clip' (contextual)
    op = parser.parse_command("Trim this clip to 00:10", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target.lower() == "this clip"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["timestamp"] == to_frames("00:10")

    # 'the clip before that one' (relative)
    op = parser.parse_command("Trim the clip before that one to 00:20", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target.lower() == "the clip before that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "before"
    assert op.parameters["timestamp"] == to_frames("00:20")

    # 'the clip after that one' (relative)
    op = parser.parse_command("Trim the clip after that one to 00:25", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target.lower() == "the clip after that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "after"
    assert op.parameters["timestamp"] == to_frames("00:25")

    # 'the clip that starts at 00:15' (by_start_time)
    op = parser.parse_command("Trim the clip that starts at 00:15 to 00:20", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target.lower().startswith("the clip that starts at")
    assert op.parameters["reference_type"] == "by_start_time"
    assert op.parameters["start_time"] == "00:15"
    assert op.parameters["timestamp"] == to_frames("00:20")

def test_join_natural_references(parser):
    # 'this clip' (contextual)
    op = parser.parse_command("Join this clip and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target.lower() == "this clip"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["second"].lower() == "clip2"
    assert op.parameters["effect"] == "crossfade"

    # 'the clip before that one' (relative)
    op = parser.parse_command("Join the clip before that one and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target.lower() == "the clip before that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "before"
    assert op.parameters["second"].lower() == "clip2"
    assert op.parameters["effect"] == "crossfade"

    # 'the clip after that one' (relative)
    op = parser.parse_command("Join the clip after that one and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target.lower() == "the clip after that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "after"
    assert op.parameters["second"].lower() == "clip2"
    assert op.parameters["effect"] == "crossfade"

    # 'the clip that starts at 00:15' (by_start_time)
    op = parser.parse_command("Join the clip that starts at 00:15 and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target.lower().startswith("the clip that starts at")
    assert op.parameters["reference_type"] == "by_start_time"
    assert op.parameters["start_time"] == "00:15"
    assert op.parameters["second"].lower() == "clip2"
    assert op.parameters["effect"] == "crossfade"

def test_overlay_natural_references(parser):
    # 'this clip' (contextual)
    op = parser.parse_command("Overlay logo.png at the this clip from 10s to 20s", FRAME_RATE)
    assert op.type == "OVERLAY"
    assert op.parameters["position"].lower() == "this clip"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["asset"] == "logo.png"
    assert op.parameters["start"] == to_frames("10s")
    assert op.parameters["end"] == to_frames("20s")

    # 'the clip before that one' (relative)
    op = parser.parse_command("Overlay logo.png at the clip before that one from 10s to 20s", FRAME_RATE)
    assert op.type == "OVERLAY"
    assert op.parameters["position"].lower() == "clip before that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "before"
    assert op.parameters["asset"] == "logo.png"
    assert op.parameters["start"] == to_frames("10s")
    assert op.parameters["end"] == to_frames("20s")

    # 'the clip after that one' (relative)
    op = parser.parse_command("Overlay logo.png at the clip after that one from 10s to 20s", FRAME_RATE)
    assert op.type == "OVERLAY"
    assert op.parameters["position"].lower() == "clip after that one"
    assert op.parameters["reference_type"] == "relative"
    assert op.parameters["relative_position"] == "after"
    assert op.parameters["asset"] == "logo.png"
    assert op.parameters["start"] == to_frames("10s")
    assert op.parameters["end"] == to_frames("20s")

    # 'the clip that starts at 00:15' (by_start_time)
    op = parser.parse_command("Overlay logo.png at the clip that starts at 00:15 from 10s to 20s", FRAME_RATE)
    assert op.type == "OVERLAY"
    pos = op.parameters["position"].lower()
    assert pos.startswith("clip that starts at") or pos.startswith("the clip that starts at")
    assert op.parameters["reference_type"] == "by_start_time"
    assert op.parameters["start_time"] == "00:15"
    assert op.parameters["asset"] == "logo.png"
    assert op.parameters["start"] == to_frames("10s")
    assert op.parameters["end"] == to_frames("20s")

def test_overlay_in_preposition(parser):
    op = parser.parse_command("Overlay image.png in clip2 from 00:30 to 00:36", FRAME_RATE)
    assert op.type == "OVERLAY"
    assert op.parameters["asset"] == "image.png"
    assert op.parameters["position"].lower() == "clip2"
    assert op.parameters["start"] == to_frames("00:30")
    assert op.parameters["end"] == to_frames("00:36")

def test_trim_contextual_pronouns(parser):
    op = parser.parse_command("Trim it to 00:10", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target.lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "it"
    assert op.parameters["timestamp"] == to_frames("00:10")

    op = parser.parse_command("Trim that to 00:15", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target.lower() == "that"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "that"
    assert op.parameters["timestamp"] == to_frames("00:15")

    op = parser.parse_command("Trim this to 00:20", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target.lower() == "this"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "this"
    assert op.parameters["timestamp"] == to_frames("00:20")

def test_cut_contextual_pronouns(parser):
    op = parser.parse_command("Cut it at 00:10", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target.lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "it"
    assert op.parameters["timestamp"] == to_frames("00:10")

    op = parser.parse_command("Cut that at 00:15", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target.lower() == "that"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "that"
    assert op.parameters["timestamp"] == to_frames("00:15")

    op = parser.parse_command("Cut this at 00:20", FRAME_RATE)
    assert op.type == "CUT"
    assert op.target.lower() == "this"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "this"
    assert op.parameters["timestamp"] == to_frames("00:20")

def test_fade_contextual_pronouns(parser):
    # Expected use: 'it' as a contextual pronoun
    op = parser.parse_command("Fade in it at 00:00 to 00:05", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "it"
    assert op.parameters["direction"] == "in"
    assert op.parameters["start"] == "00:00"
    assert op.parameters["end"] == "00:05"

    # Edge case: 'that' as a contextual pronoun
    op = parser.parse_command("Fade out that at 00:10 to 00:15", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower() == "that"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "that"
    assert op.parameters["direction"] == "out"
    assert op.parameters["start"] == "00:10"
    assert op.parameters["end"] == "00:15"

    # Failure case: missing direction or time
    op = parser.parse_command("Fade it", FRAME_RATE)
    assert op.type == "UNKNOWN" or ("direction" not in op.parameters or "start" not in op.parameters)

def test_join_contextual_pronouns(parser):
    # Expected use: 'it' as a contextual pronoun for first target
    op = parser.parse_command("Join it and clip2 with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target.lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun_first"] == "it"
    assert op.parameters["second"].lower() == "clip2"
    assert op.parameters["effect"] == "crossfade"

    # Edge case: 'that' and 'this' as contextual pronouns for both targets
    op = parser.parse_command("Join that and this with a crossfade", FRAME_RATE)
    assert op.type == "JOIN"
    assert op.target.lower() == "that"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun_first"] == "that"
    assert op.parameters["second"].lower() == "this"
    assert op.parameters["reference_pronoun_second"] == "this"
    assert op.parameters["effect"] == "crossfade"

    # Failure case: missing effect
    op = parser.parse_command("Join it and that", FRAME_RATE)
    assert op.type == "JOIN" or op.type == "UNKNOWN"
    # Should still parse pronouns, but may fail validation due to missing effect
    assert op.target.lower() == "it"
    assert op.parameters["second"].lower() == "that"
    assert op.parameters.get("reference_pronoun_first") == "it"
    assert op.parameters.get("reference_pronoun_second") == "that"

def test_overlay_contextual_pronouns(parser):
    # Expected use: 'it' as a contextual pronoun for position
    op = parser.parse_command("Overlay logo.png at the it from 10s to 20s", FRAME_RATE)
    assert op.type == "OVERLAY"
    assert op.parameters["position"].lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "it"
    assert op.parameters["asset"] == "logo.png"
    assert op.parameters["start"] == to_frames("10s")
    assert op.parameters["end"] == to_frames("20s")

    # Edge case: 'that' as a contextual pronoun for position
    op = parser.parse_command("Overlay logo.png at the that from 10s to 20s", FRAME_RATE)
    assert op.type == "OVERLAY"
    assert op.parameters["position"].lower() == "that"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "that"
    assert op.parameters["asset"] == "logo.png"
    assert op.parameters["start"] == to_frames("10s")
    assert op.parameters["end"] == to_frames("20s")

    # Failure case: missing time range
    op = parser.parse_command("Overlay logo.png at the it", FRAME_RATE)
    assert op.type == "OVERLAY" or op.type == "UNKNOWN"
    assert op.parameters["position"].lower() == "it"
    assert op.parameters.get("reference_pronoun") == "it"
    # Should fail validation due to missing start/end

def test_add_text_contextual_pronouns(parser):
    # Expected use: 'it' as a contextual pronoun
    op = parser.parse_command("Add text 'Hello' to it from 0:10 to 0:20", FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.target.lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "it"
    assert op.parameters["text"] == "Hello"
    assert op.parameters["start"] == "0:10"
    assert op.parameters["end"] == "0:20"

    # Edge case: 'that' as a contextual pronoun
    op = parser.parse_command("Add text to that from 0:10 to 0:20", FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.target.lower() == "that"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "that"
    assert op.parameters["start"] == "0:10"
    assert op.parameters["end"] == "0:20"

    # Failure case: missing text
    op = parser.parse_command("Add text to it", FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.target.lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "it"
    assert "text" not in op.parameters or not op.parameters["text"]

def test_trim_natural_time_expression(parser):
    op = parser.parse_command("Trim clip1 to forty five seconds", FRAME_RATE)
    assert op.type == "TRIM"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == 45 * FRAME_RATE
    op2 = parser.parse_command("Trim to two minutes", FRAME_RATE)
    assert op2.type == "TRIM"
    assert op2.target is None or op2.target == "current"
    assert op2.parameters["timestamp"] == 2 * 60 * FRAME_RATE

def test_add_text_natural_time_expression(parser):
    op = parser.parse_command("Add text 'Intro' at the top from ten seconds to one minute", FRAME_RATE)
    assert op.type == "ADD_TEXT"
    assert op.parameters["text"] == "Intro"
    assert op.parameters["position"] == "top"
    assert op.parameters["start"] == str(10 * FRAME_RATE)
    assert op.parameters["end"] == str(60 * FRAME_RATE)

def test_fade_natural_time_expression(parser):
    # Expected use: natural time expressions for start/end
    op = parser.parse_command("Fade in it at ten seconds to one minute", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower() == "it"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "it"
    assert op.parameters["direction"] == "in"
    assert op.parameters["start"] == str(10 * FRAME_RATE)
    assert op.parameters["end"] == str(60 * FRAME_RATE)

    # Edge case: natural time for only start
    op = parser.parse_command("Fade out that at thirty seconds", FRAME_RATE)
    assert op.type == "FADE"
    assert op.parameters["target"].lower() == "that"
    assert op.parameters["reference_type"] == "contextual"
    assert op.parameters["reference_pronoun"] == "that"
    assert op.parameters["direction"] == "out"
    assert op.parameters["start"] == str(30 * FRAME_RATE)
    assert "end" not in op.parameters or not op.parameters["end"]

    # Failure case: missing direction
    op = parser.parse_command("Fade it at ten seconds to one minute", FRAME_RATE)
    assert op.type == "UNKNOWN" or ("direction" not in op.parameters)

def test_combined_commands(parser):
    # Expected use: two valid commands
    op = parser.parse_command("Cut clip1 at 00:30 and join with clip2", FRAME_RATE)
    from app.command_types import CompoundOperation, EditOperation
    assert isinstance(op, CompoundOperation)
    assert len(op.operations) == 2
    assert isinstance(op.operations[0], EditOperation)
    assert op.operations[0].type == "CUT"
    assert op.operations[0].target == "clip1"
    assert op.operations[1].type == "JOIN"
    # Edge case: valid and invalid command
    op2 = parser.parse_command("Cut at 00:30 and make it sparkle!", FRAME_RATE)
    assert isinstance(op2, CompoundOperation)
    assert op2.operations[0].type == "CUT"
    assert op2.operations[1].type == "UNKNOWN"
    # Failure case: only conjunction
    op3 = parser.parse_command("and join with clip2", FRAME_RATE)
    assert isinstance(op3, EditOperation) or isinstance(op3, CompoundOperation)

def test_remove_command(parser):
    op = parser.parse_command("remove clip1", FRAME_RATE)
    assert op.type == "REMOVE"
    assert op.target == "clip1"
    op2 = parser.parse_command("delete clip2", FRAME_RATE)
    assert op2.type == "REMOVE"
    assert op2.target == "clip2"
    op3 = parser.parse_command("erase clip3", FRAME_RATE)
    assert op3.type == "REMOVE"
    assert op3.target == "clip3"

def test_remove_command_invalid(parser):
    op = parser.parse_command("remove", FRAME_RATE)
    assert op.type == "UNKNOWN"
    assert "raw" in op.parameters
