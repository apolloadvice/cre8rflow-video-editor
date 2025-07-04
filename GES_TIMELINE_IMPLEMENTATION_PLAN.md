# GES Professional Timeline Implementation Plan

## Overview
This document provides a comprehensive implementation plan for adopting professional GStreamer Editing Services (GES) architecture. Based on extensive analysis of GES documentation, this plan shifts from manual timeline management to a **project-centric, asset-based workflow** that leverages GES's native composition system.

## Professional GES Architecture

### Core Components Hierarchy
```
GESProject (Master Container)
    ├── GESAsset[] (Media Assets)
    ├── GESTimeline (Composition)
    │   ├── GESLayer[0] (Main Video - Priority 0)
    │   ├── GESLayer[1] (Overlay - Priority 1) 
    │   ├── GESLayer[2] (Text/Graphics - Priority 2)
    │   └── GESTrack[] (Output Streams)
    │       ├── VideoTrack (Composite Video Output)
    │       └── AudioTrack (Mixed Audio Output)
    └── GESPipeline (Preview/Export Engine)
```

### Key Architectural Principles
1. **Project-Centric**: GESProject manages all assets and timeline state
2. **Asset-Based**: All media handled through GESAsset system with automatic metadata
3. **Layer Composition**: Priority-based layer system for professional compositing
4. **Track Automation**: GES automatically creates/manages output tracks
5. **Pipeline Integration**: Single pipeline for both preview and export

---

## Phase 1: Project Foundation ✅ (Completed - Memory Fixed)

### 1.1 Core Infrastructure ✅
- [x] **Memory Management** - Lazy GStreamer initialization, thread-safe operations
- [x] **Mock System** - Comprehensive stub classes for development
- [x] **Error Handling** - Robust fallback mechanisms

### 1.2 Basic GES Integration ✅  
- [x] **Timeline Creation** - Basic timeline endpoints working
- [x] **Playback Control** - Start/stop/seek functionality
- [x] **API Structure** - RESTful endpoints established

---

## Phase 2: Professional Project System (CURRENT PRIORITY)

### 2.1 GESProject Implementation
**Files**: `backend/app/backend/ges_service.py`, `backend/app/backend/project_service.py`

#### Task 2.1.1: Create Project Service
```python
# New file: backend/app/backend/project_service.py
from typing import Dict, List, Optional
import threading
from pathlib import Path

class GESProjectService:
    """Professional GES project management following GES best practices"""
    
    def __init__(self):
        self._projects: Dict[str, 'GESProject'] = {}
        self._current_project_id: Optional[str] = None
        self._lock = threading.Lock()
    
    def create_project(self, project_id: str, name: str, 
                      width: int = 1920, height: int = 1080, 
                      framerate: str = "30/1") -> bool:
        """Create new GES project with proper initialization"""
        with self._lock:
            if not _ensure_ges_initialized():
                return False
            
            try:
                # Create GESProject instance  
                project = GES.Project.new(None)
                
                # Set project properties
                timeline = project.extract_timeline()
                timeline.set_property("width", width)
                timeline.set_property("height", height)
                timeline.set_property("framerate", Gst.Fraction(int(framerate.split('/')[0]), 
                                                                int(framerate.split('/')[1])))
                
                # Create default layers with proper priorities
                main_layer = timeline.append_layer()      # Priority 0 - Main content
                overlay_layer = timeline.append_layer()   # Priority 1 - Overlays  
                text_layer = timeline.append_layer()      # Priority 2 - Text/Graphics
                
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
                    'name': name,
                    'metadata': {
                        'width': width,
                        'height': height,
                        'framerate': framerate,
                        'created_at': time.time()
                    }
                }
                
                self._current_project_id = project_id
                return True
                
            except Exception as e:
                print(f"Error creating GES project: {e}")
                return False
```

#### Task 2.1.2: Asset Management System
```python
def add_asset_to_project(self, project_id: str, asset_path: str, 
                        asset_id: Optional[str] = None) -> Optional[str]:
    """Add media asset to project with automatic metadata extraction"""
    with self._lock:
        if project_id not in self._projects:
            return None
            
        project_data = self._projects[project_id]
        project = project_data['project']
        
        try:
            # Create GESAsset from URI
            uri = f"file://{Path(asset_path).absolute()}"
            asset = GES.UriClipAsset.request_sync(uri)
            
            if not asset:
                return None
                
            # Generate asset ID if not provided
            if not asset_id:
                asset_id = f"asset_{len(project_data['assets'])}"
            
            # Extract asset metadata
            discoverer_info = asset.get_info()
            duration = discoverer_info.get_duration()
            
            # Store asset with metadata
            project_data['assets'][asset_id] = {
                'asset': asset,
                'uri': uri, 
                'path': asset_path,
                'duration': duration / Gst.SECOND,  # Convert to seconds
                'metadata': self._extract_asset_metadata(discoverer_info),
                'added_at': time.time()
            }
            
            return asset_id
            
        except Exception as e:
            print(f"Error adding asset to project: {e}")
            return None

def _extract_asset_metadata(self, info) -> dict:
    """Extract comprehensive metadata from GStreamer discoverer"""
    metadata = {
        'duration': info.get_duration() / Gst.SECOND,
        'seekable': info.get_seekable(),
        'streams': []
    }
    
    # Extract video streams
    for stream in info.get_video_streams():
        metadata['streams'].append({
            'type': 'video',
            'width': stream.get_width(),
            'height': stream.get_height(), 
            'framerate': f"{stream.get_framerate_num()}/{stream.get_framerate_denom()}",
            'bitrate': stream.get_bitrate()
        })
    
    # Extract audio streams  
    for stream in info.get_audio_streams():
        metadata['streams'].append({
            'type': 'audio',
            'channels': stream.get_channels(),
            'sample_rate': stream.get_sample_rate(),
            'bitrate': stream.get_bitrate()
        })
        
    return metadata
```

### 2.2 Layer-Based Composition System
**Files**: `backend/app/backend/ges_service.py`

#### Task 2.2.1: Professional Layer Management
```python
class LayerType(Enum):
    MAIN = 0        # Primary video content
    OVERLAY = 1     # Video overlays, picture-in-picture
    TEXT = 2        # Text overlays, titles, captions
    EFFECTS = 3     # Effects and transitions
    AUDIO = 4       # Audio-only content

def add_clip_to_layer(self, project_id: str, asset_id: str, 
                     layer_type: LayerType, start_time: float, 
                     duration: float, in_point: float = 0.0) -> Optional[str]:
    """Add clip to specific layer with professional positioning"""
    with self._lock:
        if project_id not in self._projects:
            return None
            
        project_data = self._projects[project_id]
        timeline = project_data['timeline']
        
        # Get target layer by priority
        layer = None
        for l in timeline.get_layers():
            if l.get_priority() == layer_type.value:
                layer = l
                break
        
        if not layer:
            # Create layer if it doesn't exist
            layer = timeline.append_layer()
            layer.set_priority(layer_type.value)
        
        # Get asset
        asset_data = project_data['assets'].get(asset_id)
        if not asset_data:
            return None
            
        try:
            # Create clip from asset
            asset = asset_data['asset']
            clip = layer.add_asset(asset, 
                                  start_time * Gst.SECOND,    # Timeline position
                                  in_point * Gst.SECOND,     # Source in-point  
                                  duration * Gst.SECOND,     # Duration
                                  GES.TrackType.UNKNOWN)     # Let GES auto-detect
            
            if clip:
                clip_id = f"clip_{int(time.time() * 1000)}"
                
                # Store clip reference
                if 'clips' not in project_data:
                    project_data['clips'] = {}
                    
                project_data['clips'][clip_id] = {
                    'clip': clip,
                    'asset_id': asset_id,
                    'layer_type': layer_type,
                    'start_time': start_time,
                    'duration': duration,
                    'in_point': in_point
                }
                
                return clip_id
                
        except Exception as e:
            print(f"Error adding clip to layer: {e}")
            
        return None
```

### 2.3 Pipeline Integration
**Files**: `backend/app/backend/ges_service.py`

#### Task 2.3.1: Unified Preview/Export Pipeline
```python
def create_preview_pipeline(self, project_id: str) -> bool:
    """Create GESPipeline for timeline preview"""
    with self._lock:
        if project_id not in self._projects:
            return False
            
        project_data = self._projects[project_id]
        timeline = project_data['timeline']
        
        try:
            # Create GES pipeline
            pipeline = GES.Pipeline()
            pipeline.set_timeline(timeline)
            
            # Set preview mode
            pipeline.set_mode(GES.PipelineFlags.FULL_PREVIEW)
            
            # Store pipeline reference
            project_data['pipeline'] = pipeline
            self._current_pipeline = pipeline
            
            return True
            
        except Exception as e:
            print(f"Error creating preview pipeline: {e}")
            return False

def export_project(self, project_id: str, output_path: str, 
                  profile: str = "mp4") -> bool:
    """Export project using GES rendering pipeline"""
    with self._lock:
        project_data = self._projects.get(project_id)
        if not project_data:
            return False
            
        timeline = project_data['timeline']
        
        try:
            # Create rendering pipeline
            pipeline = GES.Pipeline()
            pipeline.set_timeline(timeline)
            
            # Set render mode
            pipeline.set_mode(GES.PipelineFlags.RENDER)
            
            # Configure output profile
            encoding_profile = self._create_encoding_profile(profile)
            pipeline.set_render_settings(output_path, encoding_profile)
            
            # Start rendering
            pipeline.set_state(Gst.State.PLAYING)
            
            # Store render pipeline
            project_data['render_pipeline'] = pipeline
            
            return True
            
        except Exception as e:
            print(f"Error starting export: {e}")
            return False

def _create_encoding_profile(self, profile: str):
    """Create GStreamer encoding profile for export"""
    if profile == "mp4":
        container = GstPbutils.EncodingContainerProfile.new(
            "mp4", "MP4 Container", Gst.Caps.from_string("video/quicktime"))
        
        video_profile = GstPbutils.EncodingVideoProfile.new(
            Gst.Caps.from_string("video/x-h264"), None, None, 0)
        
        audio_profile = GstPbutils.EncodingAudioProfile.new(
            Gst.Caps.from_string("audio/mpeg,mpegversion=1,layer=3"), None, None, 0)
        
        container.add_profile(video_profile)
        container.add_profile(audio_profile)
        
        return container
    
    # Add more profiles as needed
    return None
```

---

## Phase 3: Enhanced API Integration

### 3.1 Project-Based API Endpoints
**Files**: `backend/app/backend/ges_api.py`

#### Task 3.1.1: Project Management Endpoints
```python
# Add to ges_api.py

@app.post("/api/ges/projects/create")
async def create_project_endpoint(request: Request):
    """Create new GES project"""
    try:
        data = await request.json()
        project_id = data.get("project_id", f"project_{int(time.time())}")
        name = data.get("name", "Untitled Project")
        width = data.get("width", 1920)
        height = data.get("height", 1080)
        framerate = data.get("framerate", "30/1")
        
        success = project_service.create_project(project_id, name, width, height, framerate)
        
        if success:
            return {"status": "success", "project_id": project_id}
        else:
            return {"status": "error", "message": "Failed to create project"}
            
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/ges/projects/{project_id}/assets/add")
async def add_asset_endpoint(project_id: str, request: Request):
    """Add media asset to project"""
    try:
        data = await request.json()
        asset_path = data.get("asset_path")
        asset_id = data.get("asset_id")
        
        result_asset_id = project_service.add_asset_to_project(project_id, asset_path, asset_id)
        
        if result_asset_id:
            return {"status": "success", "asset_id": result_asset_id}
        else:
            return {"status": "error", "message": "Failed to add asset"}
            
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/ges/projects/{project_id}/clips/add")  
async def add_clip_endpoint(project_id: str, request: Request):
    """Add clip to timeline layer"""
    try:
        data = await request.json()
        asset_id = data.get("asset_id")
        layer_type = LayerType(data.get("layer", 0))
        start_time = data.get("start_time", 0.0)
        duration = data.get("duration")
        in_point = data.get("in_point", 0.0)
        
        clip_id = project_service.add_clip_to_layer(
            project_id, asset_id, layer_type, start_time, duration, in_point)
        
        if clip_id:
            return {"status": "success", "clip_id": clip_id}
        else:
            return {"status": "error", "message": "Failed to add clip"}
            
    except Exception as e:
        return {"status": "error", "message": str(e)}
```

### 3.2 Professional Timeline Operations
**Files**: `backend/app/backend/ges_api.py`

#### Task 3.2.1: Advanced Timeline Control ✅ COMPLETED
**Implementation**: Extended `backend/app/backend/projects_api.py` with 8 advanced timeline control endpoints

**🎯 Professional Timeline Features Implemented**:

**Timeline Markers System**:
- `POST /api/projects/{project_id}/timeline/markers` - Add navigation markers with color coding
- `GET /api/projects/{project_id}/timeline/markers` - List markers sorted by position  
- `DELETE /api/projects/{project_id}/timeline/markers/{marker_id}` - Remove specific marker

**Frame-Accurate Control**:
- `POST /api/projects/{project_id}/timeline/seek-frame` - Seek to exact frame numbers (professional accuracy)

**Timeline Zoom & Navigation**:
- `POST /api/projects/{project_id}/timeline/zoom` - Set zoom level with center positioning
- `GET /api/projects/{project_id}/timeline/zoom` - Get current zoom settings
- `POST /api/projects/{project_id}/timeline/snap-to-clips` - Snap positions to clip boundaries

**Multi-Clip Operations**:
- `POST /api/projects/{project_id}/timeline/bulk-operations` - Bulk move/copy/delete operations

**Ripple Editing** (Industry Standard):
- `POST /api/projects/{project_id}/timeline/ripple-edit` - Insert/delete/trim with automatic timeline adjustment

**🔧 Technical Architecture**:
- **Pydantic Models**: `TimelineMarkerRequest`, `BulkClipOperation`, `TimelineZoomRequest`, `RippleEditRequest`, `FrameSeekRequest`
- **Frame Precision**: Automatic framerate conversion for frame-accurate positioning
- **Timeline Intelligence**: Automatic snap-point detection and timeline boundary calculations
- **Professional UI Support**: Zoom range calculations for timeline viewport management
- **Ripple Operations**: Sophisticated timeline manipulation affecting subsequent clips

**📋 Test Coverage**: Comprehensive test suite `test_advanced_timeline.py` with 6 test categories and cleanup

---

## Phase 4: Frontend Integration

### 4.1 Project-Aware Store
**Files**: `frontend/src/store/editorStore.ts`

#### Task 4.1.1: Project State Management
```typescript
interface GESProject {
  id: string;
  name: string;
  metadata: {
    width: number;
    height: number;
    framerate: string;
    duration: number;
  };
  assets: Record<string, GESAsset>;
  layers: Record<LayerType, GESLayer>;
  clips: Record<string, GESClip>;
  status: 'idle' | 'loading' | 'playing' | 'exporting';
}

interface GESAsset {
  id: string;
  path: string;
  duration: number;
  metadata: {
    streams: Array<{
      type: 'video' | 'audio';
      width?: number;
      height?: number;
      channels?: number;
      sample_rate?: number;
    }>;
  };
}

interface GESClip {
  id: string;
  asset_id: string;
  layer: LayerType;
  start_time: number;
  duration: number;
  in_point: number;
}

enum LayerType {
  MAIN = 0,
  OVERLAY = 1, 
  TEXT = 2,
  EFFECTS = 3,
  AUDIO = 4
}
```

#### Task 4.1.2: Project Actions
```typescript
interface GESProjectActions {
  // Project management
  createProject: (name: string, options?: ProjectOptions) => Promise<string>;
  loadProject: (projectId: string) => Promise<void>;
  saveProject: (projectId: string) => Promise<void>;
  
  // Asset management
  addAsset: (projectId: string, filePath: string) => Promise<string>;
  removeAsset: (projectId: string, assetId: string) => Promise<void>;
  
  // Timeline composition
  addClipToLayer: (projectId: string, assetId: string, layer: LayerType, 
                   startTime: number, duration: number, inPoint?: number) => Promise<string>;
  moveClip: (projectId: string, clipId: string, newStart: number) => Promise<void>;
  trimClip: (projectId: string, clipId: string, newDuration: number) => Promise<void>;
  
  // Preview and export
  startPreview: (projectId: string) => Promise<void>;
  stopPreview: (projectId: string) => Promise<void>;
  seekTo: (projectId: string, position: number) => Promise<void>;
  exportProject: (projectId: string, outputPath: string, profile?: string) => Promise<void>;
}
```

### 4.2 Layer-Based Timeline UI
**Files**: `frontend/src/components/editor/Timeline.tsx`

#### Task 4.2.1: Professional Timeline Layout
```typescript
const ProfessionalTimeline: React.FC = () => {
  const { currentProject, layers } = useEditorStore();
  
  return (
    <div className="professional-timeline">
      {/* Timeline Header */}
      <TimelineHeader project={currentProject} />
      
      {/* Layer Stack */}
      <div className="layer-stack">
        {Object.entries(layers).map(([layerType, layer]) => (
          <LayerTrack 
            key={layerType}
            type={layerType as LayerType}
            layer={layer}
            clips={layer.clips}
            onClipMove={handleClipMove}
            onClipTrim={handleClipTrim}
          />
        ))}
      </div>
      
      {/* Timeline Controls */}
      <TimelineControls 
        onSeek={handleSeek}
        onPlayPause={handlePlayPause}
        duration={currentProject?.metadata.duration}
      />
    </div>
  );
};

const LayerTrack: React.FC<LayerTrackProps> = ({ type, layer, clips, onClipMove, onClipTrim }) => {
  const layerColor = getLayerColor(type);
  
  return (
    <div className={`layer-track layer-${type}`} style={{ backgroundColor: layerColor }}>
      <div className="layer-header">
        <span className="layer-name">{getLayerName(type)}</span>
        <span className="layer-priority">Priority {type}</span>
      </div>
      
      <div className="layer-content">
        {clips.map(clip => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            onMove={onClipMove}
            onTrim={onClipTrim}
          />
        ))}
      </div>
    </div>
  );
};
```

---

## Phase 5: Advanced Features

### 5.1 Professional Effects System
**Files**: `backend/app/backend/effects_service.py`

#### Task 5.1.1: GES Effects Integration
```python
class GESEffectsService:
    """Professional effects using GES built-in effects"""
    
    def add_video_effect(self, project_id: str, clip_id: str, effect_name: str, properties: dict = None):
        """Add video effect to clip using GES effect system"""
        try:
            clip_data = self._get_clip_data(project_id, clip_id)
            if not clip_data:
                return False
                
            clip = clip_data['clip']
            
            # Create GES effect
            effect = GES.Effect.new(effect_name)
            if properties:
                for prop, value in properties.items():
                    effect.set_property(prop, value)
            
            # Add effect to clip
            clip.add(effect)
            
            return True
            
        except Exception as e:
            print(f"Error adding effect: {e}")
            return False
    
    def add_transition(self, project_id: str, layer_type: LayerType, 
                      position: float, duration: float, transition_type: str = "crossfade"):
        """Add transition between clips on layer"""
        try:
            # Get layer
            project_data = self._projects[project_id]
            timeline = project_data['timeline']
            
            layer = None
            for l in timeline.get_layers():
                if l.get_priority() == layer_type.value:
                    layer = l
                    break
            
            if not layer:
                return False
                
            # Create transition clip
            transition = GES.TransitionClip.new(transition_type)
            layer.add_clip(transition)
            
            # Set transition timing
            transition.set_start(position * Gst.SECOND)
            transition.set_duration(duration * Gst.SECOND)
            
            return True
            
        except Exception as e:
            print(f"Error adding transition: {e}")
            return False
```

### 5.2 Export Profiles System
**Files**: `backend/app/backend/export_service.py`

#### Task 5.2.1: Professional Export Profiles
```python
class ExportProfile:
    """Professional export profile definitions"""
    
    PROFILES = {
        "youtube_1080p": {
            "container": "mp4",
            "video_codec": "x264",
            "video_bitrate": "8000k",
            "audio_codec": "aac", 
            "audio_bitrate": "192k",
            "resolution": "1920x1080",
            "framerate": "30/1"
        },
        "instagram_story": {
            "container": "mp4",
            "video_codec": "x264", 
            "video_bitrate": "4000k",
            "audio_codec": "aac",
            "audio_bitrate": "128k", 
            "resolution": "1080x1920",
            "framerate": "30/1"
        },
        "prores_422": {
            "container": "mov",
            "video_codec": "prores",
            "video_variant": "422",
            "audio_codec": "pcm_s24le",
            "resolution": "1920x1080",
            "framerate": "23.976/1"
        }
    }
    
    @classmethod
    def create_encoding_profile(cls, profile_name: str):
        """Create GStreamer encoding profile from preset"""
        if profile_name not in cls.PROFILES:
            raise ValueError(f"Unknown profile: {profile_name}")
            
        profile = cls.PROFILES[profile_name]
        
        # Create container profile
        container_caps = f"video/{profile['container']}"
        container = GstPbutils.EncodingContainerProfile.new(
            profile_name, f"{profile_name} Export", Gst.Caps.from_string(container_caps))
        
        # Add video profile
        video_caps = f"video/x-{profile['video_codec']}"
        video_profile = GstPbutils.EncodingVideoProfile.new(
            Gst.Caps.from_string(video_caps), None, None, 0)
        
        # Set video properties
        if "video_bitrate" in profile:
            video_profile.set_property("bitrate", cls._parse_bitrate(profile["video_bitrate"]))
        
        container.add_profile(video_profile)
        
        # Add audio profile
        audio_caps = f"audio/{profile['audio_codec']}"
        audio_profile = GstPbutils.EncodingAudioProfile.new(
            Gst.Caps.from_string(audio_caps), None, None, 0)
            
        if "audio_bitrate" in profile:
            audio_profile.set_property("bitrate", cls._parse_bitrate(profile["audio_bitrate"]))
            
        container.add_profile(audio_profile)
        
        return container
```

---

## Phase 6: Performance Optimization

### 6.1 Caching and Performance
**Files**: `backend/app/backend/cache_service.py`

#### Task 6.1.1: Asset Caching System
```python
class GESCacheService:
    """Performance optimization through asset caching"""
    
    def __init__(self):
        self._asset_cache = {}
        self._thumbnail_cache = {}
        self._metadata_cache = {}
    
    def cache_asset_metadata(self, asset_path: str, metadata: dict):
        """Cache asset metadata to avoid repeated discovery"""
        self._metadata_cache[asset_path] = {
            'metadata': metadata,
            'cached_at': time.time()
        }
    
    def get_cached_metadata(self, asset_path: str) -> Optional[dict]:
        """Retrieve cached metadata if available and fresh"""
        cached = self._metadata_cache.get(asset_path)
        if cached and (time.time() - cached['cached_at']) < 3600:  # 1 hour cache
            return cached['metadata']
        return None
    
    def generate_thumbnail(self, asset_path: str, timestamp: float = 0.0) -> Optional[str]:
        """Generate thumbnail using GES pipeline"""
        try:
            # Create simple pipeline for thumbnail extraction
            pipeline = Gst.Pipeline.new("thumbnail")
            
            # Source
            source = Gst.ElementFactory.make("filesrc")
            source.set_property("location", asset_path)
            
            # Decoder
            decoder = Gst.ElementFactory.make("decodebin")
            
            # Video converter and scale
            videoconvert = Gst.ElementFactory.make("videoconvert")
            videoscale = Gst.ElementFactory.make("videoscale")
            
            # Caps filter for thumbnail size
            caps = Gst.Caps.from_string("video/x-raw,width=160,height=90")
            capsfilter = Gst.ElementFactory.make("capsfilter")
            capsfilter.set_property("caps", caps)
            
            # PNG encoder and file sink
            pngenc = Gst.ElementFactory.make("pngenc")
            filesink = Gst.ElementFactory.make("filesink")
            
            thumbnail_path = f"/tmp/thumb_{hash(asset_path)}_{int(timestamp)}.png"
            filesink.set_property("location", thumbnail_path)
            
            # Build pipeline
            pipeline.add(source, decoder, videoconvert, videoscale, capsfilter, pngenc, filesink)
            source.link(decoder)
            decoder.link(videoconvert)
            videoconvert.link(videoscale)
            videoscale.link(capsfilter)
            capsfilter.link(pngenc)
            pngenc.link(filesink)
            
            # Seek to timestamp
            pipeline.set_state(Gst.State.PAUSED)
            pipeline.seek_simple(Gst.Format.TIME, Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT,
                               timestamp * Gst.SECOND)
            
            # Extract frame
            pipeline.set_state(Gst.State.PLAYING)
            
            # Wait for EOS or error
            bus = pipeline.get_bus()
            msg = bus.timed_pop_filtered(Gst.CLOCK_TIME_NONE,
                                       Gst.MessageType.EOS | Gst.MessageType.ERROR)
            
            pipeline.set_state(Gst.State.NULL)
            
            if msg.type == Gst.MessageType.EOS:
                return thumbnail_path
            else:
                return None
                
        except Exception as e:
            print(f"Error generating thumbnail: {e}")
            return None
```

---

## Implementation Timeline

### Immediate Next Steps (Week 1-2)
1. **Implement GESProjectService** - Core project management foundation
2. **Add Asset Management** - Professional asset handling with metadata
3. **Create Layer System** - Priority-based composition layers
4. **Update API Endpoints** - Project-centric RESTful API

### Short Term (Week 3-4) 
1. **Frontend Project Store** - React state management for projects
2. **Professional Timeline UI** - Layer-based timeline interface
3. **Preview Pipeline** - Unified preview/export system
4. **Basic Export Profiles** - Standard export presets

### Medium Term (Month 2)
1. **Effects System** - Professional effects and transitions
2. **Advanced Export** - Custom profiles and render queue
3. **Performance Optimization** - Caching and memory management
4. **User Testing** - Workflow validation and refinement

### Long Term (Month 3+)
1. **Advanced Composition** - Multi-layer compositing features
2. **Color Correction** - Professional color tools
3. **Audio Mixing** - Multi-track audio handling
4. **Project Templates** - Preset project configurations

---

## Success Metrics

### Technical Metrics
- **Memory Stability**: Zero malloc errors during extended operation
- **Performance**: Sub-200ms response time for timeline operations
- **Reliability**: 99% uptime for preview pipeline
- **Compatibility**: Support for major video formats (MP4, MOV, MKV)

### User Experience Metrics  
- **Professional Workflow**: Asset → Timeline → Preview → Export pipeline
- **Layer Composition**: Multi-layer video compositing capability
- **Real-time Preview**: Smooth timeline scrubbing and playback
- **Export Quality**: Professional-grade output formats

This implementation plan provides a comprehensive roadmap for transforming the current basic timeline system into a professional GES-based video editing platform that leverages the full power of GStreamer's editing services.