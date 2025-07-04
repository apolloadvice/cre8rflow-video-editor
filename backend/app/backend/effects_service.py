#!/usr/bin/env python3

"""
GES Professional Effects Service
Provides professional video editing effects using GStreamer Editing Services
"""

import logging
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass
from enum import Enum
import threading
import json

# Import GES with fallback to stubs
try:
    import gi
    gi.require_version('Gst', '1.0')
    gi.require_version('GES', '1.0')
    from gi.repository import Gst, GES
    GES_AVAILABLE = True
except ImportError:
    GES_AVAILABLE = False
    # Use stub classes when GES not available
    from .ges_service import MockGst as Gst, MockGES as GES

logger = logging.getLogger(__name__)

class EffectCategory(Enum):
    """Effect categories for organization"""
    COLOR = "color"
    TRANSFORM = "transform"
    FILTER = "filter"
    AUDIO = "audio"
    TRANSITION = "transition"
    GENERATOR = "generator"

class EffectType(Enum):
    """Available GES effect types"""
    # Color Effects
    BRIGHTNESS_CONTRAST = "brightness-contrast"
    GAMMA = "gamma"
    COLOR_BALANCE = "color-balance"
    HUE_SATURATION = "hue-saturation"
    
    # Transform Effects
    SCALE = "scale"
    ROTATE = "rotate"
    CROP = "crop"
    FLIP = "flip"
    
    # Filter Effects
    BLUR = "blur"
    SHARPEN = "sharpen"
    NOISE = "noise"
    EDGE_DETECT = "edge-detect"
    
    # Audio Effects
    VOLUME = "volume"
    PITCH = "pitch"
    REVERB = "reverb"
    ECHO = "echo"
    
    # Transitions
    CROSSFADE = "crossfade"
    WIPE = "wipe"
    SLIDE = "slide"
    
    # Generators
    COLOR_GENERATOR = "color-generator"
    TEST_PATTERN = "test-pattern"

@dataclass
class EffectDefinition:
    """Definition of an available effect"""
    effect_type: EffectType
    name: str
    description: str
    category: EffectCategory
    properties: Dict[str, Any]
    gst_element: str  # GStreamer element name
    
@dataclass
class EffectInstance:
    """Instance of an effect applied to a clip"""
    id: str
    effect_type: EffectType
    clip_id: str
    properties: Dict[str, Any]
    enabled: bool = True
    order: int = 0  # Effect processing order

class GESEffectsService:
    """Professional effects service using GES built-in effects"""
    
    def __init__(self):
        self._effects_registry: Dict[EffectType, EffectDefinition] = {}
        self._applied_effects: Dict[str, List[EffectInstance]] = {}  # clip_id -> effects
        self._lock = threading.Lock()
        self._ges_initialized = False
        
        # Initialize effect definitions
        self._init_effect_definitions()
        
    def _init_effect_definitions(self):
        """Initialize the registry of available effects"""
        
        # Color Effects
        self._effects_registry[EffectType.BRIGHTNESS_CONTRAST] = EffectDefinition(
            effect_type=EffectType.BRIGHTNESS_CONTRAST,
            name="Brightness & Contrast",
            description="Adjust brightness and contrast levels",
            category=EffectCategory.COLOR,
            properties={
                "brightness": {"type": "float", "default": 0.0, "min": -1.0, "max": 1.0},
                "contrast": {"type": "float", "default": 1.0, "min": 0.0, "max": 2.0}
            },
            gst_element="videobalance"
        )
        
        self._effects_registry[EffectType.HUE_SATURATION] = EffectDefinition(
            effect_type=EffectType.HUE_SATURATION,
            name="Hue & Saturation",
            description="Adjust hue and saturation",
            category=EffectCategory.COLOR,
            properties={
                "hue": {"type": "float", "default": 0.0, "min": -180.0, "max": 180.0},
                "saturation": {"type": "float", "default": 1.0, "min": 0.0, "max": 2.0}
            },
            gst_element="videobalance"
        )
        
        # Transform Effects
        self._effects_registry[EffectType.SCALE] = EffectDefinition(
            effect_type=EffectType.SCALE,
            name="Scale",
            description="Scale and position video",
            category=EffectCategory.TRANSFORM,
            properties={
                "scale_x": {"type": "float", "default": 1.0, "min": 0.1, "max": 5.0},
                "scale_y": {"type": "float", "default": 1.0, "min": 0.1, "max": 5.0},
                "pos_x": {"type": "float", "default": 0.0, "min": -1.0, "max": 1.0},
                "pos_y": {"type": "float", "default": 0.0, "min": -1.0, "max": 1.0}
            },
            gst_element="videoscale"
        )
        
        self._effects_registry[EffectType.ROTATE] = EffectDefinition(
            effect_type=EffectType.ROTATE,
            name="Rotate",
            description="Rotate video around center",
            category=EffectCategory.TRANSFORM,
            properties={
                "angle": {"type": "float", "default": 0.0, "min": -360.0, "max": 360.0}
            },
            gst_element="videoflip"
        )
        
        # Filter Effects
        self._effects_registry[EffectType.BLUR] = EffectDefinition(
            effect_type=EffectType.BLUR,
            name="Blur",
            description="Apply gaussian blur",
            category=EffectCategory.FILTER,
            properties={
                "sigma": {"type": "float", "default": 1.0, "min": 0.0, "max": 10.0}
            },
            gst_element="gaussianblur"
        )
        
        # Audio Effects
        self._effects_registry[EffectType.VOLUME] = EffectDefinition(
            effect_type=EffectType.VOLUME,
            name="Volume",
            description="Adjust audio volume",
            category=EffectCategory.AUDIO,
            properties={
                "volume": {"type": "float", "default": 1.0, "min": 0.0, "max": 3.0}
            },
            gst_element="volume"
        )
        
        logger.info(f"Initialized {len(self._effects_registry)} effect definitions")
    
    def get_available_effects(self) -> Dict[str, Any]:
        """Get all available effects organized by category"""
        effects_by_category = {}
        
        for effect_type, definition in self._effects_registry.items():
            category = definition.category.value
            if category not in effects_by_category:
                effects_by_category[category] = []
            
            effects_by_category[category].append({
                "type": effect_type.value,
                "name": definition.name,
                "description": definition.description,
                "properties": definition.properties
            })
        
        return effects_by_category
    
    def add_effect_to_clip(self, project_id: str, clip_id: str, 
                          effect_type: str, properties: Dict[str, Any] = None) -> Optional[str]:
        """Add an effect to a specific clip"""
        with self._lock:
            try:
                # Validate effect type
                try:
                    effect_enum = EffectType(effect_type)
                except ValueError:
                    logger.error(f"Unknown effect type: {effect_type}")
                    return None
                
                if effect_enum not in self._effects_registry:
                    logger.error(f"Effect type not registered: {effect_type}")
                    return None
                
                effect_def = self._effects_registry[effect_enum]
                
                # Create effect instance
                effect_id = f"effect_{clip_id}_{len(self._applied_effects.get(clip_id, []))}"
                effect_instance = EffectInstance(
                    id=effect_id,
                    effect_type=effect_enum,
                    clip_id=clip_id,
                    properties=properties or {},
                    order=len(self._applied_effects.get(clip_id, []))
                )
                
                # Store effect
                if clip_id not in self._applied_effects:
                    self._applied_effects[clip_id] = []
                self._applied_effects[clip_id].append(effect_instance)
                
                # Apply to GES timeline if available
                if GES_AVAILABLE:
                    self._apply_ges_effect(effect_instance, effect_def)
                
                logger.info(f"Added effect {effect_type} to clip {clip_id}")
                return effect_id
                
            except Exception as e:
                logger.error(f"Error adding effect: {e}")
                return None
    
    def _apply_ges_effect(self, effect_instance: EffectInstance, effect_def: EffectDefinition):
        """Apply effect to GES timeline"""
        try:
            # This would integrate with the GES timeline service
            # For now, we store the effect and let the timeline service handle application
            logger.info(f"GES effect application: {effect_def.gst_element} with {effect_instance.properties}")
            
        except Exception as e:
            logger.error(f"Error applying GES effect: {e}")
    
    def remove_effect_from_clip(self, clip_id: str, effect_id: str) -> bool:
        """Remove an effect from a clip"""
        with self._lock:
            try:
                if clip_id not in self._applied_effects:
                    return False
                
                # Find and remove effect
                effects = self._applied_effects[clip_id]
                for i, effect in enumerate(effects):
                    if effect.id == effect_id:
                        effects.pop(i)
                        logger.info(f"Removed effect {effect_id} from clip {clip_id}")
                        return True
                
                return False
                
            except Exception as e:
                logger.error(f"Error removing effect: {e}")
                return False
    
    def update_effect_properties(self, clip_id: str, effect_id: str, 
                                properties: Dict[str, Any]) -> bool:
        """Update effect properties"""
        with self._lock:
            try:
                if clip_id not in self._applied_effects:
                    return False
                
                # Find and update effect
                for effect in self._applied_effects[clip_id]:
                    if effect.id == effect_id:
                        effect.properties.update(properties)
                        
                        # Re-apply to GES if available
                        if GES_AVAILABLE:
                            effect_def = self._effects_registry[effect.effect_type]
                            self._apply_ges_effect(effect, effect_def)
                        
                        logger.info(f"Updated effect {effect_id} properties")
                        return True
                
                return False
                
            except Exception as e:
                logger.error(f"Error updating effect: {e}")
                return False
    
    def get_clip_effects(self, clip_id: str) -> List[Dict[str, Any]]:
        """Get all effects applied to a clip"""
        with self._lock:
            if clip_id not in self._applied_effects:
                return []
            
            effects_data = []
            for effect in self._applied_effects[clip_id]:
                effect_def = self._effects_registry[effect.effect_type]
                effects_data.append({
                    "id": effect.id,
                    "type": effect.effect_type.value,
                    "name": effect_def.name,
                    "category": effect_def.category.value,
                    "properties": effect.properties,
                    "enabled": effect.enabled,
                    "order": effect.order
                })
            
            return sorted(effects_data, key=lambda x: x["order"])
    
    def reorder_effects(self, clip_id: str, effect_ids: List[str]) -> bool:
        """Reorder effects for a clip"""
        with self._lock:
            try:
                if clip_id not in self._applied_effects:
                    return False
                
                effects = self._applied_effects[clip_id]
                
                # Create mapping of effect_id to effect
                effect_map = {effect.id: effect for effect in effects}
                
                # Reorder effects based on provided order
                reordered_effects = []
                for i, effect_id in enumerate(effect_ids):
                    if effect_id in effect_map:
                        effect = effect_map[effect_id]
                        effect.order = i
                        reordered_effects.append(effect)
                
                self._applied_effects[clip_id] = reordered_effects
                logger.info(f"Reordered {len(reordered_effects)} effects for clip {clip_id}")
                return True
                
            except Exception as e:
                logger.error(f"Error reordering effects: {e}")
                return False
    
    def toggle_effect(self, clip_id: str, effect_id: str) -> bool:
        """Toggle effect enabled/disabled"""
        with self._lock:
            try:
                if clip_id not in self._applied_effects:
                    return False
                
                for effect in self._applied_effects[clip_id]:
                    if effect.id == effect_id:
                        effect.enabled = not effect.enabled
                        logger.info(f"Toggled effect {effect_id} to {effect.enabled}")
                        return True
                
                return False
                
            except Exception as e:
                logger.error(f"Error toggling effect: {e}")
                return False
    
    def get_effect_presets(self) -> Dict[str, Any]:
        """Get predefined effect presets"""
        return {
            "cinematic": {
                "name": "Cinematic Look",
                "description": "Professional cinematic color grading",
                "effects": [
                    {
                        "type": EffectType.BRIGHTNESS_CONTRAST.value,
                        "properties": {"brightness": 0.1, "contrast": 1.2}
                    },
                    {
                        "type": EffectType.HUE_SATURATION.value,
                        "properties": {"saturation": 1.3}
                    }
                ]
            },
            "vintage": {
                "name": "Vintage Film",
                "description": "Retro film look with warmth",
                "effects": [
                    {
                        "type": EffectType.HUE_SATURATION.value,
                        "properties": {"hue": 15.0, "saturation": 0.8}
                    },
                    {
                        "type": EffectType.BRIGHTNESS_CONTRAST.value,
                        "properties": {"brightness": -0.1, "contrast": 1.1}
                    }
                ]
            },
            "black_white": {
                "name": "Black & White",
                "description": "Classic monochrome look",
                "effects": [
                    {
                        "type": EffectType.HUE_SATURATION.value,
                        "properties": {"saturation": 0.0}
                    },
                    {
                        "type": EffectType.BRIGHTNESS_CONTRAST.value,
                        "properties": {"contrast": 1.2}
                    }
                ]
            }
        }
    
    def apply_preset(self, project_id: str, clip_id: str, preset_name: str) -> List[str]:
        """Apply a preset to a clip"""
        presets = self.get_effect_presets()
        if preset_name not in presets:
            logger.error(f"Unknown preset: {preset_name}")
            return []
        
        preset = presets[preset_name]
        applied_effect_ids = []
        
        for effect_data in preset["effects"]:
            effect_id = self.add_effect_to_clip(
                project_id, clip_id, 
                effect_data["type"], 
                effect_data["properties"]
            )
            if effect_id:
                applied_effect_ids.append(effect_id)
        
        logger.info(f"Applied preset '{preset_name}' to clip {clip_id}")
        return applied_effect_ids
    
    def clear_clip_effects(self, clip_id: str) -> bool:
        """Clear all effects from a clip"""
        with self._lock:
            try:
                if clip_id in self._applied_effects:
                    effect_count = len(self._applied_effects[clip_id])
                    del self._applied_effects[clip_id]
                    logger.info(f"Cleared {effect_count} effects from clip {clip_id}")
                    return True
                return False
                
            except Exception as e:
                logger.error(f"Error clearing effects: {e}")
                return False

# Global service instance
_effects_service_instance: Optional[GESEffectsService] = None

def get_effects_service() -> GESEffectsService:
    """Get or create the global effects service instance"""
    global _effects_service_instance
    if _effects_service_instance is None:
        _effects_service_instance = GESEffectsService()
    return _effects_service_instance 