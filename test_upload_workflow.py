#!/usr/bin/env python3
"""
Test the complete video upload workflow including TwelveLabs integration
"""

import asyncio
import sys
import os
import tempfile
import requests
import json

# Add the backend path to import our modules
sys.path.append('/Users/kennydao/cre8rflow_claudecode_v1.0/backend')

async def test_upload_workflow():
    """Test the complete upload workflow through the API"""
    print("🚀 Testing Complete Upload Workflow")
    print("=" * 60)
    
    base_url = "http://localhost:8000/api"
    
    # Test 1: Check if backend is running
    print("\n🔍 Test 1: Check Backend Status")
    try:
        response = requests.get(f"{base_url}/assets/list", timeout=5)
        if response.status_code == 200:
            print("✅ Backend is running and responding")
            assets = response.json()
            print(f"📋 Current assets in database: {len(assets)}")
        else:
            print(f"❌ Backend responded with status: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Backend not accessible: {e}")
        print("💡 Make sure to start the backend with: cd backend && source ges_env/bin/activate && python -m app.main")
        return False
    
    # Test 2: Test upload URL generation
    print("\n🔗 Test 2: Upload URL Generation")
    try:
        import time
        unique_filename = f"test_video_{int(time.time())}.mp4"
        payload = {
            "filename": unique_filename,
            "folder": "test_uploads"
        }
        response = requests.post(f"{base_url}/upload-url", json=payload)
        if response.status_code == 200:
            upload_data = response.json()
            print(f"✅ Upload URL generated: path = {upload_data['path']}")
        else:
            print(f"❌ Upload URL generation failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error generating upload URL: {e}")
        return False
    
    # Test 3: Test asset registration (simulating successful upload)
    print("\n📝 Test 3: Asset Registration")
    try:
        register_payload = {
            "path": upload_data["path"],
            "originalName": unique_filename,
            "duration": 30.5,
            "width": 1920,
            "height": 1080,
            "size": 1024000,
            "mimetype": "video/mp4"
        }
        
        response = requests.post(f"{base_url}/assets/register", json=register_payload)
        if response.status_code == 200:
            register_data = response.json()
            asset_id = register_data["id"]
            print(f"✅ Asset registered successfully: ID = {asset_id}")
            print(f"📊 Status: {register_data['status']}")
            return asset_id
        else:
            print(f"❌ Asset registration failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Error registering asset: {e}")
        return False

async def monitor_indexing_status(asset_id):
    """Monitor the indexing status of an asset"""
    print(f"\n👀 Monitoring indexing status for asset {asset_id}")
    print("=" * 50)
    
    base_url = "http://localhost:8000/api"
    
    for i in range(10):  # Check up to 10 times
        try:
            response = requests.get(f"{base_url}/assets/{asset_id}/indexing-status")
            if response.status_code == 200:
                status = response.json()
                print(f"📊 Check #{i+1}: Status = {status.get('indexing_status', 'unknown')}, Progress = {status.get('indexing_progress', 0)}%")
                
                if status.get('indexing_error'):
                    print(f"❌ Indexing error: {status['indexing_error']}")
                    break
                    
                if status.get('indexing_status') in ['completed', 'failed']:
                    print(f"🏁 Final status: {status['indexing_status']}")
                    break
                    
            else:
                print(f"⚠️ Status check failed: {response.status_code}")
                
        except Exception as e:
            print(f"⚠️ Error checking status: {e}")
        
        # Wait 3 seconds before next check
        await asyncio.sleep(3)

async def main():
    """Main test function"""
    print("🧪 TwelveLabs Integration - Complete Workflow Test")
    print("=" * 60)
    
    # Test the upload workflow
    asset_id = await test_upload_workflow()
    
    if asset_id:
        print(f"\n✅ Upload workflow completed successfully!")
        print(f"📄 Created asset with ID: {asset_id}")
        
        # Monitor indexing progress
        await monitor_indexing_status(asset_id)
        
        print(f"\n🎉 Complete workflow test finished!")
        print(f"\n💡 Next steps:")
        print(f"1. Check the asset panel in your frontend to see the status badges")
        print(f"2. Try uploading a real video file through the UI")
        print(f"3. Monitor the backend logs to see TwelveLabs indexing progress")
        
    else:
        print(f"\n❌ Upload workflow test failed")
        print(f"Check the error messages above and make sure:")
        print(f"1. Backend server is running (cd backend && source ges_env/bin/activate && python -m app.main)")
        print(f"2. Database schema is up to date")
        print(f"3. TwelveLabs API key is valid")

if __name__ == "__main__":
    asyncio.run(main())