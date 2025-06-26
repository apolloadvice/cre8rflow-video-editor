from app.executor_handlers.base import BaseOperationHandler
from app.command_types import EditOperation
from app.executor_types import ExecutionResult
from app.timeline import Effect
import logging
import random

class BatchTextHandler(BaseOperationHandler):
    """
    Handler for batch text operations that affect multiple clips.
    Processes commands with target="each_clip" for adding text/captions.
    """
    
    def can_handle(self, operation: EditOperation) -> bool:
        return (operation.type == "BATCH_TEXT" or 
                (operation.type == "ADD_TEXT" and operation.parameters.get("target") == "each_clip"))

    def execute(self, operation: EditOperation, executor) -> ExecutionResult:
        """
        Execute batch text operation on all clips in the timeline.
        For demo purposes, this adds text overlays to each clip with specified style.
        """
        timeline = executor.timeline
        frame_rate = timeline.frame_rate
        
        # Get batch text parameters
        style = operation.parameters.get("style", "subtitle")
        text = operation.parameters.get("text", "AUTO_GENERATE")
        position = operation.parameters.get("position", "center")
        
        # Get all video clips from all tracks
        all_clips = []
        for track in timeline.tracks:
            if track.track_type == "video":
                all_clips.extend(track.clips)
        
        if not all_clips:
            return ExecutionResult(False, "No video clips found to apply batch text operation.")
        
        processed_clips = []
        
        # Style-specific text generation
        style_texts = {
            "banger": [
                "🔥 FIRE CONTENT 🔥",
                "💯 ABSOLUTE UNIT 💯", 
                "🚀 INSANE 🚀",
                "⚡ NO CAP ⚡",
                "🎯 HITS DIFFERENT 🎯",
                "💪 BEAST MODE 💪",
                "🌟 LEGENDARY 🌟",
                "🔥 THIS IS IT 🔥"
            ],
            "subtitle": [
                "Check this out",
                "Amazing moment",
                "Watch this",
                "Incredible",
                "Here we go",
                "Perfect timing",
                "Look at this",
                "Unbelievable"
            ],
            "title": [
                "MAIN CLIP",
                "FEATURED MOMENT", 
                "HIGHLIGHT REEL",
                "BEST PART",
                "KEY MOMENT",
                "MUST WATCH",
                "EPIC CLIP",
                "VIRAL MOMENT"
            ]
        }
        
        texts_for_style = style_texts.get(style, style_texts["subtitle"])
        
        for i, clip in enumerate(all_clips):
            # Generate or use provided text
            if text == "AUTO_GENERATE":
                # Use different text for each clip
                clip_text = texts_for_style[i % len(texts_for_style)]
            else:
                clip_text = text
            
            # Create text effect with style-specific properties
            effect_params = {
                "text": clip_text,
                "position": position,
                "style": style
            }
            
            # Style-specific customizations
            if style == "banger":
                effect_params.update({
                    "font_size": 24,
                    "font_weight": "bold",
                    "color": "#FF6B35",
                    "outline": True,
                    "animation": "bounce"
                })
            elif style == "subtitle":
                effect_params.update({
                    "font_size": 16,
                    "color": "#FFFFFF",
                    "background": "rgba(0,0,0,0.7)",
                    "position": "bottom"
                })
            elif style == "title":
                effect_params.update({
                    "font_size": 32,
                    "font_weight": "bold",
                    "color": "#FFD700",
                    "position": "top",
                    "animation": "fade_in"
                })
            
            # Create text overlay effect
            text_effect = Effect(
                effect_type="textOverlay",
                params=effect_params,
                start=clip.start,
                end=clip.end
            )
            
            # Add effect to clip
            clip.add_effect(text_effect)
            
            processed_clips.append({
                'name': clip.name,
                'text': clip_text,
                'style': style,
                'position': position
            })
            
            logging.info(f"[BatchTextHandler] Added text '{clip_text}' to clip '{clip.name}' with style '{style}'")
        
        # Notify timeline of changes
        timeline._notify_change()
        
        summary = f"Added {style} text to {len(processed_clips)} clips"
        
        return ExecutionResult(
            True, 
            summary,
            data={
                'processed_clips': processed_clips,
                'logs': [f"Processed {len(processed_clips)} clips with batch text operation (style: {style})"]
            }
        ) 