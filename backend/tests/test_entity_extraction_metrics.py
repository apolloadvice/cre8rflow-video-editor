import pytest
from app.command_parser import CommandParser

# Helper for frame conversion
FRAME_RATE = 30

def to_frames(time_str):
    if isinstance(time_str, (int, float)):
        return int(float(time_str) * FRAME_RATE)
    if ":" in time_str:
        parts = [int(p) for p in time_str.split(":")]
        if len(parts) == 2:
            return parts[0] * 60 * FRAME_RATE + parts[1] * FRAME_RATE
        elif len(parts) == 3:
            return parts[0] * 3600 * FRAME_RATE + parts[1] * 60 * FRAME_RATE + parts[2] * FRAME_RATE
    if time_str.endswith("s"):
        return int(float(time_str[:-1]) * FRAME_RATE)
    return int(float(time_str) * FRAME_RATE)

# Labeled dataset: (command, expected_entities)
# expected_entities is a dict with keys: clip_names, timecodes, effects
ENTITY_TEST_CASES = [
    ("Cut clip1 at 00:30", {"clip_names": ["clip1"], "timecodes": [to_frames("00:30")], "effects": []}),
    ("Trim the start of clip2 to 00:10", {"clip_names": ["clip2"], "timecodes": [to_frames("00:10")], "effects": []}),
    ("Join clip1 and clip2 with a crossfade", {"clip_names": ["clip1", "clip2"], "timecodes": [], "effects": ["crossfade"]}),
    ("Add text 'Intro' at the top from 0:05 to 0:15", {"clip_names": [], "timecodes": [to_frames("0:05"), to_frames("0:15")], "effects": []}),
    ("Overlay logo.png at the top right from 10s to 20s", {"clip_names": [], "timecodes": [to_frames("10s"), to_frames("20s")], "effects": []}),
    ("Fade out audio at the end of the timeline", {"clip_names": [], "timecodes": [], "effects": ["fade"]}),
    ("Apply color correction to clip3", {"clip_names": ["clip3"], "timecodes": [], "effects": ["color correction"]}),
    ("Export the project as mp4", {"clip_names": [], "timecodes": [], "effects": []}),
    ("Make it sparkle!", {"clip_names": [], "timecodes": [], "effects": []}),
    ("Cut at 00:30", {"clip_names": [], "timecodes": [to_frames("00:30")], "effects": []}),  # missing clip name
    ("Join with a crossfade", {"clip_names": [], "timecodes": [], "effects": ["crossfade"]}),  # missing clip names
]


def test_entity_extraction_accuracy():
    parser = CommandParser()
    correct = 0
    for command, expected in ENTITY_TEST_CASES:
        extracted = parser.extract_entities(command)
        # Compare sets for clip_names, timecodes, effects
        match = (
            set(extracted.get("clip_names", [])) == set(expected.get("clip_names", [])) and
            set(extracted.get("timecodes", [])) == set(expected.get("timecodes", [])) and
            set(extracted.get("effects", [])) == set(expected.get("effects", []))
        )
        if match:
            correct += 1
        else:
            print(f"Entity mismatch: '{command}'\n  Extracted: {extracted}\n  Expected: {expected}")
    accuracy = correct / len(ENTITY_TEST_CASES)
    print(f"Entity extraction accuracy: {accuracy:.2%} ({correct}/{len(ENTITY_TEST_CASES)})")
    # Assert at least 90% accuracy for now (adjust as needed)
    assert accuracy >= 0.9 