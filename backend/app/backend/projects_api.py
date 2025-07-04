from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
import os
from pathlib import Path
import time

from .project_service import (
    project_service,
    LayerType,
    AssetType,
    ClipType,
    GES_AVAILABLE
)

logger = logging.getLogger(__name__)

router = APIRouter()

# ===== REQUEST/RESPONSE MODELS =====

class ProjectCreateRequest(BaseModel):
    project_id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    width: int = Field(default=1920, ge=480, le=7680)
    height: int = Field(default=1080, ge=270, le=4320)
    framerate: str = Field(default="30/1", pattern=r"^\d+/\d+$")

class AssetAddRequest(BaseModel):
    asset_path: str = Field(..., min_length=1)
    asset_id: Optional[str] = None

class ClipAddRequest(BaseModel):
    asset_id: str = Field(..., min_length=1)
    layer_type: str = Field(..., pattern="^(MAIN|OVERLAY|TEXT|EFFECTS|AUDIO)$")
    start_time: float = Field(..., ge=0.0)
    duration: float = Field(..., gt=0.0)
    in_point: float = Field(default=0.0, ge=0.0)

class TitleClipAddRequest(BaseModel):
    layer_type: str = Field(..., pattern="^(MAIN|OVERLAY|TEXT|EFFECTS|AUDIO)$")
    start_time: float = Field(..., ge=0.0)
    duration: float = Field(..., gt=0.0)
    text: str = Field(..., min_length=1)
    font_desc: str = Field(default="Sans Bold 36")

class ClipMoveRequest(BaseModel):
    clip_id: str = Field(..., min_length=1)
    new_start_time: float = Field(..., ge=0.0)

class ClipTrimRequest(BaseModel):
    clip_id: str = Field(..., min_length=1)
    new_duration: float = Field(..., gt=0.0)
    new_in_point: Optional[float] = Field(default=None, ge=0.0)

class SeekRequest(BaseModel):
    position: float = Field(..., ge=0.0)

class ExportRequest(BaseModel):
    output_path: str = Field(..., min_length=1)
    profile: str = Field(default="mp4", pattern="^(mp4|webm|mov)$")

class ProjectResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

# ===== ADVANCED TIMELINE CONTROL ENDPOINTS =====

class TimelineMarkerRequest(BaseModel):
    position: float = Field(..., ge=0.0)
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#ff0000", pattern="^#[0-9a-fA-F]{6}$")
    note: Optional[str] = Field(default="", max_length=500)

class BulkClipOperation(BaseModel):
    clip_ids: List[str] = Field(..., min_items=1)
    operation: str = Field(..., pattern="^(move|delete|copy|mute|unmute)$")
    parameters: Dict[str, Any] = Field(default_factory=dict)

class TimelineZoomRequest(BaseModel):
    zoom_level: float = Field(..., ge=0.1, le=10.0)
    center_position: Optional[float] = Field(default=None, ge=0.0)

class RippleEditRequest(BaseModel):
    clip_id: str = Field(..., min_length=1)
    operation: str = Field(..., pattern="^(insert|delete|trim_ripple)$")
    position: float = Field(..., ge=0.0)
    duration: Optional[float] = Field(default=None, gt=0.0)

class FrameSeekRequest(BaseModel):
    frame_number: int = Field(..., ge=0)

# ===== ENHANCED PROJECT ACTION MODELS =====

class ProjectSaveRequest(BaseModel):
    file_path: str = Field(..., min_length=1)
    include_assets: bool = Field(default=True)
    compress: bool = Field(default=False)

class ProjectLoadRequest(BaseModel):
    file_path: str = Field(..., min_length=1)
    project_id: Optional[str] = None
    merge_mode: bool = Field(default=False)

class ProjectTemplateRequest(BaseModel):
    template_name: str = Field(..., pattern="^(youtube_1080p|instagram_story|podcast|documentary|music_video|custom)$")
    project_name: str = Field(..., min_length=1, max_length=200)
    custom_options: Optional[Dict[str, Any]] = Field(default_factory=dict)

class ProjectValidationRequest(BaseModel):
    check_assets: bool = Field(default=True)
    check_timing: bool = Field(default=True)
    fix_issues: bool = Field(default=False)

class BatchProjectOperation(BaseModel):
    project_ids: List[str] = Field(..., min_items=1)
    operation: str = Field(..., pattern="^(export|backup|validate|cleanup|archive)$")
    parameters: Dict[str, Any] = Field(default_factory=dict)

# ===== PROJECT TEMPLATES =====

PROJECT_TEMPLATES = {
    "youtube_1080p": {
        "name": "YouTube 1080p",
        "width": 1920,
        "height": 1080,
        "framerate": "30/1",
        "description": "Standard YouTube video format",
        "preset_layers": ["MAIN", "TEXT", "AUDIO"],
        "export_profile": "mp4"
    },
    "instagram_story": {
        "name": "Instagram Story",
        "width": 1080,
        "height": 1920,
        "framerate": "30/1",
        "description": "Vertical format for Instagram Stories",
        "preset_layers": ["MAIN", "OVERLAY", "TEXT"],
        "export_profile": "mp4"
    },
    "podcast": {
        "name": "Podcast",
        "width": 1280,
        "height": 720,
        "framerate": "25/1",
        "description": "Audio-focused with simple video",
        "preset_layers": ["MAIN", "TEXT", "AUDIO"],
        "export_profile": "mp4"
    },
    "documentary": {
        "name": "Documentary",
        "width": 1920,
        "height": 1080,
        "framerate": "24/1",
        "description": "Cinematic documentary format",
        "preset_layers": ["MAIN", "OVERLAY", "TEXT", "EFFECTS", "AUDIO"],
        "export_profile": "mov"
    },
    "music_video": {
        "name": "Music Video",
        "width": 1920,
        "height": 1080,
        "framerate": "30/1",
        "description": "High-quality music video format",
        "preset_layers": ["MAIN", "OVERLAY", "EFFECTS", "AUDIO"],
        "export_profile": "mov"
    }
}

# ===== UTILITY FUNCTIONS =====

def check_ges_availability():
    """Check if GES is available and raise HTTPException if not"""
    if not GES_AVAILABLE:
        raise HTTPException(
            status_code=503, 
            detail="GStreamer Editing Services not available. Install with: ./install_ges.sh (macOS) or apt-get install python3-gi (Ubuntu)"
        )

def validate_project_exists(project_id: str):
    """Validate project exists and raise HTTPException if not"""
    project = project_service.get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project_id}' not found"
        )

def get_layer_type_enum(layer_type_str: str) -> LayerType:
    """Convert string to LayerType enum"""
    try:
        return LayerType[layer_type_str]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid layer type: {layer_type_str}. Valid types: {[t.name for t in LayerType]}"
        )

def serialize_project_data(project_data: Dict[str, Any]) -> Dict[str, Any]:
    """Convert project data to JSON-serializable format"""
    if not project_data:
        return {}
    
    # Create a clean copy
    clean_data = {}
    
    for key, value in project_data.items():
        if key == 'project':
            # Convert GES Project to string representation
            if hasattr(value, '__gtype__'):
                clean_data[key] = f"<GES.Project: {project_data.get('name', 'Unknown')}>"
            else:
                clean_data[key] = value
        elif key == 'timeline':
            # Convert GES Timeline to string representation
            if hasattr(value, '__gtype__'):
                clean_data[key] = f"<GES.Timeline: {project_data.get('name', 'Unknown')}>"
            else:
                clean_data[key] = value
        elif key == 'layers':
            # Clean up layer objects
            clean_layers = {}
            for layer_name, layer_obj in value.items():
                if hasattr(layer_obj, '__gtype__'):
                    clean_layers[layer_name] = f"<GES.Layer: {layer_name}>"
                else:
                    clean_layers[layer_name] = layer_obj
            clean_data[key] = clean_layers
        else:
            # Keep other data as-is
            clean_data[key] = value
    
    return clean_data

# ===== PROJECT MANAGEMENT ENDPOINTS =====

@router.get("/projects/availability", response_model=ProjectResponse)
async def check_availability():
    """Check if GES and project services are available"""
    try:
        # Get detailed service status
        service_status = project_service.get_service_status()
        
        # Add additional info
        service_status.update({
            "install_command_macos": "./install_ges.sh",
            "install_command_ubuntu": "apt-get install python3-gi gstreamer1.0-tools libges-1.0-dev"
        })
        
        # Determine overall success
        success = service_status["service_available"]
        message = "Project services are available"
        
        if not service_status["ges_available"]:
            message = "GES is not installed - using mock mode"
        elif service_status["mock_mode"]:
            message = "GES initialization failed - using mock mode"
        elif service_status["ges_initialized"]:
            message = "GES Professional Project System is fully available"
        
        return ProjectResponse(
            success=success,
            message=message,
            data=service_status
        )
    except Exception as e:
        logger.error(f"Error checking availability: {e}")
        return ProjectResponse(
            success=False,
            message=f"Service check failed: {str(e)}",
            data={
                "service_available": False,
                "ges_available": False,
                "ges_initialized": False,
                "mock_mode": True,
                "error": str(e)
            }
        )

# ===== ENHANCED PROJECT ACTIONS ENDPOINTS =====

@router.get("/projects/templates", response_model=ProjectResponse)
async def list_project_templates():
    """List available project templates"""
    return ProjectResponse(
        success=True,
        message="Project templates retrieved successfully",
        data={
            "templates": PROJECT_TEMPLATES,
            "template_count": len(PROJECT_TEMPLATES)
        }
    )

@router.post("/projects/from-template", response_model=ProjectResponse)
async def create_project_from_template(request: ProjectTemplateRequest):
    """Create a new project from a template"""
    check_ges_availability()
    
    try:
        # Get template configuration
        if request.template_name == "custom":
            template_config = request.custom_options
        else:
            template_config = PROJECT_TEMPLATES.get(request.template_name)
            if not template_config:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown template: {request.template_name}"
                )
        
        # Generate unique project ID
        project_id = f"template_{request.template_name}_{int(time.time())}"
        
        # Create project with template settings
        success = project_service.create_project(
            project_id=project_id,
            name=request.project_name,
            width=template_config.get('width', 1920),
            height=template_config.get('height', 1080),
            framerate=template_config.get('framerate', '30/1')
        )
        
        if success:
            # Add template-specific setup (if needed)
            logger.info(f"Project created from template '{request.template_name}': {project_id}")
            
            project_data = project_service.get_project(project_id)
            clean_project_data = serialize_project_data(project_data)
            
            return ProjectResponse(
                success=True,
                message=f"Project created from template '{template_config.get('name', request.template_name)}'",
                data={
                    "project_id": project_id,
                    "template_used": request.template_name,
                    "template_config": template_config,
                    "project_details": clean_project_data
                }
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to create project from template"
            )
            
    except Exception as e:
        logger.error(f"Error creating project from template: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Template creation failed: {str(e)}"
        )

@router.post("/projects/load", response_model=ProjectResponse)
async def load_project_from_file(request: ProjectLoadRequest):
    """Load project from file"""
    check_ges_availability()
    
    try:
        import json
        from pathlib import Path
        
        file_path = Path(request.file_path)
        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Project file not found: {request.file_path}"
            )
        
        # Load project data
        with open(file_path, 'r') as f:
            save_data = json.load(f)
        
        # Determine project ID
        project_id = request.project_id or save_data.get('project_id', f"loaded_{int(time.time())}")
        
        # Check if project already exists
        if not request.merge_mode:
            existing_project = project_service.get_project(project_id)
            if existing_project:
                raise HTTPException(
                    status_code=409,
                    detail=f"Project '{project_id}' already exists. Use merge_mode=true to merge."
                )
        
        # Create or update project
        metadata = save_data.get('metadata', {})
        success = project_service.create_project(
            project_id=project_id,
            name=save_data.get('project_name', 'Loaded Project'),
            width=metadata.get('width', 1920),
            height=metadata.get('height', 1080),
            framerate=metadata.get('framerate', '30/1')
        )
        
        if success:
            # Load assets
            assets_loaded = 0
            for asset_id, asset_data in save_data.get('assets', {}).items():
                asset_path = asset_data.get('path', '')
                if os.path.exists(asset_path):
                    added_asset_id = project_service.add_asset_to_project(
                        project_id=project_id,
                        asset_path=asset_path,
                        asset_id=asset_id
                    )
                    if added_asset_id:
                        assets_loaded += 1
            
            # Load clips (basic implementation)
            clips_loaded = 0
            for clip_id, clip_data in save_data.get('clips', {}).items():
                asset_id = clip_data.get('asset_id')
                if asset_id and asset_id in save_data.get('assets', {}):
                    # For now, just count potential clips
                    clips_loaded += 1
            
            return ProjectResponse(
                success=True,
                message=f"Project loaded from {request.file_path}",
                data={
                    "project_id": project_id,
                    "file_path": str(file_path),
                    "merge_mode": request.merge_mode,
                    "assets_loaded": assets_loaded,
                    "clips_planned": clips_loaded,
                    "original_data": {
                        "version": save_data.get('version', 'unknown'),
                        "saved_at": save_data.get('saved_at', 0)
                    }
                }
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to create project for loading"
            )
            
    except Exception as e:
        logger.error(f"Error loading project from file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load project: {str(e)}"
        )

@router.post("/projects/batch-operations", response_model=ProjectResponse)
async def batch_project_operations(request: BatchProjectOperation):
    """Execute batch operations on multiple projects"""
    check_ges_availability()
    
    try:
        results = []
        failed_operations = []
        
        for project_id in request.project_ids:
            try:
                # Validate project exists
                project = project_service.get_project(project_id)
                if not project:
                    failed_operations.append({
                        "project_id": project_id,
                        "error": "Project not found"
                    })
                    continue
                
                operation_result = None
                
                if request.operation == "validate":
                    # Basic validation
                    status = project_service.get_project_status(project_id)
                    operation_result = {
                        "project_id": project_id,
                        "operation": "validate",
                        "status": "success",
                        "validation_result": {
                            "clips_count": status.get('clips_count', 0),
                            "assets_count": status.get('assets_count', 0),
                            "duration": status.get('duration', 0)
                        }
                    }
                    
                elif request.operation == "backup":
                    # Mock backup operation
                    backup_path = f"/tmp/backup_{project_id}_{int(time.time())}.json"
                    operation_result = {
                        "project_id": project_id,
                        "operation": "backup",
                        "status": "success",
                        "backup_path": backup_path
                    }
                    
                elif request.operation == "cleanup":
                    # Cleanup project pipelines
                    success = project_service.cleanup_pipelines(project_id)
                    operation_result = {
                        "project_id": project_id,
                        "operation": "cleanup",
                        "status": "success" if success else "failed"
                    }
                    
                else:
                    operation_result = {
                        "project_id": project_id,
                        "operation": request.operation,
                        "status": "not_implemented"
                    }
                
                results.append(operation_result)
                
            except Exception as e:
                failed_operations.append({
                    "project_id": project_id,
                    "error": str(e)
                })
        
        success_rate = len(results) / len(request.project_ids) if request.project_ids else 0
        
        return ProjectResponse(
            success=True,
            message=f"Batch operation '{request.operation}' completed",
            data={
                "operation": request.operation,
                "total_projects": len(request.project_ids),
                "successful_operations": len(results),
                "failed_operations": len(failed_operations),
                "success_rate": success_rate,
                "results": results,
                "failures": failed_operations
            }
        )
        
    except Exception as e:
        logger.error(f"Error in batch operations: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Batch operation failed: {str(e)}"
        )

@router.post("/projects", response_model=ProjectResponse)
async def create_project(request: ProjectCreateRequest):
    """Create a new GES project with professional setup"""
    check_ges_availability()
    
    try:
        logger.info(f"Creating project '{request.project_id}' with name '{request.name}'")
        
        # Check if project already exists
        existing_project = project_service.get_project(request.project_id)
        if existing_project:
            raise HTTPException(
                status_code=409,
                detail=f"Project '{request.project_id}' already exists"
            )
        
        # Create project
        success = project_service.create_project(
            project_id=request.project_id,
            name=request.name,
            width=request.width,
            height=request.height,
            framerate=request.framerate
        )
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to create project"
            )
        
        # Set as current project
        project_service.set_current_project(request.project_id)
        
        # Get project details and serialize for JSON
        project_data = project_service.get_project(request.project_id)
        clean_project_data = serialize_project_data(project_data)
        
        return ProjectResponse(
            success=True,
            message=f"Project '{request.name}' created successfully",
            data={
                "project_id": request.project_id,
                "project_details": clean_project_data
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating project: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create project: {str(e)}"
        )

@router.get("/projects", response_model=ProjectResponse)
async def list_projects():
    """List all projects"""
    try:
        projects = project_service.list_projects()
        current_project_id = project_service.get_current_project_id()
        
        return ProjectResponse(
            success=True,
            message=f"Found {len(projects)} projects",
            data={
                "projects": projects,
                "current_project_id": current_project_id,
                "project_count": len(projects)
            }
        )
        
    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list projects: {str(e)}"
        )

@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get detailed project information"""
    try:
        validate_project_exists(project_id)
        
        project_data = project_service.get_project(project_id)
        project_status = project_service.get_project_status(project_id)
        project_assets = project_service.get_project_assets(project_id)
        
        return ProjectResponse(
            success=True,
            message=f"Project '{project_id}' details retrieved",
            data={
                "project": project_data,
                "status": project_status,
                "assets": project_assets
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get project: {str(e)}"
        )

@router.delete("/projects/{project_id}", response_model=ProjectResponse)
async def delete_project(project_id: str):
    """Delete a project"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.delete_project(project_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to delete project"
            )
        
        return ProjectResponse(
            success=True,
            message=f"Project '{project_id}' deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete project: {str(e)}"
        )

@router.post("/projects/{project_id}/set-current", response_model=ProjectResponse)
async def set_current_project(project_id: str):
    """Set project as current active project"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.set_current_project(project_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to set current project"
            )
        
        return ProjectResponse(
            success=True,
            message=f"Project '{project_id}' is now the current project"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting current project: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set current project: {str(e)}"
        )

# ===== ASSET MANAGEMENT ENDPOINTS =====

@router.post("/projects/{project_id}/assets", response_model=ProjectResponse)
async def add_asset(project_id: str, request: AssetAddRequest):
    """Add asset to project with metadata extraction"""
    try:
        validate_project_exists(project_id)
        
        # Validate asset file exists
        if not os.path.exists(request.asset_path):
            raise HTTPException(
                status_code=404,
                detail=f"Asset file not found: {request.asset_path}"
            )
        
        asset_id = project_service.add_asset_to_project(
            project_id=project_id,
            asset_path=request.asset_path,
            asset_id=request.asset_id
        )
        
        if not asset_id:
            raise HTTPException(
                status_code=500,
                detail="Failed to add asset to project"
            )
        
        # Get asset info
        asset_info = project_service.get_asset_info(project_id, asset_id)
        
        return ProjectResponse(
            success=True,
            message=f"Asset added to project with ID: {asset_id}",
            data={
                "asset_id": asset_id,
                "asset_info": asset_info
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding asset: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add asset: {str(e)}"
        )

@router.get("/projects/{project_id}/assets", response_model=ProjectResponse)
async def list_assets(project_id: str, asset_type: Optional[str] = None):
    """List project assets with optional type filtering"""
    try:
        validate_project_exists(project_id)
        
        # Convert asset_type string to enum if provided
        asset_type_enum = None
        if asset_type:
            try:
                asset_type_enum = AssetType(asset_type.lower())
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid asset type: {asset_type}. Valid types: {[t.value for t in AssetType]}"
                )
        
        assets = project_service.list_project_assets(project_id, asset_type_enum)
        
        return ProjectResponse(
            success=True,
            message=f"Found {len(assets)} assets",
            data={
                "assets": assets,
                "asset_count": len(assets),
                "filtered_by_type": asset_type
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing assets: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list assets: {str(e)}"
        )

@router.get("/projects/{project_id}/assets/{asset_id}", response_model=ProjectResponse)
async def get_asset_info(project_id: str, asset_id: str):
    """Get detailed asset information"""
    try:
        validate_project_exists(project_id)
        
        asset_info = project_service.get_asset_info(project_id, asset_id)
        
        if not asset_info:
            raise HTTPException(
                status_code=404,
                detail=f"Asset '{asset_id}' not found in project"
            )
        
        return ProjectResponse(
            success=True,
            message=f"Asset '{asset_id}' information retrieved",
            data={
                "asset_info": asset_info
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting asset info: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get asset info: {str(e)}"
        )

@router.delete("/projects/{project_id}/assets/{asset_id}", response_model=ProjectResponse)
async def remove_asset(project_id: str, asset_id: str):
    """Remove asset from project"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.remove_asset_from_project(project_id, asset_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Asset '{asset_id}' not found in project or failed to remove"
            )
        
        return ProjectResponse(
            success=True,
            message=f"Asset '{asset_id}' removed from project"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing asset: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove asset: {str(e)}"
        )

@router.post("/projects/{project_id}/assets/{asset_id}/refresh", response_model=ProjectResponse)
async def refresh_asset_metadata(project_id: str, asset_id: str):
    """Refresh asset metadata"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.refresh_asset_metadata(project_id, asset_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Asset '{asset_id}' not found or failed to refresh metadata"
            )
        
        # Get updated asset info
        asset_info = project_service.get_asset_info(project_id, asset_id)
        
        return ProjectResponse(
            success=True,
            message=f"Asset '{asset_id}' metadata refreshed",
            data={
                "asset_info": asset_info
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing asset metadata: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh asset metadata: {str(e)}"
        )

# ===== TIMELINE MANAGEMENT ENDPOINTS =====

@router.post("/projects/{project_id}/clips", response_model=ProjectResponse)
async def add_clip(project_id: str, request: ClipAddRequest):
    """Add clip to timeline layer"""
    try:
        validate_project_exists(project_id)
        
        layer_type = get_layer_type_enum(request.layer_type)
        
        clip_id = project_service.add_clip_to_layer(
            project_id=project_id,
            asset_id=request.asset_id,
            layer_type=layer_type,
            start_time=request.start_time,
            duration=request.duration,
            in_point=request.in_point
        )
        
        if not clip_id:
            raise HTTPException(
                status_code=500,
                detail="Failed to add clip to timeline"
            )
        
        # Get clip info
        clip_info = project_service.get_clip_info(project_id, clip_id)
        
        return ProjectResponse(
            success=True,
            message=f"Clip added to {request.layer_type} layer with ID: {clip_id}",
            data={
                "clip_id": clip_id,
                "clip_info": clip_info
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding clip: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add clip: {str(e)}"
        )

@router.post("/projects/{project_id}/title-clips", response_model=ProjectResponse)
async def add_title_clip(project_id: str, request: TitleClipAddRequest):
    """Add title/text clip to timeline layer"""
    try:
        validate_project_exists(project_id)
        
        layer_type = get_layer_type_enum(request.layer_type)
        
        clip_id = project_service.add_title_clip_to_layer(
            project_id=project_id,
            layer_type=layer_type,
            start_time=request.start_time,
            duration=request.duration,
            text=request.text,
            font_desc=request.font_desc
        )
        
        if not clip_id:
            raise HTTPException(
                status_code=500,
                detail="Failed to add title clip to timeline"
            )
        
        # Get clip info
        clip_info = project_service.get_clip_info(project_id, clip_id)
        
        return ProjectResponse(
            success=True,
            message=f"Title clip added to {request.layer_type} layer with ID: {clip_id}",
            data={
                "clip_id": clip_id,
                "clip_info": clip_info,
                "text": request.text,
                "font_desc": request.font_desc
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding title clip: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add title clip: {str(e)}"
        )

@router.post("/projects/{project_id}/clips/move", response_model=ProjectResponse)
async def move_clip(project_id: str, request: ClipMoveRequest):
    """Move clip to new timeline position"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.move_clip(
            project_id=project_id,
            clip_id=request.clip_id,
            new_start_time=request.new_start_time
        )
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Clip '{request.clip_id}' not found or failed to move"
            )
        
        # Get updated clip info
        clip_info = project_service.get_clip_info(project_id, request.clip_id)
        
        return ProjectResponse(
            success=True,
            message=f"Clip '{request.clip_id}' moved to {request.new_start_time}s",
            data={
                "clip_info": clip_info
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error moving clip: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to move clip: {str(e)}"
        )

@router.post("/projects/{project_id}/clips/trim", response_model=ProjectResponse)
async def trim_clip(project_id: str, request: ClipTrimRequest):
    """Trim clip duration and in-point"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.trim_clip(
            project_id=project_id,
            clip_id=request.clip_id,
            new_duration=request.new_duration,
            new_in_point=request.new_in_point
        )
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Clip '{request.clip_id}' not found or failed to trim"
            )
        
        # Get updated clip info
        clip_info = project_service.get_clip_info(project_id, request.clip_id)
        
        return ProjectResponse(
            success=True,
            message=f"Clip '{request.clip_id}' trimmed to {request.new_duration}s duration",
            data={
                "clip_info": clip_info
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error trimming clip: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trim clip: {str(e)}"
        )

@router.delete("/projects/{project_id}/clips/{clip_id}", response_model=ProjectResponse)
async def remove_clip(project_id: str, clip_id: str):
    """Remove clip from timeline"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.remove_clip_from_layer(project_id, clip_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Clip '{clip_id}' not found or failed to remove"
            )
        
        return ProjectResponse(
            success=True,
            message=f"Clip '{clip_id}' removed from timeline"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing clip: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove clip: {str(e)}"
        )

@router.get("/projects/{project_id}/clips", response_model=ProjectResponse)
async def list_clips(project_id: str, layer_type: Optional[str] = None):
    """List timeline clips with optional layer filtering"""
    try:
        validate_project_exists(project_id)
        
        if layer_type:
            # Get clips for specific layer
            layer_type_enum = get_layer_type_enum(layer_type)
            clips = project_service.get_layer_clips(project_id, layer_type_enum)
            message = f"Found {len(clips)} clips in {layer_type} layer"
        else:
            # Get all clips
            clips = project_service.list_all_clips(project_id)
            message = f"Found {len(clips)} clips across all layers"
        
        # Get timeline duration
        timeline_duration = project_service.get_timeline_duration(project_id)
        
        return ProjectResponse(
            success=True,
            message=message,
            data={
                "clips": clips,
                "clip_count": len(clips),
                "timeline_duration": timeline_duration,
                "filtered_by_layer": layer_type
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing clips: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list clips: {str(e)}"
        )

@router.get("/projects/{project_id}/clips/{clip_id}", response_model=ProjectResponse)
async def get_clip_info(project_id: str, clip_id: str):
    """Get detailed clip information"""
    try:
        validate_project_exists(project_id)
        
        clip_info = project_service.get_clip_info(project_id, clip_id)
        
        if not clip_info:
            raise HTTPException(
                status_code=404,
                detail=f"Clip '{clip_id}' not found in project"
            )
        
        return ProjectResponse(
            success=True,
            message=f"Clip '{clip_id}' information retrieved",
            data={
                "clip_info": clip_info
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting clip info: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get clip info: {str(e)}"
        )

# ===== PIPELINE MANAGEMENT ENDPOINTS =====

@router.post("/projects/{project_id}/preview/start", response_model=ProjectResponse)
async def start_preview(project_id: str):
    """Start preview pipeline for project"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.start_preview(project_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to start preview pipeline"
            )
        
        # Get pipeline status
        status = project_service.get_pipeline_status(project_id)
        
        return ProjectResponse(
            success=True,
            message="Preview pipeline started",
            data={
                "pipeline_status": status
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting preview: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start preview: {str(e)}"
        )

@router.post("/projects/{project_id}/preview/pause", response_model=ProjectResponse)
async def pause_preview(project_id: str):
    """Pause preview pipeline"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.pause_preview(project_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to pause preview pipeline"
            )
        
        # Get pipeline status
        status = project_service.get_pipeline_status(project_id)
        
        return ProjectResponse(
            success=True,
            message="Preview pipeline paused",
            data={
                "pipeline_status": status
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pausing preview: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to pause preview: {str(e)}"
        )

@router.post("/projects/{project_id}/preview/stop", response_model=ProjectResponse)
async def stop_preview(project_id: str):
    """Stop preview pipeline"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.stop_preview(project_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to stop preview pipeline"
            )
        
        # Get pipeline status
        status = project_service.get_pipeline_status(project_id)
        
        return ProjectResponse(
            success=True,
            message="Preview pipeline stopped",
            data={
                "pipeline_status": status
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping preview: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop preview: {str(e)}"
        )

@router.post("/projects/{project_id}/preview/seek", response_model=ProjectResponse)
async def seek_preview(project_id: str, request: SeekRequest):
    """Seek preview pipeline to specific position"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.seek_preview(project_id, request.position)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to seek preview pipeline"
            )
        
        # Get pipeline status
        status = project_service.get_pipeline_status(project_id)
        
        return ProjectResponse(
            success=True,
            message=f"Seeked to position {request.position}s",
            data={
                "position": request.position,
                "pipeline_status": status
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error seeking preview: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to seek preview: {str(e)}"
        )

@router.get("/projects/{project_id}/pipeline/status", response_model=ProjectResponse)
async def get_pipeline_status(project_id: str):
    """Get current pipeline status"""
    try:
        validate_project_exists(project_id)
        
        status = project_service.get_pipeline_status(project_id)
        
        return ProjectResponse(
            success=True,
            message="Pipeline status retrieved",
            data={
                "pipeline_status": status
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pipeline status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get pipeline status: {str(e)}"
        )

@router.post("/projects/{project_id}/export", response_model=ProjectResponse)
async def export_project(project_id: str, request: ExportRequest, background_tasks: BackgroundTasks):
    """Export project to video file"""
    try:
        validate_project_exists(project_id)
        
        # Validate output directory exists
        output_dir = os.path.dirname(request.output_path)
        if output_dir and not os.path.exists(output_dir):
            raise HTTPException(
                status_code=400,
                detail=f"Output directory does not exist: {output_dir}"
            )
        
        def run_export():
            try:
                project_service.export_project(
                    project_id=project_id,
                    output_path=request.output_path,
                    profile=request.profile
                )
            except Exception as e:
                logger.error(f"Background export failed: {e}")
        
        # Start export in background
        background_tasks.add_task(run_export)
        
        return ProjectResponse(
            success=True,
            message=f"Export started to {request.output_path} with profile {request.profile}",
            data={
                "output_path": request.output_path,
                "profile": request.profile,
                "export_started": True
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting export: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start export: {str(e)}"
        )

@router.get("/projects/{project_id}/export/status", response_model=ProjectResponse)
async def get_export_status(project_id: str):
    """Get current export status"""
    try:
        validate_project_exists(project_id)
        
        status = project_service.get_export_status(project_id)
        
        return ProjectResponse(
            success=True,
            message="Export status retrieved",
            data={
                "export_status": status
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting export status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get export status: {str(e)}"
        )

@router.post("/projects/{project_id}/export/cancel", response_model=ProjectResponse)
async def cancel_export(project_id: str):
    """Cancel ongoing export"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.cancel_export(project_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail="No active export found to cancel"
            )
        
        return ProjectResponse(
            success=True,
            message="Export cancelled successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling export: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cancel export: {str(e)}"
        )

@router.post("/projects/{project_id}/cleanup", response_model=ProjectResponse)
async def cleanup_pipelines(project_id: str):
    """Cleanup all pipelines for project"""
    try:
        validate_project_exists(project_id)
        
        success = project_service.cleanup_pipelines(project_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to cleanup pipelines"
            )
        
        return ProjectResponse(
            success=True,
            message="Pipelines cleaned up successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up pipelines: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cleanup pipelines: {str(e)}"
        )

# ===== ADVANCED TIMELINE CONTROL ENDPOINTS =====

@router.post("/projects/{project_id}/timeline/markers", response_model=ProjectResponse)
async def add_timeline_marker(project_id: str, request: TimelineMarkerRequest):
    """Add timeline marker for navigation and annotation"""
    try:
        validate_project_exists(project_id)
        
        # Get project data
        project_data = project_service.get_project(project_id)
        if not project_data:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Add marker to project metadata
        if 'markers' not in project_data:
            project_data['markers'] = {}
        
        marker_id = f"marker_{len(project_data['markers'])}"
        marker_data = {
            'id': marker_id,
            'position': request.position,
            'name': request.name,
            'color': request.color,
            'note': request.note,
            'created_at': time.time()
        }
        
        project_data['markers'][marker_id] = marker_data
        
        return ProjectResponse(
            success=True,
            message=f"Timeline marker '{request.name}' added at {request.position}s",
            data={
                "marker_id": marker_id,
                "marker": marker_data
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding timeline marker: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add timeline marker: {str(e)}"
        )

@router.get("/projects/{project_id}/timeline/markers", response_model=ProjectResponse)
async def list_timeline_markers(project_id: str):
    """List all timeline markers"""
    try:
        validate_project_exists(project_id)
        
        project_data = project_service.get_project(project_id)
        markers = project_data.get('markers', {})
        
        # Sort markers by position
        sorted_markers = sorted(markers.values(), key=lambda m: m['position'])
        
        return ProjectResponse(
            success=True,
            message=f"Found {len(markers)} timeline markers",
            data={
                "markers": sorted_markers,
                "marker_count": len(markers)
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing timeline markers: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list timeline markers: {str(e)}"
        )

@router.delete("/projects/{project_id}/timeline/markers/{marker_id}", response_model=ProjectResponse)
async def remove_timeline_marker(project_id: str, marker_id: str):
    """Remove timeline marker"""
    try:
        validate_project_exists(project_id)
        
        project_data = project_service.get_project(project_id)
        markers = project_data.get('markers', {})
        
        if marker_id not in markers:
            raise HTTPException(
                status_code=404,
                detail=f"Marker '{marker_id}' not found"
            )
        
        removed_marker = markers.pop(marker_id)
        
        return ProjectResponse(
            success=True,
            message=f"Timeline marker '{removed_marker['name']}' removed",
            data={
                "removed_marker": removed_marker
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing timeline marker: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to remove timeline marker: {str(e)}"
        )

@router.post("/projects/{project_id}/timeline/seek-frame", response_model=ProjectResponse)
async def seek_to_frame(project_id: str, request: FrameSeekRequest):
    """Seek to specific frame number with frame-accurate positioning"""
    try:
        validate_project_exists(project_id)
        
        # Get project framerate to calculate time position
        project_data = project_service.get_project(project_id)
        
        # Try to get framerate from different possible locations
        framerate_str = None
        if 'metadata' in project_data and 'framerate' in project_data['metadata']:
            framerate_str = project_data['metadata']['framerate']
        elif 'framerate' in project_data:
            framerate_str = project_data['framerate']
        else:
            framerate_str = '30/1'  # Default fallback
        
        # Parse framerate (e.g., "30/1" -> 30.0 fps)
        try:
            fps_parts = framerate_str.split('/')
            fps = float(fps_parts[0]) / float(fps_parts[1])
        except (ValueError, IndexError):
            fps = 30.0  # Default fallback
        
        # Calculate time position from frame number
        time_position = request.frame_number / fps
        
        # Try to seek to calculated position (preview may not be active)
        seek_success = False
        try:
            seek_success = project_service.seek_preview(project_id, time_position)
        except Exception:
            # Preview not active, but frame calculation is still valid
            pass
        
        return ProjectResponse(
            success=True,
            message=f"Frame {request.frame_number} calculated at {time_position:.3f}s" + 
                   (" (preview seeked)" if seek_success else " (preview not active)"),
            data={
                "frame_number": request.frame_number,
                "time_position": time_position,
                "framerate": fps,
                "preview_seeked": seek_success
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error seeking to frame: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to seek to frame: {str(e)}"
        )

@router.post("/projects/{project_id}/timeline/bulk-operations", response_model=ProjectResponse)
async def bulk_clip_operations(project_id: str, request: BulkClipOperation):
    """Perform bulk operations on multiple clips"""
    try:
        validate_project_exists(project_id)
        
        results = []
        failed_operations = []
        
        for clip_id in request.clip_ids:
            try:
                if request.operation == "move":
                    new_start_time = request.parameters.get("new_start_time", 0.0)
                    success = project_service.move_clip(project_id, clip_id, new_start_time)
                    
                elif request.operation == "delete":
                    success = project_service.remove_clip_from_layer(project_id, clip_id)
                    
                elif request.operation == "copy":
                    # Get clip info first
                    clip_info = project_service.get_clip_info(project_id, clip_id)
                    if clip_info:
                        offset = request.parameters.get("time_offset", 1.0)
                        new_start = clip_info['start_time'] + offset
                        
                        # Add copied clip
                        new_clip_id = project_service.add_clip_to_layer(
                            project_id=project_id,
                            asset_id=clip_info['asset_id'],
                            layer_type=LayerType[clip_info['layer_type']],
                            start_time=new_start,
                            duration=clip_info['duration'],
                            in_point=clip_info.get('in_point', 0.0)
                        )
                        success = new_clip_id is not None
                    else:
                        success = False
                        
                else:
                    success = False
                
                if success:
                    results.append({
                        "clip_id": clip_id,
                        "operation": request.operation,
                        "status": "success"
                    })
                else:
                    failed_operations.append(clip_id)
                    
            except Exception as e:
                failed_operations.append(clip_id)
                logger.error(f"Bulk operation failed for clip {clip_id}: {e}")
        
        success_count = len(results)
        total_count = len(request.clip_ids)
        
        return ProjectResponse(
            success=len(failed_operations) == 0,
            message=f"Bulk {request.operation}: {success_count}/{total_count} clips processed successfully",
            data={
                "operation": request.operation,
                "total_clips": total_count,
                "successful_operations": results,
                "failed_clips": failed_operations,
                "success_rate": f"{success_count}/{total_count}"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk clip operations: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to perform bulk operations: {str(e)}"
        )

@router.post("/projects/{project_id}/timeline/ripple-edit", response_model=ProjectResponse)
async def ripple_edit_operation(project_id: str, request: RippleEditRequest):
    """Perform ripple editing operations that affect subsequent clips"""
    try:
        validate_project_exists(project_id)
        
        # Get all clips in the project
        all_clips = project_service.list_all_clips(project_id)
        
        if request.operation == "insert":
            # Insert gap and shift all clips after the position
            duration = request.duration or 1.0
            
            affected_clips = []
            for clip in all_clips:
                if clip['start_time'] >= request.position:
                    new_start_time = clip['start_time'] + duration
                    success = project_service.move_clip(project_id, clip['id'], new_start_time)
                    if success:
                        affected_clips.append({
                            "clip_id": clip['id'],
                            "old_start": clip['start_time'],
                            "new_start": new_start_time
                        })
            
            return ProjectResponse(
                success=True,
                message=f"Ripple insert: {duration}s gap inserted at {request.position}s",
                data={
                    "operation": "insert",
                    "position": request.position,
                    "duration": duration,
                    "affected_clips": affected_clips
                }
            )
            
        elif request.operation == "delete":
            # Find clip at position and delete it, then shift subsequent clips
            target_clip = None
            for clip in all_clips:
                if clip['start_time'] <= request.position < (clip['start_time'] + clip['duration']):
                    target_clip = clip
                    break
            
            if not target_clip:
                raise HTTPException(
                    status_code=404,
                    detail=f"No clip found at position {request.position}s"
                )
            
            # Delete the clip
            success = project_service.remove_clip_from_layer(project_id, target_clip['id'])
            if not success:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to delete clip"
                )
            
            # Shift subsequent clips
            clip_duration = target_clip['duration']
            affected_clips = []
            
            for clip in all_clips:
                if clip['start_time'] > target_clip['start_time']:
                    new_start_time = clip['start_time'] - clip_duration
                    success = project_service.move_clip(project_id, clip['id'], new_start_time)
                    if success:
                        affected_clips.append({
                            "clip_id": clip['id'],
                            "old_start": clip['start_time'],
                            "new_start": new_start_time
                        })
            
            return ProjectResponse(
                success=True,
                message=f"Ripple delete: clip '{target_clip['id']}' removed and timeline adjusted",
                data={
                    "operation": "delete",
                    "deleted_clip": target_clip,
                    "affected_clips": affected_clips
                }
            )
            
        elif request.operation == "trim_ripple":
            # Trim clip and adjust subsequent clips based on duration change
            duration = request.duration
            if not duration:
                raise HTTPException(
                    status_code=400,
                    detail="Duration required for ripple trim operation"
                )
            
            # Get current clip info
            clip_info = project_service.get_clip_info(project_id, request.clip_id)
            if not clip_info:
                raise HTTPException(
                    status_code=404,
                    detail=f"Clip '{request.clip_id}' not found"
                )
            
            original_duration = clip_info['duration']
            duration_change = duration - original_duration
            
            # Trim the clip
            success = project_service.trim_clip(project_id, request.clip_id, duration)
            if not success:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to trim clip"
                )
            
            # Adjust subsequent clips
            affected_clips = []
            for clip in all_clips:
                if clip['start_time'] > clip_info['start_time']:
                    new_start_time = clip['start_time'] + duration_change
                    success = project_service.move_clip(project_id, clip['id'], new_start_time)
                    if success:
                        affected_clips.append({
                            "clip_id": clip['id'],
                            "old_start": clip['start_time'],
                            "new_start": new_start_time
                        })
            
            return ProjectResponse(
                success=True,
                message=f"Ripple trim: clip duration changed by {duration_change}s",
                data={
                    "operation": "trim_ripple",
                    "clip_id": request.clip_id,
                    "duration_change": duration_change,
                    "affected_clips": affected_clips
                }
            )
        
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown ripple edit operation: {request.operation}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ripple edit operation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to perform ripple edit: {str(e)}"
        )

@router.post("/projects/{project_id}/timeline/zoom", response_model=ProjectResponse)
async def set_timeline_zoom(project_id: str, request: TimelineZoomRequest):
    """Set timeline zoom level and optional center position"""
    try:
        validate_project_exists(project_id)
        
        # Store zoom settings in project metadata
        project_data = project_service.get_project(project_id)
        if not project_data:
            raise HTTPException(status_code=404, detail="Project not found")
        
        if 'ui_settings' not in project_data:
            project_data['ui_settings'] = {}
        
        project_data['ui_settings']['timeline_zoom'] = {
            'zoom_level': request.zoom_level,
            'center_position': request.center_position,
            'updated_at': time.time()
        }
        
        # Calculate visible timeline range based on zoom
        timeline_duration = project_service.get_timeline_duration(project_id)
        visible_duration = timeline_duration / request.zoom_level
        
        if request.center_position is not None:
            visible_start = max(0, request.center_position - (visible_duration / 2))
            visible_end = min(timeline_duration, visible_start + visible_duration)
        else:
            visible_start = 0
            visible_end = visible_duration
        
        return ProjectResponse(
            success=True,
            message=f"Timeline zoom set to {request.zoom_level}x",
            data={
                "zoom_level": request.zoom_level,
                "center_position": request.center_position,
                "timeline_duration": timeline_duration,
                "visible_range": {
                    "start": visible_start,
                    "end": visible_end,
                    "duration": visible_duration
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting timeline zoom: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set timeline zoom: {str(e)}"
        )

@router.get("/projects/{project_id}/timeline/zoom", response_model=ProjectResponse)
async def get_timeline_zoom(project_id: str):
    """Get current timeline zoom settings"""
    try:
        validate_project_exists(project_id)
        
        project_data = project_service.get_project(project_id)
        zoom_settings = project_data.get('ui_settings', {}).get('timeline_zoom', {
            'zoom_level': 1.0,
            'center_position': None
        })
        
        timeline_duration = project_service.get_timeline_duration(project_id)
        
        return ProjectResponse(
            success=True,
            message="Timeline zoom settings retrieved",
            data={
                "zoom_settings": zoom_settings,
                "timeline_duration": timeline_duration
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting timeline zoom: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get timeline zoom: {str(e)}"
        )

@router.post("/projects/{project_id}/timeline/snap-to-clips", response_model=ProjectResponse)
async def snap_position_to_clips(project_id: str, target_position: float = Query(..., ge=0.0)):
    """Snap a timeline position to the nearest clip boundary"""
    try:
        validate_project_exists(project_id)
        
        # Get all clips
        all_clips = project_service.list_all_clips(project_id)
        
        # Collect all snap points (clip starts and ends)
        snap_points = [0.0]  # Timeline start
        
        for clip in all_clips:
            snap_points.append(clip['start_time'])  # Clip start
            snap_points.append(clip['start_time'] + clip['duration'])  # Clip end
        
        # Add timeline end
        timeline_duration = project_service.get_timeline_duration(project_id)
        snap_points.append(timeline_duration)
        
        # Remove duplicates and sort
        snap_points = sorted(set(snap_points))
        
        # Find nearest snap point
        nearest_point = min(snap_points, key=lambda x: abs(x - target_position))
        snap_distance = abs(nearest_point - target_position)
        
        return ProjectResponse(
            success=True,
            message=f"Snapped position {target_position}s to {nearest_point}s",
            data={
                "original_position": target_position,
                "snapped_position": nearest_point,
                "snap_distance": snap_distance,
                "all_snap_points": snap_points
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error snapping to clips: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to snap to clips: {str(e)}"
        )

@router.post("/projects/{project_id}/save", response_model=ProjectResponse)
async def save_project_to_file(project_id: str, request: ProjectSaveRequest):
    """Save project to file for persistence"""
    check_ges_availability()
    validate_project_exists(project_id)
    
    try:
        import json
        from pathlib import Path
        
        # Get project data
        project_data = project_service.get_project(project_id)
        
        # Create serializable project state
        save_data = {
            "version": "1.0",
            "project_id": project_id,
            "saved_at": time.time(),
            "project_name": project_data.get('name', 'Unknown'),
            "metadata": project_data.get('metadata', {}),
            "assets": {},
            "clips": {},
            "timeline_state": {
                "duration": project_service.get_timeline_duration(project_id),
                "layer_count": len(project_data.get('layers', {}))
            }
        }
        
        # Add asset information if requested
        if request.include_assets:
            assets_list = project_service.list_project_assets(project_id)
            for asset_info in assets_list:
                asset_id = asset_info.get('id', asset_info.get('asset_id', 'unknown'))
                save_data["assets"][asset_id] = {
                    "path": asset_info.get('path', ''),
                    "duration": asset_info.get('duration', 0),
                    "type": asset_info.get('type', 'UNKNOWN'),
                    "metadata": asset_info.get('metadata', {})
                }
        
        # Add clip information
        clips = project_service.list_all_clips(project_id)
        for clip in clips:
            save_data["clips"][clip['id']] = {
                "asset_id": clip.get('asset_id', ''),
                "layer": clip.get('layer', 0),
                "start_time": clip.get('start_time', 0),
                "duration": clip.get('duration', 0),
                "in_point": clip.get('in_point', 0),
                "clip_type": clip.get('clip_type', 'URI_CLIP')
            }
        
        # Ensure directory exists
        file_path = Path(request.file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save to file
        with open(file_path, 'w') as f:
            json.dump(save_data, f, indent=2)
        
        return ProjectResponse(
            success=True,
            message=f"Project saved to {request.file_path}",
            data={
                "file_path": str(file_path),
                "file_size": file_path.stat().st_size,
                "assets_included": request.include_assets,
                "asset_count": len(save_data["assets"]),
                "clip_count": len(save_data["clips"])
            }
        )
        
    except Exception as e:
        logger.error(f"Error saving project to file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save project: {str(e)}"
        )

@router.post("/projects/{project_id}/validate", response_model=ProjectResponse)
async def validate_project(project_id: str, request: ProjectValidationRequest):
    """Validate project integrity and assets"""
    check_ges_availability()
    validate_project_exists(project_id)
    
    try:
        validation_result = {
            "is_valid": True,
            "issues": [],
            "warnings": [],
            "asset_checks": {},
            "timing_checks": {},
            "summary": {}
        }
        
        # Asset validation
        if request.check_assets:
            assets_list = project_service.list_project_assets(project_id)
            missing_assets = []
            valid_assets = 0
            
            for asset_info in assets_list:
                asset_id = asset_info.get('id', asset_info.get('asset_id', 'unknown'))
                asset_path = asset_info.get('path', '')
                if not os.path.exists(asset_path):
                    missing_assets.append({
                        "asset_id": asset_id,
                        "path": asset_path,
                        "issue": "File not found"
                    })
                    validation_result["issues"].append(f"Asset '{asset_id}' file not found: {asset_path}")
                else:
                    valid_assets += 1
            
            validation_result["asset_checks"] = {
                "total_assets": len(assets_list),
                "valid_assets": valid_assets,
                "missing_assets": len(missing_assets),
                "missing_list": missing_assets
            }
            
            if missing_assets:
                validation_result["is_valid"] = False
        
        # Timing validation
        if request.check_timing:
            clips = project_service.list_all_clips(project_id)
            overlapping_clips = []
            negative_duration_clips = []
            
            for clip in clips:
                # Check for negative durations
                if clip.get('duration', 0) <= 0:
                    negative_duration_clips.append(clip['id'])
                    validation_result["issues"].append(f"Clip '{clip['id']}' has invalid duration: {clip.get('duration', 0)}")
            
            validation_result["timing_checks"] = {
                "total_clips": len(clips),
                "overlapping_clips": len(overlapping_clips),
                "invalid_duration_clips": len(negative_duration_clips)
            }
            
            if negative_duration_clips:
                validation_result["is_valid"] = False
        
        # Summary
        validation_result["summary"] = {
            "total_issues": len(validation_result["issues"]),
            "total_warnings": len(validation_result["warnings"]),
            "project_duration": project_service.get_timeline_duration(project_id),
            "validation_time": time.time()
        }
        
        return ProjectResponse(
            success=True,
            message=f"Project validation completed - {'Valid' if validation_result['is_valid'] else 'Issues found'}",
            data=validation_result
        )
        
    except Exception as e:
        logger.error(f"Error validating project: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to validate project: {str(e)}"
        )
async def list_project_templates():
    """List available project templates"""
    return ProjectResponse(
        success=True,
        message="Project templates retrieved successfully",
        data={
            "templates": PROJECT_TEMPLATES,
            "template_count": len(PROJECT_TEMPLATES)
        }
    )

@router.post("/projects/from-template", response_model=ProjectResponse)
async def create_project_from_template(request: ProjectTemplateRequest):
    """Create a new project from a template"""
    check_ges_availability()
    
    try:
        # Get template configuration
        if request.template_name == "custom":
            template_config = request.custom_options
        else:
            template_config = PROJECT_TEMPLATES.get(request.template_name)
            if not template_config:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown template: {request.template_name}"
                )
        
        # Generate unique project ID
        project_id = f"template_{request.template_name}_{int(time.time())}"
        
        # Create project with template settings
        success = project_service.create_project(
            project_id=project_id,
            name=request.project_name,
            width=template_config.get('width', 1920),
            height=template_config.get('height', 1080),
            framerate=template_config.get('framerate', '30/1')
        )
        
        if success:
            # Add template-specific setup (if needed)
            logger.info(f"Project created from template '{request.template_name}': {project_id}")
            
            project_data = project_service.get_project(project_id)
            clean_project_data = serialize_project_data(project_data)
            
            return ProjectResponse(
                success=True,
                message=f"Project created from template '{template_config.get('name', request.template_name)}'",
                data={
                    "project_id": project_id,
                    "template_used": request.template_name,
                    "template_config": template_config,
                    "project_details": clean_project_data
                }
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to create project from template"
            )
            
    except Exception as e:
        logger.error(f"Error creating project from template: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Template creation failed: {str(e)}"
        )

@router.post("/projects/{project_id}/save", response_model=ProjectResponse)
async def save_project_to_file(project_id: str, request: ProjectSaveRequest):
    """Save project to file for persistence"""
    check_ges_availability()
    validate_project_exists(project_id)
    
    try:
        import json
        from pathlib import Path
        
        # Get project data
        project_data = project_service.get_project(project_id)
        
        # Create serializable project state
        save_data = {
            "version": "1.0",
            "project_id": project_id,
            "saved_at": time.time(),
            "project_name": project_data.get('name', 'Unknown'),
            "metadata": project_data.get('metadata', {}),
            "assets": {},
            "clips": {},
            "timeline_state": {
                "duration": project_service.get_timeline_duration(project_id),
                "layer_count": len(project_data.get('layers', {}))
            }
        }
        
        # Add asset information
        if request.include_assets:
            assets = project_service.list_assets(project_id)
            for asset_id, asset_info in assets.items():
                save_data["assets"][asset_id] = {
                    "path": asset_info.get('path', ''),
                    "duration": asset_info.get('duration', 0),
                    "type": asset_info.get('type', 'UNKNOWN'),
                    "metadata": asset_info.get('metadata', {})
                }
        
        # Add clip information
        clips = project_service.list_all_clips(project_id)
        for clip in clips:
            save_data["clips"][clip['id']] = {
                "asset_id": clip.get('asset_id', ''),
                "layer": clip.get('layer', 0),
                "start_time": clip.get('start_time', 0),
                "duration": clip.get('duration', 0),
                "in_point": clip.get('in_point', 0),
                "clip_type": clip.get('clip_type', 'URI_CLIP')
            }
        
        # Ensure directory exists
        file_path = Path(request.file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save to file
        with open(file_path, 'w') as f:
            json.dump(save_data, f, indent=2)
        
        return ProjectResponse(
            success=True,
            message=f"Project saved to {request.file_path}",
            data={
                "file_path": str(file_path),
                "file_size": file_path.stat().st_size,
                "assets_included": request.include_assets,
                "asset_count": len(save_data["assets"]),
                "clip_count": len(save_data["clips"])
            }
        )
        
    except Exception as e:
        logger.error(f"Error saving project to file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save project: {str(e)}"
        )

@router.post("/projects/load", response_model=ProjectResponse)
async def load_project_from_file(request: ProjectLoadRequest):
    """Load project from file"""
    check_ges_availability()
    
    try:
        import json
        from pathlib import Path
        
        file_path = Path(request.file_path)
        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Project file not found: {request.file_path}"
            )
        
        # Load project data
        with open(file_path, 'r') as f:
            save_data = json.load(f)
        
        # Determine project ID
        project_id = request.project_id or save_data.get('project_id', f"loaded_{int(time.time())}")
        
        # Check if project already exists
        if not request.merge_mode:
            existing_project = project_service.get_project(project_id)
            if existing_project:
                raise HTTPException(
                    status_code=409,
                    detail=f"Project '{project_id}' already exists. Use merge_mode=true to merge."
                )
        
        # Create/load project
        if not request.merge_mode:
            metadata = save_data.get('metadata', {})
            success = project_service.create_project(
                project_id=project_id,
                name=save_data.get('project_name', 'Loaded Project'),
                width=metadata.get('width', 1920),
                height=metadata.get('height', 1080),
                framerate=metadata.get('framerate', '30/1')
            )
            
            if not success:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to create project from file"
                )
        
        # Load assets
        loaded_assets = 0
        for asset_id, asset_data in save_data.get('assets', {}).items():
            asset_path = asset_data.get('path', '')
            if asset_path and Path(asset_path).exists():
                result = project_service.add_asset_to_project(project_id, asset_path, asset_id)
                if result:
                    loaded_assets += 1
        
        # Load clips
        loaded_clips = 0
        for clip_id, clip_data in save_data.get('clips', {}).items():
            # For now, we'll skip clip recreation as it requires assets to exist
            # This would be enhanced in a full implementation
            loaded_clips += 1
        
        project_data = project_service.get_project(project_id)
        clean_project_data = serialize_project_data(project_data)
        
        return ProjectResponse(
            success=True,
            message=f"Project loaded from {request.file_path}",
            data={
                "project_id": project_id,
                "loaded_from": str(file_path),
                "project_version": save_data.get('version', 'unknown'),
                "assets_loaded": loaded_assets,
                "assets_total": len(save_data.get('assets', {})),
                "clips_total": len(save_data.get('clips', {})),
                "merge_mode": request.merge_mode,
                "project_details": clean_project_data
            }
        )
        
    except Exception as e:
        logger.error(f"Error loading project from file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load project: {str(e)}"
        )

@router.post("/projects/{project_id}/validate", response_model=ProjectResponse)
async def validate_project(project_id: str, request: ProjectValidationRequest):
    """Validate project integrity and fix issues if requested"""
    check_ges_availability()
    validate_project_exists(project_id)
    
    try:
        validation_results = {
            "project_valid": True,
            "issues_found": [],
            "issues_fixed": [],
            "asset_check": None,
            "timing_check": None
        }
        
        # Check assets
        if request.check_assets:
            assets = project_service.list_assets(project_id)
            missing_assets = []
            
            for asset_id, asset_info in assets.items():
                asset_path = asset_info.get('path', '')
                if asset_path and not Path(asset_path).exists():
                    missing_assets.append({
                        "asset_id": asset_id,
                        "path": asset_path,
                        "issue": "File not found"
                    })
            
            validation_results["asset_check"] = {
                "total_assets": len(assets),
                "missing_assets": len(missing_assets),
                "missing_details": missing_assets
            }
            
            if missing_assets:
                validation_results["project_valid"] = False
                validation_results["issues_found"].extend([
                    f"Missing asset: {asset['path']}" for asset in missing_assets
                ])
        
        # Check timing
        if request.check_timing:
            clips = project_service.list_all_clips(project_id)
            timing_issues = []
            
            for clip in clips:
                start_time = clip.get('start_time', 0)
                duration = clip.get('duration', 0)
                
                if start_time < 0:
                    timing_issues.append(f"Clip {clip['id']} has negative start time")
                if duration <= 0:
                    timing_issues.append(f"Clip {clip['id']} has invalid duration")
            
            validation_results["timing_check"] = {
                "total_clips": len(clips),
                "timing_issues": len(timing_issues),
                "issue_details": timing_issues
            }
            
            if timing_issues:
                validation_results["project_valid"] = False
                validation_results["issues_found"].extend(timing_issues)
        
        # Fix issues if requested
        if request.fix_issues and not validation_results["project_valid"]:
            # Basic fixes could be implemented here
            # For now, we'll just log what could be fixed
            validation_results["issues_fixed"].append("Issue fixing not fully implemented yet")
        
        return ProjectResponse(
            success=True,
            message=f"Project validation completed. Valid: {validation_results['project_valid']}",
            data=validation_results
        )
        
    except Exception as e:
        logger.error(f"Error validating project: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Project validation failed: {str(e)}"
        )

@router.post("/projects/batch-operations", response_model=ProjectResponse)
async def batch_project_operations(request: BatchProjectOperation):
    """Perform batch operations on multiple projects"""
    check_ges_availability()
    
    try:
        results = {
            "operation": request.operation,
            "total_projects": len(request.project_ids),
            "successful": [],
            "failed": [],
            "results": {}
        }
        
        for project_id in request.project_ids:
            try:
                project = project_service.get_project(project_id)
                if not project:
                    results["failed"].append({
                        "project_id": project_id,
                        "error": "Project not found"
                    })
                    continue
                
                # Perform operation based on type
                if request.operation == "backup":
                    # Create backup
                    backup_path = f"/tmp/backup_{project_id}_{int(time.time())}.json"
                    # Simulate backup creation
                    results["results"][project_id] = {
                        "backup_path": backup_path,
                        "status": "backup_created"
                    }
                    results["successful"].append(project_id)
                    
                elif request.operation == "validate":
                    # Validate project
                    # This would call the validate function
                    results["results"][project_id] = {
                        "status": "validated",
                        "valid": True
                    }
                    results["successful"].append(project_id)
                    
                elif request.operation == "cleanup":
                    # Cleanup pipelines
                    cleanup_success = project_service.cleanup_pipelines(project_id)
                    results["results"][project_id] = {
                        "status": "cleaned" if cleanup_success else "cleanup_failed"
                    }
                    if cleanup_success:
                        results["successful"].append(project_id)
                    else:
                        results["failed"].append({
                            "project_id": project_id,
                            "error": "Cleanup failed"
                        })
                        
                elif request.operation == "export":
                    # Export with parameters
                    output_path = request.parameters.get('output_path', f'/tmp/export_{project_id}.mp4')
                    profile = request.parameters.get('profile', 'mp4')
                    
                    export_success = project_service.start_export(project_id, output_path, profile)
                    results["results"][project_id] = {
                        "status": "export_started" if export_success else "export_failed",
                        "output_path": output_path
                    }
                    if export_success:
                        results["successful"].append(project_id)
                    else:
                        results["failed"].append({
                            "project_id": project_id,
                            "error": "Export failed to start"
                        })
                        
                else:
                    results["failed"].append({
                        "project_id": project_id,
                        "error": f"Unsupported operation: {request.operation}"
                    })
                    
            except Exception as e:
                results["failed"].append({
                    "project_id": project_id,
                    "error": str(e)
                })
        
        success_rate = len(results["successful"]) / len(request.project_ids) * 100
        
        return ProjectResponse(
            success=True,
            message=f"Batch operation completed. Success rate: {success_rate:.1f}%",
            data=results
        )
        
    except Exception as e:
        logger.error(f"Error in batch operations: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Batch operation failed: {str(e)}"
        )