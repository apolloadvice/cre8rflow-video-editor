import re
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation
from app.utils import timestamp_to_frames, parse_natural_time_expression

# Patterns for context-aware targets
ORDINALS = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"
]
ordinal_pattern = r"(?P<ordinal>(" + "|".join(ORDINALS) + r"|\d+(st|nd|rd|th)))"
natural_reference_pattern = r"this clip|the clip before that one|the clip after that one|the clip that starts at (?P<start_time>\d{1,2}:\d{2}|\d+)"
def _contextual_pronoun_pattern():
    return r"(?P<target_pronoun>it|that|this)"
# Build full_target_pattern with actual regex interpolation
full_target_pattern = rf"(?:the )?(?P<target>(last clip|first clip|clip named [\w_\-]+|clip\w+|audio\w+|subtitle\w+|effect\w+|{ordinal_pattern}(?: (?P<ref_track_type>video|audio|subtitle|effect))? clip|{natural_reference_pattern}|{_contextual_pronoun_pattern()}))"

class AddTextCommandHandler(BaseCommandHandler):
    def match(self, command_text: str) -> bool:
        # Support context-aware targets: 'to it', 'to this clip', etc.
        add_text_pattern = re.compile(
            rf"add(?! overlay)(?: text)?"
            r"(?:\s+['\"](?P<text_quoted>[^'\"]+)['\"]|\s+(?P<text_unquoted>(?!to (it|that|this)\b|to\b|at\b|from\b)[^@\n]+?)(?=\s*to [^ ]+|\s*at the|\s*from|$))?"
            rf"\s*(?:to {full_target_pattern})?"
            r"(?:\s*at the (?P<position>\w+))?"
            r"(?:\s*from (?P<start>[\w\s:-]+?)\s*to (?P<end>[\w\s:-]+))?"
            r"(?:\s*from (?P<start_only>[\w\s:-]+))?",
            re.I
        )
        return bool(add_text_pattern.match(command_text))

    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        add_text_pattern = re.compile(
            rf"add(?! overlay)(?: text)?"
            r"(?:\s+['\"](?P<text_quoted>[^'\"]+)['\"]|\s+(?P<text_unquoted>(?!to (it|that|this)\b|to\b|at\b|from\b)[^@\n]+?)(?=\s*to [^ ]+|\s*at the|\s*from|$))?"
            rf"\s*(?:to {full_target_pattern})?"
            r"(?:\s*at the (?P<position>\w+))?"
            r"(?:\s*from (?P<start>[\w\s:-]+?)\s*to (?P<end>[\w\s:-]+))?"
            r"(?:\s*from (?P<start_only>[\w\s:-]+))?",
            re.I
        )
        match = add_text_pattern.match(command_text)
        if match:
            target = None
            print(f"DEBUG groupdict for '{command_text}':", match.groupdict())
            text = match.group("text_quoted") or (match.group("text_unquoted").strip() if match.group("text_unquoted") else None)
            # If text_unquoted is 'to it', 'to that', or 'to this', treat as target, not text
            if text and text.lower() in ["to it", "to that", "to this"]:
                target = text.split()[1]
                text = None
            if not text or text.lower() == "at":
                text = None
            # Context-aware target extraction
            reference_pronoun = None
            reference_type = None
            groupdict = match.groupdict()
            # Ensure target is set if only target_pronoun is matched
            if ("target" not in groupdict or not match.group("target")) and ("target_pronoun" in groupdict and match.group("target_pronoun")):
                target = match.group("target_pronoun")
            if "target_pronoun" in groupdict and match.group("target_pronoun"):
                target = match.group("target_pronoun")
                reference_pronoun = target.lower()
                reference_type = "contextual"
            elif "target" in groupdict and match.group("target"):
                target = match.group("target")
                t = target.lower()
                target = t  # Always set target to lowercase
                if t in ["last clip", "first clip"]:
                    reference_type = "positional"
                elif t.startswith("clip named"):
                    reference_type = "named"
                elif "ordinal" in groupdict and match.group("ordinal"):
                    reference_type = "ordinal"
                elif t == "this clip":
                    reference_type = "contextual"
                elif t == "the clip before that one":
                    reference_type = "relative"
                elif t == "the clip after that one":
                    reference_type = "relative"
                elif t.startswith("the clip that starts at"):
                    reference_type = "by_start_time"
                if t in ["it", "that", "this"]:
                    reference_pronoun = t
                    reference_type = "contextual"
            position = match.group("position") if "position" in groupdict else None
            start = match.group("start") if "start" in groupdict and match.group("start") else None
            end = match.group("end") if "end" in groupdict and match.group("end") else None
            if not start and "start_only" in groupdict and match.group("start_only"):
                start = match.group("start_only")
            params = {}
            if text:
                params["text"] = text
            if position:
                params["position"] = position
            if start:
                natural_seconds = parse_natural_time_expression(start)
                if natural_seconds is not None:
                    params["start"] = str(int(natural_seconds * frame_rate))
                elif start.isdigit():
                    params["start"] = str(int(float(start) * frame_rate))
                else:
                    params["start"] = start
            if end:
                natural_seconds = parse_natural_time_expression(end)
                if natural_seconds is not None:
                    params["end"] = str(int(natural_seconds * frame_rate))
                elif end.isdigit():
                    params["end"] = str(int(float(end) * frame_rate))
                else:
                    params["end"] = end
            if reference_pronoun:
                params["reference_pronoun"] = reference_pronoun
            if reference_type:
                params["reference_type"] = reference_type
            if target is not None:
                return EditOperation(type_="ADD_TEXT", target=target, parameters=params)
            else:
                return EditOperation(type_="ADD_TEXT", target=None, parameters=params)
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text}) 