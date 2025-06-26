from typing import Any

class ExecutionResult:
    """
    Result of executing an edit operation.
    """
    def __init__(self, success: bool, message: str = "", data: Any = None):
        self.success = success
        self.message = message
        self.data = data 