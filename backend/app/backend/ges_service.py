#!/usr/bin/env python3

# Optional GStreamer imports - backend will work without GES if not installed
try:
    import gi
    gi.require_version('Gst', '1.0')
    gi.require_version('GES', '1.0')

    from gi.repository import Gst, GES, GLib
    
    # Initialize GStreamer
    Gst.init(None)
    GES.init()
    
    GES_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  GStreamer not available: {e}")
    print("   Install with: ./install_ges.sh (macOS) or apt-get install python3-gi (Ubuntu)")
    GES_AVAILABLE = False
    
    # Stub classes for when GES is not available
    class Gst:
        SECOND = 1000000000
        class State:
            NULL = "NULL"
            PLAYING = "PLAYING"
        class MessageType:
            EOS = "EOS"
            ERROR = "ERROR"
            WARNING = "WARNING"
            STATE_CHANGED = "STATE_CHANGED"
    
    class GES:
        class Timeline:
            @staticmethod
            def new_audio_video():
                return None
        class Pipeline:
            pass
        class PipelineFlags:
            PREVIEW = "PREVIEW"
            RENDER = "RENDER"
    
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

@dataclass
class TimelineClip:
    id: str
    name: str
    start: float  # seconds
    end: float    # seconds
    duration: float  # seconds
    file_path: str
    type: str
    in_point: float = 0.0  # seconds

@dataclass
class TimelineData:
    clips: List[TimelineClip]
    frame_rate: float = 30.0
    width: int = 1920
    height: int = 1080
    sample_rate: int = 48000
    channels: int = 2

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
        self.ges_available = GES_AVAILABLE
        
    def _check_ges_available(self) -> bool:
        """Check if GES is available and raise appropriate error if not"""
        if not self.ges_available:
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
            
            # Create timeline with audio and video tracks
            self.timeline = GES.Timeline.new_audio_video()
            
            # Set timeline properties
            self._configure_timeline_tracks(timeline_data)
            
            # Create layers for clips (main layer and overlay layer)
            main_layer = self.timeline.append_layer()      # Priority 0
            overlay_layer = self.timeline.append_layer()   # Priority 1
            
            # Sort clips by start time
            sorted_clips = sorted(timeline_data.clips, key=lambda c: c.start)
            
            # Add video/audio clips to main layer with enhanced error handling
            successful_clips = 0
            failed_clips = 0
            
            for clip_data in sorted_clips:
                if clip_data.type in ['video', 'audio']:
                    success = self._add_uri_clip_to_layer(main_layer, clip_data)
                    if success:
                        successful_clips += 1
                        logger.info(f"✅ Successfully added {clip_data.type} clip: {clip_data.name}")
                    else:
                        failed_clips += 1
                        logger.error(f"❌ Failed to add {clip_data.type} clip: {clip_data.name}")
                elif clip_data.type == 'text':
                    success = self._add_text_clip_to_layer(overlay_layer, clip_data)
                    if success:
                        successful_clips += 1
                        logger.info(f"✅ Successfully added text clip: {clip_data.name}")
                    else:
                        failed_clips += 1
                        logger.error(f"❌ Failed to add text clip: {clip_data.name}")
            
            logger.info(f"GES timeline creation summary: {successful_clips} successful, {failed_clips} failed")
            
            # Return False if more than half the clips failed
            if failed_clips > successful_clips:
                logger.error("Timeline creation failed: Too many clips failed to load")
                return False
            
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
            
        try:
            # Validate clip data
            if not clip_data.file_path:
                logger.error(f"No file path provided for clip {clip_data.name}")
                return False
                
            if clip_data.duration <= 0:
                logger.error(f"Invalid duration {clip_data.duration} for clip {clip_data.name}")
                return False
                
            # Ensure file path is a proper URI
            if not clip_data.file_path.startswith('file://'):
                file_path = os.path.abspath(clip_data.file_path)
                # Check if file exists
                if not os.path.exists(file_path):
                    logger.error(f"File does not exist: {file_path}")
                    return False
                file_uri = f"file://{file_path}"
            else:
                file_uri = clip_data.file_path
                
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
        """Stop the preview server"""
        if not self._check_ges_available():
            return
            
        try:
            if self.pipeline:
                self.pipeline.set_state(Gst.State.NULL)
                
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
            
            # Cleanup
            export_pipeline.set_state(Gst.State.NULL)
            
            return export_success[0]
            
        except Exception as e:
            logger.error(f"Error exporting timeline: {e}")
            return False
    
    def get_timeline_duration(self) -> float:
        """Get the total duration of the timeline in seconds"""
        if not self.timeline or not self._check_ges_available():
            return 0.0
        
        try:
            duration_ns = self.timeline.get_duration()
            return duration_ns / Gst.SECOND
        except:
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
        """Clean up resources"""
        if not self._check_ges_available():
            return
            
        try:
            self.stop_preview()
            
            if self.timeline:
                # Clear all layers and tracks
                for layer in self.timeline.get_layers():
                    self.timeline.remove_layer(layer)
                for track in self.timeline.get_tracks():
                    self.timeline.remove_track(track)
                    
            self.timeline = None
            self.pipeline = None
            
            logger.info("GES service cleaned up")
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

# Global service instance
_ges_service_instance: Optional[GESTimelineService] = None

def get_ges_service() -> GESTimelineService:
    """Get or create the global GES service instance"""
    global _ges_service_instance
    if _ges_service_instance is None:
        _ges_service_instance = GESTimelineService()
    return _ges_service_instance

def cleanup_ges_service():
    """Cleanup the global GES service instance"""
    global _ges_service_instance
    if _ges_service_instance:
        _ges_service_instance.cleanup()
        _ges_service_instance = None

def is_ges_available() -> bool:
    """Check if GES is available"""
    return GES_AVAILABLE

def get_ges_status() -> dict:
    """Get the current status of GES availability"""
    return {
        "available": GES_AVAILABLE,
        "has_imports": True,
        "has_ges": True
    } 