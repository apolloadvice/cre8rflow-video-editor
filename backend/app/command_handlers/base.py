import abc
from app.command_types import EditOperation

class BaseCommandHandler(abc.ABC):
    @abc.abstractmethod
    def match(self, command_text: str) -> bool:
        pass

    @abc.abstractmethod
    def parse(self, command_text: str) -> EditOperation:
        pass 