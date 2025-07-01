# GStreamer Editing Services (GES) Integration

## Overview

This project now includes **GStreamer Editing Services (GES)** integration, providing professional-grade video editing capabilities with seamless timeline playback, hardware acceleration support, and efficient preview generation.

GES offers several advantages over manual video switching:

- **True Timeline Playback**: Seamless playback through multiple clips without gaps or glitches
- **Hardware Acceleration**: Support for GPU decoding/encoding via NVDEC, VAAPI, VideoToolbox
- **Professional Pipeline**: Industry-standard GStreamer framework used by video professionals
- **Real-time Effects**: Native support for transitions, effects, and compositing
- **Export Quality**: Professional export options with various codecs and containers

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React UI      │    │   FastAPI        │    │  GES Timeline   │
│                 │    │   Backend        │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │VideoPlayer  │◄┼────┼►│ GES API      │◄┼────┼►│ GESPipeline │ │
│ │Component    │ │    │ │ Endpoints    │ │    │ │             │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
│                 │    │                  │    │                 │
│ ┌─────────────┐ │    │ ┌──────────────┐ │    │ ┌─────────────┐ │
│ │useGESPlayer │◄┼────┼►│ GES Service  │◄┼────┼►│ GESTimeline │ │
│ │Hook         │ │    │ │              │ │    │ │ + Layers    │ │
│ └─────────────┘ │    │ └──────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        │                        │                        │
        ▼                        ▼                        ▼
   User Controls           HTTP/REST API              GStreamer
     Timeline                  JSON                   C/Python
     Seeking                                         Native Libs
     Playback
```

### Component Hierarchy

- **GESTimeline**: Main container holding layers and tracks
- **GESLayer**: Container for clips at specific priority levels (0=main, 1=overlay)  
- **GESClip**: Timeline elements (GESUriClip for video/audio, GESTitleClip for text)
- **GESTrack**: Output streams (video/audio tracks with specific formats)
- **GESPipeline**: Wrapper for playback and rendering

## Installation

### macOS (Recommended)

```bash
# Run the automated installation script
./install_ges.sh
```

### Manual Installation

#### macOS with Homebrew
```bash
brew install gstreamer gst-plugins-base gst-plugins-good gst-editing-services gst-python pygobject3
pip install PyGObject==3.46.0
```

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    libges-1.0-dev \
    python3-gi \
    python3-gi-cairo \
    gir1.2-gstreamer-1.0
```

#### Environment Variables (macOS)
```bash
export GST_PLUGIN_PATH=/opt/homebrew/lib/gstreamer-1.0:/usr/local/lib/gstreamer-1.0
export GI_TYPELIB_PATH=/opt/homebrew/lib/girepository-1.0:/usr/local/lib/girepository-1.0
```

## Usage

### 1. Start the Backend Server

```bash
cd backend
python -m uvicorn app.backend.main:app --reload --port 8000
```

### 2. Start the Frontend

```bash
cd frontend
npm run dev
```

### 3. Toggle GES Mode

In the video player, you'll see a toggle button:
- **TL** = Traditional Timeline mode (manual video switching)
- **GES** = GStreamer Editing Services mode (native timeline)

Click to switch between modes. When in GES mode:
- Timeline is managed by GStreamer
- Playback is seamless across multiple clips
- Professional preview and export capabilities are available

## API Reference

### Timeline Creation
```typescript
// Frontend usage
const { createTimeline, togglePlayback, seekToPosition } = useGESPlayer();

// Create timeline from clips
await createTimeline();

// Control playback
await togglePlayback(); // Start/stop

// Seek to position (seconds)
await seekToPosition(30.0);
```

### Backend API Endpoints

#### Create Timeline
```bash
POST /api/ges/create-timeline
Content-Type: application/json

{
  "clips": [
    {
      "id": "clip1",
      "name": "Video 1", 
      "start": 0.0,
      "end": 10.0,
      "duration": 10.0,
      "file_path": "/path/to/video1.mp4",
      "type": "video"
    }
  ],
  "frame_rate": 30.0,
  "width": 1920,
  "height": 1080
}
```

#### Control Playback
```bash
POST /api/ges/start-preview   # Start preview
POST /api/ges/stop-preview    # Stop preview  
POST /api/ges/seek           # Seek to position
GET /api/ges/status          # Get status
```

#### Export Timeline
```bash
POST /api/ges/export
Content-Type: application/json

{
  "output_path": "/path/to/output.mp4",
  "format_string": "video/x-h264+audio/mpeg"
}
```

## Command API Mappings

The GES integration provides NLP command mappings for common editing operations:

| NLP Intent | API Endpoint | GES Operation |
|------------|--------------|---------------|
| "cut dead space" | `/ges/commands/cut-clip` | `clip.set_start()` / `clip.set_duration()` |
| "move clip to 0:30" | `/ges/commands/move-clip` | `clip.set_start(Gst.SECOND*30)` |
| "add text overlay" | `/ges/commands/add-text` | Create `GESTitleClip` on overlay layer |

## Export Options

### Supported Formats

- **H.264 + MP3**: `"video/x-h264+audio/mpeg"`
- **H.264 + AAC**: `"video/x-h264+audio/aac"`
- **WebM**: `"video/webm+audio/vorbis"`
- **ProRes**: `"video/x-prores+audio/raw"`

### Example Export
```python
# Export to H.264/AAC MP4
await exportTimeline("/path/to/output.mp4", "video/x-h264+audio/aac")
```

## Performance Optimization

### Hardware Acceleration

Set environment variables to enable hardware acceleration:

#### macOS (VideoToolbox)
```bash
export GST_VAAPI_ALL_DRIVERS=1
```

#### Linux (NVDEC/VAAPI)
```bash
export GST_VAAPI_ALL_DRIVERS=1
export GST_GL_PLATFORM=egl
```

#### Windows (DirectShow)
```bash
export GST_DIRECTSHOW_DISABLE_VIDEO_ACCELERATION=0
```

### Memory Management

For large timelines (1080p+):
```python
# In GES service configuration
timeline_config = {
    "frame_rate": 30.0,
    "width": 1920,
    "height": 1080,
    "sample_rate": 48000,
    "channels": 2
}
```

## Troubleshooting

### Common Issues

#### Import Errors
```bash
# Solution 1: Reinstall PyGObject
pip uninstall PyGObject
pip install PyGObject==3.46.0

# Solution 2: Check GI_TYPELIB_PATH
export GI_TYPELIB_PATH=/opt/homebrew/lib/girepository-1.0
```

#### Timeline Creation Fails
- Ensure video files are in supported formats (MP4, MOV, AVI)
- Check file paths are accessible from backend
- Verify GStreamer plugins are installed

#### Preview Not Working
- Check that backend server is running on port 8000
- Verify CORS settings allow frontend origin
- Look for error messages in browser console

#### Performance Issues
- Enable hardware acceleration (see above)
- Reduce video resolution for preview
- Check available system memory

### Debug Logs

Enable detailed GStreamer logging:
```bash
export GST_DEBUG=3  # 0=none, 1=error, 2=warning, 3=info, 4=debug, 5=trace
```

### Test Installation
```bash
# Run the test script
python backend/test_ges.py
```

## Development

### Extending GES Service

To add new editing operations:

1. **Add to GES Service** (`backend/app/backend/ges_service.py`)
```python
def add_transition(self, clip1_id: str, clip2_id: str, duration: float):
    # Add transition between clips
    pass
```

2. **Add API Endpoint** (`backend/app/backend/ges_api.py`)
```python
@router.post("/ges/add-transition")
async def add_transition(clip1_id: str, clip2_id: str, duration: float):
    service = get_ges_service()
    service.add_transition(clip1_id, clip2_id, duration)
```

3. **Update Frontend Hook** (`frontend/src/hooks/useGESPlayer.ts`)
```typescript
const addTransition = useCallback(async (clip1Id: string, clip2Id: string, duration: number) => {
    return await gesApiRequest('/ges/add-transition', 'POST', { clip1_id: clip1Id, clip2_id: clip2Id, duration });
}, [gesApiRequest]);
```

### Testing

Run the comprehensive test suite:
```bash
python backend/test_ges.py
```

## Comparison: Timeline vs GES Mode

| Feature | Timeline Mode | GES Mode |
|---------|---------------|----------|
| **Playback** | Manual video switching | Native timeline playback |
| **Performance** | Good for simple edits | Optimized for complex edits |
| **Transitions** | Basic cuts only | Professional transitions |
| **Export Quality** | Limited | Professional codecs |
| **Hardware Accel** | Browser-dependent | Native GPU support |
| **Latency** | Higher (file switching) | Lower (single pipeline) |
| **Compatibility** | All browsers | Requires GStreamer |

## Future Enhancements

- **Multi-camera editing**: Sync multiple video sources
- **Advanced effects**: Color grading, stabilization, noise reduction  
- **Audio processing**: Noise reduction, EQ, compression
- **Live streaming**: Real-time broadcast capabilities
- **Cloud rendering**: Distributed timeline processing

## Support

For issues with GES integration:

1. Check the installation guide above
2. Run the test script to verify setup
3. Check logs for specific error messages
4. Refer to [GStreamer documentation](https://gstreamer.freedesktop.org/documentation/)

The GES integration provides a professional-grade video editing foundation while maintaining the simplicity of the existing timeline interface. 