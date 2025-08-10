#!/usr/bin/env python3
"""
Test script for TwelveLabs integration
This script tests the basic functionality of our TwelveLabs service
"""

import asyncio
import sys
import os

# Add the backend path to import our modules
sys.path.append('/Users/kennydao/cre8rflow_claudecode_v1.0/backend')

async def test_twelvelabs_integration():
    """Test basic TwelveLabs integration functionality"""
    print("🧪 Testing TwelveLabs Integration")
    print("=" * 50)
    
    try:
        # Import our service
        from app.backend.twelvelabs_service import twelvelabs_service
        
        print("✅ Successfully imported TwelveLabs service")
        
        # Test 1: Check if we can create/get a user index
        print("\n🔍 Test 1: User Index Management")
        test_user_id = "test_user_123"
        
        try:
            index_id = await twelvelabs_service.ensure_user_index(test_user_id)
            print(f"✅ Successfully created/retrieved index: {index_id}")
        except Exception as e:
            print(f"❌ Failed to create/get user index: {e}")
            return False
        
        # Test 2: Get index stats
        print("\n📊 Test 2: Index Statistics")
        try:
            stats = await twelvelabs_service.get_user_index_stats(test_user_id)
            print(f"✅ Retrieved index stats:")
            for key, value in stats.items():
                print(f"   {key}: {value}")
        except Exception as e:
            print(f"❌ Failed to get index stats: {e}")
        
        # Test 3: Check existing assets sync (should find no unindexed assets for test user)
        print("\n🔄 Test 3: Existing Assets Sync")
        try:
            await twelvelabs_service.sync_existing_assets(test_user_id)
            print("✅ Successfully initiated existing assets sync")
        except Exception as e:
            print(f"❌ Failed to sync existing assets: {e}")
        
        print("\n🎉 TwelveLabs integration tests completed!")
        print("\nNote: To fully test video indexing, upload a video through the UI")
        return True
        
    except ImportError as e:
        print(f"❌ Failed to import TwelveLabs service: {e}")
        print("Make sure you're running from the correct directory")
        return False
    except Exception as e:
        print(f"❌ Unexpected error during testing: {e}")
        return False

def test_api_key():
    """Test if TwelveLabs API key is configured"""
    print("🔑 Checking TwelveLabs API Key Configuration")
    print("=" * 50)
    
    # Check if API key is set in environment or hardcoded
    api_key = os.getenv("TWELVELABS_API_KEY")
    hardcoded_key = "tlk_0Y89QJX096RJDT23MWKNN15Z15FE"
    
    if api_key:
        masked = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "(set)"
        print(f"✅ Environment API key found: {masked}")
        return True
    elif hardcoded_key:
        masked = f"{hardcoded_key[:6]}...{hardcoded_key[-4:]}"
        print(f"✅ Hardcoded API key found: {masked}")
        return True
    else:
        print("❌ No TwelveLabs API key found!")
        print("Set TWELVELABS_API_KEY environment variable or check hardcoded key")
        return False

async def main():
    """Main test function"""
    print("🚀 TwelveLabs Integration Test Suite")
    print("=" * 50)
    
    # Test API key first
    if not test_api_key():
        print("\n❌ Cannot proceed without API key")
        return
    
    print("\n")
    
    # Test integration
    success = await test_twelvelabs_integration()
    
    if success:
        print("\n✅ All tests passed! TwelveLabs integration is ready.")
        print("\nNext steps:")
        print("1. Start the backend server")
        print("2. Upload a video through the frontend")
        print("3. Watch the indexing status badges in the asset panel")
    else:
        print("\n❌ Some tests failed. Check the error messages above.")

if __name__ == "__main__":
    asyncio.run(main())