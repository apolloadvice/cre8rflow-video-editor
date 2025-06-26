from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult

class AddTextOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "ADD_TEXT"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        # Demo: just log the add text action
        return ExecutionResult(True, f"Add text '{operation.parameters.get('text')}' with params {operation.parameters}") 