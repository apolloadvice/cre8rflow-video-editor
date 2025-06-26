import re
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation
from app.utils import parse_natural_time_expression

ORDINALS = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"
]
ordinal_pattern = r"(?P<ordinal>(" + "|".join(ORDINALS) + r"|\d+(st|nd|rd|th)))"
natural_reference_pattern = r"this clip|the clip before that one|the clip after that one|the clip that starts at (?P<start_time>\d{1,2}:\d{2}|\d+)"

# Add pronoun support for context awareness
def _contextual_pronoun_pattern():
    return r"(?P<target_pronoun>it|that|this)"

# Update target_pattern to include pronouns
full_target_pattern = rf"(?P<target>(audio|clip\w+|timeline|video|track\d+|last clip|first clip|clip named [\w_\-]+|subtitle\w+|effect\w+|{ordinal_pattern}(?: (?P<ref_track_type>video|audio|subtitle|effect))? clip|{natural_reference_pattern}|{_contextual_pronoun_pattern()}))"

class FadeCommandHandler(BaseCommandHandler):
    def match(self, command_text: str) -> bool:
        fade_synonyms = r"fade|dissolve|blend"
        fade_pattern = re.compile(
            rf"(?:{fade_synonyms}) (?P<direction>in|out)(?: {full_target_pattern})?"
            r"(?: (?:at|from) (?P<start>[\w\s:-]+?) to (?P<end>[\w\s:-]+))?"
            r"(?: (?:at|from) (?P<start_only>[\w\s:-]+))?",
            re.I
        )
        return bool(fade_pattern.match(command_text))

    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        fade_synonyms = r"fade|dissolve|blend"
        fade_pattern = re.compile(
            rf"(?:{fade_synonyms}) (?P<direction>in|out)(?: {full_target_pattern})?"
            r"(?: (?:at|from) (?P<start>[\w\s:-]+?) to (?P<end>[\w\s:-]+))?"
            r"(?: (?:at|from) (?P<start_only>[\w\s:-]+))?",
            re.I
        )
        fade_match = fade_pattern.match(command_text)
        if fade_match:
            direction = fade_match.group("direction")
            target = None
            reference_pronoun = None
            reference_type = None
            if fade_match.group("target_pronoun"):
                target = fade_match.group("target_pronoun")
                reference_pronoun = target.lower()
                reference_type = "contextual"
            elif fade_match.group("target"):
                target = fade_match.group("target")
                t = target.lower()
                target = t
                if t in ["last clip", "first clip"]:
                    reference_type = "positional"
                elif t.startswith("clip named"):
                    reference_type = "named"
                elif fade_match.group("ordinal"):
                    reference_type = "ordinal"
                elif t == "this clip":
                    reference_type = "contextual"
                elif t == "the clip before that one":
                    reference_type = "relative"
                elif t == "the clip after that one":
                    reference_type = "relative"
                elif t.startswith("the clip that starts at"):
                    reference_type = "by_start_time"
            start = fade_match.group("start") if fade_match.group("start") else fade_match.group("start_only")
            end = fade_match.group("end")
            params = {"direction": direction}
            if target:
                params["target"] = target
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
            if fade_match.group("ordinal"):
                params["ordinal"] = fade_match.group("ordinal")
                if fade_match.group("ref_track_type"):
                    params["ref_track_type"] = fade_match.group("ref_track_type")
                    params["track_type"] = fade_match.group("ref_track_type")
            if reference_type == "relative":
                if target == "the clip before that one":
                    params["relative_position"] = "before"
                elif target == "the clip after that one":
                    params["relative_position"] = "after"
            if reference_type == "by_start_time" and fade_match.group("start_time"):
                params["start_time"] = fade_match.group("start_time")
            return EditOperation(type_="FADE", target=target, parameters=params)
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text}) 