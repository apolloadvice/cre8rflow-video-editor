import os
import pytest
from unittest.mock import patch
from app.llm_parser import parse_command_with_llm

@pytest.fixture(autouse=True)
def set_openai_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

@patch("app.llm_parser.openai.ChatCompletion.create")
def test_llm_parser_success(mock_create):
    # Simulate a successful LLM response
    mock_create.return_value = {
        "choices": [{
            "message": {"content": '{"type": "CUT", "target": "clip1", "parameters": {"timestamp": 900}}'}
        }]
    }
    result = parse_command_with_llm("Cut clip1 at 00:30")
    assert result["type"] == "CUT"
    assert result["target"] == "clip1"
    assert result["parameters"]["timestamp"] == 900

@patch("app.llm_parser.openai.ChatCompletion.create")
def test_llm_parser_json_error(mock_create):
    # Simulate a response with invalid JSON
    mock_create.return_value = {
        "choices": [{
            "message": {"content": 'not a json'}
        }]
    }
    result = parse_command_with_llm("Cut clip1 at 00:30")
    assert result is None

@patch("app.llm_parser.openai.ChatCompletion.create")
def test_llm_parser_api_error(mock_create):
    # Simulate an API error
    mock_create.side_effect = Exception("API error")
    result = parse_command_with_llm("Cut clip1 at 00:30")
    assert result is None
