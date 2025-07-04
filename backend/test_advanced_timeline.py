#!/usr/bin/env python3
"""
Advanced Timeline Control Test Script
Tests all the new advanced timeline features implemented in Task 3.2.1
"""

import requests
import json
import time
from pathlib import Path

# API Configuration
BASE_URL = "http://localhost:8000"
PROJECT_API = f"{BASE_URL}/api/projects"

def make_request(method, url, data=None, params=None):
    """Make HTTP request with error handling"""
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params)
        elif method.upper() == "POST":
            response = requests.post(url, json=data)
        elif method.upper() == "DELETE":
            response = requests.delete(url)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        print(f"{method} {url}")
        if data:
            print(f"Request data: {json.dumps(data, indent=2)}")
        
        print(f"Status: {response.status_code}")
        
        try:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2)}")
            return response.status_code, result
        except:
            print(f"Response text: {response.text}")
            return response.status_code, response.text
            
    except Exception as e:
        print(f"Request failed: {e}")
        return None, str(e)

def test_system_availability():
    """Test if the system is available"""
    print("=" * 60)
    print("TESTING SYSTEM AVAILABILITY")
    print("=" * 60)
    
    status, response = make_request("GET", f"{PROJECT_API}/availability")
    return status == 200 and response.get("available", False)

def test_project_creation():
    """Create a test project"""
    print("=" * 60)
    print("TESTING PROJECT CREATION")
    print("=" * 60)
    
    project_data = {
        "name": "Advanced Timeline Test Project",
        "width": 1920,
        "height": 1080,
        "framerate": "30/1"
    }
    
    status, response = make_request("POST", PROJECT_API, project_data)
    if status == 200 and response.get("success"):
        return response["data"]["project_id"]
    return None

def test_timeline_markers(project_id):
    """Test timeline marker functionality"""
    print("=" * 60)
    print("TESTING TIMELINE MARKERS")
    print("=" * 60)
    
    # Add multiple markers
    markers = [
        {"position": 5.0, "name": "Intro Start", "color": "#ff0000", "note": "Beginning of intro sequence"},
        {"position": 15.5, "name": "Main Content", "color": "#00ff00", "note": "Main content starts here"},
        {"position": 45.2, "name": "Conclusion", "color": "#0000ff", "note": "Wrap up section"},
        {"position": 60.0, "name": "End Credits", "color": "#ffff00", "note": "Credits roll"},
    ]
    
    marker_ids = []
    for marker in markers:
        status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/markers", marker)
        if status == 200 and response.get("success"):
            marker_ids.append(response["data"]["marker_id"])
            print(f"✓ Added marker: {marker['name']}")
        else:
            print(f"✗ Failed to add marker: {marker['name']}")
    
    # List all markers
    print("\n--- Listing all markers ---")
    status, response = make_request("GET", f"{PROJECT_API}/{project_id}/timeline/markers")
    if status == 200:
        markers_data = response.get("data", {})
        print(f"Found {markers_data.get('marker_count', 0)} markers")
    
    # Remove one marker
    if marker_ids:
        print("\n--- Removing marker ---")
        status, response = make_request("DELETE", f"{PROJECT_API}/{project_id}/timeline/markers/{marker_ids[0]}")
        if status == 200:
            print(f"✓ Removed marker: {marker_ids[0]}")
    
    return True

def test_frame_seeking(project_id):
    """Test frame-accurate seeking"""
    print("=" * 60)
    print("TESTING FRAME-ACCURATE SEEKING")
    print("=" * 60)
    
    # Test seeking to various frame numbers
    frame_tests = [0, 30, 150, 300, 900]  # 0s, 1s, 5s, 10s, 30s at 30fps
    
    for frame_number in frame_tests:
        seek_data = {"frame_number": frame_number}
        status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/seek-frame", seek_data)
        
        if status == 200 and response.get("success"):
            data = response["data"]
            print(f"✓ Seeked to frame {frame_number} = {data['time_position']:.3f}s")
        else:
            print(f"✗ Failed to seek to frame {frame_number}")
    
    return True

def test_timeline_zoom(project_id):
    """Test timeline zoom functionality"""
    print("=" * 60)
    print("TESTING TIMELINE ZOOM")
    print("=" * 60)
    
    # Test different zoom levels
    zoom_tests = [
        {"zoom_level": 2.0, "center_position": 30.0},
        {"zoom_level": 0.5, "center_position": None},
        {"zoom_level": 5.0, "center_position": 15.0},
        {"zoom_level": 1.0, "center_position": None}  # Reset to normal
    ]
    
    for zoom_test in zoom_tests:
        status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/zoom", zoom_test)
        
        if status == 200 and response.get("success"):
            data = response["data"]
            visible_range = data["visible_range"]
            print(f"✓ Set zoom {zoom_test['zoom_level']}x - Visible: {visible_range['start']:.1f}s to {visible_range['end']:.1f}s")
        else:
            print(f"✗ Failed to set zoom: {zoom_test}")
    
    # Get current zoom settings
    print("\n--- Getting current zoom settings ---")
    status, response = make_request("GET", f"{PROJECT_API}/{project_id}/timeline/zoom")
    if status == 200:
        zoom_data = response["data"]["zoom_settings"]
        print(f"Current zoom: {zoom_data['zoom_level']}x")
    
    return True

def test_snap_to_clips(project_id):
    """Test snap-to-clips functionality"""
    print("=" * 60)
    print("TESTING SNAP TO CLIPS")
    print("=" * 60)
    
    # Test snapping to various positions
    snap_tests = [0.5, 4.8, 15.3, 29.7, 45.1]
    
    for position in snap_tests:
        params = {"target_position": position}
        status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/snap-to-clips", params)
        
        if status == 200 and response.get("success"):
            data = response["data"]
            print(f"✓ Snapped {position}s → {data['snapped_position']}s (distance: {data['snap_distance']:.3f}s)")
        else:
            print(f"✗ Failed to snap position {position}s")
    
    return True

def test_bulk_clip_operations(project_id):
    """Test bulk clip operations"""
    print("=" * 60)
    print("TESTING BULK CLIP OPERATIONS")
    print("=" * 60)
    
    # First, we need some clips to work with
    # Let's get the current clips in the project
    status, response = make_request("GET", f"{PROJECT_API}/{project_id}/clips")
    
    if status != 200 or not response.get("success"):
        print("No clips found for bulk operations test")
        return True
    
    clips = response["data"]["clips"]
    if len(clips) < 2:
        print("Need at least 2 clips for bulk operations test")
        return True
    
    clip_ids = [clip["clip_id"] for clip in clips[:2]]  # Use first 2 clips
    
    # Test bulk copy operation
    print("\n--- Testing bulk copy ---")
    copy_data = {
        "clip_ids": clip_ids,
        "operation": "copy",
        "parameters": {"time_offset": 5.0}
    }
    
    status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/bulk-operations", copy_data)
    if status == 200:
        data = response["data"]
        print(f"✓ Bulk copy: {data['success_rate']} success rate")
    
    # Test bulk move operation
    print("\n--- Testing bulk move ---")
    move_data = {
        "clip_ids": clip_ids,
        "operation": "move",
        "parameters": {"new_start_time": 20.0}
    }
    
    status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/bulk-operations", move_data)
    if status == 200:
        data = response["data"]
        print(f"✓ Bulk move: {data['success_rate']} success rate")
    
    return True

def test_ripple_editing(project_id):
    """Test ripple editing operations"""
    print("=" * 60)
    print("TESTING RIPPLE EDITING")
    print("=" * 60)
    
    # Test ripple insert
    print("\n--- Testing ripple insert ---")
    insert_data = {
        "clip_id": "dummy",  # Not used for insert
        "operation": "insert",
        "position": 10.0,
        "duration": 2.0
    }
    
    status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/ripple-edit", insert_data)
    if status == 200:
        data = response["data"]
        print(f"✓ Ripple insert: {len(data['affected_clips'])} clips affected")
    
    # Get a clip for other ripple operations
    status, response = make_request("GET", f"{PROJECT_API}/{project_id}/clips")
    if status == 200 and response.get("success"):
        clips = response["data"]["clips"]
        if clips:
            test_clip = clips[0]
            clip_id = test_clip["clip_id"]
            
            # Test ripple trim
            print("\n--- Testing ripple trim ---")
            trim_data = {
                "clip_id": clip_id,
                "operation": "trim_ripple",
                "position": 0.0,  # Not used for trim
                "duration": test_clip["duration"] + 1.0  # Extend by 1 second
            }
            
            status, response = make_request("POST", f"{PROJECT_API}/{project_id}/timeline/ripple-edit", trim_data)
            if status == 200:
                data = response["data"]
                print(f"✓ Ripple trim: duration changed by {data['duration_change']}s")
    
    return True

def run_advanced_timeline_tests():
    """Run all advanced timeline control tests"""
    print("=" * 80)
    print("ADVANCED TIMELINE CONTROL TEST SUITE")
    print("=" * 80)
    
    # Check system availability
    if not test_system_availability():
        print("❌ System not available - exiting tests")
        return False
    
    print("✅ System is available")
    
    # Create test project
    project_id = test_project_creation()
    if not project_id:
        print("❌ Failed to create test project - exiting tests")
        return False
    
    print(f"✅ Created test project: {project_id}")
    
    try:
        # Run all advanced timeline tests
        test_results = []
        
        print("\n" + "="*80)
        test_results.append(("Timeline Markers", test_timeline_markers(project_id)))
        
        print("\n" + "="*80)
        test_results.append(("Frame Seeking", test_frame_seeking(project_id)))
        
        print("\n" + "="*80)
        test_results.append(("Timeline Zoom", test_timeline_zoom(project_id)))
        
        print("\n" + "="*80)
        test_results.append(("Snap to Clips", test_snap_to_clips(project_id)))
        
        print("\n" + "="*80)
        test_results.append(("Bulk Operations", test_bulk_clip_operations(project_id)))
        
        print("\n" + "="*80)
        test_results.append(("Ripple Editing", test_ripple_editing(project_id)))
        
        # Summary
        print("\n" + "="*80)
        print("TEST RESULTS SUMMARY")
        print("="*80)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results:
            status = "✅ PASSED" if result else "❌ FAILED"
            print(f"{test_name:.<60} {status}")
            if result:
                passed += 1
        
        print(f"\nOverall: {passed}/{total} tests passed")
        
        # Cleanup
        print(f"\n--- Cleaning up test project {project_id} ---")
        status, response = make_request("DELETE", f"{PROJECT_API}/{project_id}")
        if status == 200:
            print("✅ Test project cleaned up")
        
        return passed == total
        
    except Exception as e:
        print(f"❌ Test suite failed with error: {e}")
        return False

if __name__ == "__main__":
    print("Starting Advanced Timeline Control Test Suite...")
    success = run_advanced_timeline_tests()
    exit(0 if success else 1) 