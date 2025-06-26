import pytest
from app.command_parser import CommandParser

# Labeled dataset: (command, expected_intent)
INTENT_TEST_CASES = [
    ("Cut clip1 at 00:30", "CUT"),
    ("Trim the start of clip2 to 00:10", "TRIM"),
    ("Join clip1 and clip2 with a crossfade", "JOIN"),
    ("Add text 'Intro' at the top from 0:05 to 0:15", "ADD_TEXT"),
    ("Overlay logo.png at the top right from 10s to 20s", "OVERLAY"),
    ("Fade out audio at the end of the timeline", "FADE"),
    ("Speed up the middle section by 2x", "SPEED"),
    ("Reverse clip4", "REVERSE"),
    ("Apply color correction to clip3", "COLOR_CORRECTION"),
    ("Export the project as mp4", "EXPORT"),
    ("Make it sparkle!", "UNKNOWN"),
    ("Cutt clip1 at 00:30", "UNKNOWN"),  # typo/ambiguous
    ("Addd text 'Intro' at the top from 0:05 to 0:15", "UNKNOWN"),  # typo/ambiguous
]


def test_intent_recognition_accuracy():
    parser = CommandParser()
    correct = 0
    for command, expected_intent in INTENT_TEST_CASES:
        predicted = parser.recognize_intent(command)
        if predicted == expected_intent:
            correct += 1
        else:
            print(f"Intent mismatch: '{command}' => predicted: {predicted}, expected: {expected_intent}")
    accuracy = correct / len(INTENT_TEST_CASES)
    print(f"Intent recognition accuracy: {accuracy:.2%} ({correct}/{len(INTENT_TEST_CASES)})")
    # Assert at least 90% accuracy for now (adjust as needed)
    assert accuracy >= 0.9 