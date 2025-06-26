# NLP Video Editor Project Planning

## Current Status (2024-06-14)
- UI components for asset upload, timeline, and command input are present but not fully connected.
- Asset upload lacks persistent storage and metadata extraction (duration, resolution, etc.).
- Timeline drag-and-drop is incomplete; timeline does not visually represent clip duration or allow proper placement.
- **Command parsing is now AI-powered (OpenAI GPT-4 or similar) and robust for all major edit types, including nuanced 'cut' commands (trim/gap).**
- Asset duration is always fetched from the latest version in Supabase, avoiding fallback to 60s unless no asset exists.
- No visible processing feedback or step-by-step user guidance.
- Edits are not actually applied to timeline data or video; no real video processing or timeline update.
- Timeline and video playback do not update after edits; no real-time preview of changes.
- Minimal error/confirmation messages; no user guidance for failed or ambiguous actions.

## Limitations (2024-06-14)
- Workflow is incomplete: user can upload a video and type a command, but cannot fully realize the described editing scenario.
- Missing metadata and drag-and-drop support stop the flow early.
- NLP command parsing is rudimentary, limiting understanding of user instructions.
- No visible feedback during processing, making the system feel unresponsive.
- Edits are not actually applied, so the video and timeline don't update as expected.

## Roadmap & Next Steps (2024-06-14)
- Implement persistent asset management and metadata extraction
- Complete drag-and-drop and timeline clip creation with correct scaling
- Integrate robust NLP parser and map commands to timeline actions (now robust for 'cut' commands)
- Add user feedback mechanisms (processing, confirmation, error)
- Implement timeline data updates and video processing backend
- Enable real-time timeline and video updates after edits
- Improve error handling and user guidance throughout the app
- Implement central state management for UI/backend sync
- Add asynchronous processing for video edits to avoid UI blocking

## UX/Feedback & Architectural Challenges (2024-06-14)
- Need for asynchronous processing for video edits (to avoid UI blocking)
- Centralized state management for UI and backend sync
- Error handling and user guidance for ambiguous or failed actions
- Step-by-step feedback, confirmation dialogs, and error messages as core UX features

## Intended End-to-End Workflow (2024-06-14)
1. Asset Upload: User uploads a video to an asset library; system extracts and stores metadata (duration, resolution, etc.).
2. Timeline Placement: User drags and drops video onto a timeline track, creating a clip with correct duration.
3. NLP Command: User enters a natural-language command (e.g., "cut from 00:05 to 00:10").
4. Processing Feedback: System provides visible feedback (e.g., "thinking...", step-by-step interpretation).
5. Apply Edit: Edit is applied to the timeline and video.
6. Real-Time Update: Timeline and video playback update immediately to reflect the edit.

**Current State:** Steps 1-3 are partially present (UI only); steps 4-6 are not functional.

## Project Overview

The NLP Video Editor is a specialized tool that enables users to edit video clips using natural language commands. Acting as a "cursor for video editing," this tool will interpret user instructions and apply corresponding editing actions to videos on a timeline, significantly reducing the manual workload of traditional video editing.

## Project Scope

### Core Functionality
- Natural language command interpretation for video editing actions
- Command execution on video timeline
- Basic video editing operations:
  - Cutting/trimming
  - Joining/merging clips
  - Applying transitions
  - Adjusting speed
  - Adding text/captions
  - Basic color correction
  - Audio adjustments
  - Moving clips between tracks/positions (MOVE command, context-aware)

### User Experience
- Command input interface (text field)
- Command feedback system
- Visual timeline representation
- Preview window
- Command history

### Out of Scope (Initial Version)
- Advanced effects and compositing
- Motion graphics templates
- Multi-user collaboration
- Complex AI-generated content

## Technical Architecture

### Frontend
- **Framework Options:**
  - React.js with TypeScript (recommended for UI responsiveness)
  - Electron (for desktop application)
- **Video Processing:**
  - WebAssembly for browser-based video manipulation
  - FFmpeg.wasm for video transcoding and processing
  - MoviePy and ffmpeg-python for core editing operations
  - Video loading functionality is now implemented (mocked duration, file name as clip name)
  - Clip trimming (cutting), joining, and basic transition operations are now implemented and demoed
- **UI Components:**
  - Timeline view with zooming capabilities
  - Command input area with suggestions
  - Video preview panel
  - Resource browser

### Backend
- **NLP Processing:**
  - Fine-tuned language model for video editing domain
  - Command parser to convert natural language to editing operations
  - Intent recognition system
- **Video Processing Engine:**
  - Non-destructive editing layer
  - Video encoding/decoding
  - Frame-accurate editing
- **Optional Server Components:**
  - API for more intensive processing
  - Cloud storage for projects

### Data Flow
1. User inputs natural language command
2. NLP system interprets command into structured editing intent
3. Command validator checks feasibility
4. Editing engine applies changes to timeline
5. Timeline and preview update with changes
6. Command and result are stored in history

## Development Approach

### Phase 1: Proof of Concept
- Implement basic NLP command parsing
- Create simplified timeline interface
- Support fundamental operations (cut, trim, join)
- Build basic feedback system

### Phase 2: Core Functionality
- Expand command vocabulary
- Implement all core editing operations
- Improve UI/UX based on testing
- Optimize performance

### Phase 3: Refinement
- Add command suggestions
- Implement command history and undo/redo
- Enhance error handling and user guidance
- Add export options

## Technology Stack Recommendations

### NLP Processing
- **Options:**
  - Hugging Face Transformers (BERT, RoBERTa, etc.)
  - OpenAI API (GPT models)
  - Local models like Llama or Mistral (open-source)
  - Custom trained model on video editing commands

### Video Processing
- **Libraries:**
  - FFmpeg (via ffmpeg-python, primary backend for video processing)
  - MoviePy (optional, for prototyping/preview only)
  - FFmpeg.wasm for browser-based transcoding (future)
  - WebCodecs API (for modern browsers)
  - MLT Framework

### Frontend
- React.js + TypeScript
- Redux or Context API for state management
- Styled-components or Tailwind CSS

### Development Tools
- Jest for testing
- ESLint for code quality
- GitHub Actions for CI/CD

## Testing Strategy

### Unit Testing
- Command parsing accuracy
- Editing operation correctness
- Timeline manipulation

### User Testing
- Command naturalness
- Editing efficiency compared to traditional methods
- Learning curve measurements

## Challenges and Considerations

### Technical Challenges
- Accurate parsing of ambiguous commands (now robust for 'cut' trim/gap distinction)
- Performance optimization for video processing
- Managing complex timeline operations
- Cross-platform compatibility
- Asset versioning/duplication is now handled by always using the latest version for duration

### UX Challenges
- Training users to phrase commands effectively
- Providing helpful feedback for unsuccessful commands
- Balancing NLP flexibility with predictable behavior

## Success Metrics

- Command interpretation accuracy rate
- Task completion time compared to traditional editors
- User satisfaction scores
- Learning curve duration

## Future Expansion Possibilities

- Voice command support
- AI-suggested edits based on content
- Template-based editing
- Multi-language support
- Plugin system for extensibility
- Mobile version

### Technical Architecture

- **NLP:** Initial implementation uses spaCy for command parsing, with regex and custom intent classification for fallback. Now supports 'add text' commands with time and position extraction, and improved parsing for full clip names. Parser unit tests are in place and passing.
- **Video Processing:** MoviePy and ffmpeg-python will be evaluated and used for core editing operations. Video loading functionality is now implemented (mocked duration, file name as clip name). Clip trimming (cutting), joining, and basic transition operations are now implemented and demoed.
- **Code Structure:** Modular Python code, following project rules for separation, testing, and documentation.

### Documentation
- Command structure and examples are documented in `docs/command_structure.md` and `docs/command_examples.md`.

### NLP Library/Service Selection
- The project uses **spaCy** for entity extraction and tokenization, and **regex** for high-precision command pattern matching and intent recognition.
- This approach is lightweight, fast, and easy to maintain for a well-defined command set.
- If more flexible or ambiguous command parsing is needed in the future, the system can be extended with **Hugging Face Transformers** (for ML-based intent classification) or **Rasa NLU** (for conversational/intent/entity extraction).

## Timeline Data Structure Design Principles

- **Multiple Track Types:** Supports multiple video, audio, subtitle, and effects tracks for flexible editing.
- **Sequential Clips:** Clips on the same track are sequential (non-overlapping) for simplicity; compound/nested clips planned for future phases.
- **Transitions as Objects:** Transitions are represented as dedicated objects connecting clips, not as clip properties.
- **Effects as Clip Properties:** Effects (e.g., speed, color correction) are stored as properties of clips.
- **Frame-Based Timing:** All timing is stored internally as frames (integer) for precision, with support for variable frame rates. UI accepts/displays both seconds and frames.
- **JSON Serialization:** Timeline structure is easily serializable to JSON for project saving/loading, with a version field for backward compatibility.
- **Extensibility:** Base classes/interfaces for tracks, clips, and effects allow for future extension and plugin support.

*Implementation will proceed incrementally, starting with the core data structures and expanding as needed.*

## Context Awareness & Natural Time Expressions (2024-06-13)
- All major commands (CUT, TRIM, JOIN, OVERLAY, FADE, ADD_TEXT) now support:
  - Contextual pronouns ("it", "that", "this", etc.)
  - Natural time expressions ("thirty seconds", "halfway through", etc.)
- Future commands (MOVE, DUPLICATE, DELETE, REPLACE, etc.) should follow this pattern for consistency and user experience.

- Improve natural language flexibility and context understanding
  - [x] Context awareness and natural time expressions for all major commands (2024-06-13)
  - [ ] Add context/time support for future commands (MOVE, DUPLICATE, DELETE, REPLACE, etc.)

## Major Upgrade: AI-Powered NLP Command Parsing (2024-06-15)

### Overview
The project is transitioning from a regex/spaCy-based command parser to a robust AI-powered natural language understanding system using OpenAI's API (GPT-4 or similar). This will allow users to enter free-form, flexible commands (even with typos or casual language), which are interpreted into structured timeline edit instructions. The backend will validate and apply these instructions to the timeline JSON, maintaining compatibility with the existing video editing pipeline and Supabase storage.

### Key Changes
- **Regex/spaCy-based parsing is deprecated.**
- **All command parsing will be routed through an OpenAI-powered endpoint.**
- **A clear schema for AI output (edit intent JSON) is defined and enforced.**
- **Backend validates and applies AI-generated instructions to the timeline JSON.**
- **Frontend sends raw commands to the backend and handles structured responses.**
- **Fallback/error handling and context-awareness strategies are implemented.**

### New Data Flow
1. User enters a free-form command in the UI.
2. Frontend sends the command to a backend endpoint (e.g., `/api/parseCommand`).
3. Backend calls OpenAI's API with a prompt and schema, receives structured JSON.
4. Backend validates the JSON and applies the edit to the timeline (and saves to Supabase).
5. Updated timeline JSON is returned to the frontend, which updates state/UI and preview.
6. If parsing fails or is ambiguous, the user receives a clear error or feedback message.

### Command Schema Example
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

### Implementation Steps
1. **Define schema and prompt format for AI output.**
2. **Integrate OpenAI API in backend; implement parse endpoint.**
3. **Refactor frontend to use new endpoint and update UI/UX for free-form commands.**
4. **Implement backend logic to validate and apply AI-generated instructions to timeline JSON.**
5. **Add fallback/error handling for ambiguous or failed parses.**
6. **(Optional) Add context-awareness for content-based commands in the future.**
7. **Thoroughly test with a range of natural language commands and edge cases.**

### Impact on Technical Architecture
- **Frontend:** No longer relies on rigid command syntax; UI encourages natural language. Command input sends raw text to backend and handles structured responses.
- **Backend:** Centralizes command parsing and timeline updates. All business logic for validation and application of edits is handled server-side. OpenAI API integration is required.
- **Timeline JSON:** Remains the single source of truth; all edits are reflected here and synced with Supabase.
- **Error Handling:** Robust feedback for ambiguous, incomplete, or failed commands. Fallbacks and user guidance are prioritized.
- **Extensibility:** New command types and schema changes can be handled by updating the AI prompt and backend validation logic, not by writing new regexes.

### Deprecated (Legacy) Approach
- The previous spaCy/regex-based parser is deprecated and will be removed after migration is complete. All new features and bugfixes should target the AI-powered system.

### Future Directions
- Add richer context-awareness (e.g., content tags, transcript integration) to support commands like "cut out the part where the guy in the grey quarter zip is talking."
- Enable collaborative editing and real-time sync as needed.
- Continue to expand the schema and prompt as new editing features are added.