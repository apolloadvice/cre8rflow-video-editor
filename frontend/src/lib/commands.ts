/**
 * Multi-Track Command System
 * 
 * Natural language command processing for multi-track timeline with:
 * - Integration with existing cut out functionality
 * - Multi-track aware operations
 * - Command validation and error handling
 * - Undo/redo support
 * - AI-powered command interpretation
 */

import { generateUUID } from './utils';
import { TimelineElement, Track, TrackKind } from '@/types/timeline';
import { MultiTrackStore } from '@/store/multiTrackStore';

// Command types
export interface Command {
  id: string;
  type: CommandType;
  description: string;
  targetTrackId?: string;
  targetElementId?: string;
  parameters: Record<string, any>;
  timestamp: number;
  confidence?: number; // AI confidence score
}

export type CommandType = 
  | 'cut_out'
  | 'add_element'
  | 'move_element'
  | 'split_element'
  | 'merge_elements'
  | 'adjust_timing'
  | 'add_track'
  | 'delete_track'
  | 'add_text'
  | 'add_overlay'
  | 'apply_effect'
  | 'adjust_volume'
  | 'adjust_speed'
  | 'set_marker'
  | 'zoom_to'
  | 'select_elements';

export interface CommandResult {
  success: boolean;
  command: Command;
  affectedElementIds: string[];
  affectedTrackIds: string[];
  newElementIds?: string[];
  message?: string;
  error?: string;
}

export interface ParsedTimeRange {
  start: number;
  end: number;
  duration: number;
}

// Command parsing patterns
const COMMAND_PATTERNS = {
  // Cut out operations (preserving existing functionality)
  CUT_OUT_HYPHEN: /cut\s+out\s+(\d{1,2}:\d{2}|\d+)\s*[-–]\s*(\d{1,2}:\d{2}|\d+)/i,
  CUT_OUT_TO: /cut\s+out\s+(\d{1,2}:\d{2}|\d+)\s+to\s+(\d{1,2}:\d{2}|\d+)/i,
  CUT_FROM_TO: /cut\s+from\s+(\d{1,2}:\d{2}|\d+)\s+to\s+(\d{1,2}:\d{2}|\d+)/i,
  REMOVE_RANGE: /remove\s+(\d{1,2}:\d{2}|\d+)\s*[-–]\s*(\d{1,2}:\d{2}|\d+)/i,
  
  // Element operations
  ADD_TEXT: /add\s+text\s+['"]([^'"]+)['"](?:\s+(?:from|at)\s+(\d{1,2}:\d{2}|\d+))?(?:\s+(?:to|for)\s+(\d{1,2}:\d{2}|\d+))?/i,
  ADD_OVERLAY: /add\s+overlay\s+['"]([^'"]+)['"](?:\s+(?:from|at)\s+(\d{1,2}:\d{2}|\d+))?(?:\s+(?:to|for)\s+(\d{1,2}:\d{2}|\d+))?/i,
  SPLIT_AT: /split\s+(?:at\s+)?(\d{1,2}:\d{2}|\d+)/i,
  MOVE_TO: /move\s+(?:(?:element|clip|item)\s+)?(?:to\s+)?(\d{1,2}:\d{2}|\d+)/i,
  
  // Track operations
  ADD_TRACK: /add\s+(?:new\s+)?(video|audio|title|overlay|effect)\s+track(?:\s+named\s+['"]([^'"]+)['"])?/i,
  DELETE_TRACK: /(?:delete|remove)\s+track(?:\s+['"]([^'"]+)['"])?/i,
  
  // Selection operations
  SELECT_ALL: /select\s+all/i,
  SELECT_RANGE: /select\s+(?:from\s+)?(\d{1,2}:\d{2}|\d+)\s+(?:to\s+)?(\d{1,2}:\d{2}|\d+)/i,
  
  // Timing operations
  ADJUST_SPEED: /(?:set\s+speed|speed)\s+(?:to\s+)?(\d*\.?\d+)x?/i,
  ADJUST_VOLUME: /(?:set\s+volume|volume)\s+(?:to\s+)?(\d+)%?/i,
  
  // Navigation operations
  ZOOM_TO: /zoom\s+to\s+(\d{1,2}:\d{2}|\d+)(?:\s*[-–]\s*(\d{1,2}:\d{2}|\d+))?/i,
  GO_TO: /(?:go\s+to|jump\s+to|seek\s+to)\s+(\d{1,2}:\d{2}|\d+)/i,
  SET_MARKER: /(?:add|set)\s+marker(?:\s+['"]([^'"]+)['"])?(?:\s+at\s+(\d{1,2}:\d{2}|\d+))?/i,
};

/**
 * Parse time string to seconds
 * Supports formats: "1:23", "83", "0:05"
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (timeStr.includes(':')) {
    const [minutes, seconds] = timeStr.split(':').map(Number);
    return minutes * 60 + seconds;
  }
  return Number(timeStr);
}

/**
 * Parse time range from command parameters
 */
export function parseTimeRange(start: string, end: string): ParsedTimeRange {
  const startSeconds = parseTimeToSeconds(start);
  const endSeconds = parseTimeToSeconds(end);
  
  return {
    start: Math.min(startSeconds, endSeconds),
    end: Math.max(startSeconds, endSeconds),
    duration: Math.abs(endSeconds - startSeconds),
  };
}

/**
 * Parse natural language command into structured command object
 */
export function parseCommand(input: string, context?: {
  selectedElementIds?: string[];
  selectedTrackId?: string;
  currentTime?: number;
}): Command | null {
  const normalizedInput = input.trim().toLowerCase();
  const commandId = generateUUID();
  const timestamp = Date.now();
  
  // Cut out operations (highest priority - preserving existing functionality)
  for (const [patternName, pattern] of Object.entries(COMMAND_PATTERNS)) {
    if (patternName.startsWith('CUT_') || patternName.startsWith('REMOVE_')) {
      const match = normalizedInput.match(pattern);
      if (match) {
        const [, startStr, endStr] = match;
        const timeRange = parseTimeRange(startStr, endStr);
        
        return {
          id: commandId,
          type: 'cut_out',
          description: `Cut out ${startStr} to ${endStr}`,
          parameters: {
            startTime: timeRange.start,
            endTime: timeRange.end,
            preserveTiming: true,
            createGap: true,
            affectedTracks: context?.selectedTrackId ? [context.selectedTrackId] : 'all',
          },
          timestamp,
          confidence: 0.95,
        };
      }
    }
  }
  
  // Add text operations
  const textMatch = normalizedInput.match(COMMAND_PATTERNS.ADD_TEXT);
  if (textMatch) {
    const [, text, startStr, durationStr] = textMatch;
    const startTime = startStr ? parseTimeToSeconds(startStr) : (context?.currentTime || 0);
    const duration = durationStr ? parseTimeToSeconds(durationStr) : 3; // Default 3 seconds
    
    return {
      id: commandId,
      type: 'add_text',
      description: `Add text "${text}"`,
      targetTrackId: context?.selectedTrackId,
      parameters: {
        text,
        startTime,
        duration,
        style: 'default',
      },
      timestamp,
      confidence: 0.9,
    };
  }
  
  // Add overlay operations
  const overlayMatch = normalizedInput.match(COMMAND_PATTERNS.ADD_OVERLAY);
  if (overlayMatch) {
    const [, assetName, startStr, durationStr] = overlayMatch;
    const startTime = startStr ? parseTimeToSeconds(startStr) : (context?.currentTime || 0);
    const duration = durationStr ? parseTimeToSeconds(durationStr) : 5; // Default 5 seconds
    
    return {
      id: commandId,
      type: 'add_overlay',
      description: `Add overlay "${assetName}"`,
      targetTrackId: context?.selectedTrackId,
      parameters: {
        assetName,
        startTime,
        duration,
      },
      timestamp,
      confidence: 0.85,
    };
  }
  
  // Split operations
  const splitMatch = normalizedInput.match(COMMAND_PATTERNS.SPLIT_AT);
  if (splitMatch) {
    const [, timeStr] = splitMatch;
    const splitTime = parseTimeToSeconds(timeStr);
    
    return {
      id: commandId,
      type: 'split_element',
      description: `Split at ${timeStr}`,
      targetElementId: context?.selectedElementIds?.[0],
      parameters: {
        splitTime,
      },
      timestamp,
      confidence: 0.9,
    };
  }
  
  // Move operations
  const moveMatch = normalizedInput.match(COMMAND_PATTERNS.MOVE_TO);
  if (moveMatch) {
    const [, timeStr] = moveMatch;
    const newTime = parseTimeToSeconds(timeStr);
    
    return {
      id: commandId,
      type: 'move_element',
      description: `Move to ${timeStr}`,
      targetElementId: context?.selectedElementIds?.[0],
      parameters: {
        newStartTime: newTime,
      },
      timestamp,
      confidence: 0.85,
    };
  }
  
  // Track operations
  const addTrackMatch = normalizedInput.match(COMMAND_PATTERNS.ADD_TRACK);
  if (addTrackMatch) {
    const [, trackKind, trackName] = addTrackMatch;
    
    return {
      id: commandId,
      type: 'add_track',
      description: `Add ${trackKind} track`,
      parameters: {
        kind: trackKind as TrackKind,
        name: trackName || `${trackKind.charAt(0).toUpperCase() + trackKind.slice(1)} Track`,
      },
      timestamp,
      confidence: 0.95,
    };
  }
  
  // Selection operations
  const selectAllMatch = normalizedInput.match(COMMAND_PATTERNS.SELECT_ALL);
  if (selectAllMatch) {
    return {
      id: commandId,
      type: 'select_elements',
      description: 'Select all elements',
      parameters: {
        selectAll: true,
      },
      timestamp,
      confidence: 0.95,
    };
  }
  
  const selectRangeMatch = normalizedInput.match(COMMAND_PATTERNS.SELECT_RANGE);
  if (selectRangeMatch) {
    const [, startStr, endStr] = selectRangeMatch;
    const timeRange = parseTimeRange(startStr, endStr);
    
    return {
      id: commandId,
      type: 'select_elements',
      description: `Select from ${startStr} to ${endStr}`,
      parameters: {
        startTime: timeRange.start,
        endTime: timeRange.end,
      },
      timestamp,
      confidence: 0.9,
    };
  }
  
  // Speed adjustment
  const speedMatch = normalizedInput.match(COMMAND_PATTERNS.ADJUST_SPEED);
  if (speedMatch) {
    const [, speedStr] = speedMatch;
    const speed = parseFloat(speedStr);
    
    return {
      id: commandId,
      type: 'adjust_speed',
      description: `Set speed to ${speed}x`,
      targetElementId: context?.selectedElementIds?.[0],
      parameters: {
        speed,
      },
      timestamp,
      confidence: 0.9,
    };
  }
  
  // Volume adjustment
  const volumeMatch = normalizedInput.match(COMMAND_PATTERNS.ADJUST_VOLUME);
  if (volumeMatch) {
    const [, volumeStr] = volumeMatch;
    const volume = parseInt(volumeStr) / 100;
    
    return {
      id: commandId,
      type: 'adjust_volume',
      description: `Set volume to ${volumeStr}%`,
      targetElementId: context?.selectedElementIds?.[0],
      parameters: {
        volume,
      },
      timestamp,
      confidence: 0.9,
    };
  }
  
  // Navigation operations
  const goToMatch = normalizedInput.match(COMMAND_PATTERNS.GO_TO);
  if (goToMatch) {
    const [, timeStr] = goToMatch;
    const time = parseTimeToSeconds(timeStr);
    
    return {
      id: commandId,
      type: 'zoom_to', // Using zoom_to for navigation
      description: `Go to ${timeStr}`,
      parameters: {
        time,
        action: 'seek',
      },
      timestamp,
      confidence: 0.95,
    };
  }
  
  // Marker operations
  const markerMatch = normalizedInput.match(COMMAND_PATTERNS.SET_MARKER);
  if (markerMatch) {
    const [, markerName, timeStr] = markerMatch;
    const time = timeStr ? parseTimeToSeconds(timeStr) : (context?.currentTime || 0);
    
    return {
      id: commandId,
      type: 'set_marker',
      description: `Add marker ${markerName ? `"${markerName}"` : ''}`,
      parameters: {
        name: markerName || `Marker ${new Date().toLocaleTimeString()}`,
        time,
      },
      timestamp,
      confidence: 0.9,
    };
  }
  
  // If no pattern matches, return null
  return null;
}

/**
 * Execute a parsed command on the multi-track store
 */
export async function executeCommand(
  command: Command,
  store: MultiTrackStore
): Promise<CommandResult> {
  const startTime = Date.now();
  let result: CommandResult;
  
  try {
    switch (command.type) {
      case 'cut_out':
        result = await executeCutOutCommand(command, store);
        break;
        
      case 'add_text':
        result = await executeAddTextCommand(command, store);
        break;
        
      case 'add_overlay':
        result = await executeAddOverlayCommand(command, store);
        break;
        
      case 'split_element':
        result = await executeSplitElementCommand(command, store);
        break;
        
      case 'move_element':
        result = await executeMoveElementCommand(command, store);
        break;
        
      case 'add_track':
        result = await executeAddTrackCommand(command, store);
        break;
        
      case 'select_elements':
        result = await executeSelectElementsCommand(command, store);
        break;
        
      case 'adjust_speed':
        result = await executeAdjustSpeedCommand(command, store);
        break;
        
      case 'adjust_volume':
        result = await executeAdjustVolumeCommand(command, store);
        break;
        
      case 'zoom_to':
        result = await executeZoomToCommand(command, store);
        break;
        
      case 'set_marker':
        result = await executeSetMarkerCommand(command, store);
        break;
        
      default:
        result = {
          success: false,
          command,
          affectedElementIds: [],
          affectedTrackIds: [],
          error: `Unknown command type: ${command.type}`,
        };
    }
    
    const duration = Date.now() - startTime;
    console.log(`Command ${command.type} executed in ${duration}ms:`, result);
    
    return result;
    
  } catch (error) {
    return {
      success: false,
      command,
      affectedElementIds: [],
      affectedTrackIds: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Command execution functions
async function executeCutOutCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { startTime, endTime, affectedTracks } = command.parameters;
  const affectedElementIds: string[] = [];
  const affectedTrackIds: string[] = [];
  
  // Get tracks to process
  const tracksToProcess = affectedTracks === 'all' 
    ? store.project.timeline.tracks 
    : store.project.timeline.tracks.filter(track => affectedTracks.includes(track.id));
  
  // Cut out from each track
  for (const track of tracksToProcess) {
    const elementsInRange = track.elements.filter(element => 
      element.start < endTime && element.start + element.duration > startTime
    );
    
    for (const element of elementsInRange) {
      affectedElementIds.push(element.id);
      
      if (element.start >= startTime && element.start + element.duration <= endTime) {
        // Element is completely within range - remove it
        store.removeElement(track.id, element.id);
      } else if (element.start < startTime && element.start + element.duration > endTime) {
        // Element spans the entire range - split it
        const duration1 = startTime - element.start;
        const duration2 = (element.start + element.duration) - endTime;
        
        // Update first part
        store.updateElement(track.id, element.id, {
          duration: duration1,
          trimEnd: element.trimEnd + (element.duration - duration1),
        });
        
        // Add second part
        const newElementId = store.addElement(track.id, {
          ...element,
          id: generateUUID(),
          start: endTime,
          duration: duration2,
          trimStart: element.trimStart + duration1 + (endTime - startTime),
        });
        
        affectedElementIds.push(newElementId);
      } else if (element.start < startTime) {
        // Element overlaps at the start
        const newDuration = startTime - element.start;
        store.updateElement(track.id, element.id, {
          duration: newDuration,
          trimEnd: element.trimEnd + (element.duration - newDuration),
        });
      } else if (element.start + element.duration > endTime) {
        // Element overlaps at the end
        const trimAmount = endTime - element.start;
        store.updateElement(track.id, element.id, {
          start: endTime,
          duration: element.duration - trimAmount,
          trimStart: element.trimStart + trimAmount,
        });
      }
    }
    
    affectedTrackIds.push(track.id);
  }
  
  return {
    success: true,
    command,
    affectedElementIds,
    affectedTrackIds,
    message: `Cut out ${endTime - startTime}s from ${affectedTrackIds.length} track(s)`,
  };
}

async function executeAddTextCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { text, startTime, duration, style } = command.parameters;
  
  // Find or create a title track
  let titleTrack = store.project.timeline.tracks.find(track => track.kind === 'title');
  if (!titleTrack) {
    const trackId = store.addTrack('title', 'Title Track');
    titleTrack = store.project.timeline.tracks.find(track => track.id === trackId)!;
  }
  
  const elementId = store.addElement(titleTrack.id, {
    name: `Text: ${text}`,
    start: startTime,
    duration,
    trimStart: 0,
    trimEnd: 0,
    metadata: {
      text,
      style,
      fontSize: 24,
      color: '#ffffff',
      backgroundColor: 'transparent',
    },
  });
  
  return {
    success: true,
    command,
    affectedElementIds: [elementId],
    affectedTrackIds: [titleTrack.id],
    newElementIds: [elementId],
    message: `Added text "${text}" at ${startTime}s`,
  };
}

async function executeAddOverlayCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { assetName, startTime, duration } = command.parameters;
  
  // Find or create an overlay track
  let overlayTrack = store.project.timeline.tracks.find(track => track.kind === 'overlay');
  if (!overlayTrack) {
    const trackId = store.addTrack('overlay', 'Overlay Track');
    overlayTrack = store.project.timeline.tracks.find(track => track.id === trackId)!;
  }
  
  const elementId = store.addElement(overlayTrack.id, {
    name: `Overlay: ${assetName}`,
    start: startTime,
    duration,
    trimStart: 0,
    trimEnd: 0,
    metadata: {
      assetName,
      opacity: 0.8,
    },
  });
  
  return {
    success: true,
    command,
    affectedElementIds: [elementId],
    affectedTrackIds: [overlayTrack.id],
    newElementIds: [elementId],
    message: `Added overlay "${assetName}" at ${startTime}s`,
  };
}

async function executeSplitElementCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { splitTime } = command.parameters;
  const { targetElementId } = command;
  
  if (!targetElementId) {
    throw new Error('No element selected for split operation');
  }
  
  const element = store.findElement(targetElementId);
  if (!element) {
    throw new Error('Selected element not found');
  }
  
  if (splitTime <= element.element.start || splitTime >= element.element.start + element.element.duration) {
    throw new Error('Split time must be within element duration');
  }
  
  const splitPoint = splitTime - element.element.start;
  const firstDuration = splitPoint;
  const secondDuration = element.element.duration - splitPoint;
  
  // Update first part
  store.updateElement(element.trackId, targetElementId, {
    duration: firstDuration,
    trimEnd: element.element.trimEnd + secondDuration,
  });
  
  // Create second part
  const newElementId = store.addElement(element.trackId, {
    ...element.element,
    id: generateUUID(),
    start: splitTime,
    duration: secondDuration,
    trimStart: element.element.trimStart + firstDuration,
  });
  
  return {
    success: true,
    command,
    affectedElementIds: [targetElementId, newElementId],
    affectedTrackIds: [element.trackId],
    newElementIds: [newElementId],
    message: `Split element at ${splitTime}s`,
  };
}

async function executeMoveElementCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { newStartTime } = command.parameters;
  const { targetElementId } = command;
  
  if (!targetElementId) {
    throw new Error('No element selected for move operation');
  }
  
  const element = store.findElement(targetElementId);
  if (!element) {
    throw new Error('Selected element not found');
  }
  
  store.updateElement(element.trackId, targetElementId, {
    start: newStartTime,
  });
  
  return {
    success: true,
    command,
    affectedElementIds: [targetElementId],
    affectedTrackIds: [element.trackId],
    message: `Moved element to ${newStartTime}s`,
  };
}

async function executeAddTrackCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { kind, name } = command.parameters;
  
  const trackId = store.addTrack(kind, name);
  
  return {
    success: true,
    command,
    affectedElementIds: [],
    affectedTrackIds: [trackId],
    message: `Added ${kind} track "${name}"`,
  };
}

async function executeSelectElementsCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { selectAll, startTime, endTime } = command.parameters;
  let selectedIds: string[] = [];
  
  if (selectAll) {
    selectedIds = store.project.timeline.tracks.flatMap(track => 
      track.elements.map(element => element.id)
    );
  } else if (startTime !== undefined && endTime !== undefined) {
    selectedIds = store.project.timeline.tracks.flatMap(track =>
      track.elements
        .filter(element => 
          element.start < endTime && element.start + element.duration > startTime
        )
        .map(element => element.id)
    );
  }
  
  store.setSelectedElements(selectedIds);
  
  return {
    success: true,
    command,
    affectedElementIds: selectedIds,
    affectedTrackIds: [],
    message: `Selected ${selectedIds.length} element(s)`,
  };
}

async function executeAdjustSpeedCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { speed } = command.parameters;
  const { targetElementId } = command;
  
  if (!targetElementId) {
    throw new Error('No element selected for speed adjustment');
  }
  
  const element = store.findElement(targetElementId);
  if (!element) {
    throw new Error('Selected element not found');
  }
  
  store.updateElement(element.trackId, targetElementId, {
    speed,
    duration: element.element.duration / speed, // Adjust duration based on speed
  });
  
  return {
    success: true,
    command,
    affectedElementIds: [targetElementId],
    affectedTrackIds: [element.trackId],
    message: `Set speed to ${speed}x`,
  };
}

async function executeAdjustVolumeCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { volume } = command.parameters;
  const { targetElementId } = command;
  
  if (!targetElementId) {
    throw new Error('No element selected for volume adjustment');
  }
  
  const element = store.findElement(targetElementId);
  if (!element) {
    throw new Error('Selected element not found');
  }
  
  store.updateElement(element.trackId, targetElementId, {
    volume,
  });
  
  return {
    success: true,
    command,
    affectedElementIds: [targetElementId],
    affectedTrackIds: [element.trackId],
    message: `Set volume to ${Math.round(volume * 100)}%`,
  };
}

async function executeZoomToCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { time, action } = command.parameters;
  
  if (action === 'seek') {
    store.setCurrentTime(time);
    return {
      success: true,
      command,
      affectedElementIds: [],
      affectedTrackIds: [],
      message: `Jumped to ${time}s`,
    };
  }
  
  // Default zoom behavior would be handled by timeline components
  return {
    success: true,
    command,
    affectedElementIds: [],
    affectedTrackIds: [],
    message: `Zoomed to ${time}s`,
  };
}

async function executeSetMarkerCommand(command: Command, store: MultiTrackStore): Promise<CommandResult> {
  const { name, time } = command.parameters;
  
  // This would integrate with the marker system
  // For now, just return success
  return {
    success: true,
    command,
    affectedElementIds: [],
    affectedTrackIds: [],
    message: `Added marker "${name}" at ${time}s`,
  };
}