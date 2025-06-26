"""
LLM (OpenAI GPT) Command Parser Module

Provides a function to parse natural language video editing commands using the OpenAI API.

- Uses environment variable OPENAI_API_KEY for authentication.
- Returns a structured command dict compatible with the new edit intent schema.

"""
import os
from typing import Optional, Dict, Any, Tuple
import openai
import logging
import re

LOG_FILE = os.path.join(os.path.dirname(__file__), 'llm_parser.log')
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)

def build_system_prompt(duration: float) -> str:
    """
    Build the system prompt for the LLM, including the current clip duration and generalized examples for relative time expressions.
    Updated to clarify the distinction between 'cut out the first/last N seconds' (trim, no gap) and 'cut from X to Y seconds' (remove segment, leave a gap).
    Enhanced to support batch operations on multiple clips.
    Enhanced to support viral caption generation.
    Enhanced to support tracking text operations.
    """
    return (
        f"You are a video editing command interpreter. The user will give you an instruction about editing a video. "
        f"The current video clip is {{duration}} seconds long. Use this duration to resolve any relative time expressions.\n"
        f"You must output a JSON object (or array of objects) describing the intended edit(s) in the following format:\n"
        "{\n"
        "  'action': '<string: action_name>',\n"
        "  'target': '<string: single_clip|each_clip|all_clips|viral_captions|tracking_text>', // NEW: specify target scope\n"
        "  'start': <number: seconds>,\n"
        "  'end': <number: seconds>,\n"
        "  'text': '<string>',           // for add_text and tracking_text\n"
        "  'asset': '<string>',          // for overlay\n"
        "  'position': '<string|object>',// optional, for add_text/overlay/tracking_text\n"
        "  'style': '<string>',          // optional, for add_text (e.g., 'banger', 'subtitle', 'title', 'viral', 'tracking')\n"
        "  'interval': <number>,         // NEW: for viral captions, interval between captions in seconds\n"
        "  'caption_style': '<string>',  // NEW: for viral captions (e.g., 'viral', 'story-telling')\n"
        "  'trim_start': <number>,       // NEW: for batch trimming operations (seconds from start)\n"
        "  'trim_end': <number>,         // NEW: for batch trimming operations (seconds from end)\n"
        "  'tracking_text': '<string>',  // NEW: for tracking text operations, the text to track\n"
        "  'timeframe': { 'start': <number>, 'end': <number> }, // NEW: suggested timeframe for tracking text\n"
        "  'target_context': '<string>', // NEW: context description for when tracking should be active\n"
        "  'additionalParams': { }       // optional, for future extensibility\n"
        "}\n"
        "- Use double quotes for all property names and string values, as required by strict JSON. Do not use single quotes. "
        "- Respond with only valid JSON. No explanation, no markdown, no code block. "
        "Do not include any text before or after the JSON. "
        "- If the command is ambiguous, still output a valid JSON object with your best guess. "
        "- If the command contains multiple edits, output an array of objects. "
        "- If a field is not relevant, omit it. "
        "- If the user gives times in natural language (e.g., 'first 5 seconds', 'from 1 minute to 1:10', 'last 10 seconds'), convert them to seconds in the JSON using the current clip duration. "
        "\n"
        "TARGET SCOPE DEFINITIONS:\n"
        "- 'single_clip': Apply to one specific clip (default for most operations)\n"
        "- 'each_clip': Apply the same operation to each individual clip separately\n"
        "- 'all_clips': Apply to all clips as a group\n"
        "- 'viral_captions': Generate viral-style captions distributed across the timeline\n"
        "- 'tracking_text': Add text that tracks with movement and appears during specific contexts\n"
        "\n"
        "TRACKING TEXT EXAMPLES:\n"
        "User: 'Add \"fried\" on me and make it track me when I'm talking about my startup'\n"
        "Output: { \"action\": \"add_tracking_text\", \"target\": \"tracking_text\", \"tracking_text\": \"fried\", \"target_context\": \"when talking about my startup\", \"style\": \"tracking\", \"timeframe\": { \"start\": 5, \"end\": 8 } }\n"
        "\n"
        "User: 'Put \"amazing\" on me and track me when I speak'\n"
        "Output: { \"action\": \"add_tracking_text\", \"target\": \"tracking_text\", \"tracking_text\": \"amazing\", \"target_context\": \"when speaking\", \"style\": \"tracking\", \"timeframe\": { \"start\": 3, \"end\": 6 } }\n"
        "\n"
        "User: 'Add \"viral\" on me and make it follow my movements'\n"
        "Output: { \"action\": \"add_tracking_text\", \"target\": \"tracking_text\", \"tracking_text\": \"viral\", \"target_context\": \"during movement\", \"style\": \"tracking\", \"timeframe\": { \"start\": 2, \"end\": 5 } }\n"
        "\n"
        "User: 'Track \"hello\" on me throughout the video'\n"
        "Output: { \"action\": \"add_tracking_text\", \"target\": \"tracking_text\", \"tracking_text\": \"hello\", \"target_context\": \"throughout video\", \"style\": \"tracking\", \"timeframe\": { \"start\": 0, \"end\": {{duration}} } }\n"
        "\n"
        "VIRAL CAPTION EXAMPLES:\n"
        "User: 'Add viral story-telling captions'\n"
        "Output: { \"action\": \"add_text\", \"target\": \"viral_captions\", \"interval\": 3, \"caption_style\": \"viral\" }\n"
        "\n"
        "User: 'Add viral captions'\n"
        "Output: { \"action\": \"add_text\", \"target\": \"viral_captions\", \"interval\": 3, \"caption_style\": \"viral\" }\n"
        "\n"
        "User: 'Add story-telling captions'\n"
        "Output: { \"action\": \"add_text\", \"target\": \"viral_captions\", \"interval\": 3, \"caption_style\": \"story-telling\" }\n"
        "\n"
        "User: 'Add viral captions every 5 seconds'\n"
        "Output: { \"action\": \"add_text\", \"target\": \"viral_captions\", \"interval\": 5, \"caption_style\": \"viral\" }\n"
        "\n"
        "User: 'Generate viral text overlays'\n"
        "Output: { \"action\": \"add_text\", \"target\": \"viral_captions\", \"interval\": 3, \"caption_style\": \"viral\" }\n"
        "\n"
        "BATCH OPERATION EXAMPLES:\n"
        "User: 'cut each clip so that there's 0.1 seconds of dead space before I start talking and after I'm done talking'\n"
        "Output: { \"action\": \"cut\", \"target\": \"each_clip\", \"trim_start\": 0.1, \"trim_end\": 0.1 }\n"
        "\n"
        "User: 'add banger style captions to all clips'\n"
        "Output: { \"action\": \"add_text\", \"target\": \"each_clip\", \"style\": \"banger\", \"text\": \"AUTO_GENERATE\" }\n"
        "\n"
        "User: 'trim 0.5 seconds from the start of each clip'\n"
        "Output: { \"action\": \"cut\", \"target\": \"each_clip\", \"trim_start\": 0.5 }\n"
        "\n"
        "User: 'add subtitles to every clip'\n"
        "Output: { \"action\": \"add_text\", \"target\": \"each_clip\", \"style\": \"subtitle\", \"text\": \"AUTO_GENERATE\" }\n"
        "\n"
        "IMPORTANT: Distinguish between these two types of 'cut' commands:\n"
        "1. If the user says 'cut out the first N seconds' or 'cut the last N seconds', interpret this as trimming the start or end of the video. The result should be a single clip with the specified segment removed from the start or end (no gap).\n"
        "2. If the user says 'cut from X to Y seconds', interpret this as removing the segment between X and Y seconds, leaving a gap in the timeline. The result should be two clips: one before X, and one after Y, with a gap in between.\n"
        "\n"
        "SINGLE CLIP EXAMPLES (EXISTING FUNCTIONALITY):\n"
        "User: 'Cut from 10 to 20 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": 10, \"end\": 20 }\n"
        "User: 'Cut out the first 5 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": 0, \"end\": 5 }\n"
        "User: 'Cut out the last 10 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": {{duration}}-10, \"end\": {{duration}} }\n"
        "User: 'Remove the last 5 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": {{duration}}-5, \"end\": {{duration}} }\n"
        "User: 'Cut the first 5 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": 0, \"end\": 5 }\n"
        "User: 'Remove everything after 20 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": 20, \"end\": {{duration}} }\n"
        "User: 'Remove everything before 10 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": 0, \"end\": 10 }\n"
        "User: 'Cut from 5 to 10 seconds.'\n"
        "Output: { \"action\": \"cut\", \"target\": \"single_clip\", \"start\": 5, \"end\": 10 }\n"
        "\n"
        "For 'cut from X to Y', the timeline should show a gap between the remaining clips. For 'cut out the first/last N seconds', the timeline should only include the remaining segment, with no gap.\n"
    ).replace("{duration}", str(duration))

def parse_command_with_llm(command_text: str, duration: float = None) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Parse a natural language command using OpenAI GPT API.

    Args:
        command_text (str): The user's command.
        duration (float): The current clip duration in seconds (required for relative time expressions).

    Returns:
        (dict or None, error_message or None): Structured command dict, or None if parsing fails, and error message if any.
    """
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        return None, "OPENAI_API_KEY environment variable not set."
    openai.api_key = OPENAI_API_KEY
    logging.info(f"[LLM] Input command: {command_text}")
    if duration is None:
        duration = 60.0  # fallback default
    try:
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": build_system_prompt(duration)},
                {"role": "user", "content": f"{command_text}"}
            ],
            temperature=0.0,
            max_tokens=512,
        )
        content = response.choices[0].message.content.strip()
        logging.info(f"[LLM] Raw LLM response: {content}")
        import json
        try:
            if content.startswith("```") and content.endswith("```"):
                content = content.split("\n", 1)[-1].rsplit("```", 1)[0]
            result = json.loads(content)
            logging.info(f"[LLM] Parsed command successfully: {result}")
            return result, None
        except Exception as json_err:
            logging.warning(f"[LLM] JSON decode error for LLM response: {content}\nError: {json_err}")
            match = re.search(r'([\[{].*[\]}])', content, re.DOTALL)
            if match:
                try:
                    fallback_json = match.group(1)
                    result = json.loads(fallback_json)
                    logging.info(f"[LLM] Fallback JSON parse succeeded: {result}")
                    return result, None
                except Exception as fallback_err:
                    logging.error(f"[LLM] Fallback JSON parse failed: {fallback_json}\nError: {fallback_err}")
            return None, "Could not parse LLM response as JSON. Please try rephrasing your command."
    except Exception as api_err:
        logging.error(f"[LLM] OpenAI API error: {api_err}")
        
        # Provide more specific error messages based on the error type
        error_str = str(api_err).lower()
        if "quota" in error_str or "billing" in error_str or "429" in error_str:
            return None, "OpenAI API quota exceeded. Please check your billing or try again later."
        elif "authentication" in error_str or "401" in error_str:
            return None, "OpenAI API authentication failed. Please check your API key."
        elif "network" in error_str or "connection" in error_str:
            return None, "Network error connecting to OpenAI API. Please check your internet connection."
        else:
            return None, f"OpenAI API error: {api_err}. Please try again later."
