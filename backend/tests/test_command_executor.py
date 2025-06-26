import pytest
from app.command_parser import CommandParser
from app.timeline import Timeline, VideoClip
from app.command_executor import CommandExecutor
import copy
from app.timeline import Timeline
from app.command_executor import CommandHistory

FRAME_RATE = 30  # Assume 30 fps for all tests

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


def test_execute_cut_command():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add a clip to the timeline
    clip = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(60))
    timeline.add_clip(clip, track_index=0)
    # Parse and execute CUT command
    op = parser.parse_command("Cut clip1 at 00:30", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    assert f"Cut operation on clip1 at {to_frames('00:30')} frames" in result.message
    # Check that the timeline now has two clips split at 30s (900 frames)
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 2
    assert video_clips[0].end == to_frames("00:30")
    assert video_clips[1].start == to_frames("00:30")


def test_execute_add_text_command():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Parse and execute ADD_TEXT command
    op = parser.parse_command("Add text 'Intro' at the top from 0:05 to 0:15", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    assert "Add text 'Intro'" in result.message
    assert "top" in result.message
    assert "0:05" in result.message and "0:15" in result.message


def test_execute_trim_command():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add a clip to the timeline
    clip = VideoClip(name="clip2", start_frame=0, end_frame=to_frames(60))
    timeline.add_clip(clip, track_index=0)
    # Parse and execute TRIM command
    op = parser.parse_command("Trim the start of clip2 to 00:10", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    assert f"Trimmed clip2 at {to_frames('00:10')} frames" in result.message
    # Check that the timeline now has two clips split at 10s (300 frames)
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 2
    assert video_clips[0].name == "clip2_part1"
    assert video_clips[0].start == 0
    assert video_clips[0].end == to_frames("00:10")
    assert video_clips[1].name == "clip2_part2"
    assert video_clips[1].start == to_frames("00:10")
    assert video_clips[1].end == to_frames(60)


def test_execute_join_command():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add two adjacent clips to the timeline
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(30))
    clip2 = VideoClip(name="clip2", start_frame=to_frames(30), end_frame=to_frames(60))
    timeline.add_clip(clip1, track_index=0)
    timeline.add_clip(clip2, track_index=0)
    # Parse and execute JOIN command
    op = parser.parse_command("Join clip1 and clip2 with a crossfade")
    result = executor.execute(op)
    assert result.success
    assert "Joined clip1 and clip2" in result.message
    assert "crossfade" in result.message
    # Check that the timeline now has one joined clip
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 1
    joined_clip = video_clips[0]
    assert joined_clip.name == "clip1_joined_clip2"
    assert joined_clip.start == 0
    assert joined_clip.end == to_frames(60)


def test_execute_fade_command():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Parse and execute FADE command (audio fade out at end)
    op = parser.parse_command("Fade out audio at the end of the timeline", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    assert "Fade out audio" in result.message
    # Parse and execute FADE command (fade in clip1 from 0:00 to 0:05)
    # Add a clip for fade in
    clip = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(10))
    timeline.add_clip(clip, track_index=0)
    op2 = parser.parse_command("Fade in clip1 from 0:00 to 0:05", timeline.frame_rate)
    result2 = executor.execute(op2)
    assert result2.success
    assert "Fade in clip1 from 0:00 to 0:05" in result2.message


def test_execute_overlay_command():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Parse and execute OVERLAY command
    op = parser.parse_command("Overlay logo.png at the top right from 10s to 20s", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    assert "Overlay logo.png" in result.message
    assert "at the top right" in result.message
    assert f"from {to_frames('10s')} to {to_frames('20s')}" in result.message

# --- Additional tests for audio, subtitle, and effect tracks ---
def test_execute_trim_command_audio():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    audio_clip = VideoClip(name="audio1", start_frame=0, end_frame=to_frames(20))
    timeline.add_clip(audio_clip, track_index=1)  # Audio track
    op = parser.parse_command("Trim the start of audio1 to 00:05", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    audio_clips = timeline.get_track("audio").clips
    assert len(audio_clips) == 2
    assert audio_clips[0].end == to_frames("00:05")
    assert audio_clips[1].start == to_frames("00:05")

def test_execute_join_command_subtitle():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    sub1 = VideoClip(name="subtitle1", start_frame=0, end_frame=to_frames(4))
    sub2 = VideoClip(name="subtitle2", start_frame=to_frames(4), end_frame=to_frames(8))
    timeline.add_clip(sub1, track_index=2)
    timeline.add_clip(sub2, track_index=2)
    op = parser.parse_command("Join subtitle1 and subtitle2 with a slide")
    result = executor.execute(op)
    assert result.success
    subtitle_clips = timeline.get_track("subtitle").clips
    assert len(subtitle_clips) == 1
    joined_clip = subtitle_clips[0]
    assert joined_clip.name == "subtitle1_joined_subtitle2"
    assert joined_clip.start == 0
    assert joined_clip.end == to_frames(8)

def test_execute_trim_command_effect():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    effect_clip = VideoClip(name="effect1", start_frame=0, end_frame=to_frames(5))
    timeline.add_clip(effect_clip, track_index=3)
    op = parser.parse_command("Trim the start of effect1 to 00:02", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    effect_clips = timeline.get_track("effect").clips
    assert len(effect_clips) == 2
    assert effect_clips[0].end == to_frames("00:02")
    assert effect_clips[1].start == to_frames("00:02")

def test_execute_cut_command_audio():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add an audio clip to the audio track (track_index=1)
    audio_clip = VideoClip(name="audio1", start_frame=0, end_frame=to_frames(20))
    timeline.add_clip(audio_clip, track_index=1)
    # Parse and execute CUT command
    op = parser.parse_command("Cut audio1 at 00:10", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    assert f"Cut operation on audio1 at {to_frames('00:10')} frames" in result.message
    # Check that the audio track now has two clips split at 10s (300 frames)
    audio_clips = timeline.get_track("audio").clips
    assert len(audio_clips) == 2
    assert audio_clips[0].end == to_frames("00:10")
    assert audio_clips[1].start == to_frames("00:10")

def test_execute_join_command_audio():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add two adjacent audio clips to the audio track (track_index=1)
    clip1 = VideoClip(name="audio1", start_frame=0, end_frame=to_frames(10))
    clip2 = VideoClip(name="audio2", start_frame=to_frames(10), end_frame=to_frames(20))
    timeline.add_clip(clip1, track_index=1)
    timeline.add_clip(clip2, track_index=1)
    # Parse and execute JOIN command
    op = parser.parse_command("Join audio1 and audio2 with a crossfade")
    result = executor.execute(op)
    assert result.success
    assert "Joined audio1 and audio2" in result.message
    assert "crossfade" in result.message
    # Check that the audio track now has one joined clip
    audio_clips = timeline.get_track("audio").clips
    assert len(audio_clips) == 1
    joined_clip = audio_clips[0]
    assert joined_clip.name == "audio1_joined_audio2"
    assert joined_clip.start == 0
    assert joined_clip.end == to_frames(20)

def test_execute_join_command_effect():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add two adjacent effect clips to the effect track (track_index=3)
    clip1 = VideoClip(name="effect1", start_frame=0, end_frame=to_frames(5))
    clip2 = VideoClip(name="effect2", start_frame=to_frames(5), end_frame=to_frames(10))
    timeline.add_clip(clip1, track_index=3)
    timeline.add_clip(clip2, track_index=3)
    # Parse and execute JOIN command
    op = parser.parse_command("Join effect1 and effect2 with a wipe")
    result = executor.execute(op)
    assert result.success
    assert "Joined effect1 and effect2" in result.message
    assert "wipe" in result.message
    # Check that the effect track now has one joined clip
    effect_clips = timeline.get_track("effect").clips
    assert len(effect_clips) == 1
    joined_clip = effect_clips[0]
    assert joined_clip.name == "effect1_joined_effect2"
    assert joined_clip.start == 0
    assert joined_clip.end == to_frames(10)

def test_execute_group_cut_command_video():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add multiple video clips
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(60))
    clip2 = VideoClip(name="clip2", start_frame=to_frames(60), end_frame=to_frames(120))
    timeline.add_clip(clip1, track_index=0)
    timeline.add_clip(clip2, track_index=0)
    # Parse and execute group CUT command
    op = parser.parse_command("Cut all clips at 00:30", timeline.frame_rate)
    result = executor.execute(op)
    print("DEBUG group cut video:", result.message)
    assert result.success
    assert "Group CUT" in result.message
    # Only the first clip should be cut at 00:30 (900 frames)
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 3
    assert video_clips[0].name == "clip1_part1"
    assert video_clips[0].start == 0
    assert video_clips[0].end == to_frames("00:30")
    assert video_clips[1].name == "clip1_part2"
    assert video_clips[1].start == to_frames("00:30")
    assert video_clips[1].end == to_frames(60)
    assert video_clips[2].name == "clip2"
    assert video_clips[2].start == to_frames(60)
    assert video_clips[2].end == to_frames(120)

def test_execute_group_cut_command_audio():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add multiple audio clips
    audio1 = VideoClip(name="audio1", start_frame=0, end_frame=to_frames(20))
    audio2 = VideoClip(name="audio2", start_frame=to_frames(20), end_frame=to_frames(40))
    timeline.add_clip(audio1, track_index=1)
    timeline.add_clip(audio2, track_index=1)
    # Parse and execute group CUT command
    op = parser.parse_command("Cut all audio clips at 00:10", timeline.frame_rate)
    result = executor.execute(op)
    print("DEBUG group cut audio:", result.message)
    assert result.success
    assert "Group CUT" in result.message
    # Only the first audio clip should be cut at 00:10 (300 frames)
    audio_clips = timeline.get_track("audio").clips
    assert len(audio_clips) == 3
    assert audio_clips[0].name == "audio1_part1"
    assert audio_clips[0].start == 0
    assert audio_clips[0].end == to_frames("00:10")
    assert audio_clips[1].name == "audio1_part2"
    assert audio_clips[1].start == to_frames("00:10")
    assert audio_clips[1].end == to_frames(20)
    assert audio_clips[2].name == "audio2"
    assert audio_clips[2].start == to_frames(20)
    assert audio_clips[2].end == to_frames(40)

def test_execute_cut_last_clip():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add two clips
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(20))
    clip2 = VideoClip(name="clip2", start_frame=to_frames(20), end_frame=to_frames(40))
    timeline.add_clip(clip1, track_index=0)
    timeline.add_clip(clip2, track_index=0)
    # Cut the last clip at 00:30 (should cut clip2 at 30s)
    op = parser.parse_command("Cut the last clip at 00:30", timeline.frame_rate)
    result = executor.execute(op)
    print("DEBUG cut last clip:", result.message)
    assert result.success
    video_clips = timeline.get_track("video").clips
    # clip2 should be split at 30s (900 frames)
    assert video_clips[1].name == "clip2_part1"
    assert video_clips[1].end == to_frames("00:30")
    assert video_clips[2].name == "clip2_part2"
    assert video_clips[2].start == to_frames("00:30")
    assert video_clips[2].end == to_frames(40)

def test_execute_trim_first_clip():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add two clips
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(20))
    clip2 = VideoClip(name="clip2", start_frame=to_frames(20), end_frame=to_frames(40))
    timeline.add_clip(clip1, track_index=0)
    timeline.add_clip(clip2, track_index=0)
    # Trim the first clip to 00:10 (should trim clip1 at 10s)
    op = parser.parse_command("Trim the first clip to 00:10", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    video_clips = timeline.get_track("video").clips
    # clip1 should be split at 10s (300 frames)
    assert video_clips[0].name == "clip1_part1"
    assert video_clips[0].end == to_frames("00:10")
    assert video_clips[1].name == "clip1_part2"
    assert video_clips[1].start == to_frames("00:10")
    assert video_clips[1].end == to_frames(20)

def test_execute_cut_clip_named():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add two clips, one named Intro
    clip1 = VideoClip(name="Intro", start_frame=0, end_frame=to_frames(20))
    clip2 = VideoClip(name="clip2", start_frame=to_frames(20), end_frame=to_frames(40))
    timeline.add_clip(clip1, track_index=0)
    timeline.add_clip(clip2, track_index=0)
    # Cut clip named Intro at 00:05
    op = parser.parse_command("Cut clip named Intro at 00:05", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    video_clips = timeline.get_track("video").clips
    # Intro should be split at 5s (150 frames)
    assert video_clips[0].name == "Intro_part1"
    assert video_clips[0].end == to_frames("00:05")
    assert video_clips[1].name == "Intro_part2"
    assert video_clips[1].start == to_frames("00:05")
    assert video_clips[1].end == to_frames(20)

def test_execute_cut_second_clip():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add three clips
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(10))
    clip2 = VideoClip(name="clip2", start_frame=to_frames(10), end_frame=to_frames(20))
    clip3 = VideoClip(name="clip3", start_frame=to_frames(20), end_frame=to_frames(30))
    timeline.add_clip(clip1, track_index=0)
    timeline.add_clip(clip2, track_index=0)
    timeline.add_clip(clip3, track_index=0)
    # Cut the second clip at 00:15 (should cut clip2 at 15s)
    op = parser.parse_command("Cut the second clip at 00:15", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    video_clips = timeline.get_track("video").clips
    # clip2 should be split at 15s (450 frames)
    assert video_clips[1].name == "clip2_part1"
    assert video_clips[1].end == to_frames("00:15")
    assert video_clips[2].name == "clip2_part2"
    assert video_clips[2].start == to_frames("00:15")
    assert video_clips[2].end == to_frames(20)

def test_execute_trim_third_audio_clip():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add three audio clips
    audio1 = VideoClip(name="audio1", start_frame=0, end_frame=to_frames(5))
    audio2 = VideoClip(name="audio2", start_frame=to_frames(5), end_frame=to_frames(10))
    audio3 = VideoClip(name="audio3", start_frame=to_frames(10), end_frame=to_frames(15))
    timeline.add_clip(audio1, track_index=1)
    timeline.add_clip(audio2, track_index=1)
    timeline.add_clip(audio3, track_index=1)
    # Trim the third audio clip to 00:12 (should trim audio3 at 12s)
    op = parser.parse_command("Trim the third audio clip to 00:12", timeline.frame_rate)
    result = executor.execute(op)
    print("DEBUG trim third audio clip:", result.message)
    assert result.success
    audio_clips = timeline.get_track("audio").clips
    # audio3 should be split at 12s (360 frames)
    assert audio_clips[2].name == "audio3_part1"
    assert audio_clips[2].end == to_frames("00:12")
    assert audio_clips[3].name == "audio3_part2"
    assert audio_clips[3].start == to_frames("00:12")
    assert audio_clips[3].end == to_frames(15)

def test_execute_cut_4th_subtitle_clip():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add four subtitle clips
    sub1 = VideoClip(name="sub1", start_frame=0, end_frame=to_frames(2))
    sub2 = VideoClip(name="sub2", start_frame=to_frames(2), end_frame=to_frames(4))
    sub3 = VideoClip(name="sub3", start_frame=to_frames(4), end_frame=to_frames(6))
    sub4 = VideoClip(name="sub4", start_frame=to_frames(6), end_frame=to_frames(8))
    timeline.add_clip(sub1, track_index=2)
    timeline.add_clip(sub2, track_index=2)
    timeline.add_clip(sub3, track_index=2)
    timeline.add_clip(sub4, track_index=2)
    # Cut the 4th subtitle clip at 00:07 (should cut sub4 at 7s)
    op = parser.parse_command("Cut the 4th subtitle clip at 00:07", timeline.frame_rate)
    result = executor.execute(op)
    print("DEBUG cut 4th subtitle clip:", result.message)
    assert result.success
    subtitle_clips = timeline.get_track("subtitle").clips
    # sub4 should be split at 7s (210 frames)
    assert subtitle_clips[3].name == "sub4_part1"
    assert subtitle_clips[3].end == to_frames("00:07")
    assert subtitle_clips[4].name == "sub4_part2"
    assert subtitle_clips[4].start == to_frames("00:07")
    assert subtitle_clips[4].end == to_frames(8)

def test_command_history_and_undo_redo():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add a clip and execute a cut
    clip = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(60))
    timeline.add_clip(clip, track_index=0)
    op1 = parser.parse_command("Cut clip1 at 00:30", timeline.frame_rate)
    result1 = executor.execute(op1, command_text="Cut clip1 at 00:30")
    assert result1.success
    # Check history entry
    history = executor.command_history.entries
    assert len(history) == 1
    entry1 = history[0]
    assert entry1.command_text == "Cut clip1 at 00:30"
    assert entry1.operation.type == "CUT"
    assert entry1.result.success
    # Execute a join command
    op2 = parser.parse_command("Join clip1_part1 and clip1_part2")
    result2 = executor.execute(op2, command_text="Join clip1_part1 and clip1_part2")
    assert result2.success
    assert len(executor.command_history.entries) == 2
    # Undo the join
    snapshot = executor.command_history.undo()
    assert len(executor.command_history.entries) == 1
    # Restore timeline to snapshot
    executor.timeline = copy.deepcopy(snapshot)
    # Check that timeline has two clips again
    video_clips = executor.timeline.get_track("video").clips
    assert len(video_clips) == 2
    # Redo the join
    snapshot2 = executor.command_history.redo()
    assert len(executor.command_history.entries) == 2
    executor.timeline = copy.deepcopy(snapshot2)
    video_clips2 = executor.timeline.get_track("video").clips
    assert len(video_clips2) == 1
    assert video_clips2[0].name == "clip1_part1_joined_clip1_part2"

def test_command_history_save_to_file(tmp_path):
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add a clip and execute a cut
    clip = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(60))
    timeline.add_clip(clip, track_index=0)
    op1 = parser.parse_command("Cut clip1 at 00:30", timeline.frame_rate)
    result1 = executor.execute(op1, command_text="Cut clip1 at 00:30")
    # Execute a join command
    op2 = parser.parse_command("Join clip1_part1 and clip1_part2")
    result2 = executor.execute(op2, command_text="Join clip1_part1 and clip1_part2")
    # Save history to file
    history_file = tmp_path / "history.json"
    executor.command_history.save_to_file(str(history_file))
    # Read and check file contents
    import json
    with open(history_file) as f:
        data = json.load(f)
    assert "entries" in data
    assert len(data["entries"]) == 2
    entry0 = data["entries"][0]
    assert entry0["command_text"] == "Cut clip1 at 00:30"
    assert "before_snapshot" in entry0
    assert "after_snapshot" in entry0
    assert "operation" in entry0
    assert "result" in entry0

def test_command_history_load_from_file(tmp_path):
    from app.timeline import Timeline
    from app.command_executor import CommandHistory
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    # Add a clip and execute a cut
    clip = VideoClip(name="clip1", start_frame=0, end_frame=to_frames(60))
    timeline.add_clip(clip, track_index=0)
    op1 = parser.parse_command("Cut clip1 at 00:30", timeline.frame_rate)
    result1 = executor.execute(op1, command_text="Cut clip1 at 00:30")
    # Execute a join command
    op2 = parser.parse_command("Join clip1_part1 and clip1_part2")
    result2 = executor.execute(op2, command_text="Join clip1_part1 and clip1_part2")
    # Save history to file
    history_file = tmp_path / "history.json"
    executor.command_history.save_to_file(str(history_file))
    # Load history from file
    loaded_history = CommandHistory.load_from_file(str(history_file), Timeline)
    assert len(loaded_history.entries) == 2
    # Check that the loaded history matches the original
    entry0 = loaded_history.entries[0]
    assert entry0.command_text == "Cut clip1 at 00:30"
    # Check that the timeline snapshot is correct (should have one clip before cut)
    before_clips = entry0.before_snapshot.get_track("video").clips
    assert len(before_clips) == 1
    # After snapshot should have two clips after cut
    after_clips = entry0.after_snapshot.get_track("video").clips
    assert len(after_clips) == 2
    # Check that the join command's after snapshot has one joined clip
    entry1 = loaded_history.entries[1]
    after_clips2 = entry1.after_snapshot.get_track("video").clips
    assert len(after_clips2) == 1
    assert after_clips2[0].name == "clip1_part1_joined_clip1_part2"

def test_cut_trim_start():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    clip = VideoClip(name="clip_trim_start", start_frame=0, end_frame=to_frames(30))
    timeline.add_clip(clip, track_index=0)
    op = parser.parse_command("Cut out the first 10 seconds of clip_trim_start", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 1
    assert video_clips[0].start == to_frames(10)
    assert video_clips[0].end == to_frames(30)


def test_cut_trim_end():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    clip = VideoClip(name="clip_trim_end", start_frame=0, end_frame=to_frames(30))
    timeline.add_clip(clip, track_index=0)
    op = parser.parse_command("Cut out the last 10 seconds of clip_trim_end", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 1
    assert video_clips[0].start == 0
    assert video_clips[0].end == to_frames(20)


def test_cut_middle_gap():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    clip = VideoClip(name="clip_gap", start_frame=0, end_frame=to_frames(30))
    timeline.add_clip(clip, track_index=0)
    op = parser.parse_command("Cut from 10 to 20 seconds of clip_gap", timeline.frame_rate)
    result = executor.execute(op)
    assert result.success
    video_clips = timeline.get_track("video").clips
    assert len(video_clips) == 2
    # First part
    assert video_clips[0].name.startswith("clip_gap_part1")
    assert video_clips[0].start == 0
    assert video_clips[0].end == to_frames(10)
    # Second part
    assert video_clips[1].name.startswith("clip_gap_part2")
    assert video_clips[1].start == to_frames(20)
    assert video_clips[1].end == to_frames(30)


def test_cut_invalid_range():
    parser = CommandParser()
    timeline = Timeline(frame_rate=FRAME_RATE)
    executor = CommandExecutor(timeline)
    clip = VideoClip(name="clip_invalid", start_frame=0, end_frame=to_frames(30))
    timeline.add_clip(clip, track_index=0)
    # Try to cut a segment outside the clip's range
    op = parser.parse_command("Cut from 40 to 50 seconds of clip_invalid", timeline.frame_rate)
    result = executor.execute(op)
    assert not result.success
    assert "Invalid cut/trim range" in result.message
