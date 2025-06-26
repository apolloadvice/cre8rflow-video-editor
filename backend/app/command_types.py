from typing import Optional, Dict, Any

class EditOperation:
    """
    Structured representation of a video editing command.
    """
    def __init__(self, type_: str, target: Optional[str] = None, parameters: Optional[Dict[str, Any]] = None):
        self.type = type_
        self.target = target
        self.parameters = parameters or {} 

class CompoundOperation:
    """
    Represents a sequence of editing operations parsed from a combined command.

    Args:
        operations (list[EditOperation]): The list of operations to execute in order.
    """
    def __init__(self, operations: list[EditOperation]):
        self.operations = operations 