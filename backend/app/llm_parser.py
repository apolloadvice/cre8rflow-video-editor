"""
LLM (OpenAI GPT) Command Parser Module

Provides a function to parse natural language video editing commands using the OpenAI API.

- Uses environment variable OPENAI_API_KEY for authentication.
- Returns a structured command dict compatible with the new edit intent schema.

"""
import os
from typing import Optional, Dict, Any, Tuple
from openai import OpenAI
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
    Build the system prompt for the LLM with focus on standardized command parsing.
    Prioritizes cut_out operations and returns standardized format for backend processing.
    """
    return (
        f"You are a video editing command interpreter. The user will give you an instruction about editing a video. "
        f"The current timeline is {{duration}} seconds long. Use this duration to resolve any relative time expressions.\n"
        f"You must output a JSON object describing the intended edit in the following STANDARDIZED format:\n"
        "{\n"
        "  \"intent\": \"<string: cut_out|add_text|overlay|etc>\",\n"
        "  \"target\": \"<string: timeline|clip_name>\",\n"
        "  \"start_time\": <number: seconds>,\n"
        "  \"end_time\": <number: seconds>,\n"
        "  \"confidence\": <number: 0.0-1.0>,\n"
        "  \"parameters\": {\n"
        "    \"text\": \"<string>\",           // for add_text operations\n"
        "    \"asset\": \"<string>\",          // for overlay operations\n"
        "    \"position\": \"<string>\",       // for positioning (top, bottom, center, etc.)\n"
        "    \"preserve_timing\": true,        // for cut_out operations\n"
        "    \"create_gap\": false            // for cut_out operations\n"
        "  }\n"
        "}\n"
        "CRITICAL RULES:\n"
        "- Use double quotes for all property names and string values, as required by strict JSON.\n"
        "- Respond with only valid JSON. No explanation, no markdown, no code block.\n"
        "- Do not include any text before or after the JSON.\n"
        "- Convert all time formats to seconds (e.g., '1:30' becomes 90, '0:10' becomes 10).\n"
        "- Set confidence between 0.0-1.0 based on how clear the command is.\n"
        "- If a field is not relevant, omit it from parameters.\n"
        "\n"
        "STANDARD EXAMPLES:\n"
        "\n"
        "CUT OUT OPERATIONS (PRIMARY FOCUS):\n"
        "User: 'cut out 10-20'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.95, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'cutout 0:10 to 0:20'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.9, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'remove from 10 seconds to 20 seconds'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.95, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'delete between 1:30 and 2:45'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 90, \"end_time\": 165, \"confidence\": 0.9, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'cut out the part from ten seconds to twenty seconds'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.85, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'take out 5s-15s'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 5, \"end_time\": 15, \"confidence\": 0.9, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "TEXT OPERATIONS:\n"
        "User: 'add text hello from 5 to 10'\n"
        "Output: { \"intent\": \"add_text\", \"target\": \"timeline\", \"start_time\": 5, \"end_time\": 10, \"confidence\": 0.95, \"parameters\": { \"text\": \"hello\" } }\n"
        "\n"
        "OVERLAY OPERATIONS:\n"
        "User: 'overlay image.png from 0 to 5'\n"
        "Output: { \"intent\": \"overlay\", \"target\": \"timeline\", \"start_time\": 0, \"end_time\": 5, \"confidence\": 0.9, \"parameters\": { \"asset\": \"image.png\" } }\n"
        "\n"
        "CONFIDENCE GUIDELINES:\n"
        "- 0.95-1.0: Very clear command with explicit times\n"
        "- 0.85-0.94: Clear command with some ambiguity in format\n"
        "- 0.7-0.84: Understandable but requires interpretation\n"
        "- 0.5-0.69: Ambiguous command, best guess\n"
        "- 0.0-0.49: Very unclear, likely incorrect interpretation\n"
        "\n"
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
    
    # Initialize OpenAI client with the API key
    client = OpenAI(api_key=OPENAI_API_KEY)
    
    logging.info(f"[LLM] Input command: {command_text}")
    if duration is None:
        duration = 60.0  # fallback default
    try:
        response = client.chat.completions.create(
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
