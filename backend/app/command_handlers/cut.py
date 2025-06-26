import re
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation
from app.utils import timestamp_to_frames, parse_natural_time_expression

ORDINALS = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"
]
ordinal_pattern = r"(?P<ordinal>(" + "|".join(ORDINALS) + r"|\d+(st|nd|rd|th)))"
natural_reference_pattern = r"this clip|the clip before that one|the clip after that one|the clip that starts at (?P<start_time>\d{1,2}:\d{2}|\d+)"

# Add pronoun support for context awareness
def _contextual_pronoun_pattern():
    return r"(?P<target_pronoun>it|that|this)"

# Update full_target_pattern to include pronouns
full_target_pattern = rf"(?:the )?(?P<target>(last clip|first clip|clip named [\w_\-]+|clip\w+|audio\w+|subtitle\w+|effect\w+|{ordinal_pattern}(?: (?P<ref_track_type>video|audio|subtitle|effect))? clip|{natural_reference_pattern}|{_contextual_pronoun_pattern()}))"

class CutCommandHandler(BaseCommandHandler):
    def match(self, command_text: str) -> bool:
        cut_synonyms = r"cut|split|divide|slice"
        cut_pattern = re.compile(
            rf"^(?P<verb>{cut_synonyms})(?:\s+{full_target_pattern})?(?:\s+at\s+(?P<timestamp>[\w\s:-]+))?$",
            re.I
        )
        return bool(cut_pattern.match(command_text))

    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        """
        Parse a cut command. The returned 'timestamp' parameter is always in frames (not seconds).
        All downstream logic expects frames for cut locations.
        """
        cut_synonyms = r"cut|split|divide|slice"
        cut_pattern = re.compile(
            rf"^(?P<verb>{cut_synonyms})(?:\s+{full_target_pattern})?(?:\s+at\s+(?P<timestamp>[\w\s:-]+))?$",
            re.I
        )
        cut_match = cut_pattern.match(command_text)
        if cut_match:
            # Support both named targets and pronouns
            target = None
            reference_pronoun = None
            if cut_match.group("target_pronoun"):
                target = cut_match.group("target_pronoun")
                reference_pronoun = target.lower()
            elif cut_match.group("target") and cut_match.group("target").lower() != "at":
                target = cut_match.group("target")
            else:
                target = "current"
            timestamp = cut_match.group("timestamp") if cut_match.group("timestamp") else None
            params = {}
            reference_type = None
            if target:
                t = target.lower()
                if reference_pronoun:
                    reference_type = "contextual"
                    params["reference_pronoun"] = reference_pronoun
                elif t in ["last clip", "first clip"]:
                    reference_type = "positional"
                elif t.startswith("clip named"):
                    reference_type = "named"
                elif cut_match.group("ordinal"):
                    reference_type = "ordinal"
                    params["ordinal"] = cut_match.group("ordinal")
                    if cut_match.group("ref_track_type"):
                        params["ref_track_type"] = cut_match.group("ref_track_type")
                        params["track_type"] = cut_match.group("ref_track_type")
                elif t == "this clip":
                    reference_type = "contextual"
                elif t == "the clip before that one":
                    reference_type = "relative"
                    params["relative_position"] = "before"
                elif t == "the clip after that one":
                    reference_type = "relative"
                    params["relative_position"] = "after"
                elif t.startswith("the clip that starts at"):
                    reference_type = "by_start_time"
                    start_time = cut_match.group("start_time")
                    params["start_time"] = start_time
            if timestamp:
                natural_seconds = parse_natural_time_expression(timestamp)
                if natural_seconds is not None:
                    params["timestamp"] = int(natural_seconds * frame_rate)
                else:
                    params["timestamp"] = timestamp_to_frames(timestamp, frame_rate)
            if target and not reference_pronoun:
                if t.startswith("audio"):
                    params["track_type"] = "audio"
                elif t.startswith("subtitle"):
                    params["track_type"] = "subtitle"
                elif t.startswith("effect"):
                    params["track_type"] = "effect"
            if reference_type:
                params["reference_type"] = reference_type
            return EditOperation(type_="CUT", target=target, parameters=params)
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text}) 