from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult
from app.timeline import Effect

class OverlayOperationHandler(BaseOperationHandler):
    def can_handle(self, operation: EditOperation) -> bool:
        return operation.type == "OVERLAY"

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        asset = operation.parameters.get("asset")
        position = operation.parameters.get("position")
        start = operation.parameters.get("start")
        end = operation.parameters.get("end")
        timeline = executor.timeline

        # Convert start/end to frames if needed
        frame_rate = getattr(timeline, "frame_rate", 30)
        def to_frame(val):
            if val is None:
                return None
            try:
                return int(float(val) * frame_rate)
            except Exception:
                return int(val)
        start_frame = to_frame(start)
        end_frame = to_frame(end)

        # Create the overlay effect
        effect = Effect(
            effect_type="overlay",
            params={"asset": asset, "position": position},
            start=start_frame,
            end=end_frame
        )

        # Add to Effects track
        effects_track = timeline.get_track("effect")
        effects_track.clips.append(effect)

        msg = f"Overlay {asset} at {position} from {start} to {end} (frames {start_frame}-{end_frame})"
        return ExecutionResult(True, msg) 