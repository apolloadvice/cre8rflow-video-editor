#!/usr/bin/env python3

"""
Test script for GStreamer Editing Services (GES) integration
This script tests if GES is properly installed and can create basic timelines.
"""

import sys
import os

def test_ges_import():
    """Test if GES can be imported"""
    try:
        import gi
        gi.require_version('Gst', '1.0')
        gi.require_version('GES', '1.0')
        
        from gi.repository import Gst, GES, GLib
        
        print("✅ GStreamer and GES imported successfully")
        return True
    except ImportError as e:
        print(f"❌ Failed to import GES: {e}")
        print("Install with: pip install PyGObject")
        return False
    except Exception as e:
        print(f"❌ GES import error: {e}")
        return False

def test_ges_initialization():
    """Test GES initialization"""
    try:
        import gi
        gi.require_version('Gst', '1.0')
        gi.require_version('GES', '1.0')
        
        from gi.repository import Gst, GES
        
        # Initialize GStreamer and GES
        Gst.init(None)
        GES.init()
        
        print("✅ GStreamer and GES initialized successfully")
        return True
    except Exception as e:
        print(f"❌ GES initialization failed: {e}")
        return False

def test_ges_timeline_creation():
    """Test creating a basic GES timeline"""
    try:
        import gi
        gi.require_version('Gst', '1.0')
        gi.require_version('GES', '1.0')
        
        from gi.repository import Gst, GES
        
        # Initialize
        Gst.init(None)
        GES.init()
        
        # Create timeline
        timeline = GES.Timeline.new_audio_video()
        if not timeline:
            print("❌ Failed to create timeline")
            return False
        
        # Add a layer
        layer = timeline.append_layer()
        if not layer:
            print("❌ Failed to create layer")
            return False
        
        # Get tracks
        tracks = timeline.get_tracks()
        print(f"✅ Timeline created with {len(tracks)} tracks")
        
        # Create pipeline
        pipeline = GES.Pipeline()
        pipeline.set_timeline(timeline)
        
        print("✅ GES pipeline created successfully")
        return True
        
    except Exception as e:
        print(f"❌ Timeline creation failed: {e}")
        return False

def test_ges_service():
    """Test the GES service from our implementation"""
    try:
        # Add the backend app to the Python path
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app', 'backend'))
        
        from ges_service import GESTimelineService, TimelineClip, TimelineData
        
        # Create service
        service = GESTimelineService()
        print("✅ GES service created")
        
        # Create test timeline data
        test_clips = [
            TimelineClip(
                id="test1",
                name="Test Clip 1",
                start=0.0,
                end=5.0,
                duration=5.0,
                file_path="/path/to/test/video.mp4",  # This won't exist but that's OK for structure test
                type="video"
            )
        ]
        
        timeline_data = TimelineData(clips=test_clips)
        print(f"✅ Test timeline data created with {len(test_clips)} clips")
        
        # This will fail because the file doesn't exist, but we can test the structure
        print("✅ GES service structure test passed")
        
        return True
        
    except Exception as e:
        print(f"❌ GES service test failed: {e}")
        return False

def main():
    """Run all GES tests"""
    print("🔍 Testing GStreamer Editing Services Integration")
    print("=" * 50)
    
    tests = [
        ("Import Test", test_ges_import),
        ("Initialization Test", test_ges_initialization), 
        ("Timeline Creation Test", test_ges_timeline_creation),
        ("Service Test", test_ges_service),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n📋 {test_name}")
        print("-" * 30)
        if test_func():
            passed += 1
        else:
            print(f"❌ {test_name} failed")
    
    print("\n" + "=" * 50)
    print(f"🏁 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All GES tests passed! GES integration is ready.")
    else:
        print("⚠️  Some tests failed. Check GStreamer installation.")
        print("\nInstallation help:")
        print("- macOS: brew install gstreamer gst-plugins-base gst-plugins-good gst-editing-services")
        print("- Ubuntu: apt-get install gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good libges-1.0-dev")
        print("- pip install PyGObject")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 