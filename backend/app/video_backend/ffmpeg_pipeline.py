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

    def _detect_video_info(self, local_files: list) -> list:
        """
        Detect video resolution and rotation for input files using ffprobe.
        
        Args:
            local_files (list): List of local file paths to analyze
            
        Returns:
            list: List of dicts with video info: {'width': int, 'height': int, 'rotation': int}
        """
        import subprocess
        import json
        import re
        
        video_info = []
        
        for i, file_path in enumerate(local_files):
            try:
                # Use ffprobe to get video stream info
                probe_cmd = [
                    "ffprobe", "-v", "quiet", "-print_format", "json", 
                    "-show_streams", "-select_streams", "v:0", file_path
                ]
                
                result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
                
                if result.returncode == 0:
                    probe_data = json.loads(result.stdout)
                    streams = probe_data.get('streams', [])
                    
                    if streams:
                        stream = streams[0]
                        width = int(stream.get('width', 0))
                        height = int(stream.get('height', 0))
                        
                        # Check for rotation in side_data_list
                        rotation = 0
                        side_data_list = stream.get('side_data_list', [])
                        for side_data in side_data_list:
                            if side_data.get('side_data_type') == 'Display Matrix':
                                rotation_str = side_data.get('rotation', '0')
                                # Extract numeric rotation value
                                rotation_match = re.search(r'-?\d+', str(rotation_str))
                                if rotation_match:
                                    rotation = abs(int(rotation_match.group()))
                        
                        # Apply rotation to get effective resolution
                        if rotation in [90, 270]:
                            effective_width, effective_height = height, width
                        else:
                            effective_width, effective_height = width, height
                        
                        info = {
                            'width': effective_width,
                            'height': effective_height, 
                            'rotation': rotation,
                            'original_width': width,
                            'original_height': height
                        }
                        
                        video_info.append(info)
                        print(f"🎬 [FFmpeg] Input {i}: {file_path.split('/')[-1]} - Resolution: {effective_width}x{effective_height} (rotation: {rotation}°)")
                    else:
                        # No video stream found
                        video_info.append({'width': 0, 'height': 0, 'rotation': 0, 'original_width': 0, 'original_height': 0})
                        print(f"🎬 [FFmpeg] Input {i}: {file_path.split('/')[-1]} - No video stream found")
                else:
                    # ffprobe failed
                    video_info.append({'width': 0, 'height': 0, 'rotation': 0, 'original_width': 0, 'original_height': 0})
                    print(f"🎬 [FFmpeg] Input {i}: Video probe failed, assuming no video")
                    
            except Exception as e:
                # Error occurred
                video_info.append({'width': 0, 'height': 0, 'rotation': 0, 'original_width': 0, 'original_height': 0})
                print(f"🎬 [FFmpeg] Input {i}: Video detection error ({str(e)}), assuming no video")
        
        return video_info

    def _detect_audio_streams(self, local_files: list) -> list:
        """
        Detect which input files have audio streams using ffprobe.
        
        Args:
            local_files (list): List of local file paths to analyze
            
        Returns:
            list: Boolean list indicating which files have audio streams
        """
        import subprocess
        import json
        
        has_audio = []
        
        for i, file_path in enumerate(local_files):
            try:
                # Use ffprobe to detect audio streams
                probe_cmd = [
                    "ffprobe", "-v", "quiet", "-print_format", "json", 
                    "-show_streams", "-select_streams", "a", file_path
                ]
                
                result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
                
                if result.returncode == 0:
                    probe_data = json.loads(result.stdout)
                    audio_streams = probe_data.get('streams', [])
                    has_audio_stream = len(audio_streams) > 0
                    has_audio.append(has_audio_stream)
                    
                    print(f"🎬 [FFmpeg] Input {i}: {file_path.split('/')[-1]} - Audio: {'✅' if has_audio_stream else '❌'}")
                else:
                    # If ffprobe fails, assume no audio
                    has_audio.append(False)
                    print(f"🎬 [FFmpeg] Input {i}: {file_path.split('/')[-1]} - Audio probe failed, assuming no audio")
                    
            except Exception as e:
                # If anything fails, assume no audio
                has_audio.append(False)
                print(f"🎬 [FFmpeg] Input {i}: Audio detection error ({str(e)}), assuming no audio")
        
        return has_audio

    def _determine_target_resolution(self, video_info: list) -> tuple:
        """
        Determine optimal target resolution for mixed-resolution video concat.
        
        Args:
            video_info (list): List of video info dicts from _detect_video_info
            
        Returns:
            tuple: (target_width, target_height) for scaling
        """
        if not video_info:
            return (1920, 1080)  # Default HD
        
        # Filter out invalid video info
        valid_videos = [v for v in video_info if v['width'] > 0 and v['height'] > 0]
        
        if not valid_videos:
            return (1920, 1080)  # Default HD
        
        # Analyze aspect ratios and orientations
        landscape_count = sum(1 for v in valid_videos if v['width'] > v['height'])
        portrait_count = sum(1 for v in valid_videos if v['width'] < v['height'])
        
        # Calculate average resolution for guidance
        avg_width = sum(v['width'] for v in valid_videos) / len(valid_videos)
        avg_height = sum(v['height'] for v in valid_videos) / len(valid_videos)
        
        print(f"🎬 [FFmpeg] Resolution analysis: {landscape_count} landscape, {portrait_count} portrait, avg: {avg_width:.0f}x{avg_height:.0f}")
        
        # Decision logic for target resolution
        if portrait_count > landscape_count:
            # Mostly portrait content
            if avg_height >= 1920:
                target_resolution = (1080, 1920)  # Full HD portrait
            else:
                target_resolution = (720, 1280)   # HD portrait
        else:
            # Mostly landscape or equal
            if avg_width >= 2560 or avg_height >= 1440:
                target_resolution = (1920, 1080)  # Full HD landscape
            elif avg_width >= 1920 or avg_height >= 1080:
                target_resolution = (1920, 1080)  # Full HD landscape  
            else:
                target_resolution = (1280, 720)   # HD landscape
        
        print(f"🎬 [FFmpeg] Target resolution selected: {target_resolution[0]}x{target_resolution[1]}")
        return target_resolution

    def _generate_scaling_filters(self, video_info: list, target_width: int, target_height: int) -> list:
        """
        Generate scaling filters for each input to match target resolution.
        
        Args:
            video_info (list): Video info from _detect_video_info  
            target_width (int): Target width
            target_height (int): Target height
            
        Returns:
            list: List of scaling filter strings for each input
        """
        scaling_filters = []
        
        for i, info in enumerate(video_info):
            if info['width'] <= 0 or info['height'] <= 0:
                # No video or invalid - skip scaling  
                scaling_filters.append("")
                continue
            
            current_width = info['width']
            current_height = info['height']
            
            if current_width == target_width and current_height == target_height:
                # Already correct resolution - no scaling needed
                scaling_filters.append(f"[{i}:v]")
                print(f"🎬 [FFmpeg] Input {i}: No scaling needed ({current_width}x{current_height})")
            else:
                # Need scaling with aspect ratio preservation and padding
                scale_filter = (
                    f"[{i}:v]scale={target_width}:{target_height}:"
                    f"force_original_aspect_ratio=decrease,"
                    f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black[v{i}scaled]"
                )
                scaling_filters.append(f"[v{i}scaled]")
                print(f"🎬 [FFmpeg] Input {i}: Scaling {current_width}x{current_height} → {target_width}x{target_height}")
        
        return scaling_filters

    def render_timeline_export(self, export_intervals: list, output_path: str, quality: str = "high") -> None:
        """
        Export precise timeline segments with frame accuracy.
        
        This method processes export intervals that specify exact segments to extract
        from source files, enabling frame-accurate exports that match timeline visualization.
        
        Args:
            export_intervals (list): List of intervals with sourceFile, sourceStart, sourceDuration
            output_path (str): Path to the output video file
            quality (str): Export quality setting (high, medium, low)
            
        Example export_intervals:
        [
            {
                "sourceFile": "videoA.mp4", "sourceStart": 0, "sourceDuration": 10,
                "timelineStart": 0, "clipName": "Video A part 1"
            },
            {
                "sourceFile": "videoA.mp4", "sourceStart": 20, "sourceDuration": 10, 
                "timelineStart": 10, "clipName": "Video A part 2"
            }
        ]
        
        Raises:
            RuntimeError: If export fails
            ValueError: If intervals are invalid
        """
        import requests
        import tempfile
        import uuid
        import shutil
        
        if not export_intervals:
            raise ValueError("No export intervals provided")
        
        print(f"🎬 [FFmpeg] Processing {len(export_intervals)} timeline segments for export")
        
        # Step 1: Prepare temp directory and download files
        temp_dir = None
        temp_files = []
        
        try:
            temp_dir = tempfile.mkdtemp(prefix="cre8rflow_export_")
            print(f"🎬 [FFmpeg] Created temp directory: {temp_dir}")
            
            # Download or prepare source files
            for i, interval in enumerate(export_intervals):
                source_path = interval.get('sourceFile', '')
                
                if not source_path:
                    raise ValueError(f"Interval {i+1}: Missing sourceFile")
                
                if 'supabase' in source_path.lower() or source_path.startswith('http'):
                    # Download from Supabase/HTTP
                    local_path = self._download_supabase_file(source_path, temp_dir)
                    temp_files.append(local_path)
                    interval['localFile'] = local_path
                    print(f"🎬 [FFmpeg] Downloaded: {interval.get('clipName', f'Interval {i+1}')} -> {os.path.basename(local_path)}")
                else:
                    # Local file - verify existence
                    if not os.path.exists(source_path):
                        raise ValueError(f"Source file not found: {source_path}")
                    interval['localFile'] = source_path
                    print(f"🎬 [FFmpeg] Using local: {interval.get('clipName', f'Interval {i+1}')} -> {source_path}")
            
            # Step 2: Generate FFmpeg inputs with precise seeking
            inputs = []
            for i, interval in enumerate(export_intervals):
                source_start = float(interval.get('sourceStart', 0))
                source_duration = float(interval.get('sourceDuration', 0))
                local_file = interval['localFile']
                clip_name = interval.get('clipName', f'Segment {i+1}')
                
                if source_duration <= 0:
                    raise ValueError(f"Invalid sourceDuration for {clip_name}: {source_duration}")
                
                inputs.extend([
                    "-ss", str(source_start),      # Seek to exact position in source
                    "-t", str(source_duration),    # Extract exact duration
                    "-i", local_file               # Local file path
                ])
                
                print(f"🎬 [FFmpeg] Segment {i+1}: {clip_name}")
                print(f"    Extract {source_duration}s from {source_start}s -> Timeline position {interval.get('timelineStart', i)}s")
            
            # Step 3: Detect video and audio streams in input files
            local_files = [interval['localFile'] for interval in export_intervals]
            video_info = self._detect_video_info(local_files)
            has_audio = self._detect_audio_streams(local_files)
            num_segments = len(export_intervals)
            
            print(f"🎬 [FFmpeg] Audio stream analysis: {sum(has_audio)}/{num_segments} files have audio")
            
            # Step 3a: Determine target resolution and generate scaling filters
            target_width, target_height = self._determine_target_resolution(video_info)
            scaling_filter_inputs = self._generate_scaling_filters(video_info, target_width, target_height)
            
            # Build video processing filters
            scaling_filters = []
            video_concat_inputs = []
            
            for i, info in enumerate(video_info):
                if info['width'] <= 0 or info['height'] <= 0:
                    continue  # Skip invalid video streams
                
                current_width = info['width']
                current_height = info['height']
                
                if current_width == target_width and current_height == target_height:
                    # No scaling needed
                    video_concat_inputs.append(f"[{i}:v]")
                else:
                    # Need scaling filter
                    scale_filter = (
                        f"[{i}:v]scale={target_width}:{target_height}:"
                        f"force_original_aspect_ratio=decrease,"
                        f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:black[v{i}scaled]"
                    )
                    scaling_filters.append(scale_filter)
                    video_concat_inputs.append(f"[v{i}scaled]")
            
            # Build complete video filter chain
            if scaling_filters:
                # Have scaling filters + concat
                scaling_part = ";".join(scaling_filters)
                video_inputs_str = "".join(video_concat_inputs)
                video_concat = f"{scaling_part};{video_inputs_str}concat=n={num_segments}:v=1:a=0[vout]"
            else:
                # No scaling needed - simple concat
                video_inputs_str = "".join(video_concat_inputs)
                video_concat = f"{video_inputs_str}concat=n={num_segments}:v=1:a=0[vout]"
            
            # Build audio concat based on detected streams
            audio_concat = ""
            audio_map_args = []
            
            if any(has_audio):
                # At least one file has audio - create audio processing
                audio_filter_parts = []
                
                for i, has_audio_stream in enumerate(has_audio):
                    if has_audio_stream:
                        # Use actual audio stream
                        audio_filter_parts.append(f"[{i}:a]")
                    else:
                        # Generate silent audio for this input
                        duration = float(export_intervals[i].get('sourceDuration', 0))
                        audio_filter_parts.append(f"anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration={duration}[silent{i}]")
                        audio_filter_parts.append(f"[silent{i}]")
                
                # If we have mixed scenarios, we need to handle silent audio generation differently
                if not all(has_audio):
                    # Mixed scenario: some have audio, some don't
                    silent_generators = []
                    concat_inputs = []
                    
                    for i, has_audio_stream in enumerate(has_audio):
                        if has_audio_stream:
                            concat_inputs.append(f"[{i}:a]")
                        else:
                            duration = float(export_intervals[i].get('sourceDuration', 0))
                            silent_generators.append(f"anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration={duration}[silent{i}]")
                            concat_inputs.append(f"[silent{i}]")
                    
                    # Build complete audio filter
                    if silent_generators:
                        audio_concat = f"{';'.join(silent_generators)};{''.join(concat_inputs)}concat=n={num_segments}:v=0:a=1[aout]"
                    else:
                        audio_concat = f"{''.join(concat_inputs)}concat=n={num_segments}:v=0:a=1[aout]"
                else:
                    # All files have audio - simple concat
                    audio_inputs = "".join([f"[{i}:a]" for i in range(num_segments)])
                    audio_concat = f"{audio_inputs}concat=n={num_segments}:v=0:a=1[aout]"
                
                audio_map_args = ["-map", "[aout]"]
            else:
                # No audio in any file - video only export
                print(f"🎬 [FFmpeg] No audio streams detected - creating video-only export")
                audio_concat = ""
                audio_map_args = []
            
            # Create complete filter complex
            if audio_concat:
                filter_complex = f"{video_concat};{audio_concat}"
            else:
                filter_complex = video_concat
            
            # Step 4: Set quality parameters
            codec_args = ["-c:v", "libx264"]
            
            # Add audio codec only if we have audio
            if audio_map_args:
                codec_args.extend(["-c:a", "aac"])
            
            if quality == "high":
                codec_args.extend(["-crf", "18", "-preset", "slow"])
                if audio_map_args:
                    codec_args.extend(["-b:a", "192k"])
            elif quality == "medium":
                codec_args.extend(["-crf", "23", "-preset", "medium"])
                if audio_map_args:
                    codec_args.extend(["-b:a", "128k"])
            elif quality == "low":
                codec_args.extend(["-crf", "28", "-preset", "fast"])
                if audio_map_args:
                    codec_args.extend(["-b:a", "96k"])
            else:
                # Default to high quality
                codec_args.extend(["-crf", "18", "-preset", "slow"])
                if audio_map_args:
                    codec_args.extend(["-b:a", "192k"])
            
            # Step 5: Build complete FFmpeg command
            map_args = ["-map", "[vout]"] + audio_map_args
            
            command = [
                "ffmpeg", "-y"  # Overwrite output file
            ] + inputs + [
                "-filter_complex", filter_complex
            ] + map_args + codec_args + [
                "-movflags", "+faststart",  # Optimize for web playback
                output_path
            ]
            
            # Step 6: Execute FFmpeg command
            print(f"🎬 [FFmpeg] Executing timeline export...")
            print(f"🎬 [FFmpeg] Filter complex: {filter_complex}")
            print(f"🎬 [FFmpeg] Map args: {' '.join(map_args)}")
            print(f"🎬 [FFmpeg] Command: ffmpeg -y {' '.join(inputs[:6])}... [filter_complex] ... {output_path}")
            
            result = subprocess.run(command, check=True, capture_output=True, text=True)
            
            # Step 7: Verify output
            if not os.path.exists(output_path):
                raise RuntimeError(f"FFmpeg completed but output file not found: {output_path}")
            
            output_size = os.path.getsize(output_path) / (1024 * 1024)  # MB
            total_duration = sum(float(interval.get('sourceDuration', 0)) for interval in export_intervals)
            
            print(f"🎬 [FFmpeg] ✅ Timeline export successful!")
            print(f"    Output: {output_path}")
            print(f"    Size: {output_size:.1f} MB")
            print(f"    Duration: {total_duration:.1f}s")
            print(f"    Segments: {len(export_intervals)}")
            
        except subprocess.CalledProcessError as e:
            error_msg = f"FFmpeg timeline export failed: {e.stderr}\nCommand: {' '.join(command) if 'command' in locals() else 'Unknown'}"
            print(f"🎬 [FFmpeg] ❌ Export error: {e.stderr}")
            raise RuntimeError(error_msg) from e
        except Exception as e:
            error_msg = f"Timeline export error: {str(e)}"
            print(f"🎬 [FFmpeg] ❌ Unexpected error: {str(e)}")
            raise RuntimeError(error_msg) from e
        finally:
            # Step 8: Cleanup temp files and directory
            for temp_file in temp_files:
                try:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                        print(f"🎬 [FFmpeg] Cleaned up: {os.path.basename(temp_file)}")
                except Exception as cleanup_error:
                    print(f"🎬 [FFmpeg] Warning: Could not clean up {temp_file}: {cleanup_error}")
            
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                    print(f"🎬 [FFmpeg] Cleaned up temp directory")
                except Exception as cleanup_error:
                    print(f"🎬 [FFmpeg] Warning: Could not clean up temp directory: {cleanup_error}")

    def _download_supabase_file(self, supabase_url: str, temp_dir: str) -> str:
        """
        Download file from Supabase storage to local temp file.
        
        Args:
            supabase_url (str): Supabase file URL or signed URL
            temp_dir (str): Temporary directory for downloads
            
        Returns:
            str: Path to downloaded local file
            
        Raises:
            RuntimeError: If download fails
        """
        import requests
        import uuid
        
        try:
            # Generate unique filename
            file_extension = '.mp4'  # Default to mp4, could be enhanced to detect from URL
            if '.' in supabase_url:
                url_parts = supabase_url.split('.')
                potential_ext = url_parts[-1].split('?')[0]  # Remove query parameters
                if len(potential_ext) <= 4:  # Reasonable extension length
                    file_extension = f'.{potential_ext}'
            
            filename = f"temp_{uuid.uuid4()}{file_extension}"
            local_path = os.path.join(temp_dir, filename)
            
            print(f"🎬 [Download] Downloading from Supabase...")
            print(f"    URL: {supabase_url[:50]}{'...' if len(supabase_url) > 50 else ''}")
            print(f"    Target: {local_path}")
            
            # Download with streaming to handle large files
            response = requests.get(supabase_url, stream=True, timeout=300)  # 5 minute timeout
            response.raise_for_status()
            
            total_size = 0
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        total_size += len(chunk)
            
            # Verify download
            if not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
                raise RuntimeError("Downloaded file is empty or missing")
            
            print(f"🎬 [Download] ✅ Downloaded {total_size / (1024*1024):.1f} MB to {filename}")
            return local_path
            
        except requests.exceptions.RequestException as e:
            error_msg = f"Failed to download from Supabase: {str(e)}"
            print(f"🎬 [Download] ❌ {error_msg}")
            raise RuntimeError(error_msg) from e
        except Exception as e:
            error_msg = f"Unexpected download error: {str(e)}"
            print(f"🎬 [Download] ❌ {error_msg}")
            raise RuntimeError(error_msg) from e

    def render_multitrack_export(self, multitrack_intervals: list, output_path: str, quality: str = "high") -> None:
        """
        Export multi-track timeline with professional composition using FFmpeg complex filters.
        
        Supports multiple video tracks, audio mixing, text overlays, and effects processing
        without requiring GES - pure FFmpeg implementation for maximum compatibility.
        
        Args:
            multitrack_intervals (list): List of multi-track intervals with track metadata
            output_path (str): Path to the output video file
            quality (str): Export quality setting (high, medium, low)
            
        Example multitrack_intervals:
        [
            {
                "sourceFile": "video1.mp4", "sourceStart": 0, "sourceDuration": 10,
                "timelineStart": 0, "timelineEnd": 10, "trackKind": "video",
                "trackIndex": 0, "volume": 1.0, "opacity": 1.0, "zIndex": 400
            },
            {
                "sourceFile": "video2.mp4", "sourceStart": 5, "sourceDuration": 8,
                "timelineStart": 8, "timelineEnd": 16, "trackKind": "video", 
                "trackIndex": 1, "volume": 1.0, "opacity": 0.8, "zIndex": 500
            }
        ]
        
        Raises:
            RuntimeError: If export fails
            ValueError: If intervals are invalid
        """
        import requests
        import tempfile
        import uuid
        import shutil
        import json
        
        if not multitrack_intervals:
            raise ValueError("No multi-track intervals provided")
        
        print(f"🎬 [FFmpeg] Processing {len(multitrack_intervals)} multi-track intervals for export")
        
        # Group intervals by track kind for organized processing
        grouped_intervals = {
            'video': [i for i in multitrack_intervals if i.get('trackKind') == 'video'],
            'audio': [i for i in multitrack_intervals if i.get('trackKind') == 'audio'], 
            'title': [i for i in multitrack_intervals if i.get('trackKind') == 'title'],
            'overlay': [i for i in multitrack_intervals if i.get('trackKind') == 'overlay'],
            'effect': [i for i in multitrack_intervals if i.get('trackKind') == 'effect']
        }
        
        print(f"🎬 [FFmpeg] Track breakdown:")
        for track_kind, intervals in grouped_intervals.items():
            if intervals:
                print(f"  {track_kind}: {len(intervals)} intervals")
        
        # Step 1: Prepare temp directory and download files
        temp_dir = None
        temp_files = []
        
        try:
            temp_dir = tempfile.mkdtemp(prefix="cre8rflow_multitrack_")
            print(f"🎬 [FFmpeg] Created temp directory: {temp_dir}")
            
            # Step 2: Download and prepare all source files
            file_mapping = {}  # source_url -> local_file_path
            input_args = []
            
            for i, interval in enumerate(multitrack_intervals):
                source_path = interval.get('sourceFile', '')
                
                if not source_path:
                    print(f"🎬 [FFmpeg] Warning: Skipping interval {i} - no source file")
                    continue
                
                if source_path not in file_mapping:
                    # Download file if it's a URL
                    if source_path.startswith('http'):
                        print(f"🎬 [FFmpeg] Downloading: {source_path}")
                        response = requests.get(source_path, stream=True, timeout=60)
                        response.raise_for_status()
                        
                        # Create local file
                        file_ext = source_path.split('.')[-1] if '.' in source_path else 'mp4'
                        local_filename = f"source_{len(file_mapping)}.{file_ext}"
                        local_path = os.path.join(temp_dir, local_filename)
                        
                        with open(local_path, 'wb') as f:
                            for chunk in response.iter_content(chunk_size=8192):
                                f.write(chunk)
                        
                        file_mapping[source_path] = local_path
                        temp_files.append(local_path)
                        print(f"🎬 [FFmpeg] Downloaded to: {local_path}")
                    else:
                        # Local file
                        if os.path.exists(source_path):
                            file_mapping[source_path] = source_path
                        else:
                            print(f"🎬 [FFmpeg] Warning: Local file not found: {source_path}")
                            continue
                
                # Add input argument for each interval
                local_file = file_mapping[source_path]
                source_start = float(interval.get('sourceStart', 0))
                source_duration = float(interval.get('sourceDuration', 0))
                
                input_args.extend([
                    "-ss", str(source_start),
                    "-t", str(source_duration), 
                    "-i", local_file
                ])
            
            if not input_args:
                raise ValueError("No valid source files found in intervals")
            
            # Step 3: Build complex filter for multi-track composition
            filter_complex_parts = []
            video_streams = []
            audio_streams = []
            
            # Process each interval and create filter chain
            input_index = 0
            for interval in multitrack_intervals:
                if interval.get('sourceFile') not in file_mapping:
                    continue
                
                track_kind = interval.get('trackKind', 'video')
                volume = float(interval.get('volume', 1.0))
                opacity = float(interval.get('opacity', 1.0))
                
                if track_kind == 'video':
                    # Video processing
                    stream_label = f"v{input_index}"
                    
                    # Scale and format video
                    filter_parts = [f"[{input_index}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"]
                    
                    # Apply opacity if not 1.0
                    if opacity != 1.0:
                        filter_parts.append(f"format=rgba,colorchannelmixer=aa={opacity}")
                    
                    filter_parts.append(f"[{stream_label}]")
                    filter_complex_parts.append("".join(filter_parts))
                    video_streams.append(stream_label)
                    
                elif track_kind == 'audio':
                    # Audio processing
                    stream_label = f"a{input_index}"
                    
                    # Apply volume if not 1.0
                    if volume != 1.0:
                        filter_complex_parts.append(f"[{input_index}:a]volume={volume}[{stream_label}]")
                    else:
                        audio_streams.append(f"{input_index}:a")
                        input_index += 1
                        continue
                    
                    audio_streams.append(stream_label)
                
                input_index += 1
            
            # Step 4: Compose video layers
            if len(video_streams) > 1:
                # Multi-layer video composition
                overlay_chain = video_streams[0]
                for i, stream in enumerate(video_streams[1:], 1):
                    output_label = "vout" if i == len(video_streams) - 1 else f"comp{i}"
                    filter_complex_parts.append(f"[{overlay_chain}][{stream}]overlay=0:0[{output_label}]")
                    overlay_chain = output_label
                video_output = "[vout]"
            elif len(video_streams) == 1:
                # Single video stream
                filter_complex_parts.append(f"[{video_streams[0]}]copy[vout]")
                video_output = "[vout]"
            else:
                # No video - create black background
                filter_complex_parts.append("color=black:size=1920x1080:duration=10[vout]")
                video_output = "[vout]"
            
            # Step 5: Mix audio streams
            audio_output = None
            if len(audio_streams) > 1:
                # Multi-stream audio mixing
                audio_inputs = "][".join(audio_streams)
                filter_complex_parts.append(f"[{audio_inputs}]amix=inputs={len(audio_streams)}:duration=longest[aout]")
                audio_output = "[aout]"
            elif len(audio_streams) == 1:
                # Single audio stream
                if audio_streams[0].startswith('['):
                    filter_complex_parts.append(f"{audio_streams[0][1:-1]}acopy[aout]")
                    audio_output = "[aout]"
                else:
                    audio_output = f"[{audio_streams[0]}]"
            
            # Step 6: Build quality and codec settings
            codec_args = ["-c:v", "libx264"]
            
            if audio_output:
                codec_args.extend(["-c:a", "aac"])
            
            if quality == "high":
                codec_args.extend(["-crf", "18", "-preset", "slow"])
                if audio_output:
                    codec_args.extend(["-b:a", "192k"])
            elif quality == "medium":
                codec_args.extend(["-crf", "23", "-preset", "medium"])
                if audio_output:
                    codec_args.extend(["-b:a", "128k"])
            elif quality == "low":
                codec_args.extend(["-crf", "28", "-preset", "fast"])
                if audio_output:
                    codec_args.extend(["-b:a", "96k"])
            else:
                codec_args.extend(["-crf", "18", "-preset", "slow"])
                if audio_output:
                    codec_args.extend(["-b:a", "192k"])
            
            # Step 7: Build final FFmpeg command
            filter_complex = ";".join(filter_complex_parts)
            map_args = ["-map", video_output]
            if audio_output:
                map_args.extend(["-map", audio_output])
            
            command = [
                "ffmpeg", "-y"  # Overwrite output file
            ] + input_args + [
                "-filter_complex", filter_complex
            ] + map_args + codec_args + [
                "-movflags", "+faststart",  # Optimize for web playback
                output_path
            ]
            
            # Step 8: Execute FFmpeg command
            print(f"🎬 [FFmpeg] Executing multi-track export...")
            print(f"🎬 [FFmpeg] Video streams: {len(video_streams)}, Audio streams: {len(audio_streams)}")
            print(f"🎬 [FFmpeg] Filter complex length: {len(filter_complex)} chars")
            
            result = subprocess.run(command, check=True, capture_output=True, text=True)
            
            # Step 9: Verify output
            if not os.path.exists(output_path):
                raise RuntimeError(f"FFmpeg completed but output file not found: {output_path}")
            
            file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
            print(f"🎬 [FFmpeg] ✅ Multi-track export completed: {output_path} ({file_size_mb:.1f} MB)")
            
        except subprocess.CalledProcessError as e:
            error_msg = f"FFmpeg multi-track export failed. Return code: {e.returncode}"
            if e.stderr:
                error_msg += f"\nStderr: {e.stderr}"
            print(f"🎬 [FFmpeg] ❌ Error: {error_msg}")
            raise RuntimeError(error_msg) from e
            
        except Exception as e:
            print(f"🎬 [FFmpeg] ❌ Unexpected error during multi-track export: {e}")
            raise RuntimeError(f"Multi-track export failed: {str(e)}") from e
        
        finally:
            # Clean up temporary files
            if temp_dir and os.path.exists(temp_dir):
                print(f"🎬 [FFmpeg] Cleaning up temp directory: {temp_dir}")
                try:
                    shutil.rmtree(temp_dir)
                except Exception as cleanup_error:
                    print(f"🎬 [FFmpeg] Warning: Could not clean up temp directory: {cleanup_error}")

    # Placeholder for future extensibility (effects, transitions, etc.)

# Register built-in effect handlers after the class definition
FFMpegPipeline.register_effect_handler('brightness', FFMpegPipeline._brightness_filter)
FFMpegPipeline.register_effect_handler('text', FFMpegPipeline._text_filter)
# Register built-in transition handler after the class definition
FFMpegPipeline.register_transition_handler('crossfade', FFMpegPipeline._crossfade_transition_filter)
