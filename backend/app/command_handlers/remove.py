import re
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation

class RemoveCommandHandler(BaseCommandHandler):
    def match(self, command_text: str) -> bool:
        remove_synonyms = r"remove|delete|erase"
        pattern = re.compile(rf"^(?P<verb>{remove_synonyms}) (?P<target>.+)$", re.I)
        return bool(pattern.match(command_text))

    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        remove_synonyms = r"remove|delete|erase"
        pattern = re.compile(rf"^(?P<verb>{remove_synonyms}) (?P<target>.+)$", re.I)
        match = pattern.match(command_text)
        if match:
            target = match.group("target")
            return EditOperation(type_="REMOVE", target=target, parameters={})
        return EditOperation(type_="UNKNOWN", parameters={"raw": command_text}) 