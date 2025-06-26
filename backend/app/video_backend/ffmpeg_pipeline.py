import os
from typing import Optional
from app.timeline import Timeline
import subprocess

class FFMpegPipeline:
    """
    Handles conversion of a Timeline object to ffmpeg commands and manages video export/preview rendering.
    """
    # Registry for effect handlers: effect_type -> handler function
    EFFECT_FILTER_REGISTRY = {}
    # Registry for transition handlers: transition_type -> handler function
    TRANSITION_FILTER_REGISTRY = {}

    @classmethod
    def register_effect_handler(cls, effect_type, handler):
        """
        Register a handler function for an effect type.
        Args:
            effect_type (str): The effect type string.
            handler (callable): Function(effect: Effect) -> str (ffmpeg filter string)
        """
        cls.EFFECT_FILTER_REGISTRY[effect_type] = handler

    @classmethod
    def register_transition_handler(cls, transition_type, handler):
        """
        Register a handler function for a transition type.
        Args:
            transition_type (str): The transition type string.
            handler (callable): Function(transition, video_clips, timeline) -> str (ffmpeg filtergraph)
        """
        cls.TRANSITION_FILTER_REGISTRY[transition_type] = handler

    @staticmethod
    def _brightness_filter(effect):
        brightness = effect.params.get('value', 0)
        return f"eq=brightness={brightness}"

    @staticmethod
    def _text_filter(effect):
        text = effect.params.get('text', 'Sample Text')
        x = effect.params.get('x', '(w-text_w)/2')
        y = effect.params.get('y', '(h-text_h)/2')
        fontsize = effect.params.get('fontsize', 24)
        fontcolor = effect.params.get('fontcolor', 'white')
        safe_text = text.replace(':', '\\:').replace("'", "\\'")
        return f"drawtext=text='{safe_text}':x={x}:y={y}:fontsize={fontsize}:fontcolor={fontcolor}"

    @staticmethod
    def _crossfade_transition_filter(transition, video_clips, timeline):
        """
        Handler for crossfade transitions using ffmpeg's xfade filter.
        """
        if len(video_clips) < 2:
            print("[WARN] Not enough video clips for a crossfade transition.")
            return None
        from_clip = next((c for c in video_clips if getattr(c, 'name', None) == transition.from_clip), None)
        to_clip = next((c for c in video_clips if getattr(c, 'name', None) == transition.to_clip), None)
        if not from_clip or not to_clip:
            print("[WARN] Could not find both clips for the transition.")
            return None
        duration = transition.duration
        offset = (from_clip.end / timeline.frame_rate) - duration
        return f"[0:v][1:v]xfade=transition=fade:duration={duration}:offset={offset},format=yuv420p[vout]"

    def __init__(self, timeline: Optional[Timeline] = None):
        """
        Initialize the pipeline with an optional Timeline.

        Args:
            timeline (Optional[Timeline]): The timeline to process.
        """
        self.timeline = timeline

    def set_timeline(self, timeline: Timeline) -> None:
        """
        Set or update the timeline for this pipeline.

        Args:
            timeline (Timeline): The timeline to process.
        """
        self.timeline = timeline

    def _build_transition_filtergraph(self, video_clips, transitions):
        """
        Build the ffmpeg filtergraph string for transitions between video clips.
        Uses a registry for extensibility. Only the first transition is processed.

        Args:
            video_clips (list): List of video clips in timeline order.
            transitions (list): List of Transition objects from the timeline.

        Returns:
            str: The filtergraph string for ffmpeg (or None if not needed).
        """
        if not transitions:
            return None
        if len(transitions) > 1:
            print("[WARN] Multiple transitions are present; only the first will be processed.")
        transition = transitions[0]
        handler = self.TRANSITION_FILTER_REGISTRY.get(getattr(transition, 'transition_type', None))
        if handler:
            return handler(transition, video_clips, self.timeline)
        else:
            print(f"[WARN] No handler registered for transition type '{getattr(transition, 'transition_type', None)}'")
            return None

    def _build_effect_filtergraph(self, video_clips):
        """
        Build the ffmpeg filtergraph string for effects applied to video clips and timeline/range-based effects.
        Uses a registry for extensibility. Supports multiple effects (applied in order).
        Gathers effects from both per-clip and the Effects track (timeline/range-based effects).

        Args:
            video_clips (list): List of video clips in timeline order.

        Returns:
            str: The filtergraph string for ffmpeg (or None if not needed).
        """
        # Gather all effects: per-clip and timeline/range-based
        effects = []
        if len(video_clips) == 1:
            # Per-clip effects
            effects.extend(getattr(video_clips[0], 'effects', []))
        # Timeline/range-based effects (from Effects track)
        if self.timeline:
            timeline_effects = self.timeline.get_timeline_effects()
            # For now, apply all timeline effects globally (future: filter by range)
            effects.extend(timeline_effects)
        if not effects:
            return None
        filter_parts = []
        for effect in effects:
            handler = self.EFFECT_FILTER_REGISTRY.get(getattr(effect, 'effect_type', None))
            if handler:
                filter_parts.append(handler(effect))
            else:
                print(f"[WARN] No handler registered for effect type '{getattr(effect, 'effect_type', None)}'")
        if filter_parts:
            return ','.join(filter_parts)
        return None

    def generate_ffmpeg_command(self, export_path: str, quality: str = "high") -> list:
        """
        Generate the ffmpeg command for exporting the current timeline to a video file.
        Now supports a single crossfade transition between two video clips and a single brightness effect on a single video clip.
        (Scaffold: effect support will be added here.)

        Args:
            export_path (str): Path to the output video file.
            quality (str): Export quality setting (e.g., 'high', 'medium', 'low').

        Returns:
            list: The ffmpeg command as a list of arguments.
        """
        if not self.timeline:
            raise ValueError("Timeline is not set.")

        # Supported file extensions
        supported_video_exts = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".m4v", ".mpg", ".mpeg", ".wmv"}
        supported_audio_exts = {".mp3", ".wav", ".aac", ".ogg", ".flac", ".m4a", ".wma"}
        supported_sub_exts = {".srt", ".ass", ".vtt", ".sub"}

        # Gather clips by type
        video_clips = self.timeline.get_all_clips(track_type="video")
        audio_clips = self.timeline.get_all_clips(track_type="audio")
        subtitle_clips = self.timeline.get_all_clips(track_type="subtitle")
        transitions = getattr(self.timeline, "transitions", [])

        # --- Transition support scaffold ---
        # If transitions are present, build the filtergraph (not yet implemented)
        filtergraph = self._build_transition_filtergraph(video_clips, transitions)
        if filtergraph:
            # Use individual -i arguments for each video file
            input_args = []
            if len(video_clips) < 2:
                raise ValueError("At least two video clips are required for a crossfade transition.")
            input_args += ["-i", video_clips[0].file_path, "-i", video_clips[1].file_path]
            # Only support video for now; skip audio/subtitle
            codec_args = ["-c:v", "libx264", "-crf", "18"]
            # Quality settings (simple example)
            if quality == "high":
                codec_args += ["-b:v", "5M"]
            elif quality == "medium":
                codec_args += ["-b:v", "2M"]
            elif quality == "low":
                codec_args += ["-b:v", "1M"]
            # Assemble the command
            command = [
                "ffmpeg", "-y"
            ] + input_args + [
                "-filter_complex", filtergraph,
                "-map", "[vout]"
            ] + codec_args + [export_path]
            # Reason: This command applies a crossfade transition between two video clips using xfade.
            return command
        # -----------------------------------

        # --- Effect support scaffold ---
        effect_filtergraph = self._build_effect_filtergraph(video_clips)
        # If effect_filtergraph is not None and no transitions, add ['-vf', effect_filtergraph] to the command
        # For now, only support effect or transition, not both at once
        if effect_filtergraph and not filtergraph:
            if len(video_clips) != 1:
                raise ValueError("Brightness effect is only supported for a single video clip.")
            input_args = ["-i", video_clips[0].file_path]
            codec_args = ["-c:v", "libx264", "-crf", "18"]
            if quality == "high":
                codec_args += ["-b:v", "5M"]
            elif quality == "medium":
                codec_args += ["-b:v", "2M"]
            elif quality == "low":
                codec_args += ["-b:v", "1M"]
            command = [
                "ffmpeg", "-y"
            ] + input_args + [
                "-vf", effect_filtergraph
            ] + codec_args + [export_path]
            # Reason: This command applies a brightness effect to a single video clip using eq.
            return command
        # -----------------------------------

        # Validate file extensions
        for clip in video_clips:
            _, ext = os.path.splitext(clip.file_path)
            if ext.lower() not in supported_video_exts:
                raise ValueError(f"Unsupported video file extension: {ext} for {clip.file_path}")
        for clip in audio_clips:
            _, ext = os.path.splitext(clip.file_path)
            if ext.lower() not in supported_audio_exts:
                raise ValueError(f"Unsupported audio file extension: {ext} for {clip.file_path}")
        for clip in subtitle_clips:
            _, ext = os.path.splitext(clip.file_path)
            if ext.lower() not in supported_sub_exts:
                raise ValueError(f"Unsupported subtitle file extension: {ext} for {clip.file_path}")

        # Build ffmpeg input arguments using concat demuxer for sequential clips
        input_args = []
        file_list_paths = []
        # Video: use concat demuxer if multiple clips
        if video_clips:
            video_file_list = "video_file_list.txt"
            with open(video_file_list, "w") as f:
                for clip in video_clips:
                    f.write(f"file '{clip.file_path}'\n")
            input_args += ["-f", "concat", "-safe", "0", "-i", video_file_list]
            file_list_paths.append(video_file_list)
        # Audio: use concat demuxer if multiple clips
        if audio_clips:
            audio_file_list = "audio_file_list.txt"
            with open(audio_file_list, "w") as f:
                for clip in audio_clips:
                    f.write(f"file '{clip.file_path}'\n")
            input_args += ["-f", "concat", "-safe", "0", "-i", audio_file_list]
            file_list_paths.append(audio_file_list)
        # Subtitles: add each as input
        for sub_clip in subtitle_clips:
            input_args += ["-i", sub_clip.file_path]

        # Build -map arguments
        map_args = []
        idx = 0
        if video_clips:
            map_args += ["-map", f"{idx}:v:0"]
            idx += 1
        if audio_clips:
            map_args += ["-map", f"{idx}:a:0"]
            idx += 1
        for i, _ in enumerate(subtitle_clips):
            map_args += ["-map", f"{idx}:s:0"]
            idx += 1

        # Codec arguments
        codec_args = []
        if video_clips:
            codec_args += ["-c:v", "copy"]
        if audio_clips:
            codec_args += ["-c:a", "aac"]
        if subtitle_clips:
            # Use mov_text for mp4, copy for mkv
            _, ext = os.path.splitext(export_path)
            if ext.lower() == ".mp4":
                codec_args += ["-c:s", "mov_text"]
            elif ext.lower() == ".mkv":
                codec_args += ["-c:s", "copy"]
            else:
                codec_args += ["-c:s", "mov_text"]

        # Quality settings (simple example)
        if quality == "high":
            codec_args += ["-b:v", "5M"]
        elif quality == "medium":
            codec_args += ["-b:v", "2M"]
        elif quality == "low":
            codec_args += ["-b:v", "1M"]

        # Assemble the command
        command = ["ffmpeg", "-y"] + input_args + map_args + codec_args + [export_path]
        # Reason: This command combines video, audio, and subtitle tracks using concat demuxer and stream mapping.
        return command

    def render_export(self, export_path: str, quality: str = "high") -> None:
        """
        Render/export the current timeline to a high-quality video file using ffmpeg.

        Args:
            export_path (str): Path to the output video file.
            quality (str): Export quality setting (e.g., 'high', 'medium', 'low').

        Raises:
            RuntimeError: If export fails.
        """
        ffmpeg_cmd = self.generate_ffmpeg_command(export_path, quality)
        try:
            result = subprocess.run(ffmpeg_cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            error_msg = f"ffmpeg export failed: {e.stderr}\nCommand: {' '.join(ffmpeg_cmd)}"
            raise RuntimeError(error_msg) from e
        # Validate output file
        if not os.path.exists(export_path):
            raise RuntimeError(f"Export failed: output file {export_path} was not created.")
        # Clean up temp file lists
        for fname in ["video_file_list.txt", "audio_file_list.txt"]:
            if os.path.exists(fname):
                os.remove(fname)
        return None

    def render_preview(self, preview_path: str = "preview.mp4") -> None:
        """
        Render a low-res/fast preview of the timeline for UI playback.

        Args:
            preview_path (str): The output file path for the preview video.

        Raises:
            RuntimeError: If ffmpeg fails to render the preview.
        """
        # Generate the base ffmpeg command (as a list)
        command = self.generate_ffmpeg_command(preview_path)
        # Insert preview options: scale and preset
        # Find the output file index (last element)
        output_idx = len(command) - 1
        # Insert preview options before output file
        preview_opts = ["-vf", "scale=320:180", "-preset", "ultrafast", "-c:v", "libx264", "-c:a", "aac"]
        command = command[:output_idx] + preview_opts + command[output_idx:]
        try:
            result = subprocess.run(command, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            error_msg = f"ffmpeg preview failed: {e.stderr}\nCommand: {' '.join(command)}"
            raise RuntimeError(error_msg) from e
        return None

    # Placeholder for future extensibility (effects, transitions, etc.)

# Register built-in effect handlers after the class definition
FFMpegPipeline.register_effect_handler('brightness', FFMpegPipeline._brightness_filter)
FFMpegPipeline.register_effect_handler('text', FFMpegPipeline._text_filter)
# Register built-in transition handler after the class definition
FFMpegPipeline.register_transition_handler('crossfade', FFMpegPipeline._crossfade_transition_filter)
