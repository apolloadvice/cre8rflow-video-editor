import pytest
from unittest.mock import patch
from app.command_parser import CommandParser

@pytest.fixture
def llm_parser():
    # Use LLM-enabled parser
    return CommandParser(use_llm=True)

@patch("app.llm_parser.parse_command_with_llm")
def test_llm_fallback_to_handler(mock_llm, llm_parser):
    # LLM returns None, should fallback to handler logic
    mock_llm.return_value = None
    op = llm_parser.parse_command("Cut clip1 at 00:30", 30)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == 900

@patch("app.llm_parser.parse_command_with_llm")
def test_llm_returns_unknown(mock_llm, llm_parser):
    # LLM returns UNKNOWN, should fallback to handler logic
    mock_llm.return_value = {"type": "UNKNOWN", "parameters": {"raw": "Cut clip1 at 00:30"}}
    op = llm_parser.parse_command("Cut clip1 at 00:30", 30)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == 900

@patch("app.llm_parser.parse_command_with_llm")
def test_llm_returns_valid(mock_llm, llm_parser):
    # LLM returns a valid command, should use it
    mock_llm.return_value = {"type": "CUT", "target": "clip1", "parameters": {"timestamp": 900}}
    op = llm_parser.parse_command("Cut clip1 at 00:30", 30)
    assert op.type == "CUT"
    assert op.target == "clip1"
    assert op.parameters["timestamp"] == 900
