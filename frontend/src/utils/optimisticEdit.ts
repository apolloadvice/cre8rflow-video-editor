// Utility for optimistic UI updates: parses and simulates 'cut' commands on the timeline clips array

/**
 * Parse a time string (e.g., '00:05', '1:23') into seconds.
 * @param {string} timeStr
 * @returns {number}
 */
function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Simulate a 'cut' command on the clips array.
 * Supports commands like 'cut first clip at 00:05', 'cut last clip at 00:10', 'cut clip 2 at 00:15'.
 *
 * @param {string} command - The NLP command string.
 * @param {Array} clips - The current array of clips (each with id, start, end, etc.).
 * @returns {Array} - The new clips array with the cut applied, or the original if parsing fails.
 */
export function simulateCutCommand(command: string, clips: any[]): any[] {
  // Regex: cut (first|last|clip N) clip at TIME
  const cutRegex = /cut\s+(first|last|clip\s*\d+)?\s*clip?\s*at\s*([\d:]+)/i;
  const match = command.match(cutRegex);
  if (!match) return clips;

  let targetIdx = 0;
  const target = match[1]?.trim().toLowerCase();
  if (target === "last") {
    targetIdx = clips.length - 1;
  } else if (target && target.startsWith("clip")) {
    const n = parseInt(target.replace("clip", "").trim(), 10);
    if (!isNaN(n) && n > 0 && n <= clips.length) {
      targetIdx = n - 1;
    }
  } // else default to first

  const timeStr = match[2];
  const cutTime = parseTimeToSeconds(timeStr);
  const targetClip = clips[targetIdx];
  if (!targetClip) return clips;

  // Only cut if cutTime is within the clip
  if (cutTime <= targetClip.start || cutTime >= targetClip.end) return clips;

  // Create two new clips split at cutTime
  const newClip1 = {
    ...targetClip,
    id: `${targetClip.id}_part1_${Date.now()}`,
    end: cutTime,
  };
  const newClip2 = {
    ...targetClip,
    id: `${targetClip.id}_part2_${Date.now()}`,
    start: cutTime,
  };

  // Replace the target clip with the two new clips
  const newClips = [
    ...clips.slice(0, targetIdx),
    newClip1,
    newClip2,
    ...clips.slice(targetIdx + 1),
  ];
  return newClips;
}

/**
 * Simulate a 'trim' command on the clips array.
 * Supports commands like 'trim first clip to 00:10', 'trim last clip from 00:05', 'trim clip 2 to 00:20'.
 *
 * @param {string} command - The NLP command string.
 * @param {Array} clips - The current array of clips.
 * @returns {Array} - The new clips array with the trim applied, or the original if parsing fails.
 */
export function simulateTrimCommand(command: string, clips: any[]): any[] {
  // Regex: trim (first|last|clip N) clip (to|from) TIME
  const trimRegex = /trim\s+(first|last|clip\s*\d+)?\s*clip?\s*(to|from)\s*([\d:]+)/i;
  const match = command.match(trimRegex);
  if (!match) {
    console.log('[simulateTrimCommand] No match for command:', command);
    return clips;
  }

  let targetIdx = 0;
  const target = match[1]?.trim().toLowerCase();
  if (target === "last") {
    targetIdx = clips.length - 1;
  } else if (target && target.startsWith("clip")) {
    const n = parseInt(target.replace("clip", "").trim(), 10);
    if (!isNaN(n) && n > 0 && n <= clips.length) {
      targetIdx = n - 1;
    }
  } // else default to first

  const direction = match[2]?.toLowerCase(); // 'to' or 'from'
  const timeStr = match[3];
  const trimTime = parseTimeToSeconds(timeStr);
  const targetClip = clips[targetIdx];
  console.log('[simulateTrimCommand] targetIdx:', targetIdx, 'direction:', direction, 'trimTime:', trimTime, 'targetClip:', targetClip);
  if (!targetClip) {
    console.log('[simulateTrimCommand] No target clip found');
    return clips;
  }

  // Only trim if trimTime is within the clip
  if (direction === "to") {
    if (trimTime <= targetClip.start || trimTime >= targetClip.end) {
      console.log('[simulateTrimCommand] trimTime not within clip for "to"');
      return clips;
    }
    const trimmedClip = {
      ...targetClip,
      end: trimTime,
    };
    const newClips = [
      ...clips.slice(0, targetIdx),
      trimmedClip,
      ...clips.slice(targetIdx + 1),
    ];
    console.log('[simulateTrimCommand] Returning new clips array (to):', newClips);
    return newClips;
  } else if (direction === "from") {
    if (trimTime <= targetClip.start || trimTime >= targetClip.end) {
      console.log('[simulateTrimCommand] trimTime not within clip for "from"');
      return clips;
    }
    const trimmedClip = {
      ...targetClip,
      start: trimTime,
    };
    const newClips = [
      ...clips.slice(0, targetIdx),
      trimmedClip,
      ...clips.slice(targetIdx + 1),
    ];
    console.log('[simulateTrimCommand] Returning new clips array (from):', newClips);
    return newClips;
  }
  console.log('[simulateTrimCommand] Direction not recognized:', direction);
  return clips;
}

/**
 * Simulate an 'add text' command on the clips array.
 * Supports commands like 'add text "Hello" at 00:05', 'add text "Intro" from 00:05 to 00:10'.
 *
 * @param {string} command - The NLP command string.
 * @param {Array} clips - The current array of clips.
 * @returns {Array} - The new clips array with the text overlay added, or the original if parsing fails.
 */
export function simulateAddTextCommand(command: string, clips: any[]): any[] {
  // Regex: add text 'TEXT' (at|from) TIME (to TIME)?
  const addTextRegex = /add text ['"](.+?)['"]\s*(at|from)\s*([\d:]+)(?:\s*to\s*([\d:]+))?/i;
  const match = command.match(addTextRegex);
  if (!match) {
    console.log('[simulateAddTextCommand] No match for command:', command);
    return clips;
  }
  const text = match[1];
  const mode = match[2]; // 'at' or 'from'
  const startTime = parseTimeToSeconds(match[3]);
  const endTime = match[4] ? parseTimeToSeconds(match[4]) : undefined;

  // If 'at', set a default duration (e.g., 3s)
  const overlayStart = startTime;
  const overlayEnd = mode === 'from' && endTime !== undefined ? endTime : (mode === 'at' ? startTime + 3 : startTime + 3);

  const textOverlay = {
    id: `text-${Date.now()}`,
    type: 'text',
    text,
    start: overlayStart,
    end: overlayEnd,
  };
  const newClips = [...clips, textOverlay];
  console.log('[simulateAddTextCommand] Adding text overlay:', textOverlay, 'New clips:', newClips);
  return newClips;
}

/**
 * Simulate an 'overlay' command on the clips array.
 * Supports commands like 'overlay image.png at 00:10', 'overlay logo.png from 00:05 to 00:15'.
 *
 * @param {string} command - The NLP command string.
 * @param {Array} clips - The current array of clips.
 * @returns {Array} - The new clips array with the overlay added, or the original if parsing fails.
 */
export function simulateOverlayCommand(command: string, clips: any[]): any[] {
  // Regex: overlay ASSET (at|from) TIME (to TIME)?
  const overlayRegex = /overlay\s+([\w.\-]+)\s*(at|from)\s*([\d:]+)(?:\s*to\s*([\d:]+))?/i;
  const match = command.match(overlayRegex);
  if (!match) {
    console.log('[simulateOverlayCommand] No match for command:', command);
    return clips;
  }
  const asset = match[1];
  const mode = match[2]; // 'at' or 'from'
  const startTime = parseTimeToSeconds(match[3]);
  const endTime = match[4] ? parseTimeToSeconds(match[4]) : undefined;

  // If 'at', set a default duration (e.g., 3s)
  const overlayStart = startTime;
  const overlayEnd = mode === 'from' && endTime !== undefined ? endTime : (mode === 'at' ? startTime + 3 : startTime + 3);

  const overlayClip = {
    id: `overlay-${Date.now()}`,
    type: 'overlay',
    asset,
    start: overlayStart,
    end: overlayEnd,
  };
  const newClips = [...clips, overlayClip];
  console.log('[simulateOverlayCommand] Adding overlay:', overlayClip, 'New clips:', newClips);
  return newClips;
}

/**
 * Main entry point for optimistic edit simulation.
 * Dispatches to the correct simulator based on command type.
 * @param {string} command
 * @param {Array} clips
 * @returns {Array}
 */
export function simulateOptimisticEdit(command: string, clips: any[]): any[] {
  if (/^cut\s+/i.test(command)) return simulateCutCommand(command, clips);
  if (/^trim\s+/i.test(command)) return simulateTrimCommand(command, clips);
  if (/^add text\s+/i.test(command)) return simulateAddTextCommand(command, clips);
  if (/^overlay\s+/i.test(command)) return simulateOverlayCommand(command, clips);
  // TODO: Add more command types as needed
  return clips;
} 