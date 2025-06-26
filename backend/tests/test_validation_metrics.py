import pytest
from app.command_parser import CommandParser

# Labeled dataset: (command, expected_valid)
VALIDATION_TEST_CASES = [
    ("Cut clip1 at 00:30", True),
    ("Cut at 00:30", False),  # missing target
    ("Cut clip1", False),     # missing timestamp
    ("Add text 'Intro' at the top from 0:05 to 0:15", True),
    ("Add text at the top from 0:05 to 0:15", False),  # missing text
    ("Add text 'Intro' at the top", False),           # missing start/end
    ("Make it sparkle!", False),                      # unknown command
    ("Trim the start of clip2 to 00:10", True),      # now implemented, should be valid
    ("Join clip1 and clip2 with a crossfade", True), # now implemented, should be valid
    ("Overlay logo.png at the top right from 10s to 20s", True), # now implemented, should be valid
    ("Fade out audio at the end of the timeline", True),         # now implemented, should be valid
]

def test_validation_accuracy():
    parser = CommandParser()
    correct = 0
    for command, expected_valid in VALIDATION_TEST_CASES:
        op = parser.parse_command(command)
        valid, msg = parser.validate_command(op)
        if valid == expected_valid:
            correct += 1
        else:
            print(f"Validation mismatch: '{command}'\n  Got valid={valid}, expected={expected_valid}\n  Message: {msg}")
    accuracy = correct / len(VALIDATION_TEST_CASES)
    print(f"Validation accuracy: {accuracy:.2%} ({correct}/{len(VALIDATION_TEST_CASES)})")
    # Assert at least 90% accuracy for now (adjust as needed)
    assert accuracy >= 0.9 