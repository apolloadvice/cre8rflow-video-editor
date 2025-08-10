"""
TwelveLabs Video Indexing Service

This service handles all interactions with the TwelveLabs API for video indexing,
progress tracking, and search functionality. It integrates with Supabase for
storing indexing status and user index management.
"""

import asyncio
import os
from typing import Optional, Dict, Any
from datetime import datetime
from supabase import create_client
import logging
from twelvelabs import TwelveLabs
from twelvelabs.indexes import IndexesCreateRequestModelsItem

logger = logging.getLogger(__name__)

class TwelveLabsService:
    def __init__(self):
        self.api_key = "tlk_0Y89QJX096RJDT23MWKNN15Z15FE"
        self.client = TwelveLabs(api_key=self.api_key)
        self.supabase = create_client(
            "https://fgvyotgowmcwcphsctlc.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndnlvdGdvd21jd2NwaHNjdGxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTczMjU5MCwiZXhwIjoyMDYxMzA4NTkwfQ.3JXr_BUDFs0c2cvNog2-igf_UWQ2H7CAp3WJL_JJLSM"
        )
        logger.info("TwelveLabsService initialized with API key")
    
    async def ensure_user_index(self, user_id: str) -> str:
        """
        Get or create a TwelveLabs index for the user using persistent user_indexes table.
        Returns the index_id.
        """
        logger.info(f"🔍 [TwelveLabs] Ensuring index for user {user_id}")
        
        # For now, treat "user123" as the default user UUID for testing
        # In the future, this will be replaced with real user authentication
        if user_id == "user123" or user_id is None:
            # Use a consistent UUID for the default test user
            user_uuid = "00000000-0000-0000-0000-000000000001"
        else:
            user_uuid = user_id  # Assume it's already a proper UUID
        
        # Check if user already has a persistent index in user_indexes table
        try:
            existing_index = self.supabase.table("user_indexes").select("*").eq("user_id", user_uuid).execute()
            
            if existing_index.data and len(existing_index.data) > 0:
                index_record = existing_index.data[0]
                index_id = index_record["twelvelabs_index_id"]
                index_name = index_record["index_name"]
                logger.info(f"🔍 [TwelveLabs] Found existing index {index_id} ({index_name}) for user {user_id}")
                
                # Verify index still exists in TwelveLabs
                try:
                    index = self.client.indexes.retrieve(index_id)
                    if index and index.id:
                        logger.info(f"✅ [TwelveLabs] Verified index {index_id} still exists in TwelveLabs")
                        return index_id
                except Exception as e:
                    logger.warning(f"⚠️ [TwelveLabs] Index {index_id} no longer exists in TwelveLabs: {e}")
                    # Remove invalid index record from our database
                    self.supabase.table("user_indexes").delete().eq("user_id", user_uuid).execute()
        
        except Exception as e:
            logger.warning(f"⚠️ [TwelveLabs] Error checking existing index: {e}")
        
        # Create new index with correct model options (visual + audio for marengo2.7)
        import time
        index_name = f"cre8rflow_user_{user_id}_{int(time.time() * 1000000)}"
        
        try:
            logger.info(f"🎬 [TwelveLabs] Creating new index: {index_name}")
            index = self.client.indexes.create(
                index_name=index_name,
                models=[
                    IndexesCreateRequestModelsItem(
                        model_name="marengo2.7",
                        model_options=["visual", "audio"]  # Correct options for marengo2.7
                    )
                ]
            )
            
            index_id = index.id
            actual_index_name = getattr(index, 'name', index_name)  # Handle SDK response variations
            
            # Store the new index in user_indexes table for future reuse
            self.supabase.table("user_indexes").insert({
                "user_id": user_uuid,
                "twelvelabs_index_id": index_id,
                "index_name": actual_index_name
            }).execute()
            
            logger.info(f"✅ [TwelveLabs] Created and stored index {index_id} ({actual_index_name}) for user {user_id}")
            return index_id
            
        except Exception as e:
            logger.error(f"❌ [TwelveLabs] Failed to create index for user {user_id}: {e}")
            raise Exception(f"Failed to create video search index: {str(e)}")
    
    async def start_indexing(self, asset_id: str, user_id: str, video_url: str):
        """
        Start indexing a video to TwelveLabs with progress tracking.
        This function handles the entire indexing workflow.
        """
        logger.info(f"🚀 [TwelveLabs] Starting indexing for asset {asset_id}")
        logger.info(f"🚀 [TwelveLabs] Video URL: {video_url[:100]}...")
        
        try:
            # Update status to starting
            self.supabase.table("assets").update({
                "indexing_status": "starting",
                "indexing_started_at": datetime.now().isoformat(),
                "indexing_progress": 0
            }).eq("id", asset_id).execute()
            
            logger.info(f"📊 [TwelveLabs] Updated asset {asset_id} status to 'starting'")
            
            # Get or create user's index
            index_id = await self.ensure_user_index(user_id)
            
            # Update asset with index_id
            self.supabase.table("assets").update({
                "user_index_id": index_id
            }).eq("id", asset_id).execute()
            
            logger.info(f"🎯 [TwelveLabs] Using index {index_id} for asset {asset_id}")
            
            # Create indexing task using SDK
            logger.info(f"📤 [TwelveLabs] Submitting video to TwelveLabs...")
            task = self.client.tasks.create(
                index_id=index_id, 
                video_url=video_url
            )
            
            task_id = task.id
            logger.info(f"✅ [TwelveLabs] Task created successfully: {task_id}")
            
            # Update database with task info
            self.supabase.table("assets").update({
                "indexing_status": "processing",
                "twelvelabs_task_id": task_id,
                "indexing_progress": 10
            }).eq("id", asset_id).execute()
            
            logger.info(f"📊 [TwelveLabs] Updated asset {asset_id} to 'processing' with task {task_id}")
            
            # Start monitoring task progress in background
            asyncio.create_task(self.monitor_task_progress(asset_id, task))
            
        except Exception as e:
            logger.error(f"❌ [TwelveLabs] Failed to start indexing for asset {asset_id}: {e}")
            
            # Update database with error
            self.supabase.table("assets").update({
                "indexing_status": "failed",
                "indexing_error": str(e),
                "indexing_progress": 0
            }).eq("id", asset_id).execute()
            
            raise e
    
    async def monitor_task_progress(self, asset_id: str, task):
        """
        Monitor TwelveLabs task progress using SDK's built-in methods.
        This runs in the background and updates the database with progress.
        """
        logger.info(f"👀 [TwelveLabs] Starting progress monitoring for asset {asset_id}, task {task.id}")
        
        def progress_callback(t):
            """Callback function called by SDK during task monitoring."""
            logger.info(f"📈 [TwelveLabs] Task {t.id} status: {t.status}")
            
            # Map TwelveLabs task status to our progress percentage
            progress_map = {
                "pending": 20,
                "processing": 60,
                "ready": 100,
                "failed": 0
            }
            
            progress = progress_map.get(t.status, 30)
            
            # Update database with progress
            try:
                self.supabase.table("assets").update({
                    "indexing_progress": progress
                }).eq("id", asset_id).execute()
                
                logger.info(f"📊 [TwelveLabs] Updated asset {asset_id} progress: {t.status} ({progress}%)")
                
            except Exception as e:
                logger.error(f"❌ [TwelveLabs] Failed to update progress for asset {asset_id}: {e}")
        
        try:
            # Use polling approach since wait_for_done method doesn't exist
            logger.info(f"⏳ [TwelveLabs] Starting task polling with 10-second intervals...")
            max_attempts = 180  # 30 minutes max (180 * 10 seconds)
            attempt = 0
            
            while attempt < max_attempts:
                try:
                    # Get fresh task status from TwelveLabs
                    current_task = self.client.tasks.retrieve(task.id)
                    logger.info(f"📊 [TwelveLabs] Task {task.id} status: {current_task.status} (attempt {attempt + 1})")
                    
                    # Call progress callback to update database
                    progress_callback(current_task)
                    
                    # Check if task is complete
                    if current_task.status == "ready":
                        # Indexing completed successfully
                        logger.info(f"🎉 [TwelveLabs] Indexing completed for asset {asset_id}!")
                        logger.info(f"🎬 [TwelveLabs] Video ID: {current_task.video_id}")
                        
                        self.supabase.table("assets").update({
                            "indexing_status": "completed",
                            "twelvelabs_video_id": current_task.video_id,
                            "indexing_completed_at": datetime.now().isoformat(),
                            "indexing_progress": 100
                        }).eq("id", asset_id).execute()
                        
                        logger.info(f"✅ [TwelveLabs] Database updated - asset {asset_id} indexing complete")
                        return  # Task completed successfully
                        
                    elif current_task.status == "failed":
                        # Indexing failed
                        error_msg = f"TwelveLabs indexing failed with status: failed"
                        logger.error(f"❌ [TwelveLabs] {error_msg} for asset {asset_id}")
                        
                        self.supabase.table("assets").update({
                            "indexing_status": "failed",
                            "indexing_error": error_msg,
                            "indexing_progress": 0
                        }).eq("id", asset_id).execute()
                        return  # Task failed
                    
                    # Task still in progress, wait before next check
                    await asyncio.sleep(10)
                    attempt += 1
                    
                except Exception as poll_error:
                    logger.error(f"❌ [TwelveLabs] Error polling task status: {poll_error}")
                    await asyncio.sleep(10)
                    attempt += 1
                    
            # If we reach here, task timed out
            timeout_msg = f"TwelveLabs indexing timed out after {max_attempts * 10} seconds"
            logger.error(f"❌ [TwelveLabs] {timeout_msg} for asset {asset_id}")
            
            self.supabase.table("assets").update({
                "indexing_status": "failed",
                "indexing_error": timeout_msg,
                "indexing_progress": 0
            }).eq("id", asset_id).execute()
                
        except Exception as e:
            logger.error(f"❌ [TwelveLabs] Error monitoring task for asset {asset_id}: {e}")
            
            self.supabase.table("assets").update({
                "indexing_status": "failed",
                "indexing_error": str(e),
                "indexing_progress": 0
            }).eq("id", asset_id).execute()
    
    async def retry_indexing(self, asset_id: str, user_id: str):
        """
        Retry failed indexing for an asset.
        """
        logger.info(f"🔄 [TwelveLabs] Retrying indexing for asset {asset_id}")
        
        # Get asset details
        asset_data = self.supabase.table("assets").select("path").eq("id", asset_id).execute()
        
        if not asset_data.data:
            raise Exception("Asset not found")
        
        file_path = asset_data.data[0]["path"]
        
        # Create signed URL for TwelveLabs (longer expiry for indexing)
        signed_url_response = self.supabase.storage.from_("assets").create_signed_url(file_path, 7200)  # 2 hours
        
        # DEBUG: Log the actual response structure
        logger.info(f"🔍 [DEBUG] Signed URL response type: {type(signed_url_response)}")
        logger.info(f"🔍 [DEBUG] Signed URL response content: {signed_url_response}")
        if hasattr(signed_url_response, '__dict__'):
            logger.info(f"🔍 [DEBUG] Response attributes: {signed_url_response.__dict__}")
        
        # Handle different response formats from Supabase client
        if hasattr(signed_url_response, 'error') and signed_url_response.error:
            raise Exception(f"Failed to create signed URL: {signed_url_response.error}")
        elif isinstance(signed_url_response, dict) and signed_url_response.get('error'):
            raise Exception(f"Failed to create signed URL: {signed_url_response['error']}")
        
        # Extract signed URL from response - try multiple possible formats
        video_url = None
        
        # Try different possible response formats
        if hasattr(signed_url_response, 'signed_url'):
            video_url = signed_url_response.signed_url
            logger.info(f"🔍 [DEBUG] Found signed_url via attribute")
        elif isinstance(signed_url_response, dict) and 'signed_url' in signed_url_response:
            video_url = signed_url_response['signed_url']
            logger.info(f"🔍 [DEBUG] Found signed_url via dict key")
        elif hasattr(signed_url_response, 'signedURL'):
            video_url = signed_url_response.signedURL
            logger.info(f"🔍 [DEBUG] Found signedURL via attribute")
        elif isinstance(signed_url_response, dict) and 'signedURL' in signed_url_response:
            video_url = signed_url_response['signedURL']
            logger.info(f"🔍 [DEBUG] Found signedURL via dict key")
        elif isinstance(signed_url_response, dict) and 'data' in signed_url_response:
            data = signed_url_response['data']
            if isinstance(data, dict):
                if 'signedUrl' in data:
                    video_url = data['signedUrl']
                    logger.info(f"🔍 [DEBUG] Found signedUrl in data object")
                elif 'signed_url' in data:
                    video_url = data['signed_url']
                    logger.info(f"🔍 [DEBUG] Found signed_url in data object")
        
        if not video_url:
            raise Exception(f"Could not extract signed URL from response. Type: {type(signed_url_response)}, Content: {signed_url_response}")
        
        # Reset status and start indexing
        self.supabase.table("assets").update({
            "indexing_status": "not_started",
            "indexing_error": None,
            "indexing_progress": 0,
            "twelvelabs_task_id": None,
            "twelvelabs_video_id": None
        }).eq("id", asset_id).execute()
        
        logger.info(f"🔄 [TwelveLabs] Reset status for asset {asset_id}, starting fresh indexing")
        
        # Start indexing
        await self.start_indexing(asset_id, user_id, video_url)
    
    async def get_indexing_status(self, asset_id: str) -> Dict[str, Any]:
        """
        Get current indexing status for an asset.
        """
        asset_data = self.supabase.table("assets").select(
            "indexing_status, indexing_progress, indexing_error, indexing_started_at, indexing_completed_at, twelvelabs_video_id"
        ).eq("id", asset_id).execute()
        
        if not asset_data.data:
            return {"status": "not_found"}
        
        return asset_data.data[0]
    
    async def search_videos(self, user_id: str, query: str, options: Optional[Dict] = None):
        """
        Search indexed videos for a user using the SDK.
        """
        logger.info(f"🔍 [TwelveLabs] Searching videos for user {user_id} with query: '{query}'")
        
        try:
            # Get user's index
            index_id = await self.ensure_user_index(user_id)
            
            # Use SDK search functionality
            search_results = self.client.search.query(
                index_id=index_id,
                query_text=query,
                options=options or {}
            )
            
            logger.info(f"✅ [TwelveLabs] Search completed, found results for query: '{query}'")
            return search_results
            
        except Exception as e:
            logger.error(f"❌ [TwelveLabs] Error searching videos for user {user_id}: {e}")
            raise Exception(f"Video search failed: {str(e)}")
    
    async def sync_existing_assets(self, user_id: str):
        """
        Find and index any existing assets that haven't been indexed yet.
        This is called on startup and when users log in.
        """
        logger.info(f"🔄 [TwelveLabs] Starting sync of existing assets for user {user_id}")
        
        # Find unindexed assets for this user
        try:
            # Handle both NULL and specific user_id cases  
            if user_id == "user123" or user_id is None:
                # For default/anonymous users, sync all unindexed assets
                unindexed_assets = self.supabase.table("assets").select(
                    "id, path, original_name"
                ).eq("indexing_status", "not_started").execute()
            else:
                unindexed_assets = self.supabase.table("assets").select(
                    "id, path, original_name"
                ).eq("user_id", user_id).eq("indexing_status", "not_started").execute()
            
            if not unindexed_assets.data:
                logger.info(f"✅ [TwelveLabs] No unindexed assets found for user {user_id}")
                return
            
            asset_count = len(unindexed_assets.data)
            logger.info(f"📋 [TwelveLabs] Found {asset_count} unindexed assets for user {user_id}")
            
            # Start indexing for each unindexed asset
            for i, asset in enumerate(unindexed_assets.data):
                try:
                    logger.info(f"📤 [TwelveLabs] Processing asset {i+1}/{asset_count}: {asset['original_name']}")
                    
                    # Create signed URL for TwelveLabs access
                    signed_url_response = self.supabase.storage.from_("assets").create_signed_url(asset["path"], 7200)
                    
                    # Handle different response formats from Supabase client
                    error_msg = None
                    if hasattr(signed_url_response, 'error') and signed_url_response.error:
                        error_msg = f"Failed to create signed URL: {signed_url_response.error}"
                    elif isinstance(signed_url_response, dict) and signed_url_response.get('error'):
                        error_msg = f"Failed to create signed URL: {signed_url_response['error']}"
                    
                    if error_msg:
                        logger.error(f"❌ [TwelveLabs] {error_msg} for asset {asset['id']}")
                        continue
                    
                    # Extract signed URL from response
                    if hasattr(signed_url_response, 'signed_url'):
                        video_url = signed_url_response.signed_url
                    elif isinstance(signed_url_response, dict) and 'signed_url' in signed_url_response:
                        video_url = signed_url_response['signed_url']
                    else:
                        logger.error(f"❌ [TwelveLabs] Invalid signed URL response format for asset {asset['id']}: {type(signed_url_response)}")
                        continue
                    
                    # Start background indexing for this asset
                    asyncio.create_task(self.start_indexing(asset["id"], user_id, video_url))
                    
                    # Small delay to avoid overwhelming TwelveLabs API
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"❌ [TwelveLabs] Failed to start indexing for asset {asset['id']}: {e}")
                    continue
            
            logger.info(f"🚀 [TwelveLabs] Started indexing for {asset_count} existing assets")
            
        except Exception as e:
            logger.error(f"❌ [TwelveLabs] Error during asset sync for user {user_id}: {e}")
            raise e
    
    async def get_user_index_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Get statistics about a user's TwelveLabs index.
        """
        try:
            index_id = await self.ensure_user_index(user_id)
            index = self.client.indexes.retrieve(index_id)  # Use retrieve instead of get
            
            # Count assets in different indexing states
            # Handle both NULL and default user_id cases
            if user_id == "user123" or user_id is None:
                asset_stats = self.supabase.table("assets").select("indexing_status").execute()
            else:
                asset_stats = self.supabase.table("assets").select("indexing_status").eq("user_id", user_id).execute()
            
            status_counts = {}
            for asset in asset_stats.data or []:
                status = asset.get('indexing_status', 'not_started')
                status_counts[status] = status_counts.get(status, 0) + 1
            
            return {
                "index_id": index_id,
                "index_name": index.name if index else "Unknown",
                "total_assets": len(asset_stats.data or []),
                "status_breakdown": status_counts,
                "video_count": getattr(index, 'video_count', 0) if index else 0
            }
            
        except Exception as e:
            logger.error(f"❌ [TwelveLabs] Error getting index stats for user {user_id}: {e}")
            return {"error": str(e)}

# Global service instance
twelvelabs_service = TwelveLabsService()