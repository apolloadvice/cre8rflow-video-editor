from app.command_parser import CommandParser
from app.timeline import Timeline, VideoClip
from app.command_executor import CommandExecutor

if __name__ == "__main__":
    # Initialize core components
    parser = CommandParser()
    timeline = Timeline()
    executor = CommandExecutor(timeline)

    # Demo: Load a video file
    video_clip = timeline.load_video("/path/to/my_video.mp4", duration_seconds=31.0)
    print(f"Loaded video: name={video_clip.name}, start={video_clip.start}, end={video_clip.end}")

    # Add a sample clip to the timeline
    clip = VideoClip(name="clip1", start=0.0, end=60.0)
    timeline.add_clip(clip)

    # Example command
    command_text = "Cut clip1 at 00:30"
    print(f"Command: {command_text}")

    # Parse the command
    operation = parser.parse_command(command_text, timeline.frame_rate)
    print(f"Parsed Operation: type={operation.type}, target={operation.target}, parameters={operation.parameters}")

    # Execute the command
    result = executor.execute(operation)
    print(f"Execution Result: success={result.success}, message={result.message}")

    # Add text command demo
    add_text_command = "Add text 'Introduction' at the top from 0:05 to 0:15"
    print(f"\nCommand: {add_text_command}")
    add_text_op = parser.parse_command(add_text_command, timeline.frame_rate)
    print(f"Parsed Operation: type={add_text_op.type}, target={add_text_op.target}, parameters={add_text_op.parameters}")
    add_text_result = executor.execute(add_text_op)
    print(f"Execution Result: success={add_text_result.success}, message={add_text_result.message}")

    # Trim the loaded video at 30 seconds
    trimmed = timeline.trim_clip(video_clip.name, 30.0)
    print(f"Trimmed {video_clip.name} at 30s: {trimmed}")
    for c in timeline.tracks['video'][0].clips:
        print(f"Clip: name={c.name}, start={c.start}, end={c.end}")

    # Add a transition between the two trimmed clips (before joining)
    timeline.trim_clip(video_clip.name, 30.0)  # Ensure two parts exist
    transition_added = timeline.add_transition("my_video_part1", "my_video_part2", transition_type="crossfade", duration=2.0)
    print(f"Added transition between my_video_part1 and my_video_part2: {transition_added}")
    for t in timeline.transitions:
        print(f"Transition: {t.transition_type} from {t.from_clip} to {t.to_clip}, duration={t.duration}")

    # Join the two trimmed clips
    joined = timeline.join_clips("my_video_part1", "my_video_part2")
    print(f"Joined my_video_part1 and my_video_part2: {joined}")
    for c in timeline.tracks['video'][0].clips:
        print(f"Clip: name={c.name}, start={c.start}, end={c.end}")
