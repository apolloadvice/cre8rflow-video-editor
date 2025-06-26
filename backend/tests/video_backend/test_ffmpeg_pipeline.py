import pytest
from app.video_backend.ffmpeg_pipeline import FFMpegPipeline
from app.timeline import Timeline, Track, VideoClip, CompoundClip, Transition, Effect
import subprocess
import os

def has_subsequence(lst, subseq):
    """Return True if subseq appears in lst in order."""
    n, m = len(lst), len(subseq)
    for i in range(n - m + 1):
        if lst[i:i + m] == subseq:
            return True
    return False

def test_initialization():
    """
    Test that FFMpegPipeline initializes with or without a timeline.
    """
    pipeline = FFMpegPipeline()
    assert pipeline.timeline is None
    timeline = Timeline()
    pipeline2 = FFMpegPipeline(timeline)
    assert pipeline2.timeline is timeline

def test_set_timeline():
    """
    Test setting the timeline after initialization.
    """
    pipeline = FFMpegPipeline()
    timeline = Timeline()
    pipeline.set_timeline(timeline)
    assert pipeline.timeline is timeline

def test_render_export(monkeypatch, tmp_path):
    """
    Test that render_export runs ffmpeg successfully (mocked).
    """
    timeline, video_path, audio_path = make_simple_timeline(tmp_path)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    def mock_run(*args, **kwargs):
        # The export path is the last argument in the ffmpeg command list
        cmd = args[0]
        out_path = cmd[-1]
        with open(out_path, "wb") as f:
            f.write(b"\x00")
        class Result:
            stdout = "ffmpeg output"
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", mock_run)
    # Should not raise
    pipeline.render_export(export_path)
    assert os.path.exists(export_path)

def test_render_export_failure(monkeypatch):
    """
    Test that render_export raises RuntimeError if ffmpeg fails (mocked).
    """
    timeline = Timeline()
    file_path = "/mock/path/to/video.mp4"
    timeline.load_video(file_path)
    pipeline = FFMpegPipeline(timeline)

    def mock_run(cmd, shell, check, capture_output, text):
        raise subprocess.CalledProcessError(1, cmd, output="", stderr="ffmpeg error")
    monkeypatch.setattr(subprocess, "run", mock_run)
    with pytest.raises(RuntimeError) as excinfo:
        pipeline.render_export("/mock/output.mp4")
    assert "ffmpeg failed" in str(excinfo.value)

def test_render_preview_success(monkeypatch):
    """
    Test that render_preview runs ffmpeg with preview options (mocked).
    """
    timeline = Timeline()
    file_path = "/mock/path/to/video.mp4"
    timeline.load_video(file_path)
    pipeline = FFMpegPipeline(timeline)
    captured = {}
    def mock_run(*args, **kwargs):
        captured['cmd'] = args[0]
        class Result:
            stdout = "ffmpeg output"
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", mock_run)
    pipeline.render_preview("/mock/preview.mp4")
    # Check that preview options are in the command
    assert "scale=320:180" in captured['cmd']
    assert "ultrafast" in captured['cmd']
    assert "libx264" in captured['cmd']


def test_render_preview_failure(monkeypatch):
    """
    Test that render_preview raises RuntimeError if ffmpeg fails (mocked).
    """
    timeline = Timeline()
    file_path = "/mock/path/to/video.mp4"
    timeline.load_video(file_path)
    pipeline = FFMpegPipeline(timeline)
    def mock_run(*args, **kwargs):
        raise subprocess.CalledProcessError(1, args, output="", stderr="ffmpeg error preview")
    monkeypatch.setattr(subprocess, "run", mock_run)
    with pytest.raises(RuntimeError) as excinfo:
        pipeline.render_preview("/mock/preview.mp4")
    assert "ffmpeg preview failed" in str(excinfo.value)

def test_load_video_sets_file_path():
    """
    Test that Timeline.load_video sets the file_path attribute on the created VideoClip.
    """
    timeline = Timeline()
    file_path = "/mock/path/to/video.mp4"
    clip = timeline.load_video(file_path)
    assert isinstance(clip, VideoClip)
    assert clip.file_path == file_path
    # Check that the clip is in the timeline's first video track
    video_clips = [c for c in timeline.tracks[0].clips if isinstance(c, VideoClip)]
    assert clip in video_clips 

def test_get_all_clips_expected_use():
    """
    Test get_all_clips returns all video clips in timeline order.
    """
    timeline = Timeline()
    paths = [f"/mock/path/clip{i}.mp4" for i in range(3)]
    clips = [timeline.load_video(p) for p in paths]
    result = timeline.get_all_clips()
    assert result == clips
    for c, p in zip(result, paths):
        assert c.file_path == p


def test_get_all_clips_with_compound_clip():
    """
    Test get_all_clips returns clips inside a nested CompoundClip.
    """
    timeline = Timeline()
    c1 = timeline.load_video("/mock/path/clip1.mp4")
    c2 = VideoClip(name="nested", start_frame=60, end_frame=120, file_path="/mock/path/clip2.mp4")
    compound = CompoundClip(name="group", start_frame=60, end_frame=120, clips=[c2])
    timeline.tracks[0].add_clip(compound)
    result = timeline.get_all_clips()
    assert c1 in result
    assert c2 in result


def test_get_all_clips_missing_file_path():
    """
    Test get_all_clips raises AttributeError if a clip is missing file_path or has file_path=None or ''.
    """
    timeline = Timeline()
    # Case 1: file_path is None
    bad_clip_none = VideoClip(name="bad_none", start_frame=0, end_frame=60, file_path=None)
    timeline.tracks[0].add_clip(bad_clip_none)
    with pytest.raises(AttributeError):
        timeline.get_all_clips()
    # Remove the bad clip for next case
    timeline.tracks[0].clips.clear()
    # Case 2: file_path is empty string
    bad_clip_empty = VideoClip(name="bad_empty", start_frame=0, end_frame=60, file_path="")
    timeline.tracks[0].add_clip(bad_clip_empty)
    with pytest.raises(AttributeError):
        timeline.get_all_clips() 

def test_generate_ffmpeg_command_video_audio(tmp_path):
    """
    Test ffmpeg command generation for video + audio tracks.
    """
    timeline = Timeline()
    video_path = tmp_path / "video.mp4"
    audio_path = tmp_path / "audio.mp3"
    video_path.write_text("")
    audio_path.write_text("")
    timeline.load_video(str(video_path))
    # Add audio clip manually
    audio_clip = VideoClip(name="audio", start_frame=0, end_frame=60, file_path=str(audio_path), track_type="audio")
    timeline.tracks[1].add_clip(audio_clip)
    pipeline = FFMpegPipeline(timeline)
    cmd = pipeline.generate_ffmpeg_command("output.mp4")
    assert has_subsequence(cmd, ["-f", "concat", "-safe", "0", "-i", "video_file_list.txt"])
    assert has_subsequence(cmd, ["-f", "concat", "-safe", "0", "-i", "audio_file_list.txt"])
    assert has_subsequence(cmd, ["-map", "0:v:0"])
    assert has_subsequence(cmd, ["-map", "1:a:0"])
    assert has_subsequence(cmd, ["-c:v", "copy"])
    assert has_subsequence(cmd, ["-c:a", "aac"])


def test_generate_ffmpeg_command_video_audio_subtitle(tmp_path):
    """
    Test ffmpeg command generation for video + audio + subtitle tracks.
    """
    timeline = Timeline()
    video_path = tmp_path / "video.mp4"
    audio_path = tmp_path / "audio.mp3"
    sub_path = tmp_path / "sub.srt"
    video_path.write_text("")
    audio_path.write_text("")
    sub_path.write_text("")
    timeline.load_video(str(video_path))
    audio_clip = VideoClip(name="audio", start_frame=0, end_frame=60, file_path=str(audio_path), track_type="audio")
    timeline.tracks[1].add_clip(audio_clip)
    # Add subtitle clip manually
    sub_clip = VideoClip(name="sub", start_frame=0, end_frame=60, file_path=str(sub_path), track_type="subtitle")
    timeline.tracks[2].add_clip(sub_clip)
    pipeline = FFMpegPipeline(timeline)
    cmd = pipeline.generate_ffmpeg_command("output.mp4")
    assert has_subsequence(cmd, ["-f", "concat", "-safe", "0", "-i", "video_file_list.txt"])
    assert has_subsequence(cmd, ["-f", "concat", "-safe", "0", "-i", "audio_file_list.txt"])
    assert has_subsequence(cmd, ["-i", str(sub_path)])
    assert has_subsequence(cmd, ["-map", "0:v:0"])
    assert has_subsequence(cmd, ["-map", "1:a:0"])
    assert has_subsequence(cmd, ["-map", "2:s:0"])
    assert has_subsequence(cmd, ["-c:s", "mov_text"])


def test_generate_ffmpeg_command_unsupported_audio(tmp_path):
    """
    Test that unsupported audio file extension raises ValueError.
    """
    timeline = Timeline()
    video_path = tmp_path / "video.mp4"
    bad_audio_path = tmp_path / "audio.xyz"
    video_path.write_text("")
    bad_audio_path.write_text("")
    timeline.load_video(str(video_path))
    bad_audio_clip = VideoClip(name="bad_audio", start_frame=0, end_frame=60, file_path=str(bad_audio_path), track_type="audio")
    timeline.tracks[1].add_clip(bad_audio_clip)
    pipeline = FFMpegPipeline(timeline)
    with pytest.raises(ValueError):
        pipeline.generate_ffmpeg_command("output.mp4")


def test_generate_ffmpeg_command_unsupported_subtitle(tmp_path):
    """
    Test that unsupported subtitle file extension raises ValueError.
    """
    timeline = Timeline()
    video_path = tmp_path / "video.mp4"
    bad_sub_path = tmp_path / "sub.xyz"
    video_path.write_text("")
    bad_sub_path.write_text("")
    timeline.load_video(str(video_path))
    bad_sub_clip = VideoClip(name="bad_sub", start_frame=0, end_frame=60, file_path=str(bad_sub_path), track_type="subtitle")
    timeline.tracks[2].add_clip(bad_sub_clip)
    pipeline = FFMpegPipeline(timeline)
    with pytest.raises(ValueError):
        pipeline.generate_ffmpeg_command("output.mp4") 

def make_simple_timeline(tmp_path):
    timeline = Timeline()
    video_path = str(tmp_path / "video1.mp4")
    audio_path = str(tmp_path / "audio1.mp3")
    with open(video_path, "wb") as f:
        f.write(b"\x00")
    with open(audio_path, "wb") as f:
        f.write(b"\x00")
    video_clip = VideoClip(name="video1", start_frame=0, end_frame=60, file_path=video_path, track_type="video")
    audio_clip = VideoClip(name="audio1", start_frame=0, end_frame=60, file_path=audio_path, track_type="audio")
    video_track = Track(name="Video 1", track_type="video")
    audio_track = Track(name="Audio 1", track_type="audio")
    video_track.add_clip(video_clip)
    audio_track.add_clip(audio_clip)
    timeline.tracks = [video_track, audio_track]
    return timeline, video_path, audio_path

def test_generate_ffmpeg_command_valid(tmp_path):
    timeline, video_path, audio_path = make_simple_timeline(tmp_path)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    cmd = pipeline.generate_ffmpeg_command(export_path)
    assert isinstance(cmd, list)
    assert "ffmpeg" in cmd[0]
    assert export_path in cmd
    assert has_subsequence(cmd, ["-f", "concat", "-safe", "0", "-i", "video_file_list.txt"])
    assert has_subsequence(cmd, ["-f", "concat", "-safe", "0", "-i", "audio_file_list.txt"])

def test_generate_ffmpeg_command_unsupported_ext(tmp_path):
    timeline = Timeline()
    bad_video = str(tmp_path / "bad.unknown")
    with open(bad_video, "wb") as f:
        f.write(b"\x00")
    video_clip = VideoClip(name="bad", start_frame=0, end_frame=60, file_path=bad_video, track_type="video")
    video_track = Track(name="Video 1", track_type="video")
    video_track.add_clip(video_clip)
    timeline.tracks = [video_track]
    pipeline = FFMpegPipeline(timeline)
    with pytest.raises(ValueError):
        pipeline.generate_ffmpeg_command(str(tmp_path / "out.mp4"))

def test_generate_ffmpeg_command_no_timeline():
    pipeline = FFMpegPipeline()
    with pytest.raises(ValueError):
        pipeline.generate_ffmpeg_command("out.mp4")

def test_render_export_success(monkeypatch, tmp_path):
    timeline, video_path, audio_path = make_simple_timeline(tmp_path)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    def fake_run(*args, **kwargs):
        with open(export_path, "wb") as f:
            f.write(b"\x00")
        class Result:
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", fake_run)
    pipeline.render_export(export_path)
    assert os.path.exists(export_path)

def test_render_export_failure(monkeypatch, tmp_path):
    timeline, video_path, audio_path = make_simple_timeline(tmp_path)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    def fake_run(*args, **kwargs):
        raise subprocess.CalledProcessError(1, args, stderr="ffmpeg error")
    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(RuntimeError) as exc:
        pipeline.render_export(export_path)
    assert "ffmpeg export failed" in str(exc.value)

def test_render_export_no_output(monkeypatch, tmp_path):
    timeline, video_path, audio_path = make_simple_timeline(tmp_path)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    def fake_run(*args, **kwargs):
        class Result:
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(RuntimeError) as exc:
        pipeline.render_export(export_path)
    assert "output file" in str(exc.value)

def test_generate_ffmpeg_command_unsupported_audio(tmp_path):
    timeline = Timeline()
    video_path = str(tmp_path / "video.mp4")
    bad_audio_path = str(tmp_path / "audio.xyz")
    with open(video_path, "wb") as f:
        f.write(b"\x00")
    with open(bad_audio_path, "wb") as f:
        f.write(b"\x00")
    video_clip = VideoClip(name="video", start_frame=0, end_frame=60, file_path=video_path, track_type="video")
    bad_audio_clip = VideoClip(name="bad_audio", start_frame=0, end_frame=60, file_path=bad_audio_path, track_type="audio")
    video_track = Track(name="Video 1", track_type="video")
    audio_track = Track(name="Audio 1", track_type="audio")
    video_track.add_clip(video_clip)
    audio_track.add_clip(bad_audio_clip)
    timeline.tracks = [video_track, audio_track]
    pipeline = FFMpegPipeline(timeline)
    with pytest.raises(ValueError):
        pipeline.generate_ffmpeg_command(str(tmp_path / "out.mp4"))

def test_generate_ffmpeg_command_unsupported_subtitle(tmp_path):
    timeline = Timeline()
    video_path = str(tmp_path / "video.mp4")
    bad_sub_path = str(tmp_path / "sub.xyz")
    with open(video_path, "wb") as f:
        f.write(b"\x00")
    with open(bad_sub_path, "wb") as f:
        f.write(b"\x00")
    video_clip = VideoClip(name="video", start_frame=0, end_frame=60, file_path=video_path, track_type="video")
    bad_sub_clip = VideoClip(name="bad_sub", start_frame=0, end_frame=60, file_path=bad_sub_path, track_type="subtitle")
    video_track = Track(name="Video 1", track_type="video")
    subtitle_track = Track(name="Subtitles", track_type="subtitle")
    video_track.add_clip(video_clip)
    subtitle_track.add_clip(bad_sub_clip)
    timeline.tracks = [video_track, subtitle_track]
    pipeline = FFMpegPipeline(timeline)
    with pytest.raises(ValueError):
        pipeline.generate_ffmpeg_command(str(tmp_path / "out.mp4"))

def test_render_export_crossfade_transition(monkeypatch, tmp_path):
    """
    Test that render_export generates the correct ffmpeg command for a crossfade transition between two video clips.
    """
    # Create two video files
    video_path1 = tmp_path / "video1.mp4"
    video_path2 = tmp_path / "video2.mp4"
    video_path1.write_text("")
    video_path2.write_text("")
    # Create timeline and add two video clips
    timeline = Timeline()
    clip1 = VideoClip(name="clip1", start_frame=0, end_frame=90, file_path=str(video_path1))
    clip2 = VideoClip(name="clip2", start_frame=90, end_frame=180, file_path=str(video_path2))
    timeline.tracks[0].add_clip(clip1)
    timeline.tracks[0].add_clip(clip2)
    # Add a crossfade transition (duration 1s)
    transition = Transition(from_clip="clip1", to_clip="clip2", transition_type="crossfade", duration=1.0)
    timeline.transitions = [transition]
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    captured = {}
    def mock_run(cmd, *args, **kwargs):
        captured['cmd'] = cmd
        # Simulate output file creation
        with open(export_path, "wb") as f:
            f.write(b"\x00")
        class Result:
            stdout = "ffmpeg output"
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", mock_run)
    pipeline.render_export(export_path)
    # Check that the command uses -filter_complex and xfade
    assert "-filter_complex" in captured['cmd']
    filter_idx = captured['cmd'].index("-filter_complex")
    filtergraph = captured['cmd'][filter_idx + 1]
    assert "xfade" in filtergraph
    assert str(video_path1) in captured['cmd']
    assert str(video_path2) in captured['cmd']
    assert "-map" in captured['cmd']
    map_idx = captured['cmd'].index("-map")
    assert captured['cmd'][map_idx + 1] == "[vout]"
    assert os.path.exists(export_path)

def test_render_export_brightness_effect(monkeypatch, tmp_path):
    """
    Test that render_export generates the correct ffmpeg command for a brightness effect on a single video clip.
    """
    # Create a video file
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip with a brightness effect
    timeline = Timeline()
    clip = VideoClip(name="clip1", start_frame=0, end_frame=90, file_path=str(video_path))
    brightness_effect = Effect(effect_type="brightness", params={"value": 0.5})
    clip.effects = [brightness_effect]
    timeline.tracks[0].add_clip(clip)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    captured = {}
    def mock_run(cmd, *args, **kwargs):
        captured['cmd'] = cmd
        # Simulate output file creation
        with open(export_path, "wb") as f:
            f.write(b"\x00")
        class Result:
            stdout = "ffmpeg output"
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", mock_run)
    pipeline.render_export(export_path)
    # Check that the command uses -vf and eq=brightness=0.5
    assert "-vf" in captured['cmd']
    vf_idx = captured['cmd'].index("-vf")
    vf_arg = captured['cmd'][vf_idx + 1]
    assert "eq=brightness=0.5" in vf_arg
    assert str(video_path) in captured['cmd']
    assert os.path.exists(export_path)

def test_render_export_text_overlay_effect(monkeypatch, tmp_path):
    """
    Test that render_export generates the correct ffmpeg command for a text overlay effect on a single video clip.
    """
    from app.timeline import Effect
    # Create a video file
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip with a text effect
    timeline = Timeline()
    clip = VideoClip(name="clip1", start_frame=0, end_frame=90, file_path=str(video_path))
    text_effect = Effect(effect_type="text", params={"text": "Hello World", "x": 10, "y": 20, "fontsize": 32, "fontcolor": "yellow"})
    clip.effects = [text_effect]
    timeline.tracks[0].add_clip(clip)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    captured = {}
    def mock_run(cmd, *args, **kwargs):
        captured['cmd'] = cmd
        # Simulate output file creation
        with open(export_path, "wb") as f:
            f.write(b"\x00")
        class Result:
            stdout = "ffmpeg output"
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", mock_run)
    pipeline.render_export(export_path)
    # Check that the command uses -vf and drawtext with the correct parameters
    assert "-vf" in captured['cmd']
    vf_idx = captured['cmd'].index("-vf")
    vf_arg = captured['cmd'][vf_idx + 1]
    assert "drawtext" in vf_arg
    assert "text='Hello World'" in vf_arg
    assert "x=10" in vf_arg
    assert "y=20" in vf_arg
    assert "fontsize=32" in vf_arg
    assert "fontcolor=yellow" in vf_arg
    assert str(video_path) in captured['cmd']
    assert os.path.exists(export_path)

def test_register_custom_transition_handler(tmp_path):
    """
    Test that a custom transition handler can be registered and used by FFMpegPipeline.
    """
    from app.timeline import Transition
    # Define a custom handler for 'wipe' transitions
    def wipe_handler(transition, video_clips, timeline):
        return "[0:v][1:v]xfade=transition=wipe:duration=2:offset=1,format=yuv420p[vout]"
    # Register the custom handler
    from app.video_backend.ffmpeg_pipeline import FFMpegPipeline
    FFMpegPipeline.register_transition_handler('wipe', wipe_handler)
    # Create two video files
    video_path1 = tmp_path / "video1.mp4"
    video_path2 = tmp_path / "video2.mp4"
    video_path1.write_text("")
    video_path2.write_text("")
    # Create timeline and add two video clips
    timeline = Timeline()
    clip1 = timeline.load_video(str(video_path1))
    clip2 = timeline.load_video(str(video_path2))
    # Add a 'wipe' transition
    transition = Transition(from_clip=clip1.name, to_clip=clip2.name, transition_type="wipe", duration=2.0)
    timeline.transitions = [transition]
    pipeline = FFMpegPipeline(timeline)
    cmd = pipeline.generate_ffmpeg_command("output.mp4")
    # Assert that the custom filtergraph is used
    assert "-filter_complex" in cmd
    idx = cmd.index("-filter_complex")
    filtergraph = cmd[idx + 1]
    assert "xfade=transition=wipe" in filtergraph
    assert "duration=2" in filtergraph
    assert "offset=1" in filtergraph
    assert str(video_path1) in cmd
    assert str(video_path2) in cmd
    assert "-map" in cmd
    map_idx = cmd.index("-map")
    assert cmd[map_idx + 1] == "[vout]"
    # Do not check for output file existence; this test only checks command generation 

def test_render_export_timeline_effect(monkeypatch, tmp_path):
    """
    Test that render_export generates the correct ffmpeg command for a timeline/range-based effect in the Effects track.
    """
    # Create a video file
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip (no per-clip effects)
    timeline = Timeline()
    clip = VideoClip(name="clip1", start_frame=0, end_frame=90, file_path=str(video_path))
    timeline.tracks[0].add_clip(clip)
    # Add a global brightness effect to the Effects track
    brightness_effect = Effect(effect_type="brightness", params={"value": 0.7})
    effects_track = [t for t in timeline.tracks if t.track_type == "effect"]
    assert effects_track, "Effects track should exist"
    effects_track[0].clips.append(brightness_effect)
    pipeline = FFMpegPipeline(timeline)
    export_path = str(tmp_path / "out.mp4")
    captured = {}
    def mock_run(cmd, *args, **kwargs):
        captured['cmd'] = cmd
        # Simulate output file creation
        with open(export_path, "wb") as f:
            f.write(b"\x00")
        class Result:
            stdout = "ffmpeg output"
            stderr = ""
        return Result()
    monkeypatch.setattr(subprocess, "run", mock_run)
    pipeline.render_export(export_path)
    # Check that the command uses -vf and eq=brightness=0.7
    assert "-vf" in captured['cmd']
    vf_idx = captured['cmd'].index("-vf")
    vf_arg = captured['cmd'][vf_idx + 1]
    assert "eq=brightness=0.7" in vf_arg
    assert str(video_path) in captured['cmd']
    assert os.path.exists(export_path) 