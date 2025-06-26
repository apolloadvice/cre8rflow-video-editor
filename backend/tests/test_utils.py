import pytest
from app.utils import parse_natural_time_expression

def test_parse_natural_time_expression_numeric():
    assert parse_natural_time_expression('30 seconds') == 30
    assert parse_natural_time_expression('2 minutes') == 120
    assert parse_natural_time_expression('1 hour') == 3600
    assert parse_natural_time_expression('45 s') == 45
    assert parse_natural_time_expression('3 m') == 180
    assert parse_natural_time_expression('2 h') == 7200

def test_parse_natural_time_expression_words():
    assert parse_natural_time_expression('thirty seconds') == 30
    assert parse_natural_time_expression('one minute') == 60
    assert parse_natural_time_expression('two hours') == 7200
    assert parse_natural_time_expression('forty five seconds') == 45
    assert parse_natural_time_expression('ninety minutes') == 5400

def test_parse_natural_time_expression_fractions():
    assert parse_natural_time_expression('halfway through', duration=100) == 50
    assert parse_natural_time_expression('half', duration=80) == 40
    assert parse_natural_time_expression('quarter', duration=80) == 20
    assert parse_natural_time_expression('three quarters', duration=80) == 60

def test_parse_natural_time_expression_relative():
    assert parse_natural_time_expression('the last 5 seconds', duration=100) == 95
    assert parse_natural_time_expression('the last ten seconds', duration=100) == 90
    assert parse_natural_time_expression('the last 2 minutes', duration=300) == 180
    assert parse_natural_time_expression('the last twenty minutes', duration=3600) == 2400

def test_parse_natural_time_expression_edge_cases():
    assert parse_natural_time_expression('start') == 0.0
    assert parse_natural_time_expression('beginning') == 0.0
    assert parse_natural_time_expression('end', duration=123) == 123
    assert parse_natural_time_expression('unknown phrase') is None

def test_parse_natural_time_expression_failure():
    assert parse_natural_time_expression('nonsense input') is None 