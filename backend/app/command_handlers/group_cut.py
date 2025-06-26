import re
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation
from app.utils import timestamp_to_frames

class GroupCutCommandHandler(BaseCommandHandler):
    def match(self, command_text: str) -> bool:
        # Match 'Cut all clips at 00:30', 'Cut all audio clips at 00:30', etc.
        pattern = re.compile(r"cut all (?P<target_type>clips|audio clips|subtitle clips|effect clips)(?: at (?P<timestamp>\d{1,2}:\d{2}))?", re.I)
        return bool(pattern.match(command_text))

    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        pattern = re.compile(r"cut all (?P<target_type>clips|audio clips|subtitle clips|effect clips)(?: at (?P<timestamp>\d{1,2}:\d{2}))?", re.I)
        match = pattern.match(command_text)
        if match:
            target_type = match.group("target_type").lower()
            timestamp = match.group("timestamp")
            params = {}
            # Determine track_type filter
            if target_type == "clips":
                params["track_type"] = "video"
            elif target_type == "audio clips":
                params["track_type"] = "audio"
            elif target_type == "subtitle clips":
                params["track_type"] = "subtitle"
            elif target_type == "effect clips":
                params["track_type"] = "effect"
            if timestamp:
                params["timestamp"] = timestamp_to_frames(timestamp, frame_rate)
            return EditOperation(type_="CUT_GROUP", parameters=params)
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text}) 