"""
Professional Export API

Enhanced export endpoints with professional profile support, progress tracking,
and advanced export management.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
import os
import uuid
import json
import asyncio
from datetime import datetime

from .export_profiles import export_profiles_service, ExportCategory, ExportProfile
from ..video_backend.ffmpeg_pipeline import FFMpegPipeline
from ..timeline import Timeline
import logging
from supabase import create_client, Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])

# ================== REQUEST/RESPONSE MODELS ==================

class ExportRequest(BaseModel):
    """Professional export request"""
    timeline: Dict[str, Any]
    profile_id: str = Field(..., description="Professional export profile ID")
    output_filename: Optional[str] = Field(None, description="Custom output filename")
    custom_settings: Optional[Dict[str, Any]] = Field(None, description="Override profile settings")
    
    # NEW: Support for precise timeline intervals (frame-accurate export)
    intervals: Optional[List[Dict[str, Any]]] = Field(None, description="Timeline export intervals for frame-accurate processing")
    
    # NEW: Multi-track intervals for professional multi-track composition
    multitrack_intervals: Optional[List[Dict[str, Any]]] = Field(None, description="Multi-track intervals with track metadata for advanced composition")


class QuickExportRequest(BaseModel):
    """Quick export with simplified options"""
    timeline: Dict[str, Any]
    format: str = Field("youtube_1080p_h264", description="Quick format preset")
    quality: str = Field("high", description="Legacy quality setting")


class ExportJob(BaseModel):
    """Export job status"""
    job_id: str
    status: str  # queued, processing, completed, failed, cancelled
    profile_id: str
    output_path: str
    progress: float = 0.0
    estimated_size_mb: Optional[float] = None
    file_size_mb: Optional[float] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    download_url: Optional[str] = None


class ExportProfileResponse(BaseModel):
    """Export profile information"""
    id: str
    name: str
    description: str
    category: str
    container: str
    resolution: str
    framerate: str
    estimated_quality: str
    platform_optimized: bool
    file_size_estimate: Optional[str] = None


class ExportStatusResponse(BaseModel):
    """Export status response"""
    success: bool
    job_id: str
    status: str
    progress: float
    message: str
    data: Optional[Dict[str, Any]] = None


# ================== EXPORT JOB MANAGEMENT ==================

class ExportJobManager:
    """Manages export jobs and progress tracking"""
    
    def __init__(self):
        self._jobs: Dict[str, ExportJob] = {}
        self._active_jobs: Dict[str, asyncio.Task] = {}
    
    def create_job(self, profile_id: str, output_path: str, timeline_duration: float = None) -> str:
        """Create a new export job"""
        job_id = str(uuid.uuid4())
        
        # Estimate file size if possible
        profile = export_profiles_service.get_profile(profile_id)
        estimated_size = None
        if profile and timeline_duration:
            estimated_size = export_profiles_service.estimate_file_size(profile, timeline_duration)
        
        job = ExportJob(
            job_id=job_id,
            status="queued",
            profile_id=profile_id,
            output_path=output_path,
            estimated_size_mb=estimated_size,
            created_at=datetime.now()
        )
        
        self._jobs[job_id] = job
        logger.info(f"🔍 [JobManager] Created job {job_id}")
        logger.info(f"🔍 [JobManager] Total jobs in manager: {len(self._jobs)}")
        logger.info(f"🔍 [JobManager] All job IDs: {list(self._jobs.keys())}")
        return job_id
    
    def get_job(self, job_id: str) -> Optional[ExportJob]:
        """Get job by ID"""
        return self._jobs.get(job_id)
    
    def get_all_jobs(self) -> List[ExportJob]:
        """Get all jobs"""
        return list(self._jobs.values())
    
    def update_job_status(self, job_id: str, status: str, progress: float = None, error: str = None):
        """Update job status"""
        if job_id in self._jobs:
            job = self._jobs[job_id]
            old_status = job.status
            job.status = status
            if progress is not None:
                job.progress = progress
            if error:
                job.error_message = error
            if status == "processing" and not job.started_at:
                job.started_at = datetime.now()
            elif status in ["completed", "failed", "cancelled"]:
                job.completed_at = datetime.now()
                # Calculate actual file size
                if status == "completed" and os.path.exists(job.output_path):
                    job.file_size_mb = os.path.getsize(job.output_path) / (1024 * 1024)
                    job.download_url = f"/export/download/{job_id}"
            
            logger.info(f"🔍 [JobManager] Updated job {job_id}: {old_status} → {status}")
            if progress is not None:
                logger.info(f"🔍 [JobManager] Job {job_id} progress: {progress}%")
            if status == "completed":
                logger.info(f"🔍 [JobManager] Job {job_id} completed - setting up download")
                logger.info(f"    File size: {job.file_size_mb:.1f} MB" if hasattr(job, 'file_size_mb') and job.file_size_mb else "    File size: unknown")
                logger.info(f"    Download URL: {job.download_url}" if hasattr(job, 'download_url') else "    No download URL set")
        else:
            logger.error(f"🔍 [JobManager] Attempted to update non-existent job: {job_id}")
            logger.error(f"🔍 [JobManager] Available jobs: {list(self._jobs.keys())}")
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel an export job"""
        if job_id in self._active_jobs:
            task = self._active_jobs[job_id]
            task.cancel()
            del self._active_jobs[job_id]
            self.update_job_status(job_id, "cancelled")
            return True
        return False
    
    def cleanup_old_jobs(self, max_age_hours: int = 24):
        """Clean up old completed jobs"""
        cutoff = datetime.now().timestamp() - (max_age_hours * 3600)
        to_remove = []
        
        for job_id, job in self._jobs.items():
            if job.completed_at and job.completed_at.timestamp() < cutoff:
                to_remove.append(job_id)
                # Remove output file if it exists
                if os.path.exists(job.output_path):
                    try:
                        os.remove(job.output_path)
                    except:
                        pass
        
        for job_id in to_remove:
            del self._jobs[job_id]


# Global job manager
job_manager = ExportJobManager()

# ================== SUPABASE INTEGRATION ==================

# Supabase configuration (using same config as upload_api.py)
SUPABASE_URL = "https://fgvyotgowmcwcphsctlc.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndnlvdGdvd21jd2NwaHNjdGxjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTczMjU5MCwiZXhwIjoyMDYxMzA4NTkwfQ.3JXr_BUDFs0c2cvNog2-igf_UWQ2H7CAp3WJL_JJLSM"
EXPORTS_BUCKET = "exports"  # Dedicated bucket for export files

def get_supabase_client() -> Client:
    """Get Supabase client for export operations"""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async def upload_export_to_supabase(file_path: str, job_id: str) -> str:
    """
    Upload exported file to Supabase storage and return download URL
    
    Args:
        file_path (str): Local path to exported file
        job_id (str): Export job ID for unique naming
        
    Returns:
        str: Public download URL for the exported file
        
    Raises:
        RuntimeError: If upload fails
    """
    try:
        if not os.path.exists(file_path):
            raise RuntimeError(f"Export file not found: {file_path}")
        
        # Get file info
        file_size = os.path.getsize(file_path) / (1024 * 1024)  # MB
        file_extension = os.path.splitext(file_path)[1] or '.mp4'
        
        # Generate storage path with job ID and timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        storage_path = f"exports/{job_id}_{timestamp}{file_extension}"
        
        logger.info(f"🎬 [Export] Uploading to Supabase: {storage_path} ({file_size:.1f} MB)")
        
        # Initialize Supabase client
        supabase = get_supabase_client()
        
        # Read file and upload
        with open(file_path, 'rb') as f:
            file_data = f.read()
            
        # Upload to exports bucket
        response = supabase.storage.from_(EXPORTS_BUCKET).upload(
            path=storage_path,
            file=file_data,
            file_options={
                "content-type": "video/mp4",
                "cache-control": "3600"  # 1 hour cache
            }
        )
        
        if response.error:
            raise RuntimeError(f"Supabase upload failed: {response.error}")
        
        # Generate signed URL for download (valid for 24 hours)
        download_response = supabase.storage.from_(EXPORTS_BUCKET).create_signed_url(
            path=storage_path,
            expires_in=86400  # 24 hours in seconds
        )
        
        if download_response.error:
            raise RuntimeError(f"Failed to create download URL: {download_response.error}")
        
        download_url = download_response.signed_url
        
        logger.info(f"🎬 [Export] ✅ Upload successful: {storage_path}")
        logger.info(f"🎬 [Export] Download URL: {download_url[:50]}...")
        
        return download_url
        
    except Exception as e:
        error_msg = f"Failed to upload export to Supabase: {str(e)}"
        logger.error(f"🎬 [Export] ❌ {error_msg}")
        raise RuntimeError(error_msg) from e

# ================== EXPORT PROCESSING ==================

async def process_export_job(job_id: str, timeline_dict: Dict[str, Any], 
                           profile_id: str, output_path: str, 
                           custom_settings: Optional[Dict[str, Any]] = None,
                           intervals: Optional[List[Dict[str, Any]]] = None,
                           multitrack_intervals: Optional[List[Dict[str, Any]]] = None):
    """Process an export job asynchronously with optional timeline intervals support"""
    try:
        job_manager.update_job_status(job_id, "processing", 0.0)
        
        # Get export profile
        profile = export_profiles_service.get_profile(profile_id)
        if not profile:
            raise ValueError(f"Export profile not found: {profile_id}")
        
        # Create FFmpeg pipeline
        pipeline = FFMpegPipeline()
        
        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        # Apply custom settings if provided
        if custom_settings:
            # Override profile settings with custom settings
            for key, value in custom_settings.items():
                if hasattr(profile, key):
                    setattr(profile, key, value)
        
        # Update progress
        job_manager.update_job_status(job_id, "processing", 25.0)
        
        # PRIORITY 1: Use multi-track intervals for professional composition if provided
        if multitrack_intervals and len(multitrack_intervals) > 0:
            logger.info(f"Export job {job_id}: Using {len(multitrack_intervals)} multi-track intervals for professional export")
            
            # Quality mapping from profile to FFmpeg quality setting
            quality_map = {
                "youtube_1080p_h264": "high",
                "youtube_4k_h264": "high", 
                "web_1080p_h264": "high",
                "web_720p_h264": "medium",
                "mobile_720p_h264": "medium",
                "instagram_feed_1080": "medium",
                "instagram_story_1080": "medium",
                "tiktok_1080": "medium"
            }
            quality = quality_map.get(profile_id, "high")
            
            # Log multi-track export details
            track_counts = {}
            for interval in multitrack_intervals:
                track_kind = interval.get('trackKind', 'unknown')
                track_counts[track_kind] = track_counts.get(track_kind, 0) + 1
            
            total_duration = sum(float(interval.get('sourceDuration', 0)) for interval in multitrack_intervals)
            logger.info(f"Export job {job_id}: Multi-track composition - {total_duration:.1f}s total")
            logger.info(f"Export job {job_id}: Track breakdown: {track_counts}")
            
            # Use new multi-track export method
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, pipeline.render_multitrack_export, multitrack_intervals, output_path, quality)
            
        # PRIORITY 2: Use timeline intervals for frame-accurate export if provided
        elif intervals and len(intervals) > 0:
            logger.info(f"Export job {job_id}: Using {len(intervals)} timeline intervals for frame-accurate export")
            
            # Quality mapping from profile to FFmpeg quality setting
            quality_map = {
                "youtube_1080p_h264": "high",
                "youtube_4k_h264": "high", 
                "web_1080p_h264": "high",
                "web_720p_h264": "medium",
                "mobile_720p_h264": "medium",
                "instagram_feed_1080": "medium",
                "instagram_story_1080": "medium",
                "tiktok_1080": "medium"
            }
            quality = quality_map.get(profile_id, "high")
            
            # Log export details for debugging
            total_duration = sum(float(interval.get('sourceDuration', 0)) for interval in intervals)
            logger.info(f"Export job {job_id}: Processing {len(intervals)} segments, {total_duration:.1f}s total")
            for i, interval in enumerate(intervals):
                logger.info(f"  Segment {i+1}: {interval.get('clipName', 'Unknown')} - "
                          f"{interval.get('sourceDuration', 0)}s from {interval.get('sourceStart', 0)}s")
            
            # Use new timeline-aware export method
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, pipeline.render_timeline_export, intervals, output_path, quality)
            
        else:
            # Fallback to existing method for backward compatibility
            logger.info(f"Export job {job_id}: Using legacy export method (no intervals provided)")
            
            # Create timeline from dict
            timeline = Timeline()
            timeline.from_dict(timeline_dict)
            pipeline.set_timeline(timeline)
            
            # Generate FFmpeg command using profile
            if hasattr(pipeline, 'render_export_with_profile'):
                # Use enhanced method if available
                await pipeline.render_export_with_profile(output_path, profile)
            else:
                # Fallback to existing method with quality mapping
                quality_map = {
                    "youtube_1080p_h264": "high",
                    "youtube_4k_h264": "high",
                    "web_1080p_h264": "high",
                    "web_720p_h264": "medium",
                    "mobile_720p_h264": "medium",
                    "instagram_feed_1080": "medium",
                    "instagram_story_1080": "medium",
                    "tiktok_1080": "medium"
                }
                quality = quality_map.get(profile_id, "high")
                
                # Run in thread to avoid blocking
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, pipeline.render_export, output_path, quality)
        
        # Upload to Supabase storage
        job_manager.update_job_status(job_id, "processing", 90.0)
        
        # Verify output file exists
        if not os.path.exists(output_path):
            raise RuntimeError("Export completed but output file not found")
        
        logger.info(f"Export job {job_id}: Uploading to Supabase storage...")
        
        # Upload to Supabase and get download URL
        upload_successful = False
        try:
            download_url = await upload_export_to_supabase(output_path, job_id)
            
            # Update job with download URL
            job = job_manager.get_job(job_id)
            if job:
                logger.info(f"🔍 [Export] Setting Supabase download URL for job {job_id}")
                logger.info(f"🔍 [Export] Previous download_url: {getattr(job, 'download_url', 'None')}")
                job.download_url = download_url
                logger.info(f"🔍 [Export] New download_url: {job.download_url}")
            else:
                logger.error(f"🔍 [Export] Could not find job {job_id} to set download URL!")
                
            job_manager.update_job_status(job_id, "processing", 95.0)
            logger.info(f"Export job {job_id}: Upload successful, download URL created")
            upload_successful = True
            
        except Exception as upload_error:
            logger.error(f"🔍 [Export] ❌ Upload failed: {upload_error}")
            logger.warning(f"🔍 [Export] Keeping local file for fallback download: {output_path}")
            # Don't clean up local file - it will be used for direct download
        
        # Only clean up local file if Supabase upload was successful
        if upload_successful:
            try:
                if os.path.exists(output_path):
                    os.remove(output_path)
                    logger.info(f"🔍 [Export] Cleaned up local file (Supabase upload successful)")
            except Exception as cleanup_error:
                logger.warning(f"🔍 [Export] Could not clean up local file: {cleanup_error}")
        else:
            logger.info(f"🔍 [Export] Local file preserved for direct download: {output_path}")
        
        # Complete the job
        job_manager.update_job_status(job_id, "completed", 100.0)
        download_method = "Supabase URL" if upload_successful else "local file fallback"
        logger.info(f"🔍 [Export] Export job {job_id} completed successfully - download via {download_method}")
        
    except Exception as e:
        error_msg = f"Export failed: {str(e)}"
        job_manager.update_job_status(job_id, "failed", error=error_msg)
        logger.error(f"Export job {job_id} failed: {error_msg}")
        # Re-raise for proper error handling
        raise


# ================== API ENDPOINTS ==================

@router.get("/profiles", response_model=List[ExportProfileResponse])
async def get_export_profiles(category: Optional[str] = Query(None, description="Filter by category")):
    """Get all available export profiles"""
    try:
        if category:
            try:
                cat_enum = ExportCategory(category.lower())
                profiles = export_profiles_service.get_profiles_by_category(cat_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
        else:
            profiles = export_profiles_service.get_all_profiles()
        
        result = []
        for profile in profiles:
            # Determine quality estimate
            quality = "high"
            if profile.video_crf and profile.video_crf > 25:
                quality = "medium"
            elif profile.video_bitrate and "k" in profile.video_bitrate:
                bitrate = int(profile.video_bitrate.replace("k", ""))
                if bitrate < 2000:
                    quality = "medium"
                elif bitrate > 10000:
                    quality = "very_high"
            
            result.append(ExportProfileResponse(
                id=profile.id,
                name=profile.name,
                description=profile.description,
                category=profile.category.value,
                container=profile.container,
                resolution=profile.resolution,
                framerate=profile.framerate,
                estimated_quality=quality,
                platform_optimized=bool(profile.platform_specific),
                file_size_estimate=f"~{profile.video_bitrate or 'Variable'} video bitrate"
            ))
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting export profiles: {e}")
        raise HTTPException(status_code=500, detail="Failed to get export profiles")


@router.get("/profiles/{profile_id}", response_model=ExportProfileResponse)
async def get_export_profile(profile_id: str):
    """Get a specific export profile"""
    profile = export_profiles_service.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Export profile not found: {profile_id}")
    
    return ExportProfileResponse(
        id=profile.id,
        name=profile.name,
        description=profile.description,
        category=profile.category.value,
        container=profile.container,
        resolution=profile.resolution,
        framerate=profile.framerate,
        estimated_quality="high" if profile.video_bitrate else "variable",
        platform_optimized=bool(profile.platform_specific)
    )


@router.post("/professional", response_model=ExportStatusResponse)
async def export_professional(request: ExportRequest, background_tasks: BackgroundTasks):
    """Start professional export with advanced profile support"""
    try:
        # Validate profile exists
        profile = export_profiles_service.get_profile(request.profile_id)
        if not profile:
            raise HTTPException(status_code=400, detail=f"Invalid profile ID: {request.profile_id}")
        
        # Generate output path
        if request.output_filename:
            filename = request.output_filename
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"export_{request.profile_id}_{timestamp}.{profile.container}"
        
        output_dir = "/tmp/exports"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, filename)
        
        # Estimate timeline duration for file size estimation
        timeline_duration = None
        try:
            timeline = Timeline()
            timeline.from_dict(request.timeline)
            timeline_duration = timeline.get_duration()
        except:
            pass
        
        # Create export job
        job_id = job_manager.create_job(request.profile_id, output_path, timeline_duration)
        
        # Start export in background
        task = asyncio.create_task(
            process_export_job(
                job_id, 
                request.timeline, 
                request.profile_id, 
                output_path,
                request.custom_settings,
                request.intervals,  # Pass timeline intervals for frame-accurate export
                request.multitrack_intervals  # NEW: Pass multi-track intervals for professional composition
            )
        )
        job_manager._active_jobs[job_id] = task
        
        return ExportStatusResponse(
            success=True,
            job_id=job_id,
            status="queued",
            progress=0.0,
            message=f"Export started with profile: {profile.name}",
            data={
                "profile_name": profile.name,
                "output_filename": filename,
                "estimated_size_mb": job_manager.get_job(job_id).estimated_size_mb
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting professional export: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start export: {str(e)}")


@router.post("/quick", response_model=ExportStatusResponse)
async def export_quick(request: QuickExportRequest, background_tasks: BackgroundTasks):
    """Quick export with simplified options (legacy compatibility)"""
    # Map legacy format to profile
    format_map = {
        "youtube": "youtube_1080p_h264",
        "instagram": "instagram_feed_1080",
        "tiktok": "tiktok_1080",
        "web": "web_1080p_h264",
        "mobile": "mobile_720p_h264"
    }
    
    profile_id = format_map.get(request.format, request.format)
    
    # Convert to professional export request
    professional_request = ExportRequest(
        timeline=request.timeline,
        profile_id=profile_id
    )
    
    return await export_professional(professional_request, background_tasks)


@router.get("/jobs", response_model=List[ExportJob])
async def get_export_jobs():
    """Get all export jobs"""
    return job_manager.get_all_jobs()


@router.get("/jobs/{job_id}", response_model=ExportJob)
async def get_export_job(job_id: str):
    """Get specific export job status"""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Export job not found: {job_id}")
    return job


@router.delete("/jobs/{job_id}")
async def cancel_export_job(job_id: str):
    """Cancel an export job"""
    if not job_manager.get_job(job_id):
        raise HTTPException(status_code=404, detail=f"Export job not found: {job_id}")
    
    success = job_manager.cancel_job(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")
    
    return {"success": True, "message": "Export job cancelled"}


@router.get("/download/{job_id}")
async def download_export(job_id: str):
    """Download completed export file"""
    logger.info(f"🔍 [Download] Request received for job_id: {job_id}")
    
    # Log job manager state
    all_jobs = job_manager.get_all_jobs()
    logger.info(f"🔍 [Download] Job manager has {len(all_jobs)} total jobs")
    logger.info(f"🔍 [Download] Job IDs in manager: {[job.job_id for job in all_jobs]}")
    
    job = job_manager.get_job(job_id)
    if not job:
        logger.error(f"🔍 [Download] Job {job_id} NOT FOUND in job manager")
        logger.error(f"🔍 [Download] Available jobs: {[(j.job_id, j.status) for j in all_jobs]}")
        raise HTTPException(status_code=404, detail=f"Export job not found: {job_id}")
    
    logger.info(f"🔍 [Download] Job {job_id} FOUND - Status: {job.status}")
    logger.info(f"🔍 [Download] Job details: created={job.created_at}, started={job.started_at}, completed={job.completed_at}")
    
    if job.status != "completed":
        logger.warning(f"🔍 [Download] Job {job_id} not completed. Status: {job.status}")
        raise HTTPException(status_code=400, detail=f"Export not completed. Status: {job.status}")
    
    # Log download options
    has_download_url = hasattr(job, 'download_url') and job.download_url and job.download_url.startswith('http')
    has_local_file = os.path.exists(job.output_path) if hasattr(job, 'output_path') and job.output_path else False
    
    logger.info(f"🔍 [Download] Job {job_id} download options:")
    logger.info(f"    Has download_url: {has_download_url}")
    if has_download_url:
        logger.info(f"    Download URL: {job.download_url}")
    logger.info(f"    Has local file: {has_local_file}")
    if hasattr(job, 'output_path'):
        logger.info(f"    Output path: {job.output_path}")
    
    # Priority 1: Use Supabase download URL if available (enhanced export system)
    if has_download_url:
        logger.info(f"🔍 [Download] Job {job_id}: Redirecting to Supabase download URL: {job.download_url}")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=job.download_url, status_code=302)
    
    # Priority 2: Fall back to local file serving (backward compatibility)
    if has_local_file:
        logger.info(f"🔍 [Download] Job {job_id}: Serving local file: {job.output_path}")
        filename = os.path.basename(job.output_path)
        return FileResponse(
            job.output_path,
            filename=filename,
            media_type="application/octet-stream"
        )
    
    # Neither option available - return 404
    logger.error(f"🔍 [Download] Job {job_id}: No download method available")
    logger.error(f"    download_url exists: {hasattr(job, 'download_url')}")
    if hasattr(job, 'download_url'):
        logger.error(f"    download_url value: '{job.download_url}'")
    logger.error(f"    output_path exists: {hasattr(job, 'output_path')}")
    if hasattr(job, 'output_path'):
        logger.error(f"    output_path value: '{job.output_path}'")
        logger.error(f"    local file exists: {os.path.exists(job.output_path)}")
    
    raise HTTPException(
        status_code=404, 
        detail="Export file not available for download. File may have been cleaned up or upload failed."
    )


@router.post("/cleanup")
async def cleanup_old_exports(max_age_hours: int = Query(24, description="Maximum age in hours")):
    """Clean up old export jobs and files"""
    job_manager.cleanup_old_jobs(max_age_hours)
    return {"success": True, "message": f"Cleaned up exports older than {max_age_hours} hours"}


# Legacy endpoint for backwards compatibility
@router.post("", response_model=ExportStatusResponse)
async def export_legacy(request: QuickExportRequest, background_tasks: BackgroundTasks):
    """Legacy export endpoint for backwards compatibility"""
    return await export_quick(request, background_tasks)