"""
CutOut Command Handler for LLM-First Intent Recognition

Processes standardized cut_out commands from LLM parser with confidence scoring.
Handles cut operations that split clips, delete segments, and maintain sequential playback.
"""
import os
from typing import Dict, Any, Optional, List
from app.command_handlers.base import BaseCommandHandler
from app.command_types import EditOperation
from app.llm_parser import parse_command_with_llm
import logging

LOG_FILE = os.path.join(os.path.dirname(__file__), '../llm_parser.log')
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)

class CutOutCommandHandler(BaseCommandHandler):
    """
    Handles cut_out operations using LLM-first approach.
    Processes standardized command format from LLM parser.
    """
    
    def match(self, command_text: str) -> bool:
        """
        Match cut out variations using LLM intelligence instead of regex.
        Returns True if LLM identifies this as a cut_out intent with sufficient confidence.
        """
        try:
            # Use LLM to determine intent and confidence
            parsed_command, error = parse_command_with_llm(command_text, duration=60.0)
            
            if error or not parsed_command:
                logging.info(f"[CutOut Handler] LLM parsing failed for: {command_text}")
                return False
            
            # Check if this is a cut_out intent with sufficient confidence
            is_cut_out = parsed_command.get('intent') == 'cut_out'
            confidence = parsed_command.get('confidence', 0.0)
            
            # Require minimum 70% confidence for cut_out operations
            is_confident = confidence >= 0.7
            
            logging.info(f"[CutOut Handler] Command: {command_text}")
            logging.info(f"[CutOut Handler] Intent: {parsed_command.get('intent')}, Confidence: {confidence}")
            logging.info(f"[CutOut Handler] Match result: {is_cut_out and is_confident}")
            
            return is_cut_out and is_confident
            
        except Exception as e:
            logging.error(f"[CutOut Handler] Error in match(): {e}")
            return False
    
    def parse(self, command_text: str, frame_rate: int = 30) -> EditOperation:
        """
        Parse cut_out command using LLM-first approach.
        Returns EditOperation with standardized parameters.
        """
        try:
            # Get current timeline duration (fallback to 60s if not available)
            timeline_duration = getattr(self, '_timeline_duration', 60.0)
            
            # Use LLM to parse the command
            parsed_command, error = parse_command_with_llm(command_text, duration=timeline_duration)
            
            if error or not parsed_command:
                logging.error(f"[CutOut Handler] LLM parse failed: {error}")
                return EditOperation(type_="UNKNOWN", parameters={"raw": command_text, "error": error})
            
            # Extract standardized parameters
            intent = parsed_command.get('intent')
            target = parsed_command.get('target', 'timeline')
            start_time = parsed_command.get('start_time', 0)
            end_time = parsed_command.get('end_time', 0)
            confidence = parsed_command.get('confidence', 0.0)
            parameters = parsed_command.get('parameters', {})
            
            # Validate the parsed command
            if intent != 'cut_out':
                logging.error(f"[CutOut Handler] Expected cut_out intent, got: {intent}")
                return EditOperation(type_="UNKNOWN", parameters={"raw": command_text})
            
            if start_time >= end_time:
                logging.error(f"[CutOut Handler] Invalid time range: {start_time} >= {end_time}")
                return EditOperation(type_="UNKNOWN", parameters={"raw": command_text, "error": "Invalid time range"})
            
            # Convert seconds to frames for backend processing
            start_frame = int(start_time * frame_rate)
            end_frame = int(end_time * frame_rate)
            
            # Build operation parameters
            operation_params = {
                'start_time': start_time,
                'end_time': end_time,
                'start_frame': start_frame,
                'end_frame': end_frame,
                'confidence': confidence,
                'preserve_timing': parameters.get('preserve_timing', True),
                'create_gap': parameters.get('create_gap', False),
                'llm_parsed': True,
                'original_command': command_text
            }
            
            logging.info(f"[CutOut Handler] Successfully parsed cut_out command:")
            logging.info(f"[CutOut Handler] Time range: {start_time}s - {end_time}s")
            logging.info(f"[CutOut Handler] Frame range: {start_frame} - {end_frame}")
            logging.info(f"[CutOut Handler] Confidence: {confidence}")
            logging.info(f"[CutOut Handler] Parameters: {parameters}")
            
            return EditOperation(
                type_="CUT_OUT",
                target=target,
                parameters=operation_params
            )
            
        except Exception as e:
            logging.error(f"[CutOut Handler] Error in parse(): {e}")
            return EditOperation(
                type_="UNKNOWN", 
                parameters={
                    "raw": command_text, 
                    "error": str(e)
                }
            )
    
    def set_timeline_duration(self, duration: float):
        """
        Set the current timeline duration for context-aware parsing.
        This helps the LLM understand relative time expressions.
        """
        self._timeline_duration = duration
        logging.info(f"[CutOut Handler] Timeline duration set to: {duration}s")
    
    def validate_cut_operation(self, start_time: float, end_time: float, timeline_duration: float) -> bool:
        """
        Validate that the cut operation parameters are reasonable.
        """
        if start_time < 0 or end_time < 0:
            return False
        
        if start_time >= end_time:
            return False
        
        if end_time > timeline_duration:
            logging.warning(f"[CutOut Handler] Cut end time ({end_time}s) exceeds timeline duration ({timeline_duration}s)")
            # Allow this but log as warning - user might know what they're doing
        
        # Check for reasonable cut duration (not too short, not too long)
        cut_duration = end_time - start_time
        if cut_duration < 0.1:  # Less than 100ms
            logging.warning(f"[CutOut Handler] Very short cut duration: {cut_duration}s")
        
        if cut_duration > timeline_duration * 0.9:  # More than 90% of timeline
            logging.warning(f"[CutOut Handler] Very long cut duration: {cut_duration}s")
        
        return True