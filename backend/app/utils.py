import re
from typing import Optional, Union

NUM_WORDS = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
    'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90
}

# Order matters: longer phrases first
FRACTIONS = [
    ('three quarters', 0.75),
    ('half', 0.5),
    ('quarter', 0.25),
    ('third', 1/3),
]

def words_to_number(text: str) -> Optional[float]:
    """
    Convert a string of English number words to a float (e.g., 'thirty five' -> 35).
    """
    text = text.lower().replace('-', ' ')
    words = text.split()
    total = 0
    current = 0
    for word in words:
        if word in NUM_WORDS:
            current += NUM_WORDS[word]
        elif word == 'hundred':
            current *= 100
        elif word == 'thousand':
            current *= 1000
        else:
            continue
    total += current
    return float(total) if total > 0 else None

def parse_natural_time_expression(text: str, duration: Optional[float] = None) -> Optional[float]:
    """
    Parse a natural language time expression and return the value in seconds.

    Args:
        text (str): The time expression (e.g., 'thirty seconds', 'halfway through', 'the last 5 seconds')
        duration (Optional[float]): The total duration in seconds, for relative expressions

    Returns:
        Optional[float]: The time in seconds, or None if not recognized
    """
    text = text.strip().lower()
    # 'the last X seconds/minutes' (handle this first)
    match = re.match(r"the last ([a-z\-\d ]+)\s*seconds?", text)
    if match and duration is not None:
        num = words_to_number(match.group(1))
        if num is not None:
            return duration - num
        try:
            num = float(match.group(1))
            return duration - num
        except Exception:
            pass
    match = re.match(r"the last ([a-z\-\d ]+)\s*minutes?", text)
    if match and duration is not None:
        num = words_to_number(match.group(1))
        if num is not None:
            return duration - num * 60
        try:
            num = float(match.group(1))
            return duration - num * 60
        except Exception:
            pass
    # Direct seconds/minutes/hours
    match = re.match(r"(\d+)\s*(seconds?|s)", text)
    if match:
        return float(match.group(1))
    match = re.match(r"(\d+)\s*(minutes?|m)", text)
    if match:
        return float(match.group(1)) * 60
    match = re.match(r"(\d+)\s*(hours?|h)", text)
    if match:
        return float(match.group(1)) * 3600
    # Number words (e.g., 'thirty seconds')
    match = re.match(r"([a-z\- ]+)\s*seconds?", text)
    if match:
        num = words_to_number(match.group(1))
        if num is not None:
            return num
    match = re.match(r"([a-z\- ]+)\s*minutes?", text)
    if match:
        num = words_to_number(match.group(1))
        if num is not None:
            return num * 60
    match = re.match(r"([a-z\- ]+)\s*hours?", text)
    if match:
        num = words_to_number(match.group(1))
        if num is not None:
            return num * 3600
    # Fractions (e.g., 'halfway through', 'quarter of the way')
    # Match longer fraction words first
    for frac_word, frac_val in FRACTIONS:
        if frac_word in text:
            if duration is not None:
                return duration * frac_val
    if 'halfway' in text and duration is not None:
        return duration * 0.5
    # 'start', 'beginning', 'end'
    if text in ['start', 'beginning']:
        return 0.0
    if text == 'end' and duration is not None:
        return duration
    return None

def timestamp_to_frames(timestamp, frame_rate):
    """
    Convert a timestamp (seconds, mm:ss, or string) to frame number.

    Args:
        timestamp (Union[str, int, float]): The timestamp to convert.
        frame_rate (int): The frame rate (frames per second).

    Returns:
        int: The corresponding frame number.
    """
    if isinstance(timestamp, (int, float)):
        return int(float(timestamp) * frame_rate)
    if isinstance(timestamp, str):
        if ":" in timestamp:
            parts = [int(p) for p in timestamp.split(":")]
            if len(parts) == 2:
                return parts[0] * 60 * frame_rate + parts[1] * frame_rate
            elif len(parts) == 3:
                return parts[0] * 3600 * frame_rate + parts[1] * 60 * frame_rate + parts[2] * frame_rate
        if timestamp.endswith("s"):
            return int(float(timestamp[:-1]) * frame_rate)
        return int(float(timestamp) * frame_rate)
    return int(timestamp) 