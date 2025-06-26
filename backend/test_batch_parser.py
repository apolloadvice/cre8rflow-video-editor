#!/usr/bin/env python3
"""
Test script for the updated LLM parser with batch command support.
This tests both existing functionality and new batch operations.
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.llm_parser import parse_command_with_llm
import json

def test_command(command: str, duration: float = 60.0):
    """Test a command and display the result"""
    print(f"\n{'='*60}")
    print(f"Testing command: '{command}'")
    print(f"Duration: {duration}s")
    print(f"{'='*60}")
    
    parsed, error = parse_command_with_llm(command, duration)
    
    if error:
        print(f"❌ ERROR: {error}")
    else:
        print(f"✅ SUCCESS:")
        print(json.dumps(parsed, indent=2))

def main():
    print("🧪 Testing Enhanced LLM Parser with Batch Operations")
    
    # Test existing single-clip functionality (should still work)
    print("\n🔍 TESTING EXISTING SINGLE-CLIP FUNCTIONALITY:")
    test_command("Cut from 10 to 20 seconds")
    test_command("Cut out the first 5 seconds")
    test_command("Add text 'Hello World' from 5 to 10 seconds")
    
    # Test new batch operations
    print("\n🔍 TESTING NEW BATCH OPERATIONS:")
    test_command("cut each clip so that there's 0.1 seconds of dead space before I start talking and after I'm done talking")
    test_command("Add banger style captions")
    test_command("trim 0.5 seconds from the start of each clip")
    test_command("add subtitles to every clip")
    
    # Test mixed commands
    print("\n🔍 TESTING MIXED COMMANDS:")
    test_command("cut each clip so that there's 0.1 seconds of dead space before I start talking and after I'm done talking. Add banger style captions.")

if __name__ == "__main__":
    main() 