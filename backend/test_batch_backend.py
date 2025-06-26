#!/usr/bin/env python3
"""
Test script for the updated backend with batch command support.
This tests the full pipeline: LLM parsing -> Operation conversion -> Timeline execution.
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.timeline import Timeline
from app.command_executor import CommandExecutor
from app.backend.command_api import convert_llm_to_operation
from app.llm_parser import parse_command_with_llm
import json

def test_batch_pipeline(command: str, duration: float = 60.0):
    """Test the complete batch processing pipeline"""
    print(f"\n{'='*80}")
    print(f"Testing batch pipeline for: '{command}'")
    print(f"Duration: {duration}s")
    print(f"{'='*80}")
    
    # Step 1: Create a timeline with multiple clips
    timeline = Timeline()
    
    # Add multiple video clips to simulate a real scenario
    clip1 = timeline.load_video("test_video1.mp4", duration_seconds=10.0)
    clip2 = timeline.load_video("test_video2.mp4", duration_seconds=15.0) 
    clip3 = timeline.load_video("test_video3.mp4", duration_seconds=12.0)
    
    print(f"✅ Created timeline with {len(timeline.get_all_clips('video'))} video clips")
    for i, clip in enumerate(timeline.get_all_clips('video')):
        duration_sec = (clip.end - clip.start) / timeline.frame_rate
        print(f"   Clip {i+1}: {clip.name} ({duration_sec:.1f}s)")
    
    # Step 2: Parse command with LLM
    parsed_llm, error = parse_command_with_llm(command, duration=duration)
    
    if error:
        print(f"❌ LLM PARSING ERROR: {error}")
        return False
    
    print(f"✅ LLM PARSED:")
    print(json.dumps(parsed_llm, indent=2))
    
    # Step 3: Convert to operations
    try:
        llm_operations = parsed_llm if isinstance(parsed_llm, list) else [parsed_llm]
        operations = []
        
        for llm_op in llm_operations:
            operation = convert_llm_to_operation(llm_op)
            operations.append(operation)
            print(f"✅ CONVERTED TO OPERATION: {operation.type} (target: {operation.target})")
            print(f"   Parameters: {operation.parameters}")
    
    except Exception as e:
        print(f"❌ CONVERSION ERROR: {e}")
        return False
    
    # Step 4: Execute operations
    executor = CommandExecutor(timeline)
    
    for i, operation in enumerate(operations):
        print(f"\n🔧 EXECUTING OPERATION {i+1}: {operation.type}")
        
        result = executor.execute(operation, command_text=command)
        
        if result.success:
            print(f"✅ EXECUTION SUCCESS: {result.message}")
            # Extract logs from result.data since ExecutionResult doesn't have logs attribute
            if hasattr(result, 'data') and result.data and isinstance(result.data, dict):
                logs_from_data = result.data.get('logs', [])
                for log in logs_from_data:
                    print(f"   📝 {log}")
        else:
            print(f"❌ EXECUTION FAILED: {result.message}")
            return False
    
    # Step 5: Show final timeline state
    print(f"\n📊 FINAL TIMELINE STATE:")
    print(f"   Total clips: {len(timeline.get_all_clips('video'))}")
    
    for i, clip in enumerate(timeline.get_all_clips('video')):
        duration_sec = (clip.end - clip.start) / timeline.frame_rate
        effects_count = len(clip.effects)
        print(f"   Clip {i+1}: {clip.name} ({duration_sec:.1f}s, {effects_count} effects)")
        
        # Show text effects
        for effect in clip.effects:
            if effect.effect_type == "textOverlay":
                text = effect.params.get("text", "")
                style = effect.params.get("style", "")
                print(f"      🎬 Text: '{text}' (style: {style})")
    
    return True

def main():
    print("🧪 Testing Enhanced Backend with Batch Operations")
    
    # Test batch operations
    print("\n🔍 TESTING BATCH OPERATIONS:")
    
    success1 = test_batch_pipeline(
        "cut each clip so that there's 0.1 seconds of dead space before I start talking and after I'm done talking"
    )
    
    success2 = test_batch_pipeline(
        "Add banger style captions"
    )
    
    success3 = test_batch_pipeline(
        "cut each clip so that there's 0.1 seconds of dead space before I start talking and after I'm done talking. Add banger style captions."
    )
    
    # Test single-clip operations (should still work)
    print("\n🔍 TESTING SINGLE-CLIP OPERATIONS (BACKWARD COMPATIBILITY):")
    
    success4 = test_batch_pipeline(
        "Cut from 5 to 10 seconds"
    )
    
    # Summary
    total_tests = 4
    passed_tests = sum([success1, success2, success3, success4])
    
    print(f"\n📊 TEST SUMMARY:")
    print(f"   Passed: {passed_tests}/{total_tests}")
    print(f"   Status: {'✅ ALL TESTS PASSED' if passed_tests == total_tests else '❌ SOME TESTS FAILED'}")

if __name__ == "__main__":
    main() 