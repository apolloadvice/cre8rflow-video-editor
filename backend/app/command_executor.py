from typing import Any
from app.timeline import Timeline, VideoClip
from app.command_parser import EditOperation
from app.executor_types import ExecutionResult
from app.executor_handlers.cut import CutOperationHandler
from app.executor_handlers.trim import TrimOperationHandler
from app.executor_handlers.join import JoinOperationHandler
from app.executor_handlers.add_text import AddTextOperationHandler
from app.executor_handlers.overlay import OverlayOperationHandler
from app.executor_handlers.fade import FadeOperationHandler
from app.executor_handlers.group_cut import GroupCutOperationHandler
from app.executor_handlers.remove import RemoveOperationHandler
from app.executor_handlers.batch_cut import BatchCutHandler
from app.executor_handlers.batch_text import BatchTextHandler
import copy
import time
from app.utils import timestamp_to_frames

class CommandHistoryEntry:
    def __init__(self, command_text, operation, result, before_snapshot, after_snapshot, timestamp=None):
        self.command_text = command_text
        self.operation = operation
        self.result = result
        self.before_snapshot = before_snapshot  # Timeline before command
        self.after_snapshot = after_snapshot    # Timeline after command
        self.timestamp = timestamp or time.time()

    def to_dict(self):
        return {
            "command_text": self.command_text,
            "operation": self.operation.to_dict() if hasattr(self.operation, 'to_dict') else str(self.operation),
            "result": self.result.to_dict() if hasattr(self.result, 'to_dict') else str(self.result),
            "before_snapshot": self.before_snapshot.to_dict() if hasattr(self.before_snapshot, 'to_dict') else str(self.before_snapshot),
            "after_snapshot": self.after_snapshot.to_dict() if hasattr(self.after_snapshot, 'to_dict') else str(self.after_snapshot),
            "timestamp": self.timestamp
        }

    @staticmethod
    def from_dict(data, timeline_class):
        # Reconstruct operation and result as needed
        from app.command_parser import EditOperation
        from app.executor_types import ExecutionResult
        operation = EditOperation.from_dict(data["operation"]) if hasattr(EditOperation, 'from_dict') else data["operation"]
        result = ExecutionResult.from_dict(data["result"]) if hasattr(ExecutionResult, 'from_dict') else data["result"]
        before_snapshot = timeline_class.from_dict(data["before_snapshot"])
        after_snapshot = timeline_class.from_dict(data["after_snapshot"])
        return CommandHistoryEntry(
            command_text=data["command_text"],
            operation=operation,
            result=result,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
            timestamp=data.get("timestamp")
        )

class CommandHistory:
    def __init__(self):
        self.entries = []
        self.undo_stack = []

    def add_entry(self, entry: CommandHistoryEntry):
        self.entries.append(entry)
        self.undo_stack.clear()  # Clear redo stack on new command

    def undo(self):
        if not self.entries:
            return None
        entry = self.entries.pop()
        self.undo_stack.append(entry)
        return entry.before_snapshot  # Restore timeline to before this command

    def redo(self):
        if not self.undo_stack:
            return None
        entry = self.undo_stack.pop()
        self.entries.append(entry)
        return entry.after_snapshot  # Restore timeline to after this command

    def to_dict(self):
        return {
            "entries": [entry.to_dict() for entry in self.entries],
            "undo_stack": [entry.to_dict() for entry in self.undo_stack]
        }

    @staticmethod
    def from_dict(data, timeline_class):
        history = CommandHistory()
        history.entries = [CommandHistoryEntry.from_dict(e, timeline_class) for e in data.get("entries", [])]
        history.undo_stack = [CommandHistoryEntry.from_dict(e, timeline_class) for e in data.get("undo_stack", [])]
        return history

    @staticmethod
    def load_from_file(filename, timeline_class):
        import json
        with open(filename) as f:
            data = json.load(f)
        return CommandHistory.from_dict(data, timeline_class)

    def save_to_file(self, filename):
        import json
        with open(filename, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

class CommandExecutor:
    """
    Executes parsed commands on the timeline.
    """
    def __init__(self, timeline: Timeline):
        """
        Initialize with a timeline to operate on.
        """
        self.timeline = timeline
        self.command_history = CommandHistory()
        # Handler registry for extensibility
        self.handlers = []
        self.register_handler(GroupCutOperationHandler())
        self.register_handler(CutOperationHandler())
        self.register_handler(TrimOperationHandler())
        self.register_handler(JoinOperationHandler())
        self.register_handler(AddTextOperationHandler())
        self.register_handler(OverlayOperationHandler())
        self.register_handler(FadeOperationHandler())
        self.register_handler(RemoveOperationHandler())
        self.register_handler(BatchCutHandler())
        self.register_handler(BatchTextHandler())
        # TODO: Register other handlers as they are refactored

    def register_handler(self, handler):
        self.handlers.append(handler)

    def _timestamp_to_frames(self, timestamp, frame_rate):
        if isinstance(timestamp, (int, float)):
            return int(float(timestamp) * frame_rate)
        if isinstance(timestamp, str):
            if ":" in timestamp:
                parts = [int(p) for p in timestamp.split(":")]
                if len(parts) == 2:
                    return parts[0] * 60 * frame_rate + parts[1] * frame_rate
                elif len(parts) == 3:
                    return parts[0] * 3600 * frame_rate + parts[1] * 60 * frame_rate + parts[2] * frame_rate
            if timestamp.endswith("s"):
                return int(float(timestamp[:-1]) * frame_rate)
            return int(float(timestamp) * frame_rate)
        return int(timestamp)

    def resolve_clip_reference(self, reference: str, reference_type: str, track_type: str = "video", ordinal: str = None, ref_track_type: str = None) -> str:
        """
        Resolve a clip reference (e.g., 'last clip', 'first clip', 'clip named X', 'second clip', 'third audio clip') to an actual clip name.
        Returns the clip name or None if not found.
        """
        # For ordinal, use ref_track_type if provided
        if reference_type == "ordinal":
            # Determine which track type to use
            ttype = ref_track_type if ref_track_type else track_type
            tracks = [t for t in self.timeline.tracks if t.track_type == ttype]
            if not tracks:
                return None
            all_clips = []
            for track in tracks:
                all_clips.extend(track.clips)
            if not all_clips:
                return None
            # Convert ordinal to index
            ORDINALS = [
                "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"
            ]
            idx = None
            if ordinal:
                o = ordinal.lower()
                if o in ORDINALS:
                    idx = ORDINALS.index(o)
                else:
                    # Try to parse numeric ordinals (e.g., 4th, 5th)
                    import re
                    m = re.match(r"(\d+)(st|nd|rd|th)", o)
                    if m:
                        idx = int(m.group(1)) - 1
            if idx is not None and 0 <= idx < len(all_clips):
                return all_clips[idx].name
            return None
        # Existing logic for positional/named
        tracks = [t for t in self.timeline.tracks if t.track_type == track_type]
        if not tracks:
            return None
        all_clips = []
        for track in tracks:
            all_clips.extend(track.clips)
        if not all_clips:
            return None
        if reference_type == "positional":
            if reference.lower() == "last clip":
                return all_clips[-1].name
            elif reference.lower() == "first clip":
                return all_clips[0].name
        elif reference_type == "named":
            name = reference[len("clip named "):].strip()
            for clip in all_clips:
                if clip.name.lower() == name.lower():
                    return clip.name
        return None

    def execute(self, operation: EditOperation, command_text: str = None) -> ExecutionResult:
        """
        Execute an edit operation on the timeline.

        Args:
            operation (EditOperation): The operation to execute
            command_text (str, optional): The original user command text

        Returns:
            ExecutionResult: Result of the execution with success/failure status and feedback message
        """
        before_snapshot = copy.deepcopy(self.timeline)
        frame_rate = self.timeline.frame_rate
        # Reference resolution for positional/named/ordinal references
        reference_type = operation.parameters.get("reference_type")
        # --- NEW: Extract clip_id(s) from parameters if present ---
        clip_id = operation.parameters.get("clip_id")
        second_clip_id = operation.parameters.get("second_clip_id")
        # ---
        if reference_type and operation.target:
            track_type = operation.parameters.get("track_type", "video")
            ordinal = operation.parameters.get("ordinal")
            ref_track_type = operation.parameters.get("ref_track_type")
            resolved_name = self.resolve_clip_reference(
                operation.target, reference_type, track_type, ordinal, ref_track_type
            )
            if not resolved_name:
                result = ExecutionResult(False, f"Could not resolve reference '{operation.target}' for track type '{track_type}'.")
                after_snapshot = copy.deepcopy(self.timeline)
                entry = CommandHistoryEntry(command_text, operation, result, before_snapshot, after_snapshot)
                self.command_history.add_entry(entry)
                return result
            new_params = {k: v for k, v in operation.parameters.items() if k not in ["reference_type", "ordinal", "ref_track_type"]}
            operation = EditOperation(type_=operation.type, target=resolved_name, parameters=new_params)
        # ---
        # Pass clip_id(s) to handlers via operation.parameters
        operation.parameters["clip_id"] = clip_id
        if second_clip_id:
            operation.parameters["second_clip_id"] = second_clip_id
        for handler in self.handlers:
            if handler.can_handle(operation):
                result = handler.execute(operation, self)
                after_snapshot = copy.deepcopy(self.timeline)
                entry = CommandHistoryEntry(command_text, operation, result, before_snapshot, after_snapshot)
                self.command_history.add_entry(entry)
                return result
        # Remove fallback CUT operation logic that normalizes time
        result = ExecutionResult(False, f"Unknown operation: {operation.type}")
        after_snapshot = copy.deepcopy(self.timeline)
        entry = CommandHistoryEntry(command_text, operation, result, before_snapshot, after_snapshot)
        self.command_history.add_entry(entry)
        return result

    def find_track_index_for_clip(self, clip_name, track_type):
        rel_index = 0
        for track in self.timeline.tracks:
            if track.track_type == track_type:
                for clip in track.clips:
                    if clip.name == clip_name:
                        return rel_index
                rel_index += 1
        return None

    def undo(self):
        snapshot = self.command_history.undo()
        if snapshot is not None:
            self.timeline = copy.deepcopy(snapshot)
            return True
        return False

    def redo(self):
        snapshot = self.command_history.redo()
        if snapshot is not None:
            self.timeline = copy.deepcopy(snapshot)
            return True
        return False
