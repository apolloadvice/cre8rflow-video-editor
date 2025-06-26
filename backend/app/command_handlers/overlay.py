import re
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation
from app.utils import timestamp_to_frames

ORDINALS = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"
]
ordinal_pattern = r"(?P<ordinal>(" + "|".join(ORDINALS) + r"|\d+(st|nd|rd|th)))"
natural_reference_pattern = r"(?:the )?clip that starts at (?P<start_time_position>\d{1,2}:\d{2}|\d+)|the clip before that one|the clip after that one|this clip"

# Add pronoun support for context awareness
def _contextual_pronoun_pattern():
    return r"(?P<position_pronoun>it|that|this)"

# Update position_pattern to include pronouns
full_position_pattern = rf"(?P<position>(top|bottom|left|right|center|middle|top left|top right|bottom left|bottom right|{ordinal_pattern}(?: (?P<ref_track_type>video|audio|subtitle|effect))? position|{natural_reference_pattern}|{_contextual_pronoun_pattern()}|[\w ]+?))(?= from| to|$)"

class OverlayCommandHandler(BaseCommandHandler):
    def match(self, command_text: str) -> bool:
        overlay_synonyms = r"overlay|superimpose|place|put|add overlay"
        overlay_pattern = re.compile(
            rf"^(?:{overlay_synonyms}) (?P<asset>\S+)(?: (?:at the|in) {full_position_pattern})?(?: from (?P<start>\d{{1,2}}:\d{{2}}|\d+s?)(?: to (?P<end>\d{{1,2}}:\d{{2}}|\d+s?))?)?$",
            re.I
        )
        return bool(overlay_pattern.match(command_text))

    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        overlay_synonyms = r"overlay|superimpose|place|put|add overlay"
        overlay_pattern = re.compile(
            rf"^(?:{overlay_synonyms}) (?P<asset>\S+)(?: (?:at the|in) {full_position_pattern})?(?: from (?P<start>\d{{1,2}}:\d{{2}}|\d+s?)(?: to (?P<end>\d{{1,2}}:\d{{2}}|\d+s?))?)?$",
            re.I
        )
        overlay_match = overlay_pattern.match(command_text)
        if overlay_match:
            asset = overlay_match.group("asset")
            if not asset:
                return EditOperation(type_="UNKNOWN", parameters={"raw": command_text})
            position = None
            reference_pronoun = None
            if overlay_match.group("position_pronoun"):
                position = overlay_match.group("position_pronoun")
                reference_pronoun = position.lower()
            elif overlay_match.group("position"):
                position = overlay_match.group("position")
            start = overlay_match.group("start")
            end = overlay_match.group("end")
            params = {"asset": asset}
            reference_type = None
            if position:
                p = position.lower()
                params["position"] = position
                if reference_pronoun:
                    reference_type = "contextual"
                    params["reference_pronoun"] = reference_pronoun
                elif p in ["top", "bottom", "left", "right", "center", "middle", "top left", "top right", "bottom left", "bottom right"]:
                    reference_type = "positional"
                elif overlay_match.group("ordinal"):
                    reference_type = "ordinal"
                    params["ordinal"] = overlay_match.group("ordinal")
                    if overlay_match.group("ref_track_type"):
                        params["ref_track_type"] = overlay_match.group("ref_track_type")
                        params["track_type"] = overlay_match.group("ref_track_type")
                elif p == "this clip":
                    reference_type = "contextual"
                elif p in ["the clip before that one", "clip before that one"]:
                    reference_type = "relative"
                    params["relative_position"] = "before"
                elif p in ["the clip after that one", "clip after that one"]:
                    reference_type = "relative"
                    params["relative_position"] = "after"
                elif p.startswith("the clip that starts at") or p.startswith("clip that starts at"):
                    reference_type = "by_start_time"
                    start_time = overlay_match.group("start_time_position")
                    params["start_time"] = start_time
            # Normalize start/end to frames if present
            if start:
                params["start"] = timestamp_to_frames(start, frame_rate)
            if end:
                params["end"] = timestamp_to_frames(end, frame_rate)
            if reference_type:
                params["reference_type"] = reference_type
            return EditOperation(type_="OVERLAY", parameters=params)
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text}) 