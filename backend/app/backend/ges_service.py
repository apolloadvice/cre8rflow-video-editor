#!/usr/bin/env python3

# Re-enable GES for systematic debugging
# TODO: Debug GStreamer + Python GI + FastAPI threading issues separately
GES_FORCE_DISABLED = False

if GES_FORCE_DISABLED:
    print("🚫 GES functionality temporarily disabled due to malloc errors")
    print("   Enable by setting GES_FORCE_DISABLED = False in ges_service.py")
    GES_IMPORTS_AVAILABLE = False
    GES_USING_STUBS = True
else:
    # Optional GStreamer imports - backend will work without GES if not installed
    try:
        import gi
        gi.require_version('Gst', '1.0')
        gi.require_version('GES', '1.0')

        from gi.repository import Gst, GES, GLib
        
        # DON'T initialize GStreamer at import time - use lazy initialization
        GES_IMPORTS_AVAILABLE = True
        GES_USING_STUBS = False
        print("✅ Real GStreamer imports successful")
    except ImportError as e:
        print(f"⚠️  GStreamer not available: {e}")
        print("   Install with: ./install_ges.sh (macOS) or apt-get install python3-gi (Ubuntu)")
        GES_IMPORTS_AVAILABLE = False
        GES_USING_STUBS = True
    
    # Stub classes for when GES is not available
    class MockLayer:
        def __init__(self):
            self.priority = 0
        def set_priority(self, priority):
            self.priority = priority
        def add_clip(self, clip):
            pass
    
    class MockTrack:
        def __init__(self, track_type):
            self.track_type = track_type
        def get_property(self, prop):
            return self.track_type
        def set_restriction_caps(self, caps):
            pass
        def set_mixing(self, enable):
            pass
    
    class MockTimeline:
        def __init__(self):
            self.layers = []
            self.tracks = [MockTrack("VIDEO"), MockTrack("AUDIO")]
            self._clips = []  # Track clips for duration calculation
        def append_layer(self):
            layer = MockLayer()
            self.layers.append(layer)
            return layer
        def get_layers(self):
            return self.layers
        def get_tracks(self):
            return self.tracks
        def remove_layer(self, layer):
            if layer in self.layers:
                self.layers.remove(layer)
        def remove_track(self, track):
            if track in self.tracks:
                self.tracks.remove(track)
        def add_clip_data(self, clip_data):
            """Add clip data for duration calculation"""
            self._clips.append(clip_data)
        def get_duration(self):
            """Calculate timeline duration from clips"""
            if not self._clips:
                return 0
            # Return duration in nanoseconds (GStreamer format)
            max_end = max(clip.end for clip in self._clips)
            return int(max_end * 1000000000)  # Convert to nanoseconds
        def commit(self):
            """Mock commit method"""
            pass
    
    class MockCaps:
        @staticmethod
        def from_string(caps_str):
            return MockCaps()
    
    class MockClip:
        def __init__(self):
            pass
        def set_start(self, time):
            pass
        def set_duration(self, time):
            pass
        def set_inpoint(self, time):
            pass
        def set_child_property(self, prop, value):
            pass
    
    class Gst:
        SECOND = 1000000000
        
        @staticmethod
        def init(args):
            """Stub init method - does nothing"""
            pass
            
        class State:
            NULL = "NULL"
            PLAYING = "PLAYING"
        class MessageType:
            EOS = "EOS"
            ERROR = "ERROR"
            WARNING = "WARNING"
            STATE_CHANGED = "STATE_CHANGED"
        
        Caps = MockCaps
    
    class GES:
        @staticmethod
        def init():
            """Stub init method - does nothing"""
            pass
            
        class Timeline:
            @staticmethod
            def new_audio_video():
                return MockTimeline()
        
        class UriClip:
            @staticmethod
            def new(uri):
                return MockClip()
        
        class TitleClip:
            @staticmethod
            def new():
                return MockClip()
        
        class Pipeline:
            pass
        class PipelineFlags:
            PREVIEW = "PREVIEW"
            RENDER = "RENDER"
        
        class TrackType:
            VIDEO = "VIDEO"
            AUDIO = "AUDIO"
    
    class GLib:
        class MainLoop:
            pass

import threading
import logging
import asyncio
import json
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import os
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# GStreamer initialization state
GES_INITIALIZED = False
GES_INIT_LOCK = threading.Lock()
GES_USING_STUBS = False  # Will be set based on import success

def _initialize_ges() -> bool:
    """
    Lazy initialization of GStreamer. 
    Only initializes once, thread-safe.
    Returns True if successful, False otherwise.
    """
    global GES_INITIALIZED
    
    if GES_FORCE_DISABLED:
        logger.debug("GES functionality is force-disabled")
        return False
    
    if not GES_IMPORTS_AVAILABLE:
        return False
    
    if GES_INITIALIZED:
        return True
    
    with GES_INIT_LOCK:
        # Double-check pattern
        if GES_INITIALIZED:
            return True
        
        try:
            logger.info("Initializing GStreamer...")
            Gst.init(None)
            GES.init()
            GES_INITIALIZED = True
            logger.info("✅ GStreamer initialized successfully")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to initialize GStreamer: {e}")
            return False

@dataclass
class TimelineClip:
    id: str
    name: str
    start: float  # Timeline position start (seconds)
    end: float    # Timeline position end (seconds)
    duration: float  # Clip duration (seconds)
    in_point: float = 0.0  # Source media in-point (seconds)
    file_path: str = ""
    type: str = "video"  # video, audio, text
    track: int = 0  # Track/layer index (0=main, 1=overlay, etc.)

@dataclass
class TimelineData:
    clips: List[TimelineClip]
    frame_rate: float = 30.0
    width: int = 1920
    height: int = 1080
    sample_rate: int = 48000
    channels: int = 2

def convert_videoclip_to_timeline_clip(video_clip, timeline) -> TimelineClip:
    """
    Convert a VideoClip to a GES-compatible TimelineClip.
    Args:
        video_clip: VideoClip instance
        timeline: Timeline instance for frame rate conversion
    Returns:
        TimelineClip: GES-compatible timeline clip
    """
    return TimelineClip(
        id=video_clip.clip_id,
        name=video_clip.name,
        start=video_clip.get_timeline_start_seconds(timeline),
        end=video_clip.get_timeline_end_seconds(timeline),
        duration=video_clip.get_duration_seconds(timeline),
        in_point=video_clip.get_source_in_point_seconds(timeline),
        file_path=video_clip.file_path or "",
        type=video_clip.track_type,
        track=getattr(video_clip, 'track_index', 0)
    )

def convert_timeline_clip_to_videoclip(timeline_clip: TimelineClip, timeline) -> 'VideoClip':
    """
    Convert a TimelineClip back to a VideoClip.
    Args:
        timeline_clip: TimelineClip instance
        timeline: Timeline instance for frame rate conversion
    Returns:
        VideoClip: Backend timeline clip
    """
    # Import here to avoid circular imports
    from ..timeline import VideoClip
    
    return VideoClip(
        name=timeline_clip.name,
        start_frame=int(timeline_clip.start * timeline.frame_rate),
        end_frame=int(timeline_clip.end * timeline.frame_rate),
        track_type=timeline_clip.type,
        file_path=timeline_clip.file_path,
        clip_id=timeline_clip.id,
        in_point=int(timeline_clip.in_point * timeline.frame_rate),
        track_index=timeline_clip.track
    )

def create_timeline_data_from_clips(video_clips: List, timeline, width: int = 1920, height: int = 1080) -> TimelineData:
    """
    Create TimelineData from a list of VideoClips and Timeline.
    Args:
        video_clips: List of VideoClip instances
        timeline: Timeline instance for frame rate conversion
        width: Timeline width (default 1920)
        height: Timeline height (default 1080)
    Returns:
        TimelineData: GES-compatible timeline data
    """
    timeline_clips = [
        convert_videoclip_to_timeline_clip(clip, timeline)
        for clip in video_clips
    ]
    
    return TimelineData(
        clips=timeline_clips,
        frame_rate=timeline.frame_rate,
        width=width,
        height=height,
        sample_rate=48000,
        channels=2
    )

class GESTimelineService:
    """
    GStreamer Editing Services timeline management service.
    Provides timeline creation, preview, and export functionality.
    """
    
    def __init__(self):
        self.timeline: Optional[Any] = None
        self.pipeline: Optional[Any] = None
        self.main_loop: Optional[Any] = None
        self.loop_thread: Optional[threading.Thread] = None
        self.is_running = False
        self.preview_port = 8554  # RTSP port for preview
        self.timeline_data: Optional[TimelineData] = None  # Store timeline data for duration calculation
    
    def __del__(self):
        """Destructor to ensure cleanup when service is garbage collected"""
        try:
            self.cleanup()
        except:
            # Ignore errors during destruction
            pass
        
    def _check_ges_available(self) -> bool:
        """Check if GES is available and initialize if needed"""
        if not _initialize_ges():
            logger.error("GStreamer Editing Services not available. Install with ./install_ges.sh")
            return False
        return True
        
    def create_timeline_from_data(self, timeline_data: TimelineData) -> bool:
        """
        Create a GES timeline from timeline data
        """
        if not self._check_ges_available():
            return False
            
        try:
            logger.info(f"Creating GES timeline with {len(timeline_data.clips)} clips")
            
            # Store timeline data for duration calculation and other operations
            self.timeline_data = timeline_data
            
            # Create timeline with audio and video tracks
            self.timeline = GES.Timeline.new_audio_video()
            
            # Set timeline properties
            self._configure_timeline_tracks(timeline_data)
            
            # Create layers dynamically based on track indices
            layers = {}
            max_track = max((clip.track for clip in timeline_data.clips), default=1)
            
            for track_index in range(max_track + 1):
                layer = self.timeline.append_layer()
                layer.set_priority(track_index)  # Lower track index = higher priority (bottom layer)
                layers[track_index] = layer
                logger.info(f"Created layer for track {track_index} with priority {track_index}")
            
            # Sort clips by start time
            sorted_clips = sorted(timeline_data.clips, key=lambda c: c.start)
            
            # Add clips to their respective layers with enhanced error handling
            successful_clips = 0
            failed_clips = 0
            
            for clip_data in sorted_clips:
                # Get the appropriate layer for this clip's track
                target_layer = layers.get(clip_data.track, layers.get(0))
                
                if clip_data.type in ['video', 'audio']:
                    success = self._add_uri_clip_to_layer(target_layer, clip_data)
                    if success:
                        successful_clips += 1
                        logger.info(f"✅ Successfully added {clip_data.type} clip: {clip_data.name} to track {clip_data.track}")
                    else:
                        failed_clips += 1
                        logger.error(f"❌ Failed to add {clip_data.type} clip: {clip_data.name} to track {clip_data.track}")
                elif clip_data.type == 'text':
                    success = self._add_text_clip_to_layer(target_layer, clip_data)
                    if success:
                        successful_clips += 1
                        logger.info(f"✅ Successfully added text clip: {clip_data.name} to track {clip_data.track}")
                    else:
                        failed_clips += 1
                        logger.error(f"❌ Failed to add text clip: {clip_data.name} to track {clip_data.track}")
            
            logger.info(f"GES timeline creation summary: {successful_clips} successful, {failed_clips} failed")
            
            # Return False if more than half the clips failed
            if failed_clips > successful_clips:
                logger.error("Timeline creation failed: Too many clips failed to load")
                return False
            
            # Add clip data to mock timeline for duration calculation
            if GES_USING_STUBS and hasattr(self.timeline, 'add_clip_data'):
                for clip_data in sorted_clips:
                    self.timeline.add_clip_data(clip_data)
            
            # Commit timeline changes to update duration
            try:
                self.timeline.commit()
                logger.info("Timeline changes committed")
            except Exception as e:
                logger.debug(f"Timeline commit failed (might be normal): {e}")
            
            logger.info("GES timeline created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating GES timeline: {e}")
            return False
    
    def _configure_timeline_tracks(self, timeline_data: TimelineData):
        """Configure video and audio tracks with specific caps"""
        if not self._check_ges_available():
            return
            
        try:
            tracks = self.timeline.get_tracks()
            
            for track in tracks:
                track_type = track.get_property("track-type")
                
                if track_type == GES.TrackType.VIDEO:
                    # Set video track restrictions
                    video_caps = Gst.Caps.from_string(
                        f"video/x-raw,width={timeline_data.width},"
                        f"height={timeline_data.height},"
                        f"framerate={int(timeline_data.frame_rate)}/1"
                    )
                    track.set_restriction_caps(video_caps)
                    track.set_mixing(True)  # Enable transitions
                    
                elif track_type == GES.TrackType.AUDIO:
                    # Set audio track restrictions  
                    audio_caps = Gst.Caps.from_string(
                        f"audio/x-raw,rate={timeline_data.sample_rate},"
                        f"channels={timeline_data.channels}"
                    )
                    track.set_restriction_caps(audio_caps)
                    track.set_mixing(True)  # Enable audio mixing
                    
        except Exception as e:
            logger.error(f"Error configuring timeline tracks: {e}")
    
    def _add_uri_clip_to_layer(self, layer: Any, clip_data: TimelineClip) -> bool:
        """Add a URI clip (video/audio) to the specified layer"""
        if not self._check_ges_available():
            return False
        
        # If using stub classes, always return success for testing purposes
        if GES_USING_STUBS:
            logger.info(f"Mock: Added URI clip {clip_data.name} (stub mode)")
            return True
            
        try:
            # Validate clip data
            if not clip_data.file_path:
                logger.error(f"No file path provided for clip {clip_data.name}")
                return False
                
            if clip_data.duration <= 0:
                logger.error(f"Invalid duration {clip_data.duration} for clip {clip_data.name}")
                return False
                
            # Handle different URI types properly
            if clip_data.file_path.startswith(('http://', 'https://', 'rtsp://', 'file://')):
                # Already a valid URI (HTTP/HTTPS/RTSP/file)
                file_uri = clip_data.file_path
                logger.info(f"Using URI directly: {file_uri}")
            else:
                # Assume it's a local file path, convert to file:// URI
                file_path = os.path.abspath(clip_data.file_path)
                # Check if file exists
                if not os.path.exists(file_path):
                    logger.error(f"File does not exist: {file_path}")
                    return False
                file_uri = f"file://{file_path}"
                logger.info(f"Converted local path to URI: {file_uri}")
                
            logger.info(f"Adding URI clip: {clip_data.name} at {clip_data.start}s (duration: {clip_data.duration}s)")
            logger.debug(f"URI: {file_uri}")
            
            # Create URI clip
            clip = GES.UriClip.new(file_uri)
            if not clip:
                logger.error(f"Failed to create URI clip for {file_uri}")
                return False
            
            # Validate timing values
            start_ns = int(clip_data.start * Gst.SECOND)
            duration_ns = int(clip_data.duration * Gst.SECOND)
            inpoint_ns = int(clip_data.in_point * Gst.SECOND)
            
            if start_ns < 0 or duration_ns <= 0 or inpoint_ns < 0:
                logger.error(f"Invalid timing values for clip {clip_data.name}: start={start_ns}, duration={duration_ns}, inpoint={inpoint_ns}")
                return False
            
            # Set timing properties (GES uses nanoseconds)
            clip.set_start(start_ns)
            clip.set_duration(duration_ns)
            clip.set_inpoint(inpoint_ns)
            
            # Add to layer
            layer.add_clip(clip)
            logger.info(f"✅ Added clip {clip_data.name} successfully (start: {clip_data.start}s, duration: {clip_data.duration}s)")
            return True
            
        except Exception as e:
            logger.error(f"Error adding URI clip {clip_data.name}: {e}")
            logger.debug(f"Clip data: start={clip_data.start}, duration={clip_data.duration}, file_path={clip_data.file_path}")
            return False
    
    def _add_text_clip_to_layer(self, layer: Any, clip_data: TimelineClip) -> bool:
        """Add a text overlay clip to the specified layer"""
        if not self._check_ges_available():
            return False
        
        # If using stub classes, always return success for testing purposes
        if GES_USING_STUBS:
            logger.info(f"Mock: Added text clip {clip_data.name} (stub mode)")
            return True
            
        try:
            logger.info(f"Adding text clip: {clip_data.name} at {clip_data.start}s")
            
            # Create title clip for text overlay
            clip = GES.TitleClip.new()
            if not clip:
                logger.error("Failed to create title clip")
                return False
            
            # Set text properties
            clip.set_child_property("text", clip_data.name)
            clip.set_child_property("font-desc", "Sans Bold 24")
            clip.set_child_property("color", 0xFFFFFFFF)  # White text
            clip.set_child_property("halignment", 1)  # Center alignment
            clip.set_child_property("valignment", 2)  # Bottom alignment
            
            # Set timing properties
            clip.set_start(int(clip_data.start * Gst.SECOND))
            clip.set_duration(int(clip_data.duration * Gst.SECOND))
            
            # Add to layer
            layer.add_clip(clip)
            logger.info(f"✅ Added text clip {clip_data.name} successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error adding text clip {clip_data.name}: {e}")
            return False
    
    def start_preview_server(self, port: int = 8554) -> bool:
        """
        Start an RTSP preview server for the timeline
        """
        if not self._check_ges_available():
            return False
            
        try:
            if not self.timeline:
                logger.error("No timeline available for preview")
                return False
            
            # Create pipeline for preview
            self.pipeline = GES.Pipeline()
            self.pipeline.set_timeline(self.timeline)
            
            # Configure for RTSP streaming preview
            self._setup_rtsp_preview(port)
            
            # Commit timeline changes
            self.timeline.commit()
            
            # Setup bus for messages
            bus = self.pipeline.get_bus()
            bus.add_signal_watch()
            bus.connect("message", self._on_bus_message)
            
            # Set to preview mode
            self.pipeline.set_mode(GES.PipelineFlags.PREVIEW)
            
            # Start the pipeline
            ret = self.pipeline.set_state(Gst.State.PLAYING)
            if ret == Gst.StateChangeReturn.FAILURE:
                logger.error("Failed to start preview pipeline")
                return False
            
            # Start GLib main loop in a separate thread
            self._start_main_loop()
            
            logger.info(f"Preview server started on RTSP port {port}")
            return True
            
        except Exception as e:
            logger.error(f"Error starting preview server: {e}")
            return False
    
    def _setup_rtsp_preview(self, port: int):
        """Setup RTSP streaming for preview"""
        if not self._check_ges_available():
            return
            
        try:
            # For now, we'll use a simple preview sink
            # In production, you'd want to set up an RTSP server
            video_sink = Gst.ElementFactory.make("autovideosink", None)
            if video_sink:
                self.pipeline.preview_set_video_sink(video_sink)
            
            audio_sink = Gst.ElementFactory.make("autoaudiosink", None) 
            if audio_sink:
                self.pipeline.preview_set_audio_sink(audio_sink)
                
        except Exception as e:
            logger.error(f"Error setting up RTSP preview: {e}")
    
    def _start_main_loop(self):
        """Start GLib main loop in a separate thread"""
        if not self._check_ges_available():
            return
            
        def run_loop():
            self.main_loop = GLib.MainLoop()
            self.is_running = True
            logger.info("Starting GStreamer main loop")
            self.main_loop.run()
            
        self.loop_thread = threading.Thread(target=run_loop, daemon=True)
        self.loop_thread.start()
    
    def _on_bus_message(self, bus, message):
        """Handle GStreamer bus messages"""
        if not self._check_ges_available():
            return
            
        try:
            if message.type == Gst.MessageType.EOS:
                logger.info("End of stream reached")
            elif message.type == Gst.MessageType.ERROR:
                err, debug = message.parse_error()
                logger.error(f"GStreamer error: {err.message}")
                logger.debug(f"Debug info: {debug}")
            elif message.type == Gst.MessageType.WARNING:
                warn, debug = message.parse_warning()
                logger.warning(f"GStreamer warning: {warn.message}")
            elif message.type == Gst.MessageType.STATE_CHANGED:
                if message.src == self.pipeline:
                    old_state, new_state, pending_state = message.parse_state_changed()
                    logger.info(f"Pipeline state changed: {old_state.value_name} -> {new_state.value_name}")
                    
        except Exception as e:
            logger.error(f"Error handling bus message: {e}")
    
    def stop_preview(self):
        """Stop the preview server with proper cleanup"""
        if not self._check_ges_available():
            return
            
        try:
            if self.pipeline:
                self.pipeline.set_state(Gst.State.NULL)
                # Note: Don't unref pipeline here as it's reused, only in cleanup()
                
            if self.main_loop and self.is_running:
                self.main_loop.quit()
                self.is_running = False
                
            if self.loop_thread and self.loop_thread.is_alive():
                self.loop_thread.join(timeout=5.0)
                
            logger.info("Preview server stopped")
            
        except Exception as e:
            logger.error(f"Error stopping preview: {e}")
    
    def export_timeline(self, output_path: str, format_string: str = "video/x-h264+audio/mpeg") -> bool:
        """
        Export the timeline to a video file
        """
        if not self._check_ges_available():
            return False
            
        try:
            if not self.timeline:
                logger.error("No timeline available for export")
                return False
            
            # Create a new pipeline for export
            export_pipeline = GES.Pipeline()
            export_pipeline.set_timeline(self.timeline)
            
            # Create encoding profile
            profile = Gst.EncodingProfile.from_string(format_string)
            if not profile:
                logger.error(f"Failed to create encoding profile: {format_string}")
                return False
            
            # Set render settings
            output_uri = f"file://{os.path.abspath(output_path)}"
            export_pipeline.set_render_settings(output_uri, profile)
            export_pipeline.set_mode(GES.PipelineFlags.RENDER)
            
            # Commit timeline
            self.timeline.commit()
            
            # Setup export monitoring
            bus = export_pipeline.get_bus()
            bus.add_signal_watch()
            
            export_complete = threading.Event()
            export_success = [False]  # Use list for closure
            
            def on_export_message(bus, message):
                if message.type == Gst.MessageType.EOS:
                    logger.info("Export completed successfully")
                    export_success[0] = True
                    export_complete.set()
                elif message.type == Gst.MessageType.ERROR:
                    err, debug = message.parse_error()
                    logger.error(f"Export failed: {err.message}")
                    export_complete.set()
            
            bus.connect("message", on_export_message)
            
            # Start export
            ret = export_pipeline.set_state(Gst.State.PLAYING)
            if ret == Gst.StateChangeReturn.FAILURE:
                logger.error("Failed to start export pipeline")
                return False
            
            # Wait for export to complete
            logger.info(f"Starting export to {output_path}")
            export_complete.wait(timeout=300)  # 5 minute timeout
            
            # Cleanup - let Python GI handle memory management
            export_pipeline.set_state(Gst.State.NULL)
            bus.remove_signal_watch()
            # Don't call unref() - let Python GI handle it
            export_pipeline = None  # Set to None after use
            
            return export_success[0]
            
        except Exception as e:
            logger.error(f"Error exporting timeline: {e}")
            # Ensure cleanup even if errors occur
            try:
                if 'export_pipeline' in locals():
                    export_pipeline.set_state(Gst.State.NULL)
                    # Don't call unref() - let Python GI handle it
                    export_pipeline = None  # Set to None after use
            except:
                pass
            return False
    
    def get_timeline_duration(self) -> float:
        """Get the total duration of the timeline in seconds"""
        if not self.timeline:
            return 0.0
        
        try:
            # Try to get duration from timeline
            duration_ns = self.timeline.get_duration()
            duration_seconds = duration_ns / Gst.SECOND
            
            if duration_seconds > 0:
                logger.debug(f"Got timeline duration from GES: {duration_seconds}s")
                return duration_seconds
            else:
                logger.debug("Timeline duration is 0, this might be normal for newly created timelines")
                return duration_seconds
                
        except Exception as e:
            logger.warning(f"Failed to get timeline duration from GES: {e}")
            return 0.0
    
    def seek_to_position(self, position_seconds: float) -> bool:
        """Seek to a specific position in the timeline"""
        if not self._check_ges_available():
            return False
            
        try:
            if not self.pipeline:
                return False
            
            position_ns = int(position_seconds * Gst.SECOND)
            
            seek_event = Gst.Event.new_seek(
                1.0,  # rate
                Gst.Format.TIME,
                Gst.SeekFlags.FLUSH | Gst.SeekFlags.ACCURATE,
                Gst.SeekType.SET, position_ns,
                Gst.SeekType.NONE, -1
            )
            
            return self.pipeline.send_event(seek_event)
            
        except Exception as e:
            logger.error(f"Error seeking to position {position_seconds}: {e}")
            return False
    
    def cleanup(self):
        """Clean up resources with improved GStreamer memory management"""
        try:
            logger.info("Starting GES service cleanup...")
            
            # Stop any running preview first
            self.stop_preview()
            
            # Clean up pipeline first (it references the timeline)
            if self.pipeline:
                try:
                    # Stop the pipeline completely
                    self.pipeline.set_state(Gst.State.NULL)
                    # Wait for state change to complete
                    self.pipeline.get_state(Gst.CLOCK_TIME_NONE)
                    logger.info("Pipeline stopped and cleaned up")
                except Exception as e:
                    logger.warning(f"Error stopping pipeline: {e}")
                finally:
                    self.pipeline = None
            
            # Clean up timeline and its contents more carefully
            if self.timeline:
                try:
                    # Clear all layers and their clips - be more defensive
                    layers = self.timeline.get_layers() if hasattr(self.timeline, 'get_layers') else []
                    layers_list = list(layers) if layers else []  # Safe copy
                    
                    for layer in layers_list:
                        try:
                            # Remove all clips from layer safely
                            clips = layer.get_clips() if hasattr(layer, 'get_clips') else []
                            clips_list = list(clips) if clips else []  # Safe copy
                            
                            for clip in clips_list:
                                try:
                                    layer.remove_clip(clip)
                                except Exception as clip_error:
                                    logger.debug(f"Error removing clip: {clip_error}")
                            
                            # Remove layer from timeline safely
                            try:
                                self.timeline.remove_layer(layer)
                            except Exception as layer_error:
                                logger.debug(f"Error removing layer: {layer_error}")
                                
                        except Exception as e:
                            logger.debug(f"Error cleaning layer: {e}")
                    
                    logger.info(f"Cleaned up {len(layers_list)} timeline layers")
                    
                except Exception as e:
                    logger.warning(f"Error cleaning timeline layers: {e}")
                finally:
                    self.timeline = None
            
            # Reset state
            self.is_running = False
            self.timeline_data = None
            
            # Stop main loop if running
            if self.main_loop:
                try:
                    if hasattr(self.main_loop, 'is_running') and self.main_loop.is_running():
                        self.main_loop.quit()
                except Exception as e:
                    logger.debug(f"Error stopping main loop: {e}")
                finally:
                    self.main_loop = None
            
            # Wait for loop thread to finish
            if self.loop_thread and self.loop_thread.is_alive():
                try:
                    self.loop_thread.join(timeout=2.0)
                except Exception as e:
                    logger.debug(f"Error joining loop thread: {e}")
                finally:
                    self.loop_thread = None
            
            logger.info("✅ GES service cleanup completed successfully")
            
        except Exception as e:
            logger.error(f"❌ Error during GES cleanup: {e}")
        finally:
            # Force reset state even if cleanup failed to prevent memory leaks
            self.timeline = None
            self.pipeline = None
            self.main_loop = None
            self.loop_thread = None
            self.is_running = False
            self.timeline_data = None

# Global service instance
_ges_service_instance: Optional[GESTimelineService] = None

def get_ges_service() -> GESTimelineService:
    """Get or create the global GES service instance"""
    global _ges_service_instance
    if _ges_service_instance is None:
        _ges_service_instance = GESTimelineService()
    return _ges_service_instance

def cleanup_ges_service():
    """Cleanup the global GES service instance and uninitialize GStreamer"""
    global _ges_service_instance, GES_INITIALIZED
    
    try:
        # Clean up service instance if it exists
        if _ges_service_instance:
            logger.info("Cleaning up GES service instance...")
            _ges_service_instance.cleanup()
            _ges_service_instance = None
            logger.info("✅ GES service instance cleaned up")
        
        # Uninitialize GStreamer if it was initialized
        with GES_INIT_LOCK:
            if GES_INITIALIZED and GES_IMPORTS_AVAILABLE:
                try:
                    logger.info("Uninitializing GStreamer...")
                    # Note: GStreamer doesn't have a proper uninit function
                    # but we can mark it as uninitialized for our tracking
                    GES_INITIALIZED = False
                    logger.info("✅ GStreamer marked as uninitialized")
                except Exception as e:
                    logger.error(f"Error during GStreamer cleanup: {e}")
            elif not GES_INITIALIZED:
                logger.info("GStreamer was not initialized, nothing to cleanup")
    
    except Exception as e:
        logger.error(f"Error during cleanup_ges_service: {e}")
        # Force cleanup even if errors occur
        try:
            _ges_service_instance = None
            with GES_INIT_LOCK:
                GES_INITIALIZED = False
        except:
            pass

def is_ges_available() -> bool:
    """Check if GES is available"""
    return _initialize_ges()

def get_ges_status() -> dict:
    """Get the current status of GES availability without triggering initialization"""
    # Return status without initializing GStreamer
    return {
        "available": GES_INITIALIZED and GES_IMPORTS_AVAILABLE and not GES_FORCE_DISABLED,
        "has_imports": GES_IMPORTS_AVAILABLE,
        "has_ges": GES_INITIALIZED,
        "initialized": GES_INITIALIZED,
        "force_disabled": GES_FORCE_DISABLED,
        "using_stubs": GES_USING_STUBS,
        "disable_reason": "malloc errors from threading conflicts" if GES_FORCE_DISABLED else None
    } 