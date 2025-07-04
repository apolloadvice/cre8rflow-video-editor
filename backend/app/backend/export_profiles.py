"""
Professional Export Profiles Service

Provides industry-standard export presets for different platforms, quality levels,
and use cases. Supports both FFmpeg and GES rendering pipelines.
"""

from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass
from enum import Enum
import os


class ExportCategory(Enum):
    """Export profile categories"""
    SOCIAL_MEDIA = "social_media"
    BROADCAST = "broadcast" 
    CINEMA = "cinema"
    WEB = "web"
    MOBILE = "mobile"
    ARCHIVE = "archive"
    CUSTOM = "custom"


class VideoCodec(Enum):
    """Supported video codecs"""
    H264 = "libx264"
    H265 = "libx265"
    PRORES = "prores"
    PRORES_422 = "prores_422"
    PRORES_4444 = "prores_4444"
    VP9 = "libvpx-vp9"
    AV1 = "libaom-av1"


class AudioCodec(Enum):
    """Supported audio codecs"""
    AAC = "aac"
    MP3 = "libmp3lame"
    PCM = "pcm_s24le"
    OPUS = "libopus"
    VORBIS = "libvorbis"


@dataclass
class ExportProfile:
    """Professional export profile definition"""
    id: str
    name: str
    description: str
    category: ExportCategory
    
    # Container
    container: str  # mp4, mov, mkv, webm
    
    # Video settings
    video_codec: VideoCodec
    video_bitrate: Optional[str] = None  # e.g., "8000k"
    video_crf: Optional[int] = None      # For CRF encoding
    resolution: str = "1920x1080"        # WxH
    framerate: str = "30"                # fps or fraction "30000/1001"
    video_preset: Optional[str] = None   # ultrafast, fast, medium, slow, veryslow
    
    # Audio settings
    audio_codec: AudioCodec = AudioCodec.AAC
    audio_bitrate: str = "192k"
    audio_channels: int = 2
    audio_samplerate: int = 48000
    
    # Advanced settings
    color_space: Optional[str] = None    # rec709, rec2020, etc.
    color_range: Optional[str] = None    # tv, pc
    pixel_format: Optional[str] = None   # yuv420p, yuv422p10le, etc.
    
    # Platform specific
    platform_specific: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.platform_specific is None:
            self.platform_specific = {}


class ProfessionalExportProfiles:
    """Professional export profiles registry"""
    
    def __init__(self):
        self._profiles: Dict[str, ExportProfile] = {}
        self._load_default_profiles()
    
    def _load_default_profiles(self):
        """Load all default professional profiles"""
        
        # ================== SOCIAL MEDIA PROFILES ==================
        
        # YouTube
        self._add_profile(ExportProfile(
            id="youtube_1080p_h264",
            name="YouTube 1080p (H.264)",
            description="Optimized for YouTube uploads with excellent quality-to-size ratio",
            category=ExportCategory.SOCIAL_MEDIA,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_bitrate="8000k",
            resolution="1920x1080",
            framerate="30",
            video_preset="medium",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="192k",
            platform_specific={
                "youtube_optimized": True,
                "fast_start": True,
                "moov_atom": "front"
            }
        ))
        
        self._add_profile(ExportProfile(
            id="youtube_4k_h264",
            name="YouTube 4K (H.264)",
            description="4K upload for YouTube with high bitrate",
            category=ExportCategory.SOCIAL_MEDIA,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_bitrate="35000k",
            resolution="3840x2160",
            framerate="30",
            video_preset="medium",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="192k"
        ))
        
        # Instagram
        self._add_profile(ExportProfile(
            id="instagram_feed_1080",
            name="Instagram Feed (1080x1080)",
            description="Square format for Instagram feed posts",
            category=ExportCategory.SOCIAL_MEDIA,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_bitrate="3500k",
            resolution="1080x1080",
            framerate="30",
            video_preset="medium",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="128k",
            platform_specific={
                "max_duration": 60,
                "max_file_size": "100MB"
            }
        ))
        
        self._add_profile(ExportProfile(
            id="instagram_story_1080",
            name="Instagram Story (1080x1920)",
            description="Vertical format for Instagram Stories",
            category=ExportCategory.SOCIAL_MEDIA,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_bitrate="2000k",
            resolution="1080x1920",
            framerate="30",
            video_preset="medium",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="128k",
            platform_specific={
                "max_duration": 15,
                "max_file_size": "30MB"
            }
        ))
        
        # TikTok
        self._add_profile(ExportProfile(
            id="tiktok_1080",
            name="TikTok (1080x1920)",
            description="Optimized for TikTok uploads",
            category=ExportCategory.SOCIAL_MEDIA,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_bitrate="2500k",
            resolution="1080x1920",
            framerate="30",
            video_preset="fast",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="128k",
            platform_specific={
                "max_duration": 180,
                "max_file_size": "287MB"
            }
        ))
        
        # ================== WEB PROFILES ==================
        
        self._add_profile(ExportProfile(
            id="web_1080p_h264",
            name="Web 1080p (H.264)",
            description="Optimized for web streaming and embedding",
            category=ExportCategory.WEB,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_crf=23,
            resolution="1920x1080",
            framerate="30",
            video_preset="medium",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="128k",
            platform_specific={
                "fast_start": True,
                "web_optimized": True
            }
        ))
        
        self._add_profile(ExportProfile(
            id="web_720p_h264",
            name="Web 720p (H.264)",
            description="Smaller web format for faster loading",
            category=ExportCategory.WEB,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_crf=25,
            resolution="1280x720",
            framerate="30",
            video_preset="medium",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="128k"
        ))
        
        # ================== MOBILE PROFILES ==================
        
        self._add_profile(ExportProfile(
            id="mobile_720p_h264",
            name="Mobile 720p (H.264)",
            description="Optimized for mobile devices and data usage",
            category=ExportCategory.MOBILE,
            container="mp4",
            video_codec=VideoCodec.H264,
            video_bitrate="1500k",
            resolution="1280x720",
            framerate="30",
            video_preset="fast",
            audio_codec=AudioCodec.AAC,
            audio_bitrate="96k"
        ))
        
        # ================== BROADCAST PROFILES ==================
        
        self._add_profile(ExportProfile(
            id="broadcast_1080p_prores",
            name="Broadcast 1080p ProRes 422",
            description="Professional broadcast quality with ProRes 422",
            category=ExportCategory.BROADCAST,
            container="mov",
            video_codec=VideoCodec.PRORES_422,
            resolution="1920x1080",
            framerate="29.97",
            audio_codec=AudioCodec.PCM,
            audio_bitrate="1536k",
            audio_channels=2,
            color_space="rec709",
            pixel_format="yuv422p10le"
        ))
    
    def _add_profile(self, profile: ExportProfile):
        """Add a profile to the registry"""
        self._profiles[profile.id] = profile
    
    def get_profile(self, profile_id: str) -> Optional[ExportProfile]:
        """Get a specific export profile by ID"""
        return self._profiles.get(profile_id)
    
    def get_profiles_by_category(self, category: ExportCategory) -> List[ExportProfile]:
        """Get all profiles in a specific category"""
        return [p for p in self._profiles.values() if p.category == category]
    
    def get_all_profiles(self) -> List[ExportProfile]:
        """Get all available profiles"""
        return list(self._profiles.values())
    
    def get_profile_ids(self) -> List[str]:
        """Get all profile IDs"""
        return list(self._profiles.keys())
    
    def search_profiles(self, query: str) -> List[ExportProfile]:
        """Search profiles by name or description"""
        query_lower = query.lower()
        return [
            p for p in self._profiles.values()
            if query_lower in p.name.lower() or query_lower in p.description.lower()
        ]
    
    def generate_ffmpeg_args(self, profile: ExportProfile, input_file: str, output_file: str) -> List[str]:
        """Generate FFmpeg command arguments for a given profile"""
        args = ["ffmpeg", "-y", "-i", input_file]
        
        # Video codec and settings
        args.extend(["-c:v", profile.video_codec.value])
        
        if profile.video_bitrate:
            args.extend(["-b:v", profile.video_bitrate])
        elif profile.video_crf is not None:
            args.extend(["-crf", str(profile.video_crf)])
        
        if profile.video_preset:
            args.extend(["-preset", profile.video_preset])
        
        # Resolution
        if profile.resolution != "original":
            args.extend(["-s", profile.resolution])
        
        # Framerate
        args.extend(["-r", profile.framerate])
        
        # Audio codec and settings
        args.extend(["-c:a", profile.audio_codec.value])
        args.extend(["-b:a", profile.audio_bitrate])
        args.extend(["-ac", str(profile.audio_channels)])
        args.extend(["-ar", str(profile.audio_samplerate)])
        
        # Color settings
        if profile.color_space:
            args.extend(["-colorspace", profile.color_space])
        
        if profile.pixel_format:
            args.extend(["-pix_fmt", profile.pixel_format])
        
        # Platform-specific optimizations
        if profile.platform_specific:
            if profile.platform_specific.get("fast_start"):
                args.extend(["-movflags", "+faststart"])
        
        args.append(output_file)
        return args
    
    def estimate_file_size(self, profile: ExportProfile, duration_seconds: float) -> Optional[float]:
        """Estimate output file size in MB based on profile and duration"""
        try:
            # Video bitrate estimation
            video_mbps = 0
            if profile.video_bitrate:
                # Parse bitrate string like "8000k" or "35000k"
                bitrate_str = profile.video_bitrate.lower().replace('k', '').replace('m', '000')
                video_kbps = float(bitrate_str)
                video_mbps = video_kbps / 8 / 1024  # Convert to MB/s
            elif profile.video_crf is not None:
                # Rough estimation based on CRF values
                crf_to_mbps = {
                    0: 50,    # Lossless
                    18: 8,    # High quality
                    23: 4,    # Medium quality
                    28: 2,    # Lower quality
                    32: 1     # Low quality
                }
                video_mbps = crf_to_mbps.get(profile.video_crf, 4)
            
            # Audio bitrate estimation
            audio_kbps = float(profile.audio_bitrate.lower().replace('k', ''))
            audio_mbps = audio_kbps / 8 / 1024  # Convert to MB/s
            
            total_mbps = video_mbps + audio_mbps
            estimated_size_mb = total_mbps * duration_seconds
            
            return estimated_size_mb
        except:
            return None


# Global instance
export_profiles_service = ProfessionalExportProfiles()