
import { formatTimecode } from '../utils/formatTimecode';
import '@testing-library/jest-dom';

describe('formatTimecode', () => {
  test('formats 0 seconds correctly', () => {
    expect(formatTimecode(0)).toBe('00:00.00');
  });
  
  test('formats minutes correctly', () => {
    expect(formatTimecode(60)).toBe('01:00.00');
    expect(formatTimecode(120)).toBe('02:00.00');
  });
  
  test('formats seconds correctly', () => {
    expect(formatTimecode(1)).toBe('00:01.00');
    expect(formatTimecode(59)).toBe('00:59.00');
  });
  
  test('formats centiseconds correctly', () => {
    expect(formatTimecode(0.12)).toBe('00:00.12');
    expect(formatTimecode(0.01)).toBe('00:00.01');
  });
  
  test('formats mixed values correctly', () => {
    expect(formatTimecode(61.25)).toBe('01:01.25');
    expect(formatTimecode(125.75)).toBe('02:05.75');
    expect(formatTimecode(3599.99)).toBe('59:59.99');
  });
  
  test('handles overflow correctly', () => {
    expect(formatTimecode(3600)).toBe('60:00.00');
  });
});
