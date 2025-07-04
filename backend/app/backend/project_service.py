# GES Professional Project Service
# Implements project-centric workflow following GES best practices

from typing import Dict, List, Optional, Any
import threading
import time
import os
from pathlib import Path
from enum import Enum

# Import GES with fallback to stubs
try:
    import gi
    gi.require_version('Gst', '1.0')
    gi.require_version('GES', '1.0')
    gi.require_version('GstPbutils', '1.0')
    from gi.repository import Gst, GES, GstPbutils
    GES_AVAILABLE = True
except ImportError:
    GES_AVAILABLE = False
    # Use stub classes when GES not available
    from .ges_service import MockGst as Gst, MockGES as GES, MockGstPbutils as GstPbutils

class LayerType(Enum):
    """Professional layer types with priority mapping"""
    MAIN = 0        # Primary video content
    OVERLAY = 1     # Video overlays, picture-in-picture
    TEXT = 2        # Text overlays, titles, captions
    EFFECTS = 3     # Effects and transitions
    AUDIO = 4       # Audio-only content

class AssetType(Enum):
    """Supported asset types"""
    VIDEO = "video"
    AUDIO = "audio"
    IMAGE = "image"
    UNKNOWN = "unknown"

class ClipType(Enum):
    """GES clip types for professional editing"""
    URI_CLIP = "uri"        # Video/Audio from file
    TITLE_CLIP = "title"    # Text/Title overlay
    TEST_CLIP = "test"      # Test pattern/color
    TRANSITION = "transition"  # Transition between clips

class GESProjectService:
    """Professional GES project management following GES best practices"""
    
    def __init__(self):
        self._projects: Dict[str, Dict[str, Any]] = {}
        self._current_project_id: Optional[str] = None
        self._lock = threading.Lock()
        self._ges_initialized = False
        self._ges_init_attempted = False
        self._asset_cache: Dict[str, Dict[str, Any]] = {}  # Cache for asset metadata
        
        # Supported file extensions
        self._supported_video_formats = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'}
        self._supported_audio_formats = {'.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a'}
        self._supported_image_formats = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif'}
        
        print("GES Project Service created (GES initialization deferred)")
        # Note: GES initialization is now deferred until first use
    
    def _ensure_ges_initialized(self) -> bool:
        """Ensure GES is properly initialized (call this with lock already held)"""
        if self._ges_initialized:
            return True
            
        # If we've already attempted initialization and failed, don't retry
        if self._ges_init_attempted and not self._ges_initialized:
            print("GES initialization previously failed, using mock mode")
            return True
            
        if not GES_AVAILABLE:
            print("GES not available, using stub implementation")
            self._ges_initialized = True
            self._ges_init_attempted = True
            return True
            
        try:
            print("Attempting GES initialization...")
            self._ges_init_attempted = True
            
            # GES initialization (assuming lock is already held by caller)
            if not self._ges_initialized:
                if not Gst.is_initialized():
                    print("Initializing GStreamer...")
                    Gst.init(None)
                    
                print("Initializing GES...")
                if not GES.init():
                    print("❌ Failed to initialize GES - using mock mode")
                    return True  # Continue with mock mode instead of failing
                    
                self._ges_initialized = True
                print("✅ GES initialized successfully")
            return True
        except Exception as e:
            print(f"❌ Error initializing GES: {e}")
            print("Continuing with mock implementation")
            # Don't fail - continue with mock implementation
            return True

    def safe_initialize_ges(self) -> bool:
        """Thread-safe GES initialization that can be called independently"""
        if self._ges_initialized:
            return True
            
        with self._lock:
            return self._ensure_ges_initialized()
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get the current status of the GES service"""
        return {
            "service_available": True,
            "ges_available": GES_AVAILABLE,
            "ges_initialized": self._ges_initialized,
            "ges_init_attempted": self._ges_init_attempted,
            "mock_mode": self._ges_init_attempted and not self._ges_initialized,
            "projects_count": len(self._projects),
            "current_project": self._current_project_id
        }
    
    def _validate_asset_file(self, asset_path: str) -> tuple[bool, AssetType, str]:
        """Validate asset file and determine type"""
        if not os.path.exists(asset_path):
            return False, AssetType.UNKNOWN, f"File does not exist: {asset_path}"
        
        if not os.path.isfile(asset_path):
            return False, AssetType.UNKNOWN, f"Path is not a file: {asset_path}"
        
        # Check file size (avoid empty files)
        if os.path.getsize(asset_path) == 0:
            return False, AssetType.UNKNOWN, f"File is empty: {asset_path}"
        
        # Determine asset type by extension
        file_ext = Path(asset_path).suffix.lower()
        
        if file_ext in self._supported_video_formats:
            return True, AssetType.VIDEO, "Valid video file"
        elif file_ext in self._supported_audio_formats:
            return True, AssetType.AUDIO, "Valid audio file"
        elif file_ext in self._supported_image_formats:
            return True, AssetType.IMAGE, "Valid image file"
        else:
            return False, AssetType.UNKNOWN, f"Unsupported file format: {file_ext}"
    
    def _get_cached_metadata(self, asset_path: str) -> Optional[Dict[str, Any]]:
        """Get cached asset metadata if available and fresh"""
        cache_key = asset_path
        cached_data = self._asset_cache.get(cache_key)
        
        if cached_data:
            # Check if cache is fresh (within 1 hour)
            if time.time() - cached_data.get('cached_at', 0) < 3600:
                # Verify file hasn't changed
                current_mtime = os.path.getmtime(asset_path)
                if cached_data.get('file_mtime') == current_mtime:
                    return cached_data.get('metadata')
        
        return None
    
    def _cache_asset_metadata(self, asset_path: str, metadata: Dict[str, Any]):
        """Cache asset metadata with file modification time"""
        cache_key = asset_path
        self._asset_cache[cache_key] = {
            'metadata': metadata,
            'cached_at': time.time(),
            'file_mtime': os.path.getmtime(asset_path)
        }
    
    def _get_layer_by_type(self, project_id: str, layer_type: LayerType):
        """Get layer by type from project"""
        project_data = self._projects.get(project_id)
        if not project_data:
            return None
            
        if GES_AVAILABLE:
            timeline = project_data['timeline']
            # Find layer with matching priority
            for layer in timeline.get_layers():
                if layer.get_priority() == layer_type.value:
                    return layer
        else:
            # Mock layer handling
            layer_name = layer_type.name.lower()
            return project_data['layers'].get(layer_name)
        
        return None
    
    def _create_layer_if_needed(self, project_id: str, layer_type: LayerType):
        """Create layer if it doesn't exist"""
        project_data = self._projects.get(project_id)
        if not project_data:
            return None
            
        existing_layer = self._get_layer_by_type(project_id, layer_type)
        if existing_layer:
            return existing_layer
            
        if GES_AVAILABLE:
            timeline = project_data['timeline']
            # Create new layer
            layer = timeline.append_layer()
            layer.set_priority(layer_type.value)
            
            # Update stored layers
            layer_name = layer_type.name.lower()
            project_data['layers'][layer_name] = layer
            
            return layer
        else:
            # Mock layer creation
            layer_name = layer_type.name.lower()
            mock_layer = {"type": "mock_layer", "priority": layer_type.value}
            project_data['layers'][layer_name] = mock_layer
            return mock_layer

    def create_project(self, project_id: str, name: str, 
                      width: int = 1920, height: int = 1080, 
                      framerate: str = "30/1") -> bool:
        """Create new GES project with proper initialization"""
        with self._lock:
            if not self._ensure_ges_initialized():
                return False
            
            try:
                if GES_AVAILABLE:
                    # Create GES Timeline directly
                    timeline = GES.Timeline.new()
                    
                    # Create default layers with proper priorities
                    main_layer = timeline.append_layer()      # Priority 0 - Main content
                    overlay_layer = timeline.append_layer()   # Priority 1 - Overlays  
                    text_layer = timeline.append_layer()      # Priority 2 - Text/Graphics
                    
                    # Set layer priorities explicitly
                    main_layer.set_priority(LayerType.MAIN.value)
                    overlay_layer.set_priority(LayerType.OVERLAY.value)
                    text_layer.set_priority(LayerType.TEXT.value)
                    
                    # Create GES Project for asset management
                    project = GES.Project.new(None)
                    
                else:
                    # Mock implementation for development
                    project = {"type": "mock_project", "id": project_id}
                    timeline = {"type": "mock_timeline", "project_id": project_id}
                    main_layer = {"type": "mock_layer", "priority": LayerType.MAIN.value}
                    overlay_layer = {"type": "mock_layer", "priority": LayerType.OVERLAY.value}
                    text_layer = {"type": "mock_layer", "priority": LayerType.TEXT.value}
                
                # Store project state
                self._projects[project_id] = {
                    'project': project,
                    'timeline': timeline,
                    'layers': {
                        'main': main_layer,
                        'overlay': overlay_layer, 
                        'text': text_layer
                    },
                    'assets': {},
                    'clips': {},
                    'name': name,
                    'metadata': {
                        'width': width,
                        'height': height,
                        'framerate': framerate,
                        'created_at': time.time(),
                        'using_stubs': not GES_AVAILABLE
                    }
                }
                
                self._current_project_id = project_id
                print(f"Created GES project: {name} ({project_id})")
                return True
                
            except Exception as e:
                print(f"Error creating GES project: {e}")
                return False
    
    def add_clip_to_layer(self, project_id: str, asset_id: str, 
                         layer_type: LayerType, start_time: float, 
                         duration: float, in_point: float = 0.0) -> Optional[str]:
        """Add clip to specific layer with professional positioning"""
        with self._lock:
            if project_id not in self._projects:
                print(f"Project {project_id} not found")
                return None
                
            project_data = self._projects[project_id]
            
            # Validate asset exists
            if asset_id not in project_data['assets']:
                print(f"Asset {asset_id} not found in project")
                return None
            
            asset_data = project_data['assets'][asset_id]
            
            # Validate timing parameters
            if start_time < 0 or duration <= 0 or in_point < 0:
                print(f"Invalid timing parameters: start={start_time}, duration={duration}, in_point={in_point}")
                return None
                
            # Check if in_point + duration exceeds asset duration
            if in_point + duration > asset_data['duration']:
                print(f"Clip extends beyond asset duration: {in_point + duration} > {asset_data['duration']}")
                return None
            
            try:
                # Get or create target layer
                layer = self._create_layer_if_needed(project_id, layer_type)
                if not layer:
                    print(f"Failed to get/create layer {layer_type}")
                    return None
                
                # Generate clip ID
                clip_id = f"clip_{int(time.time() * 1000)}_{len(project_data['clips'])}"
                
                if GES_AVAILABLE:
                    # Create GES clip from asset
                    asset = asset_data['asset']
                    
                    # Convert time values to nanoseconds
                    start_ns = int(start_time * Gst.SECOND)
                    in_point_ns = int(in_point * Gst.SECOND)
                    duration_ns = int(duration * Gst.SECOND)
                    
                    # Create clip based on asset type
                    asset_type = asset_data.get('type', 'video')
                    if asset_type in ['video', 'audio']:
                        # Create URI clip for video/audio
                        clip = layer.add_asset(asset, start_ns, in_point_ns, duration_ns, GES.TrackType.UNKNOWN)
                    else:
                        print(f"Unsupported asset type for GES clip: {asset_type}")
                        return None
                    
                    if not clip:
                        print(f"Failed to create GES clip from asset {asset_id}")
                        return None
                        
                    # Store clip with GES reference
                    project_data['clips'][clip_id] = {
                        'clip': clip,
                        'asset_id': asset_id,
                        'layer_type': layer_type,
                        'start_time': start_time,
                        'duration': duration,
                        'in_point': in_point,
                        'clip_type': ClipType.URI_CLIP.value,
                        'created_at': time.time(),
                        'layer_priority': layer_type.value
                    }
                    
                else:
                    # Mock implementation
                    mock_clip = {
                        'type': 'mock_clip',
                        'asset_id': asset_id,
                        'start_time': start_time,
                        'duration': duration,
                        'in_point': in_point
                    }
                    
                    project_data['clips'][clip_id] = {
                        'clip': mock_clip,
                        'asset_id': asset_id,
                        'layer_type': layer_type,
                        'start_time': start_time,
                        'duration': duration,
                        'in_point': in_point,
                        'clip_type': ClipType.URI_CLIP.value,
                        'created_at': time.time(),
                        'layer_priority': layer_type.value
                    }
                
                print(f"Added clip {clip_id} to layer {layer_type.name} at {start_time}s")
                return clip_id
                
            except Exception as e:
                print(f"Error adding clip to layer: {e}")
                return None

    def add_title_clip_to_layer(self, project_id: str, layer_type: LayerType, 
                               start_time: float, duration: float, 
                               text: str, font_desc: str = "Sans Bold 36") -> Optional[str]:
        """Add text/title clip to layer"""
        with self._lock:
            if project_id not in self._projects:
                return None
                
            project_data = self._projects[project_id]
            
            try:
                # Get or create target layer
                layer = self._create_layer_if_needed(project_id, layer_type)
                if not layer:
                    return None
                
                clip_id = f"title_{int(time.time() * 1000)}"
                
                if GES_AVAILABLE:
                    # Create GES title clip
                    start_ns = int(start_time * Gst.SECOND)
                    duration_ns = int(duration * Gst.SECOND)
                    
                    clip = GES.TitleClip.new()
                    clip.set_start(start_ns)
                    clip.set_duration(duration_ns)
                    
                    # Set text properties
                    clip.set_text(text)
                    clip.set_font_desc(font_desc)
                    
                    # Add to layer
                    layer.add_clip(clip)
                    
                    project_data['clips'][clip_id] = {
                        'clip': clip,
                        'asset_id': None,
                        'layer_type': layer_type,
                        'start_time': start_time,
                        'duration': duration,
                        'in_point': 0.0,
                        'clip_type': ClipType.TITLE_CLIP.value,
                        'text': text,
                        'font_desc': font_desc,
                        'created_at': time.time(),
                        'layer_priority': layer_type.value
                    }
                    
                else:
                    # Mock title clip
                    mock_clip = {
                        'type': 'mock_title_clip',
                        'text': text,
                        'font_desc': font_desc
                    }
                    
                    project_data['clips'][clip_id] = {
                        'clip': mock_clip,
                        'asset_id': None,
                        'layer_type': layer_type,
                        'start_time': start_time,
                        'duration': duration,
                        'in_point': 0.0,
                        'clip_type': ClipType.TITLE_CLIP.value,
                        'text': text,
                        'font_desc': font_desc,
                        'created_at': time.time(),
                        'layer_priority': layer_type.value
                    }
                
                print(f"Added title clip '{text}' to layer {layer_type.name}")
                return clip_id
                
            except Exception as e:
                print(f"Error adding title clip: {e}")
                return None

    def move_clip(self, project_id: str, clip_id: str, new_start_time: float) -> bool:
        """Move clip to new timeline position"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or clip_id not in project_data['clips']:
                return False
            
            clip_data = project_data['clips'][clip_id]
            
            try:
                if GES_AVAILABLE and 'clip' in clip_data:
                    # Move GES clip
                    clip = clip_data['clip']
                    new_start_ns = int(new_start_time * Gst.SECOND)
                    clip.set_start(new_start_ns)
                
                # Update stored timing
                clip_data['start_time'] = new_start_time
                
                print(f"Moved clip {clip_id} to {new_start_time}s")
                return True
                
            except Exception as e:
                print(f"Error moving clip: {e}")
                return False

    def trim_clip(self, project_id: str, clip_id: str, new_duration: float, 
                  new_in_point: Optional[float] = None) -> bool:
        """Trim clip duration and optionally adjust in-point"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or clip_id not in project_data['clips']:
                return False
            
            clip_data = project_data['clips'][clip_id]
            asset_id = clip_data.get('asset_id')
            
            # Validate new parameters against asset duration
            if asset_id:
                asset_data = project_data['assets'][asset_id]
                current_in_point = new_in_point if new_in_point is not None else clip_data['in_point']
                
                if current_in_point + new_duration > asset_data['duration']:
                    print(f"Trim would extend beyond asset duration")
                    return False
            
            try:
                if GES_AVAILABLE and 'clip' in clip_data:
                    clip = clip_data['clip']
                    
                    # Set new duration
                    new_duration_ns = int(new_duration * Gst.SECOND)
                    clip.set_duration(new_duration_ns)
                    
                    # Set new in-point if provided
                    if new_in_point is not None:
                        new_in_point_ns = int(new_in_point * Gst.SECOND)
                        clip.set_inpoint(new_in_point_ns)
                
                # Update stored values
                clip_data['duration'] = new_duration
                if new_in_point is not None:
                    clip_data['in_point'] = new_in_point
                
                print(f"Trimmed clip {clip_id} to {new_duration}s")
                return True
                
            except Exception as e:
                print(f"Error trimming clip: {e}")
                return False

    def remove_clip_from_layer(self, project_id: str, clip_id: str) -> bool:
        """Remove clip from its layer"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or clip_id not in project_data['clips']:
                return False
            
            clip_data = project_data['clips'][clip_id]
            
            try:
                if GES_AVAILABLE and 'clip' in clip_data:
                    clip = clip_data['clip']
                    layer = clip.get_layer()
                    if layer:
                        layer.remove_clip(clip)
                
                # Remove from project clips
                del project_data['clips'][clip_id]
                
                print(f"Removed clip {clip_id} from project")
                return True
                
            except Exception as e:
                print(f"Error removing clip: {e}")
                return False

    def get_layer_clips(self, project_id: str, layer_type: LayerType) -> List[Dict[str, Any]]:
        """Get all clips on a specific layer"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return []
            
            layer_clips = []
            for clip_id, clip_data in project_data['clips'].items():
                if clip_data['layer_type'] == layer_type:
                    # Create safe copy for return
                    safe_clip = clip_data.copy()
                    # Remove GES object reference
                    if 'clip' in safe_clip and hasattr(safe_clip['clip'], '__gtype__'):
                        safe_clip['clip'] = f"<GES.Clip: {clip_id}>"
                    safe_clip['clip_id'] = clip_id
                    layer_clips.append(safe_clip)
            
            # Sort by start time
            layer_clips.sort(key=lambda x: x['start_time'])
            return layer_clips

    def get_clip_info(self, project_id: str, clip_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed clip information"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or clip_id not in project_data['clips']:
                return None
            
            clip_data = project_data['clips'][clip_id].copy()
            
            # Add calculated end time
            clip_data['end_time'] = clip_data['start_time'] + clip_data['duration']
            
            # Add asset information if available
            asset_id = clip_data.get('asset_id')
            if asset_id and asset_id in project_data['assets']:
                asset_data = project_data['assets'][asset_id]
                clip_data['asset_info'] = {
                    'path': asset_data['path'],
                    'duration': asset_data['duration'],
                    'type': asset_data['type']
                }
            
            # Remove GES object reference for JSON serialization
            if 'clip' in clip_data and hasattr(clip_data['clip'], '__gtype__'):
                clip_data['clip'] = f"<GES.Clip: {clip_id}>"
            
            clip_data['clip_id'] = clip_id
            return clip_data

    def list_all_clips(self, project_id: str) -> List[Dict[str, Any]]:
        """List all clips in project sorted by layer priority then start time"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return []
            
            all_clips = []
            for clip_id, clip_data in project_data['clips'].items():
                safe_clip = self.get_clip_info(project_id, clip_id)
                if safe_clip:
                    all_clips.append(safe_clip)
            
            # Sort by layer priority (lower = higher priority) then start time
            all_clips.sort(key=lambda x: (x['layer_priority'], x['start_time']))
            return all_clips

    def get_timeline_duration(self, project_id: str) -> float:
        """Calculate total timeline duration based on clips"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return 0.0
            
            max_end_time = 0.0
            for clip_data in project_data['clips'].values():
                end_time = clip_data['start_time'] + clip_data['duration']
                max_end_time = max(max_end_time, end_time)
            
            return max_end_time

    def add_asset_to_project(self, project_id: str, asset_path: str, 
                            asset_id: Optional[str] = None) -> Optional[str]:
        """Add media asset to project with comprehensive validation and metadata extraction"""
        with self._lock:
            if project_id not in self._projects:
                print(f"Project {project_id} not found")
                return None
            
            # Validate asset file
            is_valid, asset_type, message = self._validate_asset_file(asset_path)
            if not is_valid:
                print(f"Asset validation failed: {message}")
                return None
                
            project_data = self._projects[project_id]
            
            try:
                # Generate asset ID if not provided
                if not asset_id:
                    asset_id = f"asset_{len(project_data['assets'])}"
                
                # Check for duplicate assets
                for existing_asset in project_data['assets'].values():
                    if existing_asset['path'] == asset_path:
                        print(f"Asset already exists in project: {asset_path}")
                        return None
                
                # Try to get cached metadata first
                cached_metadata = self._get_cached_metadata(asset_path)
                
                if GES_AVAILABLE and not cached_metadata:
                    # Create GESAsset from URI for metadata extraction
                    uri = f"file://{Path(asset_path).absolute()}"
                    asset = GES.UriClipAsset.request_sync(uri)
                    
                    if not asset:
                        print(f"Failed to create GES asset from {uri}")
                        return None
                        
                    # Extract comprehensive metadata
                    discoverer_info = asset.get_info()
                    duration = discoverer_info.get_duration()
                    metadata = self._extract_comprehensive_metadata(discoverer_info, asset_type)
                    
                    # Cache the metadata
                    self._cache_asset_metadata(asset_path, metadata)
                    
                    # Store asset with full GES integration
                    project_data['assets'][asset_id] = {
                        'asset': asset,
                        'uri': uri, 
                        'path': asset_path,
                        'duration': duration / Gst.SECOND if duration != Gst.CLOCK_TIME_NONE else 0.0,
                        'type': asset_type.value,
                        'metadata': metadata,
                        'added_at': time.time(),
                        'file_size': os.path.getsize(asset_path),
                        'file_modified': os.path.getmtime(asset_path)
                    }
                    
                else:
                    # Use cached metadata or create mock data
                    if cached_metadata:
                        metadata = cached_metadata
                        duration = metadata.get('duration', 30.0)
                    else:
                        # Create basic metadata for mock/fallback
                        metadata = self._create_basic_metadata(asset_path, asset_type)
                        duration = metadata.get('duration', 30.0)
                        
                        # Cache the basic metadata
                        self._cache_asset_metadata(asset_path, metadata)
                    
                    # Store asset with basic information
                    project_data['assets'][asset_id] = {
                        'asset': {"type": "mock_asset", "path": asset_path} if not GES_AVAILABLE else None,
                        'uri': f"file://{Path(asset_path).absolute()}", 
                        'path': asset_path,
                        'duration': duration,
                        'type': asset_type.value,
                        'metadata': metadata,
                        'added_at': time.time(),
                        'file_size': os.path.getsize(asset_path),
                        'file_modified': os.path.getmtime(asset_path)
                    }
                
                print(f"Added {asset_type.value} asset {asset_id} to project {project_id}")
                return asset_id
                
            except Exception as e:
                print(f"Error adding asset to project: {e}")
                return None

    def _extract_comprehensive_metadata(self, info, asset_type: AssetType) -> dict:
        """Extract comprehensive metadata from GStreamer discoverer"""
        if not GES_AVAILABLE:
            return {}
            
        try:
            metadata = {
                'duration': info.get_duration() / Gst.SECOND if info.get_duration() != Gst.CLOCK_TIME_NONE else 0.0,
                'seekable': info.get_seekable(),
                'streams': [],
                'asset_type': asset_type.value,
                'container_format': None,
                'tags': {}
            }
            
            # Extract container format
            container_caps = info.get_container_streams()
            if container_caps:
                for caps in container_caps:
                    metadata['container_format'] = caps.get_caps().to_string()
                    break
            
            # Extract video streams with comprehensive info
            for stream in info.get_video_streams():
                video_info = {
                    'type': 'video',
                    'width': stream.get_width(),
                    'height': stream.get_height(), 
                    'framerate': f"{stream.get_framerate_num()}/{stream.get_framerate_denom()}",
                    'framerate_float': stream.get_framerate_num() / stream.get_framerate_denom() if stream.get_framerate_denom() > 0 else 0,
                    'bitrate': stream.get_bitrate(),
                    'max_bitrate': stream.get_max_bitrate(),
                    'depth': stream.get_depth(),
                    'pixel_aspect_ratio': f"{stream.get_par_num()}/{stream.get_par_denom()}",
                    'interlaced': stream.is_interlaced(),
                    'codec': stream.get_caps().to_string()
                }
                metadata['streams'].append(video_info)
            
            # Extract audio streams with comprehensive info
            for stream in info.get_audio_streams():
                audio_info = {
                    'type': 'audio',
                    'channels': stream.get_channels(),
                    'sample_rate': stream.get_sample_rate(),
                    'bitrate': stream.get_bitrate(),
                    'max_bitrate': stream.get_max_bitrate(),
                    'depth': stream.get_depth(),
                    'language': stream.get_language(),
                    'codec': stream.get_caps().to_string()
                }
                metadata['streams'].append(audio_info)
            
            # Extract tags (metadata like title, artist, etc.)
            tags = info.get_tags()
            if tags:
                tag_dict = {}
                def tag_foreach_func(tag_list, tag, user_data):
                    success, value = tag_list.get_string(tag)
                    if success:
                        tag_dict[tag] = value
                    return True
                tags.foreach(tag_foreach_func, None)
                metadata['tags'] = tag_dict
                
            return metadata
            
        except Exception as e:
            print(f"Error extracting comprehensive metadata: {e}")
            return {}

    def _create_basic_metadata(self, asset_path: str, asset_type: AssetType) -> dict:
        """Create basic metadata for assets when GES is not available"""
        file_stats = os.stat(asset_path)
        
        basic_metadata = {
            'duration': 30.0,  # Default duration
            'seekable': True,
            'streams': [],
            'asset_type': asset_type.value,
            'container_format': None,
            'tags': {},
            'file_size': file_stats.st_size,
            'created_from': 'basic_analysis'
        }
        
        # Add type-specific default stream info
        if asset_type == AssetType.VIDEO:
            basic_metadata['streams'].append({
                'type': 'video',
                'width': 1920,
                'height': 1080,
                'framerate': '30/1',
                'framerate_float': 30.0,
                'bitrate': 5000000,
                'codec': 'video/x-h264'
            })
            basic_metadata['streams'].append({
                'type': 'audio', 
                'channels': 2,
                'sample_rate': 48000,
                'bitrate': 192000,
                'codec': 'audio/mpeg'
            })
        elif asset_type == AssetType.AUDIO:
            basic_metadata['streams'].append({
                'type': 'audio',
                'channels': 2,
                'sample_rate': 48000,
                'bitrate': 192000,
                'codec': 'audio/mpeg'
            })
        elif asset_type == AssetType.IMAGE:
            basic_metadata['duration'] = 5.0  # Default image duration
            basic_metadata['streams'].append({
                'type': 'image',
                'width': 1920,
                'height': 1080,
                'codec': 'image/jpeg'
            })
        
        return basic_metadata

    def remove_asset_from_project(self, project_id: str, asset_id: str) -> bool:
        """Remove asset from project with cleanup"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or asset_id not in project_data['assets']:
                print(f"Asset {asset_id} not found in project {project_id}")
                return False
            
            try:
                # Check if asset is used in any clips
                clips_using_asset = []
                for clip_id, clip_data in project_data.get('clips', {}).items():
                    if clip_data.get('asset_id') == asset_id:
                        clips_using_asset.append(clip_id)
                
                if clips_using_asset:
                    print(f"Cannot remove asset {asset_id} - used by clips: {clips_using_asset}")
                    return False
                
                # Remove asset
                asset_data = project_data['assets'][asset_id]
                del project_data['assets'][asset_id]
                
                print(f"Removed asset {asset_id} from project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error removing asset: {e}")
                return False

    def get_asset_info(self, project_id: str, asset_id: str) -> Optional[Dict[str, Any]]:
        """Get detailed asset information"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or asset_id not in project_data['assets']:
                return None
            
            asset_data = project_data['assets'][asset_id].copy()
            
            # Remove GES object references for JSON serialization
            if 'asset' in asset_data and hasattr(asset_data['asset'], '__gtype__'):
                asset_data['asset'] = f"<GES.Asset: {asset_data['path']}>"
            
            return asset_data

    def list_project_assets(self, project_id: str, asset_type: Optional[AssetType] = None) -> List[Dict[str, Any]]:
        """List assets in project with optional type filtering"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return []
            
            assets = []
            for asset_id, asset_data in project_data['assets'].items():
                # Filter by type if specified
                if asset_type and asset_data.get('type') != asset_type.value:
                    continue
                
                # Create safe copy for return
                safe_asset = {
                    'asset_id': asset_id,
                    'path': asset_data['path'],
                    'duration': asset_data['duration'],
                    'type': asset_data['type'],
                    'file_size': asset_data['file_size'],
                    'added_at': asset_data['added_at'],
                    'metadata_summary': {
                        'streams': len(asset_data['metadata'].get('streams', [])),
                        'seekable': asset_data['metadata'].get('seekable', False),
                        'container_format': asset_data['metadata'].get('container_format')
                    }
                }
                assets.append(safe_asset)
            
            return assets

    def refresh_asset_metadata(self, project_id: str, asset_id: str) -> bool:
        """Refresh asset metadata (useful after file changes)"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or asset_id not in project_data['assets']:
                return False
            
            asset_data = project_data['assets'][asset_id]
            asset_path = asset_data['path']
            
            try:
                # Clear cache for this asset
                if asset_path in self._asset_cache:
                    del self._asset_cache[asset_path]
                
                # Re-validate and extract metadata
                is_valid, asset_type, message = self._validate_asset_file(asset_path)
                if not is_valid:
                    print(f"Asset no longer valid: {message}")
                    return False
                
                # Update file stats
                asset_data['file_size'] = os.path.getsize(asset_path)
                asset_data['file_modified'] = os.path.getmtime(asset_path)
                
                if GES_AVAILABLE:
                    # Re-extract metadata
                    uri = asset_data['uri']
                    asset = GES.UriClipAsset.request_sync(uri)
                    if asset:
                        discoverer_info = asset.get_info()
                        duration = discoverer_info.get_duration()
                        metadata = self._extract_comprehensive_metadata(discoverer_info, asset_type)
                        
                        # Update asset data
                        asset_data['asset'] = asset
                        asset_data['duration'] = duration / Gst.SECOND if duration != Gst.CLOCK_TIME_NONE else 0.0
                        asset_data['metadata'] = metadata
                        asset_data['type'] = asset_type.value
                        
                        # Cache new metadata
                        self._cache_asset_metadata(asset_path, metadata)
                
                print(f"Refreshed metadata for asset {asset_id}")
                return True
                
            except Exception as e:
                print(f"Error refreshing asset metadata: {e}")
                return False

    def _extract_asset_metadata(self, info) -> dict:
        """Extract comprehensive metadata from GStreamer discoverer (legacy method)"""
        # This method is kept for backward compatibility
        return self._extract_comprehensive_metadata(info, AssetType.VIDEO)
    
    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Get project data by ID"""
        with self._lock:
            return self._projects.get(project_id)
    
    def list_projects(self) -> Dict[str, Dict[str, Any]]:
        """List all projects with metadata"""
        with self._lock:
            return {
                pid: {
                    'name': pdata['name'],
                    'metadata': pdata['metadata'],
                    'asset_count': len(pdata['assets']),
                    'clip_count': len(pdata.get('clips', {}))
                }
                for pid, pdata in self._projects.items()
            }
    
    def get_current_project_id(self) -> Optional[str]:
        """Get current active project ID"""
        return self._current_project_id
    
    def set_current_project(self, project_id: str) -> bool:
        """Set active project"""
        with self._lock:
            if project_id in self._projects:
                self._current_project_id = project_id
                return True
            return False
    
    def delete_project(self, project_id: str) -> bool:
        """Delete project and cleanup resources"""
        with self._lock:
            if project_id not in self._projects:
                return False
                
            try:
                project_data = self._projects[project_id]
                
                # Cleanup GES resources if available
                if GES_AVAILABLE and 'project' in project_data:
                    # Let GES handle cleanup automatically
                    pass
                
                # Remove from projects dict
                del self._projects[project_id]
                
                # Update current project if needed
                if self._current_project_id == project_id:
                    self._current_project_id = None
                
                print(f"Deleted project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error deleting project: {e}")
                return False
    
    def get_project_assets(self, project_id: str) -> Dict[str, Any]:
        """Get all assets in a project"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return {}
            return project_data['assets']
    
    def get_project_status(self, project_id: str) -> Dict[str, Any]:
        """Get comprehensive project status"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return {'error': 'Project not found'}
            
            # Calculate asset type distribution
            asset_types = {}
            for asset_data in project_data['assets'].values():
                asset_type = asset_data.get('type', 'unknown')
                asset_types[asset_type] = asset_types.get(asset_type, 0) + 1
            
            # Calculate layer clip distribution
            layer_clips = {}
            timeline_duration = self.get_timeline_duration(project_id)
            
            for clip_data in project_data['clips'].values():
                layer_name = clip_data['layer_type'].name if hasattr(clip_data['layer_type'], 'name') else str(clip_data['layer_type'])
                layer_clips[layer_name] = layer_clips.get(layer_name, 0) + 1
            
            # Get pipeline status
            pipeline_status = self.get_pipeline_status(project_id)
            
            return {
                'project_id': project_id,
                'name': project_data['name'],
                'metadata': project_data['metadata'],
                'timeline': {
                    'duration': timeline_duration,
                    'total_clips': len(project_data['clips'])
                },
                'assets': {
                    'count': len(project_data['assets']),
                    'types': asset_types,
                    'list': list(project_data['assets'].keys())
                },
                'clips': {
                    'count': len(project_data.get('clips', {})),
                    'by_layer': layer_clips,
                    'list': list(project_data.get('clips', {}).keys())
                },
                'layers': {
                    'available': list(project_data['layers'].keys()),
                    'count': len(project_data['layers'])
                },
                'pipeline': pipeline_status,
                'cache_stats': {
                    'cached_assets': len(self._asset_cache),
                    'cache_size': f"{len(str(self._asset_cache))} chars"
                },
                'ges_available': GES_AVAILABLE,
                'using_stubs': project_data['metadata'].get('using_stubs', False)
            }

    # ==================== PIPELINE MANAGEMENT ====================

    def create_preview_pipeline(self, project_id: str) -> bool:
        """Create GESPipeline for timeline preview"""
        with self._lock:
            if project_id not in self._projects:
                print(f"Project {project_id} not found")
                return False
                
            project_data = self._projects[project_id]
            timeline = project_data['timeline']
            
            try:
                if GES_AVAILABLE:
                    # Create GES pipeline
                    pipeline = GES.Pipeline()
                    if not pipeline.set_timeline(timeline):
                        print("Failed to set timeline on pipeline")
                        return False
                    
                    # Set preview mode
                    pipeline.set_mode(GES.PipelineFlags.FULL_PREVIEW)
                    
                    # Store pipeline reference
                    project_data['preview_pipeline'] = pipeline
                    project_data['pipeline_state'] = 'ready'
                    
                else:
                    # Mock pipeline for development
                    mock_pipeline = {
                        'type': 'mock_preview_pipeline',
                        'state': 'ready',
                        'position': 0.0
                    }
                    project_data['preview_pipeline'] = mock_pipeline
                    project_data['pipeline_state'] = 'ready'
                
                print(f"Created preview pipeline for project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error creating preview pipeline: {e}")
                return False

    def start_preview(self, project_id: str) -> bool:
        """Start timeline preview playback"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return False
            
            # Create pipeline if it doesn't exist
            if 'preview_pipeline' not in project_data:
                if not self.create_preview_pipeline(project_id):
                    return False
            
            try:
                if GES_AVAILABLE:
                    pipeline = project_data['preview_pipeline']
                    
                    # Set pipeline to playing state
                    ret = pipeline.set_state(Gst.State.PLAYING)
                    if ret == Gst.StateChangeReturn.FAILURE:
                        print("Failed to start preview pipeline")
                        return False
                    
                    project_data['pipeline_state'] = 'playing'
                    
                else:
                    # Mock preview start
                    project_data['preview_pipeline']['state'] = 'playing'
                    project_data['pipeline_state'] = 'playing'
                
                print(f"Started preview for project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error starting preview: {e}")
                return False

    def pause_preview(self, project_id: str) -> bool:
        """Pause timeline preview playback"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or 'preview_pipeline' not in project_data:
                return False
            
            try:
                if GES_AVAILABLE:
                    pipeline = project_data['preview_pipeline']
                    
                    # Set pipeline to paused state
                    ret = pipeline.set_state(Gst.State.PAUSED)
                    if ret == Gst.StateChangeReturn.FAILURE:
                        print("Failed to pause preview pipeline")
                        return False
                    
                    project_data['pipeline_state'] = 'paused'
                    
                else:
                    # Mock preview pause
                    project_data['preview_pipeline']['state'] = 'paused'
                    project_data['pipeline_state'] = 'paused'
                
                print(f"Paused preview for project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error pausing preview: {e}")
                return False

    def stop_preview(self, project_id: str) -> bool:
        """Stop timeline preview playback"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or 'preview_pipeline' not in project_data:
                return False
            
            try:
                if GES_AVAILABLE:
                    pipeline = project_data['preview_pipeline']
                    
                    # Set pipeline to null state
                    ret = pipeline.set_state(Gst.State.NULL)
                    if ret == Gst.StateChangeReturn.FAILURE:
                        print("Failed to stop preview pipeline")
                        return False
                    
                    project_data['pipeline_state'] = 'stopped'
                    
                else:
                    # Mock preview stop
                    project_data['preview_pipeline']['state'] = 'stopped'
                    project_data['preview_pipeline']['position'] = 0.0
                    project_data['pipeline_state'] = 'stopped'
                
                print(f"Stopped preview for project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error stopping preview: {e}")
                return False

    def seek_preview(self, project_id: str, position: float) -> bool:
        """Seek preview pipeline to specific position (seconds)"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or 'preview_pipeline' not in project_data:
                return False
            
            # Validate position
            timeline_duration = self.get_timeline_duration(project_id)
            if position < 0 or position > timeline_duration:
                print(f"Invalid seek position: {position}s (timeline duration: {timeline_duration}s)")
                return False
            
            try:
                if GES_AVAILABLE:
                    pipeline = project_data['preview_pipeline']
                    
                    # Convert to nanoseconds and seek
                    position_ns = int(position * Gst.SECOND)
                    
                    # Perform seek
                    seek_result = pipeline.seek_simple(
                        Gst.Format.TIME,
                        Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT,
                        position_ns
                    )
                    
                    if not seek_result:
                        print(f"Seek failed for position {position}s")
                        return False
                    
                else:
                    # Mock seek
                    project_data['preview_pipeline']['position'] = position
                
                print(f"Seeked to {position}s in project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error seeking preview: {e}")
                return False

    def get_pipeline_status(self, project_id: str) -> Dict[str, Any]:
        """Get pipeline status and position"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return {'error': 'Project not found'}
            
            pipeline_info = {
                'has_preview_pipeline': 'preview_pipeline' in project_data,
                'has_render_pipeline': 'render_pipeline' in project_data,
                'state': project_data.get('pipeline_state', 'none'),
                'position': 0.0,
                'duration': self.get_timeline_duration(project_id)
            }
            
            if 'preview_pipeline' in project_data:
                try:
                    if GES_AVAILABLE:
                        pipeline = project_data['preview_pipeline']
                        
                        # Get current position
                        success, position_ns = pipeline.query_position(Gst.Format.TIME)
                        if success:
                            pipeline_info['position'] = position_ns / Gst.SECOND
                        
                        # Get current state
                        success, state, pending = pipeline.get_state(0)
                        if success:
                            state_names = {
                                Gst.State.NULL: 'null',
                                Gst.State.READY: 'ready', 
                                Gst.State.PAUSED: 'paused',
                                Gst.State.PLAYING: 'playing'
                            }
                            pipeline_info['gst_state'] = state_names.get(state, 'unknown')
                    else:
                        # Mock pipeline status
                        mock_pipeline = project_data['preview_pipeline']
                        pipeline_info['position'] = mock_pipeline.get('position', 0.0)
                        pipeline_info['gst_state'] = mock_pipeline.get('state', 'ready')
                        
                except Exception as e:
                    pipeline_info['error'] = f"Error getting pipeline status: {e}"
            
            return pipeline_info

    def export_project(self, project_id: str, output_path: str, 
                      profile: str = "mp4") -> bool:
        """Export project using GES rendering pipeline"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                print(f"Project {project_id} not found")
                return False
                
            timeline = project_data['timeline']
            
            # Validate timeline has clips
            if not project_data.get('clips'):
                print("Cannot export empty timeline")
                return False
            
            try:
                if GES_AVAILABLE:
                    # Create rendering pipeline
                    pipeline = GES.Pipeline()
                    if not pipeline.set_timeline(timeline):
                        print("Failed to set timeline on render pipeline")
                        return False
                    
                    # Set render mode
                    pipeline.set_mode(GES.PipelineFlags.RENDER)
                    
                    # Configure output profile
                    encoding_profile = self._create_encoding_profile(profile)
                    if not encoding_profile:
                        print(f"Failed to create encoding profile: {profile}")
                        return False
                    
                    # Set render settings
                    if not pipeline.set_render_settings(output_path, encoding_profile):
                        print("Failed to set render settings")
                        return False
                    
                    # Start rendering
                    ret = pipeline.set_state(Gst.State.PLAYING)
                    if ret == Gst.StateChangeReturn.FAILURE:
                        print("Failed to start render pipeline")
                        return False
                    
                    # Store render pipeline
                    project_data['render_pipeline'] = pipeline
                    project_data['render_output_path'] = output_path
                    project_data['render_profile'] = profile
                    project_data['render_state'] = 'rendering'
                    
                else:
                    # Mock export
                    mock_render = {
                        'type': 'mock_render_pipeline',
                        'output_path': output_path,
                        'profile': profile,
                        'state': 'rendering',
                        'progress': 0.0
                    }
                    project_data['render_pipeline'] = mock_render
                    project_data['render_output_path'] = output_path
                    project_data['render_profile'] = profile
                    project_data['render_state'] = 'rendering'
                
                print(f"Started export of project {project_id} to {output_path}")
                return True
                
            except Exception as e:
                print(f"Error starting export: {e}")
                return False

    def _create_encoding_profile(self, profile: str):
        """Create GStreamer encoding profile for export"""
        if not GES_AVAILABLE:
            return None
            
        try:
            if profile == "mp4":
                # MP4 container with H.264 video and AAC audio
                container = GstPbutils.EncodingContainerProfile.new(
                    "mp4", "MP4 Container", Gst.Caps.from_string("video/quicktime"))
                
                # H.264 video profile
                video_profile = GstPbutils.EncodingVideoProfile.new(
                    Gst.Caps.from_string("video/x-h264,profile=high"), 
                    None, None, 0)
                video_profile.set_property("bitrate", 5000000)  # 5 Mbps
                
                # AAC audio profile
                audio_profile = GstPbutils.EncodingAudioProfile.new(
                    Gst.Caps.from_string("audio/mpeg,mpegversion=4"), 
                    None, None, 0)
                audio_profile.set_property("bitrate", 192000)  # 192 kbps
                
                container.add_profile(video_profile)
                container.add_profile(audio_profile)
                
                return container
                
            elif profile == "webm":
                # WebM container with VP8 video and Vorbis audio
                container = GstPbutils.EncodingContainerProfile.new(
                    "webm", "WebM Container", Gst.Caps.from_string("video/webm"))
                
                # VP8 video profile
                video_profile = GstPbutils.EncodingVideoProfile.new(
                    Gst.Caps.from_string("video/x-vp8"), None, None, 0)
                video_profile.set_property("bitrate", 3000000)  # 3 Mbps
                
                # Vorbis audio profile
                audio_profile = GstPbutils.EncodingAudioProfile.new(
                    Gst.Caps.from_string("audio/x-vorbis"), None, None, 0)
                audio_profile.set_property("bitrate", 128000)  # 128 kbps
                
                container.add_profile(video_profile)
                container.add_profile(audio_profile)
                
                return container
                
            elif profile == "mov":
                # MOV container with H.264 video and AAC audio
                container = GstPbutils.EncodingContainerProfile.new(
                    "mov", "MOV Container", Gst.Caps.from_string("video/quicktime"))
                
                # H.264 video profile
                video_profile = GstPbutils.EncodingVideoProfile.new(
                    Gst.Caps.from_string("video/x-h264,profile=high"), 
                    None, None, 0)
                video_profile.set_property("bitrate", 8000000)  # 8 Mbps
                
                # AAC audio profile
                audio_profile = GstPbutils.EncodingAudioProfile.new(
                    Gst.Caps.from_string("audio/mpeg,mpegversion=4"), 
                    None, None, 0)
                audio_profile.set_property("bitrate", 256000)  # 256 kbps
                
                container.add_profile(video_profile)
                container.add_profile(audio_profile)
                
                return container
            
            else:
                print(f"Unsupported export profile: {profile}")
                return None
                
        except Exception as e:
            print(f"Error creating encoding profile: {e}")
            return None

    def get_export_status(self, project_id: str) -> Dict[str, Any]:
        """Get export status and progress"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return {'error': 'Project not found'}
            
            export_info = {
                'is_exporting': 'render_pipeline' in project_data,
                'state': project_data.get('render_state', 'none'),
                'output_path': project_data.get('render_output_path'),
                'profile': project_data.get('render_profile'),
                'progress': 0.0
            }
            
            if 'render_pipeline' in project_data:
                try:
                    if GES_AVAILABLE:
                        pipeline = project_data['render_pipeline']
                        
                        # Get render progress
                        success, position_ns = pipeline.query_position(Gst.Format.TIME)
                        if success:
                            timeline_duration = self.get_timeline_duration(project_id)
                            if timeline_duration > 0:
                                progress = (position_ns / Gst.SECOND) / timeline_duration
                                export_info['progress'] = min(progress, 1.0)
                        
                        # Check if render is complete
                        success, state, pending = pipeline.get_state(0)
                        if success and state == Gst.State.NULL:
                            export_info['state'] = 'completed'
                            project_data['render_state'] = 'completed'
                    else:
                        # Mock export progress
                        mock_render = project_data['render_pipeline']
                        export_info['progress'] = mock_render.get('progress', 0.0)
                        
                        # Simulate progress increment
                        if mock_render.get('state') == 'rendering':
                            mock_render['progress'] = min(mock_render.get('progress', 0.0) + 0.1, 1.0)
                            if mock_render['progress'] >= 1.0:
                                mock_render['state'] = 'completed'
                                export_info['state'] = 'completed'
                        
                except Exception as e:
                    export_info['error'] = f"Error getting export status: {e}"
            
            return export_info

    def cancel_export(self, project_id: str) -> bool:
        """Cancel ongoing export"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data or 'render_pipeline' not in project_data:
                return False
            
            try:
                if GES_AVAILABLE:
                    pipeline = project_data['render_pipeline']
                    
                    # Stop render pipeline
                    ret = pipeline.set_state(Gst.State.NULL)
                    if ret == Gst.StateChangeReturn.FAILURE:
                        print("Failed to cancel render pipeline")
                        return False
                
                # Clean up render state
                del project_data['render_pipeline']
                project_data['render_state'] = 'cancelled'
                
                print(f"Cancelled export for project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error cancelling export: {e}")
                return False

    def cleanup_pipelines(self, project_id: str) -> bool:
        """Cleanup all pipelines for project"""
        with self._lock:
            project_data = self._projects.get(project_id)
            if not project_data:
                return False
            
            try:
                # Stop and cleanup preview pipeline
                if 'preview_pipeline' in project_data:
                    if GES_AVAILABLE:
                        pipeline = project_data['preview_pipeline']
                        pipeline.set_state(Gst.State.NULL)
                    del project_data['preview_pipeline']
                
                # Stop and cleanup render pipeline
                if 'render_pipeline' in project_data:
                    if GES_AVAILABLE:
                        pipeline = project_data['render_pipeline']
                        pipeline.set_state(Gst.State.NULL)
                    del project_data['render_pipeline']
                
                # Reset pipeline state
                project_data['pipeline_state'] = 'none'
                project_data['render_state'] = 'none'
                
                print(f"Cleaned up pipelines for project {project_id}")
                return True
                
            except Exception as e:
                print(f"Error cleaning up pipelines: {e}")
                return False

# Global project service instance
project_service = GESProjectService() 