# NLP Video Editor (Prototype)

This project is an NLP-based video editing tool that allows users to edit videos on a timeline using natural language commands.

## Major Upgrade: AI-Powered NLP Command Parsing (2024-06-15)

The command parser is now powered by OpenAI's GPT-4 (or similar), enabling robust, flexible natural language understanding. Users can enter free-form, conversational commands (even with typos or casual phrasing), and the system will interpret and apply the intended edits to the video timeline.

- **Regex/spaCy-based parsing is deprecated.**
- **All command parsing is routed through an OpenAI-powered backend endpoint.**
- **A clear schema for AI output (edit intent JSON) is enforced.**
- **Backend validates and applies AI-generated instructions to the timeline JSON.**
- **Frontend sends raw commands to the backend and updates state/UI based on structured responses.**
- **Fallback/error handling and context-awareness strategies are implemented.**

## How It Works
1. User enters a free-form command in the UI (e.g., "cut out the part where the guy in the grey quarter zip is talking").
2. Frontend sends the command to the backend (`/api/parseCommand`).
3. Backend calls OpenAI's API with a prompt and schema, receives structured JSON.
4. Backend validates the JSON and applies the edit to the timeline (and saves to Supabase).
5. Updated timeline JSON is returned to the frontend, which updates state/UI and preview.
6. If parsing fails or is ambiguous, the user receives a clear error or feedback message.

## Command Schema Example
```json
{
  "action": "cut",
  "start": 5,
  "end": 10
}
```
Or for text overlay:
```json
{
  "action": "add_text",
  "start": 10,
  "end": 15,
  "text": "Welcome to the channel"
}
```
Multiple actions can be represented as an array of such objects.

### Robust Cut Command Handling (2024-06-15)
- The system now robustly distinguishes between:
  - **Trim:** "cut out the first/last N seconds" (removes from start/end, no gap)
  - **Gap:** "cut from X to Y seconds" (removes a middle segment, leaves a gap in the timeline)
- The backend and LLM prompt/schema have been updated to support both cases, and the timeline is updated accordingly.
- See tests for both scenarios in `/backend/tests/test_command_executor.py`.

### Asset Duration Handling
- The backend always fetches the latest version of the asset from Supabase to determine duration.
- Fallback to 60s only occurs if no asset is found; otherwise, the correct duration is used for all commands.

## User Instructions (New)
- **Type any natural language command describing your edit.**
  - Examples:
    - "Cut out the part where the guy in the grey quarter zip is talking."
    - "Add title text from 10 to 15 that says 'Welcome to the channel'."
    - "Overlay the logo from 5s to 10s."
    - "Trim the first 5 seconds."
    - "Remove the intro."
- The system will interpret your intent and update the timeline accordingly.
- If your command is ambiguous or cannot be understood, you'll receive a helpful error or feedback message.
- Undo/redo and command history are supported for all edits.

## Error Handling & Fallbacks
- If the AI output is incomplete or ambiguous, the backend will not apply the edit and will return a clear error message.
- If the OpenAI API is unreachable, a fallback parser may be used for simple commands, but this is not guaranteed.
- All errors are handled gracefully, and the user is guided to rephrase or clarify as needed.

## Extensibility
- New command types and schema changes can be handled by updating the AI prompt and backend validation logic, not by writing new regexes.
- The system is designed for future context-awareness (e.g., content tags, transcript integration) and collaborative editing.

## Deprecated (Legacy) Approach
- The previous spaCy/regex-based parser is deprecated and will be removed after migration is complete. All new features and bugfixes should target the AI-powered system.

## Current Status (2024-06-10)
- Core data structures (timeline, tracks, clips, effects, transitions) are robust, extensible, and fully tested.
- Compound/nested clips are supported, with recursive timeline operations (trim, join, remove, move, transitions).
- Serialization/deserialization is robust, versioned, and extensible (supports custom subclasses).
- Command parsing, validation, and execution are robust and tested for all major command types.
- **Parser and executor are now fully extensible and handler/plugin-based (2024-06-11).**
- **Group/compound (batch) operations (e.g., group cut) are now implemented and tested (2024-06-11).**

## Current Gaps & Limitations (2024-06-14)
- **Asset Upload:** No persistent asset storage; missing metadata extraction (duration, resolution, etc.).
- **Timeline Placement:** Drag-and-drop is incomplete; timeline does not visually represent clip duration or allow proper placement.
- **NLP Command:** Command parsing is basic; lacks robust NLP, error handling, and feedback.
- **Processing Feedback:** No visible "thinking" or step-by-step feedback for users.
- **Edit Application:** Edits are not actually applied to timeline data or video; no real video processing or timeline update.
- **Real-Time Update:** Timeline and video playback do not update after edits; no real-time preview of changes.
- **Error Handling & UX:** Minimal error/confirmation messages; no user guidance for failed or ambiguous actions.

## Features (Implemented, Partial, Planned)
- **Implemented:**
  - UI components for asset upload, timeline, and command input (not fully connected)
  - Core timeline data structures (tracks, clips, effects, transitions)
  - Command parser and executor scaffolding
  - JSON serialization/deserialization
- **Partially Implemented:**
  - Asset upload UI (no metadata extraction or persistence)
  - Timeline UI (drag-and-drop and clip creation incomplete)
  - Command input and parsing (basic pattern matching only)
- **Planned:**
  - Persistent asset management and metadata extraction
  - Functional drag-and-drop and timeline clip creation
  - Robust NLP command parsing and mapping
  - User feedback mechanisms (processing, confirmation, error)
  - Real-time timeline and video updates after edits
  - Integration of video processing backend

## Intended End-to-End Workflow
1. **Asset Upload:** User uploads a video to an asset library; system extracts and stores metadata (duration, resolution, etc.).
2. **Timeline Placement:** User drags and drops video onto a timeline track, creating a clip with correct duration.
3. **NLP Command:** User enters a natural-language command (e.g., "cut from 00:05 to 00:10").
4. **Processing Feedback:** System provides visible feedback (e.g., "thinking...", step-by-step interpretation).
5. **Apply Edit:** Edit is applied to the timeline and video.
6. **Real-Time Update:** Timeline and video playback update immediately to reflect the edit.

**Current State:** Steps 1-3 are partially present (UI only); steps 4-6 are not functional.

## Next Steps / Roadmap (2024-06-14)
- Implement persistent asset storage and metadata extraction
- Complete drag-and-drop and timeline clip creation with correct scaling
- Integrate robust NLP parser and map commands to timeline actions
- Add user feedback mechanisms (processing, confirmation, error)
- Implement timeline data updates and video processing backend
- Enable real-time timeline and video updates after edits
- Improve error handling and user guidance throughout the app

## User Flow: Edit → Timeline Update → Preview → Export

1. **Edit (Command or Manual UI):**
   - The user issues a natural language command (e.g., "Cut clip1 at 00:30") or performs a manual edit in the UI.
   - The command parser interprets the input and maps it to timeline operations (cut, trim, join, add effect, etc.).

2. **Timeline Update:**
   - The timeline data structure is updated to reflect the edit.
   - All changes are non-destructive and versioned; the timeline can be serialized/deserialized for persistence.
   - The UI (if present) is notified of changes and updates the visual timeline accordingly.

3. **User-Initiated Preview:**
   - The user can trigger a preview of the current timeline state (e.g., by clicking a "Preview" button).
   - The backend generates a low-resolution, fast-rendered video preview using ffmpeg (or optionally MoviePy for prototyping).
   - The preview is returned as a video file for UI playback, allowing the user to see edits in context before exporting.

4. **Export:**
   - When satisfied, the user triggers an export (e.g., by clicking an "Export" button).
   - The backend uses the ffmpeg pipeline to render the full-quality video, applying all timeline edits, transitions, and effects.
   - The exported video is returned for download or further processing.

**Backend/API Support:**
- The backend provides `/api/preview` and `/api/export` endpoints for preview and export, respectively.
- Both endpoints accept the current timeline state as input and return a video file.
- All timeline operations (cut, trim, join, transitions, effects) are supported in both preview and export flows.

## Tech Stack
- Python 3.8+
- [spaCy](https://spacy.io/) (NLP, entity extraction)
- Regex (command pattern matching and intent recognition)
- [ffmpeg-python](https://github.com/kkroening/ffmpeg-python) (primary backend for video processing)
- (Optional) [MoviePy](https://zulko.github.io/moviepy/) (for prototyping/preview only, not required for production or backend export)
- (Optional, future) Hugging Face Transformers or Rasa for advanced intent classification

## LLM (GPT) Command Parsing (Experimental)

- The command parser can use OpenAI GPT (via API) to interpret natural language commands.
- If enabled, the LLM is tried first; if ambiguous or fails, the system falls back to pattern-based parsing.
- To enable LLM parsing:
  1. Set the environment variable `OPENAI_API_KEY` to your OpenAI API key.
  2. Instantiate the parser with `CommandParser(use_llm=True)`.
- LLM parsing is fully tested with mocks; no real API calls are made during unit tests.
- All errors and LLM responses are logged to `src/llm_parser.log`.

### Example (Python):
```python
import os
from src.command_parser import CommandParser
os.environ["OPENAI_API_KEY"] = "sk-..."  # Set your key
parser = CommandParser(use_llm=True)
result = parser.parse_command("Cut clip1 at 00:30")
```

## Setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd <repo-directory>
   ```
2. **Create a virtual environment:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
3. **Install dependencies:**
   ```bash
   pip install spacy
   pip install ffmpeg-python
   # Optional: for prototyping/preview only
   pip install moviepy
   ```

**Note:** MoviePy is only needed for prototyping or preview features. It is not required for production or backend export, which uses ffmpeg directly.

## Running the Demo

The demo script shows how to parse and execute a sample command:

```bash
python src/demo.py
```

**Expected output:**
```
Loaded video: name=my_video, start=0.0, end=60.0
Trimmed my_video at 30s: True
Clip: name=my_video_part1, start=0.0, end=30.0
Clip: name=my_video_part2, start=30.0, end=60.0
Added transition between my_video_part1 and my_video_part2: True
Transition: crossfade from my_video_part1 to my_video_part2, duration=2.0
Joined my_video_part1 and my_video_part2: True
Clip: name=my_video_part1_joined_my_video_part2, start=0.0, end=60.0
Command: Cut clip1 at 00:30
Parsed Operation: type=CUT, target=clip1, parameters={'timestamp': '00:30'}
Execution Result: success=True, message=Cut operation on clip1 at 00:30

Command: Add text 'Introduction' at the top from 0:05 to 0:15
Parsed Operation: type=ADD_TEXT, target=None, parameters={'text': 'Introduction', 'position': 'top', 'start': '0:05', 'end': '0:15'}
Execution Result: success=True, message=Add text 'Introduction' with params {'text': 'Introduction', 'position': 'top', 'start': '0:05', 'end': '0:15'}
```

## Project Structure
- `src/command_parser.py` — NLP command parser
- `src/timeline.py` — Timeline and clip data structures (including Effects track for timeline/range-based effects)
- `src/command_executor.py` — Command-to-edit bridge
- `src/demo.py` — Demo script

## Timeline/Range-Based Effects (Effects Track)

- Effects can be attached to individual clips (e.g., brightness, text overlay) or to the Effects track for global or range-based application.
- Effects in the Effects track can specify `start` and `end` (in frames) to apply only to a portion of the timeline (future: range filtering).
- All effects are composable and extensible via handler registration.

### Example: Adding a Global Brightness Effect

```python
from src.timeline import Timeline, Effect

timeline = Timeline()
# ... add video clips ...
# Add a global brightness effect to the Effects track
brightness_effect = Effect(effect_type="brightness", params={"value": 0.7})
effects_track = [t for t in timeline.tracks if t.track_type == "effect"]
effects_track[0].clips.append(brightness_effect)
```

When exported, this will apply the brightness effect to the entire timeline.

## Testing
- Standard parser unit tests: `tests/test_command_parser.py`
- LLM parser and fallback logic: `tests/test_llm_parser.py`, `tests/test_command_parser_llm.py`
- Run all tests:
  ```bash
  PYTHONPATH=src pytest
  ```
- LLM tests use mocking; no real API calls are made during testing.

## Contributing
See `PLANNING.md`

## API Endpoints for UI Integration

The backend exposes API endpoints for real-time timeline preview and export, ready for UI integration:

### POST /api/preview
- **Description:** Generate a low-res/fast preview video for the given timeline state. Returns a video file for UI playback.
- **Payload:**
  ```json
  {
    "timeline": { /* Timeline as dict/JSON (see Timeline.to_dict()) */ }
  }
  ```
- **Response:** `

### Timeline Placement & Overlap Prevention (2024-12-19)

The timeline now includes robust clip placement functionality that prevents overlapping clips on the same track:

- **Smart Positioning**: When dragging assets from the asset panel to the timeline, the system automatically finds the best available position
- **Overlap Prevention**: Clips cannot overlap on the same track - if a drop position conflicts with existing clips, the system finds the next available spot
- **Gap Detection**: The system intelligently fills gaps between clips when possible, rather than always placing at the end
- **Visual Feedback**: Drag operations show visual feedback including drop zone highlighting and position indicators
- **Multi-Track Support**: Clips on different tracks can occupy the same timeline position without conflict
- **User Notification**: Users are informed when clips are repositioned to avoid overlaps

#### Example Scenarios:
- Drop at empty position → Clip placed at exact drop location
- Drop overlapping existing clip → Clip placed after the overlapping clip
- Drop with gap available → Clip placed in the gap if it fits
- Drop on different track → No conflict, exact positioning maintained

This functionality ensures a smooth editing experience where users can quickly add clips without manually avoiding overlaps.

## User Instructions (New)