from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult

class FadeOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "FADE"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        direction = operation.parameters.get("direction")
        target = operation.parameters.get("target")
        start = operation.parameters.get("start")
        end = operation.parameters.get("end")
        msg = f"Fade {direction} {target}"
        if start and end:
            msg += f" from {start} to {end}"
        elif start:
            msg += f" starting at {start}"
        elif end:
            msg += f" ending at {end}"
        return ExecutionResult(True, msg) 