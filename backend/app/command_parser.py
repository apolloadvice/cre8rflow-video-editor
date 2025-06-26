import re
from typing import Optional, Dict, Any
import spacy
from app.command_types import EditOperation, CompoundOperation
from app.command_handlers.cut import CutCommandHandler
from app.command_handlers.trim import TrimCommandHandler
from app.command_handlers.join import JoinCommandHandler
from app.command_handlers.add_text import AddTextCommandHandler
from app.command_handlers.overlay import OverlayCommandHandler
from app.command_handlers.fade import FadeCommandHandler
from app.command_handlers.group_cut import GroupCutCommandHandler
from app.command_handlers.remove import RemoveCommandHandler
from app.utils import timestamp_to_frames
import importlib

class CommandParser:
    """
    Parses natural language video editing commands into structured operations.
    Now supports optional LLM (OpenAI GPT) parsing as a first step.

    Uses NLP techniques to extract:
    - Command intent (cut, join, speed, etc.)
    - Target clips
    - Parameters (timestamps, speeds, etc.)
    - Modifiers (transitions, effects)
    """
    def __init__(self, use_llm: bool = False):
        """
        Initialize the parser with spaCy, handler registry, and optional LLM support.

        Args:
            use_llm (bool): Whether to use LLM (OpenAI GPT) for command parsing.
        """
        self.nlp = spacy.blank("en")  # Use blank for now; can load 'en_core_web_sm' if available
        # Handler registry for extensibility
        self.handlers = []
        self.register_handler(GroupCutCommandHandler())
        self.register_handler(CutCommandHandler())
        self.register_handler(TrimCommandHandler())
        self.register_handler(JoinCommandHandler())
        self.register_handler(AddTextCommandHandler())
        self.register_handler(OverlayCommandHandler())
        self.register_handler(FadeCommandHandler())
        self.register_handler(RemoveCommandHandler())
        # TODO: Register other handlers as they are refactored
        self.use_llm = use_llm
        # Import LLM parser only if needed (avoids dependency if not used)
        self.llm_parser = None
        if self.use_llm:
            self.llm_parser = importlib.import_module("app.llm_parser")

    def register_handler(self, handler):
        self.handlers.append(handler)

    def parse_command(self, command_text: str, frame_rate: int = 30):
        """
        Parse a natural language command into a structured edit operation.
        If LLM parsing is enabled, try it first. Fallback to handler-based logic if LLM fails or is disabled.

        Args:
            command_text (str): The natural language command
            frame_rate (int): The frame rate to use for time normalization

        Returns:
            EditOperation or CompoundOperation: Structured representation of the command(s)
        """
        # Step 1: Try LLM parsing if enabled
        if self.use_llm and self.llm_parser:
            llm_result = self.llm_parser.parse_command_with_llm(command_text)
            if llm_result:
                # If the LLM returns a list, treat as compound
                if isinstance(llm_result, list):
                    operations = [EditOperation(**op) for op in llm_result]
                    return CompoundOperation(operations)
                elif isinstance(llm_result, dict):
                    # If type is UNKNOWN, fallback to handler-based
                    if llm_result.get("type", "").upper() != "UNKNOWN":
                        # Map 'type' to 'type_' for EditOperation constructor
                        op_args = dict(llm_result)
                        if "type" in op_args:
                            op_args["type_"] = op_args.pop("type")
                        return EditOperation(**op_args)
                # If ambiguous or unknown, fallback to handler-based
        # If the command starts with JOIN/MERGE/COMBINE, always try handler matching first
        if re.match(r'^\s*(join|merge|combine)\b', command_text, re.I):
            for handler in self.handlers:
                if handler.match(command_text):
                    return handler.parse(command_text, frame_rate=frame_rate)
        # Otherwise, check for top-level conjunctions outside of quotes
        def split_outside_quotes(text):
            parts = []
            current = ''
            in_single = False
            in_double = False
            i = 0
            while i < len(text):
                c = text[i]
                if c == "'" and not in_double:
                    in_single = not in_single
                elif c == '"' and not in_single:
                    in_double = not in_double
                # Check for conjunctions only if not in quotes
                if not in_single and not in_double:
                    for conj in [';',' then ',' and ']:
                        if text[i:i+len(conj)].lower() == conj:
                            if current.strip():
                                parts.append(current.strip())
                            current = ''
                            i += len(conj)
                            break
                    else:
                        current += c
                        i += 1
                else:
                    current += c
                    i += 1
            if current.strip():
                parts.append(current.strip())
            return parts
        sub_commands = split_outside_quotes(command_text)
        if len(sub_commands) > 1:
            operations = []
            prev_target = None
            for cmd in sub_commands:
                op = self.parse_command(cmd, frame_rate=frame_rate)
                # Contextual filling for JOIN
                if (
                    isinstance(op, EditOperation)
                    and op.type == "JOIN"
                    and (not op.target or op.target == "")
                    and prev_target
                ):
                    op.target = prev_target
                if isinstance(op, EditOperation) and op.target:
                    prev_target = op.target
                operations.append(op)
            if len(operations) == 1:
                return operations[0]
            return CompoundOperation(operations)
        # If no top-level conjunction, use handler registry
        for handler in self.handlers:
            if handler.match(command_text):
                return handler.parse(command_text, frame_rate=frame_rate)
        # Step 2: Split on conjunctions outside of quotes if no handler matches
        def split_outside_quotes(text):
            parts = []
            current = ''
            in_single = False
            in_double = False
            i = 0
            while i < len(text):
                c = text[i]
                if c == "'" and not in_double:
                    in_single = not in_single
                elif c == '"' and not in_single:
                    in_double = not in_double
                # Check for conjunctions only if not in quotes
                if not in_single and not in_double:
                    for conj in [';',' then ',' and ']:
                        if text[i:i+len(conj)].lower() == conj:
                            if current.strip():
                                parts.append(current.strip())
                            current = ''
                            i += len(conj)
                            break
                    else:
                        current += c
                        i += 1
                else:
                    current += c
                    i += 1
            if current.strip():
                parts.append(current.strip())
            return parts
        sub_commands = split_outside_quotes(command_text)
        if len(sub_commands) > 1:
            operations = []
            prev_target = None
            for cmd in sub_commands:
                op = self.parse_command(cmd, frame_rate=frame_rate)
                # Contextual filling for JOIN
                if (
                    isinstance(op, EditOperation)
                    and op.type == "JOIN"
                    and (not op.target or op.target == "")
                    and prev_target
                ):
                    op.target = prev_target
                if isinstance(op, EditOperation) and op.target:
                    prev_target = op.target
                operations.append(op)
            if len(operations) == 1:
                return operations[0]
            return CompoundOperation(operations)
        # Fallback to legacy logic for commands not yet refactored
        # TODO: Add more patterns and spaCy-based parsing
        # Improved add text pattern: captures only the intended text, avoids 'at' as text, allows missing text
        add_text_pattern = re.compile(
            r"add(?! overlay)(?: text)?(?: ['\"]?(?P<text>[^'\"\s]+)['\"]?| (?P<text_unquoted>[^@\n]+?)(?= at the| from| to|$))?(?: at the (?P<position>\w+))?(?: from (?P<start>\d{1,2}:\d{2}|\d+)(?: to (?P<end>\d{1,2}:\d{2}|\d+))?)?",
            re.I
        )
        match = add_text_pattern.match(command_text)
        if match:
            text = match.group("text") or (match.group("text_unquoted").strip() if match.group("text_unquoted") else None)
            if not text or text.lower() == "at":
                text = None
            position = match.group("position")
            start = match.group("start")
            end = match.group("end")
            params = {}
            if text:
                params["text"] = text
            if position:
                params["position"] = position
            if start:
                params["start"] = start
            if end:
                params["end"] = end
            return EditOperation(type_="ADD_TEXT", parameters=params)
        # TODO: Add more patterns and spaCy-based parsing
        # Fallback: return unknown operation
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text})

    def recognize_intent(self, command_text: str, frame_rate: int = 30) -> str:
        """
        Recognize the intent of a command using regex patterns.

        Args:
            command_text (str): The natural language command
            frame_rate (int): The frame rate to use for time normalization (not used here, but for interface consistency)

        Returns:
            str: The detected intent (e.g., 'CUT', 'TRIM', 'JOIN', etc.), or 'UNKNOWN'
        """
        patterns = [
            (r"cut |split |divide |slice ", "CUT"),
            (r"trim |shorten |crop |reduce ", "TRIM"),
            (r"join |merge |combine ", "JOIN"),
            (r"add text ", "ADD_TEXT"),
            (r"overlay |superimpose |place |put |add overlay ", "OVERLAY"),
            (r"fade |dissolve |blend (in|out)", "FADE"),
            (r"speed up|slow down", "SPEED"),
            (r"reverse ", "REVERSE"),
            (r"apply .*color correction", "COLOR_CORRECTION"),
            (r"export ", "EXPORT"),
        ]
        for pattern, intent in patterns:
            if re.search(pattern, command_text, re.I):
                return intent
        return "UNKNOWN"

    def extract_entities(self, command_text: str, frame_rate: int = 30) -> Dict[str, Any]:
        """
        Extract entities such as timecodes, clip names, and effects from a command string.

        Args:
            command_text (str): The natural language command
            frame_rate (int): The frame rate to use for time normalization

        Returns:
            Dict[str, Any]: Dictionary with keys 'timecodes', 'clip_names', 'effects'
        """
        entities = {
            "timecodes": [],
            "clip_names": [],
            "effects": []
        }
        # Extract timecodes (mm:ss or seconds)
        timecode_pattern = re.compile(r"\b(\d{1,2}:\d{2}|\d{1,4}(?:s| seconds)?)\b", re.I)
        raw_timecodes = [m.group(1) for m in timecode_pattern.finditer(command_text)]
        # Normalize to frames
        entities["timecodes"] = [timestamp_to_frames(tc, frame_rate) for tc in raw_timecodes]
        # Extract clip names (e.g., 'clip1', 'intro_clip', 'clip2')
        clip_pattern = re.compile(r"\bclip\w+\b", re.I)
        entities["clip_names"] = [m.group(0) for m in clip_pattern.finditer(command_text)]
        # Extract effects (e.g., 'crossfade', 'fade', 'dissolve', 'color correction')
        effects = []
        effect_patterns = [
            (r"\bcrossfade\b", "crossfade"),
            (r"\bfade\b", "fade"),
            (r"\bdissolve\b", "dissolve"),
            (r"\bcolor correction\b", "color correction"),
            (r"\bblur\b", "blur"),
            (r"\breverse\b", "reverse"),
            (r"\bspeed up\b", "speed up"),
            (r"\bslow down\b", "slow down"),
        ]
        for pattern, effect in effect_patterns:
            if re.search(pattern, command_text, re.I):
                effects.append(effect)
        entities["effects"] = effects
        return entities

    def validate_command(self, operation: EditOperation) -> (bool, str):
        """
        Validate a parsed EditOperation to ensure all required fields are present.

        Args:
            operation (EditOperation): The operation to validate

        Returns:
            (bool, str): Tuple of (is_valid, message)
        """
        if operation.type == "CUT":
            if not operation.target:
                return False, "CUT command requires a target clip name."
            if "timestamp" not in operation.parameters:
                return False, "CUT command requires a timestamp."
            return True, "Valid CUT command."
        if operation.type == "TRIM":
            if not operation.target:
                return False, "TRIM command requires a target clip name."
            if "timestamp" not in operation.parameters:
                return False, "TRIM command requires a timestamp."
            return True, "Valid TRIM command."
        if operation.type == "ADD_TEXT":
            if "text" not in operation.parameters or not operation.parameters["text"]:
                return False, "ADD_TEXT command requires text."
            if "start" not in operation.parameters or "end" not in operation.parameters:
                return False, "ADD_TEXT command requires start and end times."
            return True, "Valid ADD_TEXT command."
        if operation.type == "JOIN":
            if not operation.target:
                return False, "JOIN command requires a first clip name."
            if "second" not in operation.parameters or not operation.parameters["second"]:
                return False, "JOIN command requires a second clip name."
            # Effect is optional
            return True, "Valid JOIN command."
        if operation.type == "OVERLAY":
            if "asset" not in operation.parameters or not operation.parameters["asset"]:
                return False, "OVERLAY command requires an asset (e.g., image or video file)."
            # Position, start, and end are optional
            return True, "Valid OVERLAY command."
        if operation.type == "FADE":
            if "direction" not in operation.parameters or not operation.parameters["direction"]:
                return False, "FADE command requires a direction (in or out)."
            if "target" not in operation.parameters or not operation.parameters["target"]:
                return False, "FADE command requires a target (audio, clip name, etc.)."
            # start and end are optional
            return True, "Valid FADE command."
        # Add more command type validations as needed
        if operation.type == "UNKNOWN":
            return False, "Unknown command type."
        return True, "Valid command."

    def feedback_for_command(self, command_text: str, frame_rate: int = 30) -> str:
        """
        Provide user-friendly feedback for unclear or invalid commands.

        Args:
            command_text (str): The natural language command
            frame_rate (int): The frame rate to use for time normalization

        Returns:
            str: Feedback message for the user
        """
        operation = self.parse_command(command_text)
        is_valid, message = self.validate_command(operation)
        if is_valid:
            return f"✅ Command understood: {operation.type}. {message}"
        # Provide specific feedback for common unclear/invalid cases
        if operation.type == "UNKNOWN":
            return "❌ Sorry, I couldn't understand that command. Please check your syntax or refer to the command guide."
        return f"⚠️ Command issue: {message}"
