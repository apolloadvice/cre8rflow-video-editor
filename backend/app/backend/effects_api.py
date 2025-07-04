#!/usr/bin/env python3

"""
GES Effects API Endpoints
Provides RESTful API for professional video effects management
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging

from .effects_service import get_effects_service, GESEffectsService
from .ges_service import is_ges_available

router = APIRouter(prefix="/effects", tags=["effects"])
logger = logging.getLogger(__name__)

# ==================== REQUEST/RESPONSE MODELS ====================

class EffectProperty(BaseModel):
    type: str  # "float", "int", "bool", "string"
    default: Any
    min: Optional[Any] = None
    max: Optional[Any] = None
    description: Optional[str] = None

class EffectDefinition(BaseModel):
    type: str
    name: str
    description: str
    category: str
    properties: Dict[str, EffectProperty]

class EffectInstance(BaseModel):
    id: str
    type: str
    name: str
    category: str
    properties: Dict[str, Any]
    enabled: bool
    order: int

class AddEffectRequest(BaseModel):
    effect_type: str
    properties: Dict[str, Any] = {}

class UpdateEffectRequest(BaseModel):
    properties: Dict[str, Any]

class ReorderEffectsRequest(BaseModel):
    effect_ids: List[str]

class ApplyPresetRequest(BaseModel):
    preset_name: str

class EffectsResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Any] = None

# ==================== DEPENDENCY INJECTION ====================

def get_effects_service_dep() -> GESEffectsService:
    """Dependency to get effects service"""
    return get_effects_service()

def check_ges_availability():
    """Check if GES is available and raise HTTPException if not"""
    if not is_ges_available():
        raise HTTPException(
            status_code=503, 
            detail="GStreamer Editing Services not available. Install with: ./install_ges.sh (macOS) or apt-get install python3-gi (Ubuntu)"
        )

# ==================== EFFECTS LIBRARY ENDPOINTS ====================

@router.get("/library", response_model=EffectsResponse)
async def get_effects_library(effects_service: GESEffectsService = Depends(get_effects_service_dep)):
    """
    Get the library of available effects organized by category
    """
    try:
        effects_library = effects_service.get_available_effects()
        
        return EffectsResponse(
            success=True,
            message="Effects library retrieved successfully",
            data={
                "categories": effects_library,
                "total_effects": sum(len(effects) for effects in effects_library.values())
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting effects library: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get effects library: {str(e)}")

@router.get("/presets", response_model=EffectsResponse)
async def get_effect_presets(effects_service: GESEffectsService = Depends(get_effects_service_dep)):
    """
    Get available effect presets
    """
    try:
        presets = effects_service.get_effect_presets()
        
        return EffectsResponse(
            success=True,
            message="Effect presets retrieved successfully",
            data={
                "presets": presets,
                "total_presets": len(presets)
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting effect presets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get effect presets: {str(e)}")

# ==================== CLIP EFFECTS MANAGEMENT ====================

@router.get("/clips/{clip_id}", response_model=EffectsResponse)
async def get_clip_effects(
    clip_id: str,
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Get all effects applied to a specific clip
    """
    try:
        effects = effects_service.get_clip_effects(clip_id)
        
        return EffectsResponse(
            success=True,
            message=f"Retrieved {len(effects)} effects for clip {clip_id}",
            data={
                "clip_id": clip_id,
                "effects": effects,
                "total_effects": len(effects)
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting clip effects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get clip effects: {str(e)}")

@router.post("/clips/{clip_id}/add", response_model=EffectsResponse)
async def add_effect_to_clip(
    clip_id: str,
    request: AddEffectRequest,
    project_id: str = "default",  # TODO: Get from session/context
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Add an effect to a specific clip
    """
    check_ges_availability()
    
    try:
        effect_id = effects_service.add_effect_to_clip(
            project_id, clip_id, request.effect_type, request.properties
        )
        
        if effect_id:
            return EffectsResponse(
                success=True,
                message=f"Effect {request.effect_type} added to clip {clip_id}",
                data={
                    "effect_id": effect_id,
                    "clip_id": clip_id,
                    "effect_type": request.effect_type,
                    "properties": request.properties
                }
            )
        else:
            raise HTTPException(status_code=400, detail="Failed to add effect")
            
    except Exception as e:
        logger.error(f"Error adding effect to clip: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add effect: {str(e)}")

@router.delete("/clips/{clip_id}/effects/{effect_id}", response_model=EffectsResponse)
async def remove_effect_from_clip(
    clip_id: str,
    effect_id: str,
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Remove an effect from a clip
    """
    try:
        success = effects_service.remove_effect_from_clip(clip_id, effect_id)
        
        if success:
            return EffectsResponse(
                success=True,
                message=f"Effect {effect_id} removed from clip {clip_id}",
                data={
                    "effect_id": effect_id,
                    "clip_id": clip_id
                }
            )
        else:
            raise HTTPException(status_code=404, detail="Effect not found")
            
    except Exception as e:
        logger.error(f"Error removing effect: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove effect: {str(e)}")

@router.put("/clips/{clip_id}/effects/{effect_id}", response_model=EffectsResponse)
async def update_effect_properties(
    clip_id: str,
    effect_id: str,
    request: UpdateEffectRequest,
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Update effect properties
    """
    try:
        success = effects_service.update_effect_properties(
            clip_id, effect_id, request.properties
        )
        
        if success:
            return EffectsResponse(
                success=True,
                message=f"Effect {effect_id} properties updated",
                data={
                    "effect_id": effect_id,
                    "clip_id": clip_id,
                    "properties": request.properties
                }
            )
        else:
            raise HTTPException(status_code=404, detail="Effect not found")
            
    except Exception as e:
        logger.error(f"Error updating effect properties: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update effect: {str(e)}")

@router.post("/clips/{clip_id}/effects/{effect_id}/toggle", response_model=EffectsResponse)
async def toggle_effect(
    clip_id: str,
    effect_id: str,
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Toggle effect enabled/disabled
    """
    try:
        success = effects_service.toggle_effect(clip_id, effect_id)
        
        if success:
            return EffectsResponse(
                success=True,
                message=f"Effect {effect_id} toggled",
                data={
                    "effect_id": effect_id,
                    "clip_id": clip_id
                }
            )
        else:
            raise HTTPException(status_code=404, detail="Effect not found")
            
    except Exception as e:
        logger.error(f"Error toggling effect: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to toggle effect: {str(e)}")

@router.post("/clips/{clip_id}/reorder", response_model=EffectsResponse)
async def reorder_clip_effects(
    clip_id: str,
    request: ReorderEffectsRequest,
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Reorder effects for a clip
    """
    try:
        success = effects_service.reorder_effects(clip_id, request.effect_ids)
        
        if success:
            return EffectsResponse(
                success=True,
                message=f"Effects reordered for clip {clip_id}",
                data={
                    "clip_id": clip_id,
                    "effect_order": request.effect_ids
                }
            )
        else:
            raise HTTPException(status_code=400, detail="Failed to reorder effects")
            
    except Exception as e:
        logger.error(f"Error reordering effects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reorder effects: {str(e)}")

@router.delete("/clips/{clip_id}/clear", response_model=EffectsResponse)
async def clear_clip_effects(
    clip_id: str,
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Clear all effects from a clip
    """
    try:
        success = effects_service.clear_clip_effects(clip_id)
        
        if success:
            return EffectsResponse(
                success=True,
                message=f"All effects cleared from clip {clip_id}",
                data={
                    "clip_id": clip_id
                }
            )
        else:
            return EffectsResponse(
                success=True,
                message=f"No effects to clear for clip {clip_id}",
                data={
                    "clip_id": clip_id
                }
            )
            
    except Exception as e:
        logger.error(f"Error clearing effects: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear effects: {str(e)}")

# ==================== PRESET MANAGEMENT ====================

@router.post("/clips/{clip_id}/apply-preset", response_model=EffectsResponse)
async def apply_preset_to_clip(
    clip_id: str,
    request: ApplyPresetRequest,
    project_id: str = "default",  # TODO: Get from session/context
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Apply an effect preset to a clip
    """
    check_ges_availability()
    
    try:
        applied_effect_ids = effects_service.apply_preset(
            project_id, clip_id, request.preset_name
        )
        
        if applied_effect_ids:
            return EffectsResponse(
                success=True,
                message=f"Preset '{request.preset_name}' applied to clip {clip_id}",
                data={
                    "clip_id": clip_id,
                    "preset_name": request.preset_name,
                    "applied_effects": applied_effect_ids,
                    "total_effects": len(applied_effect_ids)
                }
            )
        else:
            raise HTTPException(status_code=400, detail=f"Failed to apply preset '{request.preset_name}'")
            
    except Exception as e:
        logger.error(f"Error applying preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to apply preset: {str(e)}")

# ==================== BULK OPERATIONS ====================

@router.post("/clips/bulk/add", response_model=EffectsResponse)
async def add_effect_to_multiple_clips(
    clip_ids: List[str],
    request: AddEffectRequest,
    project_id: str = "default",  # TODO: Get from session/context
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Add the same effect to multiple clips
    """
    check_ges_availability()
    
    try:
        results = {}
        success_count = 0
        
        for clip_id in clip_ids:
            effect_id = effects_service.add_effect_to_clip(
                project_id, clip_id, request.effect_type, request.properties
            )
            results[clip_id] = effect_id
            if effect_id:
                success_count += 1
        
        return EffectsResponse(
            success=success_count > 0,
            message=f"Effect {request.effect_type} added to {success_count}/{len(clip_ids)} clips",
            data={
                "effect_type": request.effect_type,
                "properties": request.properties,
                "results": results,
                "success_count": success_count,
                "total_clips": len(clip_ids)
            }
        )
        
    except Exception as e:
        logger.error(f"Error adding effect to multiple clips: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add effect to clips: {str(e)}")

@router.post("/clips/bulk/apply-preset", response_model=EffectsResponse)
async def apply_preset_to_multiple_clips(
    clip_ids: List[str],
    request: ApplyPresetRequest,
    project_id: str = "default",  # TODO: Get from session/context
    effects_service: GESEffectsService = Depends(get_effects_service_dep)
):
    """
    Apply an effect preset to multiple clips
    """
    check_ges_availability()
    
    try:
        results = {}
        success_count = 0
        
        for clip_id in clip_ids:
            applied_effect_ids = effects_service.apply_preset(
                project_id, clip_id, request.preset_name
            )
            results[clip_id] = applied_effect_ids
            if applied_effect_ids:
                success_count += 1
        
        return EffectsResponse(
            success=success_count > 0,
            message=f"Preset '{request.preset_name}' applied to {success_count}/{len(clip_ids)} clips",
            data={
                "preset_name": request.preset_name,
                "results": results,
                "success_count": success_count,
                "total_clips": len(clip_ids)
            }
        )
        
    except Exception as e:
        logger.error(f"Error applying preset to multiple clips: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to apply preset to clips: {str(e)}")

# ==================== SYSTEM STATUS ====================

@router.get("/status", response_model=EffectsResponse)
async def get_effects_system_status(effects_service: GESEffectsService = Depends(get_effects_service_dep)):
    """
    Get effects system status and capabilities
    """
    try:
        effects_library = effects_service.get_available_effects()
        presets = effects_service.get_effect_presets()
        
        return EffectsResponse(
            success=True,
            message="Effects system status retrieved",
            data={
                "ges_available": is_ges_available(),
                "total_effects": sum(len(effects) for effects in effects_library.values()),
                "total_categories": len(effects_library),
                "total_presets": len(presets),
                "categories": list(effects_library.keys()),
                "system_ready": True
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting effects system status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get system status: {str(e)}") 