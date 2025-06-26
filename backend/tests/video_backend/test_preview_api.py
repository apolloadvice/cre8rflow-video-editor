import pytest
from fastapi.testclient import TestClient
from app.backend.main import app
from app.timeline import Timeline, Transition, Effect, VideoClip
from app.video_backend.ffmpeg_pipeline import FFMpegPipeline

client = TestClient(app)

def test_preview_api_valid(monkeypatch, tmp_path):
    """
    Test /api/preview returns 200 and video/mp4 for a valid timeline.
    """
    timeline = Timeline()
    file_path = str(tmp_path / "video.mp4")
    with open(file_path, "w") as f:
        f.write("")
    timeline.load_video(file_path)
    timeline_dict = timeline.to_dict()

    def mock_render_preview(self, preview_path):
        # Create a dummy mp4 file
        with open(preview_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_preview", mock_render_preview)

    response = client.post("/api/preview", json={"timeline": timeline_dict})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")


def test_preview_api_invalid_timeline():
    """
    Test /api/preview returns 400 for invalid timeline input.
    """
    response = client.post("/api/preview", json={"timeline": {"bad": "data"}})
    assert response.status_code == 400
    assert "Invalid timeline" in response.json()["detail"]


def test_preview_api_ffmpeg_failure(monkeypatch, tmp_path):
    """
    Test /api/preview returns 500 if ffmpeg fails (mocked).
    """
    timeline = Timeline()
    file_path = str(tmp_path / "video.mp4")
    with open(file_path, "w") as f:
        f.write("")
    timeline.load_video(file_path)
    timeline_dict = timeline.to_dict()

    def mock_render_preview(self, preview_path):
        raise RuntimeError("ffmpeg error")
    monkeypatch.setattr(FFMpegPipeline, "render_preview", mock_render_preview)

    response = client.post("/api/preview", json={"timeline": timeline_dict})
    assert response.status_code == 500
    assert "Failed to render preview" in response.json()["detail"]


def test_export_api_valid(monkeypatch, tmp_path):
    """
    Test /api/export returns 200 and video/mp4 for a valid timeline.
    """
    timeline = Timeline()
    file_path = str(tmp_path / "video.mp4")
    with open(file_path, "w") as f:
        f.write("")
    timeline.load_video(file_path)
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        # Create a dummy mp4 file
        with open(export_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")


def test_export_api_invalid_timeline():
    """
    Test /api/export returns 400 for invalid timeline input.
    """
    response = client.post("/api/export", json={"timeline": {"bad": "data"}})
    assert response.status_code == 400
    assert "Invalid timeline" in response.json()["detail"]


def test_export_api_ffmpeg_failure(monkeypatch, tmp_path):
    """
    Test /api/export returns 500 if ffmpeg fails (mocked).
    """
    timeline = Timeline()
    file_path = str(tmp_path / "video.mp4")
    with open(file_path, "w") as f:
        f.write("")
    timeline.load_video(file_path)
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        raise RuntimeError("ffmpeg error")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 500
    assert "Failed to export video" in response.json()["detail"]


def test_export_api_crossfade_transition(monkeypatch, tmp_path):
    """
    Test /api/export with a timeline that includes a crossfade transition between two video clips.
    """
    # Create two video files
    video_path1 = tmp_path / "video1.mp4"
    video_path2 = tmp_path / "video2.mp4"
    video_path1.write_text("")
    video_path2.write_text("")
    # Create timeline and add two video clips
    timeline = Timeline()
    clip1 = timeline.load_video(str(video_path1))
    clip2 = timeline.load_video(str(video_path2))
    # Add a crossfade transition
    transition = Transition(from_clip=clip1.name, to_clip=clip2.name, transition_type="crossfade", duration=1.0)
    timeline.transitions = [transition]
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        # Simulate checking for xfade in the filtergraph by checking transitions
        assert self.timeline.transitions
        assert self.timeline.transitions[0].transition_type == "crossfade"
        # Create a dummy mp4 file
        with open(export_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")


def test_export_api_brightness_effect(monkeypatch, tmp_path):
    """
    Test /api/export with a timeline that includes a brightness effect on a video clip.
    """
    # Create a video file
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip with a brightness effect
    timeline = Timeline()
    clip = timeline.load_video(str(video_path))
    brightness_effect = Effect(effect_type="brightness", params={"value": 0.5})
    clip.effects = [brightness_effect]
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        # Simulate checking for brightness effect
        video_clips = self.timeline.get_all_clips(track_type="video")
        assert video_clips[0].effects
        effect = video_clips[0].effects[0]
        assert effect.effect_type == "brightness"
        assert effect.params["value"] == 0.5
        # Create a dummy mp4 file
        with open(export_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")


def test_export_api_text_overlay_effect(monkeypatch, tmp_path):
    """
    Test /api/export with a timeline that includes a text overlay effect on a video clip.
    """
    # Create a video file
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip with a text effect
    timeline = Timeline()
    clip = timeline.load_video(str(video_path))
    text_params = {"text": "Hello World", "x": 10, "y": 20, "fontsize": 32, "fontcolor": "yellow"}
    text_effect = Effect(effect_type="text", params=text_params)
    clip.effects = [text_effect]
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        # Simulate checking for text overlay effect
        video_clips = self.timeline.get_all_clips(track_type="video")
        assert video_clips[0].effects
        effect = video_clips[0].effects[0]
        assert effect.effect_type == "text"
        for k, v in text_params.items():
            assert effect.params[k] == v
        # Create a dummy mp4 file
        with open(export_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")


def test_export_api_empty_timeline():
    """
    Test /api/export with an empty timeline (no clips). Should return 400 with a clear error message.
    """
    timeline = Timeline()  # No clips added
    timeline_dict = timeline.to_dict()
    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 400
    assert "Invalid timeline" in response.json()["detail"]


def test_export_api_missing_file_path():
    """
    Test /api/export with a timeline containing a video clip with a missing file path. Should return 400 with a clear error message.
    """
    timeline = Timeline()
    bad_clip = VideoClip(name="bad", start_frame=0, end_frame=60, file_path=None)
    timeline.tracks[0].add_clip(bad_clip)
    timeline_dict = timeline.to_dict()
    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 400
    assert "Invalid timeline" in response.json()["detail"]


def test_export_api_unsupported_file_type(tmp_path):
    """
    Test /api/export with a timeline containing a video clip with an unsupported file type (.xyz). Should return 400 with a clear error message.
    """
    timeline = Timeline()
    bad_path = str(tmp_path / "bad.xyz")
    with open(bad_path, "w") as f:
        f.write("")
    bad_clip = VideoClip(name="bad", start_frame=0, end_frame=60, file_path=bad_path)
    timeline.tracks[0].add_clip(bad_clip)
    timeline_dict = timeline.to_dict()
    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 400
    assert "Invalid timeline" in response.json()["detail"]


def test_export_api_multiple_transitions(monkeypatch, tmp_path):
    """
    Test /api/export with a timeline containing multiple transitions. Should process without error (only first transition is used).
    """
    from app.timeline import Transition
    # Create three video files
    video_path1 = tmp_path / "video1.mp4"
    video_path2 = tmp_path / "video2.mp4"
    video_path3 = tmp_path / "video3.mp4"
    video_path1.write_text("")
    video_path2.write_text("")
    video_path3.write_text("")
    # Create timeline and add three video clips
    timeline = Timeline()
    clip1 = timeline.load_video(str(video_path1))
    clip2 = timeline.load_video(str(video_path2))
    clip3 = timeline.load_video(str(video_path3))
    # Add two crossfade transitions
    transition1 = Transition(from_clip=clip1.name, to_clip=clip2.name, transition_type="crossfade", duration=1.0)
    transition2 = Transition(from_clip=clip2.name, to_clip=clip3.name, transition_type="crossfade", duration=1.0)
    timeline.transitions = [transition1, transition2]
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        # Simulate checking for multiple transitions
        assert len(self.timeline.transitions) == 2
        assert self.timeline.transitions[0].transition_type == "crossfade"
        assert self.timeline.transitions[1].transition_type == "crossfade"
        # Create a dummy mp4 file
        with open(export_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")


def test_export_api_multiple_effects(monkeypatch, tmp_path):
    """
    Test /api/export with a timeline containing a video clip with multiple effects (brightness and text overlay).
    Should process without error (only one effect is used, but should not error).
    """
    from app.timeline import Effect
    # Create a video file
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip with two effects
    timeline = Timeline()
    clip = timeline.load_video(str(video_path))
    brightness_effect = Effect(effect_type="brightness", params={"value": 0.5})
    text_effect = Effect(effect_type="text", params={"text": "Hello", "x": 10, "y": 20, "fontsize": 24, "fontcolor": "red"})
    clip.effects = [brightness_effect, text_effect]
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        # Simulate checking for multiple effects
        video_clips = self.timeline.get_all_clips(track_type="video")
        assert len(video_clips[0].effects) == 2
        effect_types = {e.effect_type for e in video_clips[0].effects}
        assert "brightness" in effect_types
        assert "text" in effect_types
        # Create a dummy mp4 file
        with open(export_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 200
    assert response.headers["content-type"] == "video/mp4"
    assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")


def test_export_api_quality_parameter(monkeypatch, tmp_path):
    """
    Test /api/export with different quality parameter values ("high", "medium", "low").
    Should pass the correct quality value to the pipeline.
    """
    from app.timeline import Effect
    # Create a video file
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip
    timeline = Timeline()
    clip = timeline.load_video(str(video_path))
    timeline_dict = timeline.to_dict()

    called = {"quality": None}
    def mock_render_export(self, export_path, quality="high"):
        called["quality"] = quality
        # Create a dummy mp4 file
        with open(export_path, "wb") as f:
            f.write(b"\x00\x00\x00\x18ftypmp42")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    for q in ["high", "medium", "low"]:
        called["quality"] = None
        response = client.post(f"/api/export?quality={q}", json={"timeline": timeline_dict})
        assert response.status_code == 200
        assert response.headers["content-type"] == "video/mp4"
        assert response.content.startswith(b"\x00\x00\x00\x18ftypmp42")
        assert called["quality"] == q


def test_export_api_corrupted_file(monkeypatch, tmp_path):
    """
    Test /api/export simulating a corrupted file (ffmpeg failure). Should return 500 with a clear error message.
    """
    # Create a video file (content doesn't matter, will simulate error)
    video_path = tmp_path / "video.mp4"
    video_path.write_text("")
    # Create timeline and add a video clip
    timeline = Timeline()
    clip = timeline.load_video(str(video_path))
    timeline_dict = timeline.to_dict()

    def mock_render_export(self, export_path, quality="high"):
        raise RuntimeError("ffmpeg error: corrupted file")
    monkeypatch.setattr(FFMpegPipeline, "render_export", mock_render_export)

    response = client.post("/api/export", json={"timeline": timeline_dict})
    assert response.status_code == 500
    assert "Failed to export video" in response.json()["detail"]
    assert "corrupted file" in response.json()["detail"]


def test_export_api_invalid_json():
    """
    Test /api/export with invalid JSON payload. Should return 422 or 400 with a clear error message.
    """
    # Send a malformed JSON (not a dict, missing 'timeline' field)
    response = client.post("/api/export", json=[1, 2, 3])
    assert response.status_code in (400, 422)
    # The error message should indicate invalid input (FastAPI/Pydantic default)
    assert "Input should be a valid dictionary or object to extract fields from" in response.text 