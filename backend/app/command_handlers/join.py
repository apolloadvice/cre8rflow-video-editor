import re
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation

ORDINALS = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"
]
ordinal_pattern_first = r"(?P<ordinal_first>(" + "|".join(ORDINALS) + r"|\d+(st|nd|rd|th)))"
ordinal_pattern_second = r"(?P<ordinal_second>(" + "|".join(ORDINALS) + r"|\d+(st|nd|rd|th)))"
natural_reference_pattern_first = r"this clip|the clip before that one|the clip after that one|the clip that starts at (?P<start_time_first>\d{1,2}:\d{2}|\d+)"
natural_reference_pattern_second = r"this clip|the clip before that one|the clip after that one|the clip that starts at (?P<start_time_second>\d{1,2}:\d{2}|\d+)"

# Add pronoun support for context awareness
def _contextual_pronoun_pattern_first():
    return r"(?P<first_target_pronoun>it|that|this)"

def _contextual_pronoun_pattern_second():
    return r"(?P<second_target_pronoun>it|that|this)"

# Update target patterns to include pronouns
full_target_pattern_first = rf"(?:the )?(?P<first_target>(last clip|first clip|clip named [\w_\-]+|clip\w+|audio\w+|subtitle\w+|effect\w+|{ordinal_pattern_first}(?: (?P<ref_track_type_first>video|audio|subtitle|effect))? clip|{natural_reference_pattern_first}|{_contextual_pronoun_pattern_first()}))"
full_target_pattern_second = rf"(?:the )?(?P<second_target>(last clip|first clip|clip named [\w_\-]+|clip\w+|audio\w+|subtitle\w+|effect\w+|{ordinal_pattern_second}(?: (?P<ref_track_type_second>video|audio|subtitle|effect))? clip|{natural_reference_pattern_second}|{_contextual_pronoun_pattern_second()}))"

class JoinCommandHandler(BaseCommandHandler):
    def match(self, command_text: str) -> bool:
        join_synonyms = r"join|merge|combine"
        join_pattern = re.compile(
            rf"({join_synonyms}) {full_target_pattern_first} and {full_target_pattern_second}(?: with a (?P<effect>\w+))?",
            re.I
        )
        join_with_pattern = re.compile(
            rf"({join_synonyms}) with {full_target_pattern_second}(?: with a (?P<effect>\w+))?",
            re.I
        )
        return bool(join_pattern.match(command_text)) or bool(join_with_pattern.match(command_text))

    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        join_synonyms = r"join|merge|combine"
        join_pattern = re.compile(
            rf"({join_synonyms}) {full_target_pattern_first} and {full_target_pattern_second}(?: with a (?P<effect>\w+))?",
            re.I
        )
        join_with_pattern = re.compile(
            rf"({join_synonyms}) with {full_target_pattern_second}(?: with a (?P<effect>\w+))?",
            re.I
        )
        join_match = join_pattern.match(command_text)
        if join_match:
            first = None
            first_reference_pronoun = None
            if join_match.group("first_target_pronoun"):
                first = join_match.group("first_target_pronoun")
                first_reference_pronoun = first.lower()
            elif join_match.group("first_target"):
                first = join_match.group("first_target")
            second = None
            second_reference_pronoun = None
            if join_match.group("second_target_pronoun"):
                second = join_match.group("second_target_pronoun")
                second_reference_pronoun = second.lower()
            elif join_match.group("second_target"):
                second = join_match.group("second_target")
            effect = join_match.group("effect")
            params = {"second": second}
            # Reference type logic for first
            reference_type = None
            if first:
                t = first.lower()
                if first_reference_pronoun:
                    reference_type = "contextual"
                    params["reference_pronoun_first"] = first_reference_pronoun
                elif t in ["last clip", "first clip"]:
                    reference_type = "positional"
                elif t.startswith("clip named"):
                    reference_type = "named"
                elif join_match.group("ordinal_first"):
                    reference_type = "ordinal"
                    params["ordinal"] = join_match.group("ordinal_first")
                    if join_match.group("ref_track_type_first"):
                        params["ref_track_type"] = join_match.group("ref_track_type_first")
                        params["track_type"] = join_match.group("ref_track_type_first")
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
                    start_time = join_match.group("start_time_first")
                    params["start_time"] = start_time
            # Reference type logic for second (for completeness, but only first is used as target)
            if second_reference_pronoun:
                params["reference_pronoun_second"] = second_reference_pronoun
            if effect:
                params["effect"] = effect
            # Infer track_type from first or second
            if (first and first.lower().startswith("audio")) or (second and second.lower().startswith("audio")):
                params["track_type"] = "audio"
            elif (first and first.lower().startswith("subtitle")) or (second and second.lower().startswith("subtitle")):
                params["track_type"] = "subtitle"
            elif (first and first.lower().startswith("effect")) or (second and second.lower().startswith("effect")):
                params["track_type"] = "effect"
            if reference_type:
                params["reference_type"] = reference_type
            return EditOperation(type_="JOIN", target=first, parameters=params)
        # Support 'join with <target>' for contextual filling
        join_with_match = join_with_pattern.match(command_text)
        if join_with_match:
            second = None
            second_reference_pronoun = None
            if join_with_match.group("second_target_pronoun"):
                second = join_with_match.group("second_target_pronoun")
                second_reference_pronoun = second.lower()
            elif join_with_match.group("second_target"):
                second = join_with_match.group("second_target")
            effect = join_with_match.group("effect")
            params = {"second": second}
            if second_reference_pronoun:
                params["reference_pronoun_second"] = second_reference_pronoun
            if effect:
                params["effect"] = effect
            # Infer track_type from second
            if second and second.lower().startswith("audio"):
                params["track_type"] = "audio"
            elif second and second.lower().startswith("subtitle"):
                params["track_type"] = "subtitle"
            elif second and second.lower().startswith("effect"):
                params["track_type"] = "effect"
            return EditOperation(type_="JOIN", target=None, parameters=params)
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text}) 