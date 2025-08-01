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
    Build the system prompt for the LLM with advanced semantic understanding.
    Emphasizes unlimited flexibility for typos, synonyms, and natural language variations.
    """
    return (
        f"You are a video editing command interpreter with advanced semantic understanding. "
        f"The user will give you an instruction about editing a video. "
        f"The current timeline is {{duration}} seconds long. Use this duration to resolve any relative time expressions.\n"
        f"You must output a JSON object describing the intended edit in the following STANDARDIZED format:\n"
        "{\n"
        "  \"intent\": \"<string: cut_out|add_text|overlay|etc>\",\n"
        "  \"target\": \"<string: timeline|clip_name>\",\n"
        "  \"start_time\": <number: seconds>,\n"
        "  \"end_time\": <number: seconds>,\n"
        "  \"confidence\": <number: 0.0-1.0>,\n"
        "  \"parameters\": {\n"
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
        "- Use semantic understanding - recognize ANY variation that means 'remove a time segment'\n"
        "\n"
        "CUT OUT INTENT RECOGNITION (Training Examples - Not Exhaustive):\n"
        "Recognize ANY command that means 'remove/delete/cut a time segment from timeline'\n"
        "\n"
        "EXACT PHRASES:\n"
        "User: 'cut out 10-20'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.95, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "TYPO PATTERNS (Apply to ANY similar variations):\n"
        "User: 'cutout 10-20' (missing space)\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.9, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'cut-out 0:10 to 0:20' (hyphenated)\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.85, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'cutt out 10s-20s' (letter typo)\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.8, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'cut  out 5-15' (double space)\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 5, \"end_time\": 15, \"confidence\": 0.9, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "SYNONYM PATTERNS (Apply semantic understanding to ANY removal word):\n"
        "User: 'remove from 10 to 20'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.9, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'delete between 1:30 and 2:45'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 90, \"end_time\": 165, \"confidence\": 0.85, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'trim out the section from 5 to 15'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 5, \"end_time\": 15, \"confidence\": 0.8, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'take out 0:05-0:15'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 5, \"end_time\": 15, \"confidence\": 0.85, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'eliminate 10 seconds to 20 seconds'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.8, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "NATURAL LANGUAGE PATTERNS (Use context clues for ANY phrasing):\n"
        "User: 'get rid of the part from 10 to 20'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.8, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'I want to cut out 0:10-0:20'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 10, \"end_time\": 20, \"confidence\": 0.85, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "User: 'skip the section between 0:05 and 0:25'\n"
        "Output: { \"intent\": \"cut_out\", \"target\": \"timeline\", \"start_time\": 5, \"end_time\": 25, \"confidence\": 0.75, \"parameters\": { \"preserve_timing\": true, \"create_gap\": false } }\n"
        "\n"
        "UNLIMITED FLEXIBILITY EXAMPLES:\n"
        "Recognize these patterns even if not explicitly trained:\n"
        "- ANY typo: 'ctu out', 'cut oout', 'cyt out' → cut_out intent\n"
        "- ANY synonym: 'chop out', 'slice out', 'omit', 'exclude' → cut_out intent  \n"
        "- ANY phrasing: 'please remove', 'can you delete', 'drop the part' → cut_out intent\n"
        "- As long as there's a time range and removal intent → cut_out\n"
        "\n"
        "CONFIDENCE SCORING GUIDELINES:\n"
        "- 0.95-1.0: Exact 'cut out' phrase with clear time format\n"
        "- 0.85-0.94: Minor typos or clear synonyms ('remove', 'delete')\n"
        "- 0.75-0.84: Natural language or unusual synonyms but clear intent\n"
        "- 0.70-0.74: Ambiguous phrasing but still recognizable cutting intent\n"
        "- Below 0.70: Too ambiguous, will fall back to regex detection\n"
        "\n"
        "SEMANTIC UNDERSTANDING:\n"
        "Use your language model capabilities to recognize cutting intent even in:\n"
        "- Completely new typo variations not seen before\n"
        "- Synonyms not in training examples\n"
        "- Natural language phrasings\n"
        "- Creative expressions of removal/deletion intent\n"
        "The key is: REMOVAL ACTION + TIME RANGE = cut_out intent\n"
        "\n"
        "OTHER OPERATIONS (for context):\n"
        "User: 'add text hello from 5 to 10'\n"
        "Output: { \"intent\": \"add_text\", \"target\": \"timeline\", \"start_time\": 5, \"end_time\": 10, \"confidence\": 0.95, \"parameters\": { \"text\": \"hello\" } }\n"
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
