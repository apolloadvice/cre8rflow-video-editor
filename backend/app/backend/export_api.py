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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["export"])

# ================== REQUEST/RESPONSE MODELS ==================

class ExportRequest(BaseModel):
    """Professional export request"""
    timeline: Dict[str, Any]
    profile_id: str = Field(..., description="Professional export profile ID")
    output_filename: Optional[str] = Field(None, description="Custom output filename")
    custom_settings: Optional[Dict[str, Any]] = Field(None, description="Override profile settings")


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

# ================== EXPORT PROCESSING ==================

async def process_export_job(job_id: str, timeline_dict: Dict[str, Any], 
                           profile_id: str, output_path: str, 
                           custom_settings: Optional[Dict[str, Any]] = None):
    """Process an export job asynchronously"""
    try:
        job_manager.update_job_status(job_id, "processing", 0.0)
        
        # Get export profile
        profile = export_profiles_service.get_profile(profile_id)
        if not profile:
            raise ValueError(f"Export profile not found: {profile_id}")
        
        # Create timeline from dict
        timeline = Timeline()
        timeline.from_dict(timeline_dict)
        
        # Create FFmpeg pipeline
        pipeline = FFMpegPipeline(timeline)
        
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
        
        # Final progress update
        job_manager.update_job_status(job_id, "processing", 90.0)
        
        # Verify output file exists
        if not os.path.exists(output_path):
            raise RuntimeError("Export completed but output file not found")
        
        # Complete the job
        job_manager.update_job_status(job_id, "completed", 100.0)
        logger.info(f"Export job {job_id} completed successfully: {output_path}")
        
    except Exception as e:
        error_msg = f"Export failed: {str(e)}"
        job_manager.update_job_status(job_id, "failed", error=error_msg)
        logger.error(f"Export job {job_id} failed: {error_msg}")


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
                request.custom_settings
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
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Export job not found: {job_id}")
    
    if job.status != "completed":
        raise HTTPException(status_code=400, detail=f"Export not completed. Status: {job.status}")
    
    if not os.path.exists(job.output_path):
        raise HTTPException(status_code=404, detail="Export file not found")
    
    filename = os.path.basename(job.output_path)
    return FileResponse(
        job.output_path,
        filename=filename,
        media_type="application/octet-stream"
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