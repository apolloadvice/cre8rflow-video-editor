import abc
from app.command_types import EditOperation
from app.executor_types import ExecutionResult

class BaseOperationHandler(abc.ABC):
    @abc.abstractmethod
    def can_handle(self, operation: EditOperation) -> bool:
        pass

    @abc.abstractmethod
    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        pass 