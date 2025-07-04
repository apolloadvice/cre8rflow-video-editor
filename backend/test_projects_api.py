#!/usr/bin/env python3
"""
Simple test script for Project Management API endpoints
"""

import requests
import json
import time

BASE_URL = "http://localhost:8000/api"

def test_endpoint(endpoint, method="GET", data=None, expected_status=200):
    """Test an API endpoint"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method == "GET":
            response = requests.get(url)
        elif method == "POST":
            response = requests.post(url, json=data)
        elif method == "DELETE":
            response = requests.delete(url)
        
        print(f"\n{method} {endpoint}")
        print(f"Status: {response.status_code}")
        
        if response.status_code == expected_status:
            print("✅ SUCCESS")
        else:
            print("❌ FAILED")
        
        try:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2)}")
        except:
            print(f"Response: {response.text}")
        
        return response.status_code == expected_status, response
        
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False, None

def main():
    print("🧪 Testing Project Management API Endpoints")
    print("=" * 50)
    
    # Test 1: Check availability
    print("\n1. Testing availability endpoint...")
    success, response = test_endpoint("/projects/availability")
    
    if not success:
        print("❌ Availability check failed. Server might not be running.")
        return
    
    # Test 2: List projects (should be empty initially)
    print("\n2. Testing list projects...")
    test_endpoint("/projects")
    
    # Test 3: Create a project
    print("\n3. Testing project creation...")
    project_data = {
        "project_id": "test_project_001",
        "name": "Test Project for API",
        "width": 1920,
        "height": 1080,
        "framerate": "30/1"
    }
    success, response = test_endpoint("/projects", method="POST", data=project_data, expected_status=200)
    
    if success:
        # Test 4: Get project details
        print("\n4. Testing get project details...")
        test_endpoint("/projects/test_project_001")
        
        # Test 5: List projects again (should show our project)
        print("\n5. Testing list projects (with created project)...")
        test_endpoint("/projects")
        
        # Test 6: Set as current project
        print("\n6. Testing set current project...")
        test_endpoint("/projects/test_project_001/set-current", method="POST")
        
        # Test 7: Check project assets (should be empty)
        print("\n7. Testing list project assets...")
        test_endpoint("/projects/test_project_001/assets")
        
        # Test 8: Get project clips (should be empty)
        print("\n8. Testing list project clips...")
        test_endpoint("/projects/test_project_001/clips")
        
        # Test 9: Get pipeline status
        print("\n9. Testing pipeline status...")
        test_endpoint("/projects/test_project_001/pipeline/status")
        
        # Test 10: Clean up - delete project
        print("\n10. Testing project deletion...")
        test_endpoint("/projects/test_project_001", method="DELETE")
    
    print("\n" + "=" * 50)
    print("🏁 API Testing Complete!")

if __name__ == "__main__":
    main()