# Command Examples Dataset for NLP Video Editor

This dataset provides example natural language commands, their intent categories, and example parsed outputs for use in training, testing, and documentation.

| Command | Intent Category | Example Parsed Output |
|---------|----------------|----------------------|
| Cut clip1 at 00:30 | Cut | {"type": "CUT", "target": "clip1", "parameters": {"timestamp": "00:30"}} |
| Trim the start of clip2 to 00:10 | Trim | {"type": "TRIM", "target": "clip2", "parameters": {"edge": "start", "timestamp": "00:10"}} |
| Join clip1 and clip2 with a crossfade | Join | {"type": "JOIN", "parameters": {"clips": ["clip1", "clip2"], "transition": "crossfade"}} |
| Add text 'Intro' at the top from 0:05 to 0:15 | Add Text | {"type": "ADD_TEXT", "parameters": {"text": "Intro", "position": "top", "start": "0:05", "end": "0:15"}} |
| Overlay logo.png at the top right from 10s to 20s | Overlay | {"type": "OVERLAY", "parameters": {"file": "logo.png", "position": "top right", "start": "10", "end": "20"}} |
| Fade out audio at the end of the timeline | Fade | {"type": "FADE", "parameters": {"direction": "out", "target": "audio", "position": "end"}} |
| Speed up the middle section by 2x | Change Speed | {"type": "SPEED", "parameters": {"section": "middle", "factor": 2.0}} |
| Apply color correction to clip3 | Color Correction | {"type": "COLOR_CORRECTION", "target": "clip3"}} |
| Export the project as mp4 | Export | {"type": "EXPORT", "parameters": {"format": "mp4"}} |
| Reverse clip4 | Reverse | {"type": "REVERSE", "target": "clip4"}} |

---

Add more examples as new features and intents are supported. 