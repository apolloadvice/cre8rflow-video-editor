/**
 * Formats a time in seconds to a mm:ss.cc format
 * @param time Time in seconds
 * @returns Formatted time string
 */
export function formatTimecode(time: number): string {
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  // Use fixed decimal formatting for centiseconds
  const centiseconds = ((time - Math.floor(time)) * 100).toFixed(0).padStart(2, '0');
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds}`;
}
