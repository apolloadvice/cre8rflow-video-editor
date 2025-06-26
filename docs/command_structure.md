# Command Structure for NLP Video Editor

This document describes the structure of natural language commands supported by the video editor. It defines the general syntax, required and optional components, and provides examples for each intent category.

## General Syntax

- **[Action] [Target/Clip] [Parameters/Modifiers]**
- Use clear verbs for actions (cut, trim, join, add, overlay, fade, speed up, etc.).
- Specify targets (clip names, timeline, audio, etc.) when relevant.
- Include parameters (timestamps, durations, text, effects) as needed.

---

## Components

- **Action**: The operation to perform (e.g., cut, trim, join, add, overlay, fade, speed up, export).
- **Target**: The object of the action (e.g., clip name, timeline, audio track).
- **Parameters**: Details needed for the action (e.g., timestamp, duration, text, effect type).
- **Modifiers**: Optional details that modify the action (e.g., transition type, position, speed factor).

---

## Intent Categories & Examples

### 1. Clip Manipulation
- **Cut**: `Cut clip1 at 00:30`
- **Trim**: `Trim the start of clip2 to 00:10`
- **Join**: `Join clip1 and clip2 with a crossfade`

### 2. Transitions & Effects
- **Add Transition**: `Add a crossfade between clip2 and clip3`
- **Apply Effect**: `Apply color correction to clip3`

### 3. Text & Overlays
- **Add Text**: `Add text 'Intro' at the top from 0:05 to 0:15`
- **Overlay**: `Overlay logo.png at the top right from 10s to 20s`

### 4. Audio Operations
- **Fade**: `Fade out audio at the end of the timeline`
- **Adjust Volume**: `Set volume of clip2 to 50%`

### 5. Speed & Direction
- **Change Speed**: `Speed up the middle section by 2x`
- **Reverse**: `Reverse clip4`

### 6. Export & Project Management
- **Export**: `Export the project as mp4`
- **Save/Load**: `Save project as my_edit` / `Load project my_edit`

---

## Notes
- **Timestamps**: Use `mm:ss` or seconds (e.g., `1:30` or `90s`).
- **Clip names**: Should be unique and alphanumeric (e.g., `clip1`, `intro_clip`).
- **Text**: Enclose in single or double quotes.
- **Positions**: Use `top`, `bottom`, `top left`, `center`, etc.
- **Transitions/effects**: Use common names (`crossfade`, `fade`, `dissolve`, `blur`, etc.).

---

Refer to `command_examples.md` for a full dataset of supported commands. 