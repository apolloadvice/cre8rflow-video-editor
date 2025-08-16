/**
 * Multi-Track AI Commands Bridge Hook
 * 
 * Connects existing OpenAI command system with new multi-track store:
 * - Preserves existing cut out functionality and patterns
 * - Routes commands between single-track and multi-track systems
 * - Maintains backward compatibility
 * - Adds multi-track specific command interpretation
 */

import { useCallback, useEffect, useState } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { useAICommands } from './useAICommands';
import { TrackKind, TimelineElement } from '@/types/timeline';
import { generateUUID } from '@/lib/utils';

export interface MultiTrackCommandContext {
  selectedTrackId?: string;
  selectedElementIds: string[];
  currentTime: number;
  activeTrackKinds: TrackKind[];
}

export interface CommandRoutingResult {
  handled: boolean;
  success: boolean;
  message?: string;
  error?: string;
  affectedTracks?: string[];
  affectedElements?: string[];
}

export function useMultiTrackAICommands() {
  const multiTrackStore = useMultiTrackStore();
  const legacyAICommands = useAICommands();
  
  // Get current command context
  const getCommandContext = useCallback((): MultiTrackCommandContext => {
    const selectedElementIds = multiTrackStore.selectedElementIds;
    const selectedTrackId = selectedElementIds.length > 0 
      ? multiTrackStore.findElement(selectedElementIds[0])?.trackId 
      : undefined;
    
    const activeTrackKinds = multiTrackStore.project.timeline.tracks
      .filter(track => track.elements.length > 0)
      .map(track => track.kind);
    
    return {
      selectedTrackId,
      selectedElementIds,
      currentTime: multiTrackStore.currentTime,
      activeTrackKinds,
    };
  }, [multiTrackStore]);
  
  // Enhanced command parsing for multi-track context
  const parseMultiTrackCommand = useCallback((command: string, context: MultiTrackCommandContext) => {
    const normalizedCommand = command.toLowerCase().trim();
    
    // Multi-track specific patterns
    const multiTrackPatterns = {
      // Track-specific cut operations
      trackCutOut: /cut\s+out\s+(.+?)\s+from\s+(video|audio|title|overlay|effect)\s+track/i,
      
      // Track management
      addTrack: /add\s+(video|audio|title|overlay|effect)\s+track/i,
      deleteTrack: /(?:delete|remove)\s+(video|audio|title|overlay|effect)\s+track/i,
      muteTrack: /mute\s+(video|audio|title|overlay|effect)\s+track/i,
      unmuteTrack: /unmute\s+(video|audio|title|overlay|effect)\s+track/i,
      
      // Cross-track operations
      moveToTrack: /move\s+(?:to\s+)?(video|audio|title|overlay|effect)\s+track/i,
      syncTracks: /sync\s+(?:all\s+)?tracks/i,
      
      // Track-specific element operations
      addToTrack: /add\s+(.+?)\s+to\s+(video|audio|title|overlay|effect)\s+track/i,
      selectTrack: /select\s+(video|audio|title|overlay|effect)\s+track/i,
    };
    
    // Check for multi-track specific commands
    for (const [patternName, pattern] of Object.entries(multiTrackPatterns)) {
      const match = normalizedCommand.match(pattern);
      if (match) {
        return {
          isMultiTrack: true,
          pattern: patternName,
          matches: match,
          originalCommand: command,
          confidence: 0.9,
        };
      }
    }
    
    // Check if command mentions tracks but doesn't match specific patterns
    const hasTrackReference = /\b(?:video|audio|title|overlay|effect)\s+track/i.test(normalizedCommand);
    if (hasTrackReference) {
      return {
        isMultiTrack: true,
        pattern: 'generic_track_reference',
        matches: [normalizedCommand],
        originalCommand: command,
        confidence: 0.7,
      };
    }
    
    // Not a multi-track specific command
    return {
      isMultiTrack: false,
      originalCommand: command,
      confidence: 0.0,
    };
  }, []);
  
  // Execute multi-track specific commands
  const executeMultiTrackCommand = useCallback(async (
    parsedCommand: any,
    context: MultiTrackCommandContext
  ): Promise<CommandRoutingResult> => {
    const { pattern, matches, originalCommand } = parsedCommand;
    
    try {
      switch (pattern) {
        case 'trackCutOut': {
          const [, timeRange, trackKind] = matches;
          const track = multiTrackStore.project.timeline.tracks.find(t => t.kind === trackKind);
          
          if (!track) {
            return {
              handled: true,
              success: false,
              error: `No ${trackKind} track found`,
            };
          }
          
          // Parse time range and execute cut out on specific track
          const timeMatch = timeRange.match(/(\d+(?::\d+)?)\s*[-–]\s*(\d+(?::\d+)?)/);
          if (timeMatch) {
            const [, startStr, endStr] = timeMatch;
            const startTime = parseTimeToSeconds(startStr);
            const endTime = parseTimeToSeconds(endStr);
            
            // Execute cut out on specific track
            await executeCutOutOnTrack(track.id, startTime, endTime);
            
            return {
              handled: true,
              success: true,
              message: `Cut out ${timeRange} from ${trackKind} track`,
              affectedTracks: [track.id],
            };
          }
          break;
        }
        
        case 'addTrack': {
          const [, trackKind] = matches;
          const trackId = multiTrackStore.addTrack(trackKind as TrackKind, `${trackKind.charAt(0).toUpperCase() + trackKind.slice(1)} Track`);
          
          return {
            handled: true,
            success: true,
            message: `Added ${trackKind} track`,
            affectedTracks: [trackId],
          };
        }
        
        case 'deleteTrack': {
          const [, trackKind] = matches;
          const track = multiTrackStore.project.timeline.tracks.find(t => t.kind === trackKind);
          
          if (!track) {
            return {
              handled: true,
              success: false,
              error: `No ${trackKind} track found`,
            };
          }
          
          multiTrackStore.removeTrack(track.id);
          
          return {
            handled: true,
            success: true,
            message: `Deleted ${trackKind} track`,
            affectedTracks: [track.id],
          };
        }
        
        case 'muteTrack':
        case 'unmuteTrack': {
          const [, trackKind] = matches;
          const track = multiTrackStore.project.timeline.tracks.find(t => t.kind === trackKind);
          
          if (!track) {
            return {
              handled: true,
              success: false,
              error: `No ${trackKind} track found`,
            };
          }
          
          const shouldMute = pattern === 'muteTrack';
          multiTrackStore.updateTrack(track.id, { muted: shouldMute });
          
          return {
            handled: true,
            success: true,
            message: `${shouldMute ? 'Muted' : 'Unmuted'} ${trackKind} track`,
            affectedTracks: [track.id],
          };
        }
        
        case 'moveToTrack': {
          const [, targetTrackKind] = matches;
          
          if (context.selectedElementIds.length === 0) {
            return {
              handled: true,
              success: false,
              error: 'No elements selected to move',
            };
          }
          
          const targetTrack = multiTrackStore.project.timeline.tracks.find(t => t.kind === targetTrackKind);
          if (!targetTrack) {
            return {
              handled: true,
              success: false,
              error: `No ${targetTrackKind} track found`,
            };
          }
          
          // Move selected elements to target track
          const affectedElements: string[] = [];
          const affectedTracks = new Set<string>();
          
          for (const elementId of context.selectedElementIds) {
            const elementInfo = multiTrackStore.findElement(elementId);
            if (elementInfo && elementInfo.trackId !== targetTrack.id) {
              multiTrackStore.moveElement(
                elementId,
                elementInfo.trackId,
                targetTrack.id,
                elementInfo.element.start
              );
              affectedElements.push(elementId);
              affectedTracks.add(elementInfo.trackId);
              affectedTracks.add(targetTrack.id);
            }
          }
          
          return {
            handled: true,
            success: true,
            message: `Moved ${affectedElements.length} element(s) to ${targetTrackKind} track`,
            affectedTracks: Array.from(affectedTracks),
            affectedElements,
          };
        }
        
        case 'selectTrack': {
          const [, trackKind] = matches;
          const track = multiTrackStore.project.timeline.tracks.find(t => t.kind === trackKind);
          
          if (!track) {
            return {
              handled: true,
              success: false,
              error: `No ${trackKind} track found`,
            };
          }
          
          // Select all elements in the track
          const trackElementIds = track.elements.map(element => element.id);
          multiTrackStore.setSelectedElements(trackElementIds);
          
          return {
            handled: true,
            success: true,
            message: `Selected ${trackElementIds.length} element(s) from ${trackKind} track`,
            affectedTracks: [track.id],
            affectedElements: trackElementIds,
          };
        }
        
        default:
          return {
            handled: false,
            success: false,
            error: 'Unknown multi-track command pattern',
          };
      }
    } catch (error) {
      return {
        handled: true,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error executing multi-track command',
      };
    }
    
    return {
      handled: false,
      success: false,
      error: 'Command not handled',
    };
  }, [multiTrackStore]);
  
  // Main command execution function - ALWAYS processes through multi-track system first
  const executeCommand = useCallback(async (command: string): Promise<CommandRoutingResult> => {
    const context = getCommandContext();
    const parsedCommand = parseMultiTrackCommand(command, context);
    
    console.log('🎵 [MultiTrackAICommands] Processing command (multi-track default):', {
      command,
      context,
      parsedCommand,
    });
    
    // FIRST: Try explicit multi-track specific commands
    if (parsedCommand.isMultiTrack && parsedCommand.confidence > 0.8) {
      console.log('🎵 [MultiTrackAICommands] Handling explicit multi-track command');
      return executeMultiTrackCommand(parsedCommand, context);
    }
    
    // SECOND: For general commands, enhance with multi-track context
    console.log('🎵 [MultiTrackAICommands] Attempting to handle as multi-track-aware command');
    
    // Check if it's a cut out command that should work on selected track or all tracks
    const isCutOutCommand = /cut\s+out|remove|delete|trim.*out/i.test(command);
    if (isCutOutCommand) {
      if (context.selectedTrackId) {
        // Route to specific track
        const enhancedCommand = `${command} from ${getTrackKindName(context.selectedTrackId)} track`;
        const enhancedParsed = parseMultiTrackCommand(enhancedCommand, context);
        
        if (enhancedParsed.isMultiTrack) {
          return executeMultiTrackCommand(enhancedParsed, context);
        }
      } else {
        // Apply to all tracks (default multi-track behavior)
        try {
          const allTracksResult = await executeMultiTrackCutOut(command, context);
          if (allTracksResult.success) {
            return allTracksResult;
          }
        } catch (error) {
          console.warn('🎵 [MultiTrackAICommands] Multi-track cut out failed:', error);
        }
      }
    }
    
    // THIRD: Try other multi-track interpretations of general commands
    const generalMultiTrackResult = await tryGeneralCommandAsMultiTrack(command, context);
    if (generalMultiTrackResult.handled) {
      return generalMultiTrackResult;
    }
    
    // LAST RESORT: Fall back to legacy AI commands system
    console.log('🎵 [MultiTrackAICommands] Using legacy system as fallback');
    try {
      const result = await legacyAICommands.executeCommand(command);
      
      return {
        handled: true,
        success: !result.error,
        message: result.error ? undefined : 'Command executed via legacy system',
        error: result.error,
      };
    } catch (error) {
      return {
        handled: true,
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
      };
    }
  }, [getCommandContext, parseMultiTrackCommand, executeMultiTrackCommand, legacyAICommands]);
  
  // Helper function to get track kind name from track ID
  const getTrackKindName = useCallback((trackId: string): string => {
    const track = multiTrackStore.project.timeline.tracks.find(t => t.id === trackId);
    return track?.kind || 'unknown';
  }, [multiTrackStore.project.timeline.tracks]);
  
  // Helper function to execute cut out on specific track
  const executeCutOutOnTrack = useCallback(async (trackId: string, startTime: number, endTime: number) => {
    const track = multiTrackStore.project.timeline.tracks.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found');
    
    // Find elements that intersect with the cut range
    const elementsToProcess = track.elements.filter(element => 
      element.start < endTime && element.start + element.duration > startTime
    );
    
    for (const element of elementsToProcess) {
      if (element.start >= startTime && element.start + element.duration <= endTime) {
        // Element is completely within range - remove it
        multiTrackStore.removeElement(trackId, element.id);
      } else if (element.start < startTime && element.start + element.duration > endTime) {
        // Element spans the entire range - split it
        const duration1 = startTime - element.start;
        const duration2 = (element.start + element.duration) - endTime;
        
        // Update first part
        multiTrackStore.updateElement(trackId, element.id, {
          duration: duration1,
          trimEnd: element.trimEnd + (element.duration - duration1),
        });
        
        // Add second part
        multiTrackStore.addElement(trackId, {
          ...element,
          id: generateUUID(),
          start: endTime,
          duration: duration2,
          trimStart: element.trimStart + duration1 + (endTime - startTime),
        });
      } else if (element.start < startTime) {
        // Element overlaps at the start
        const newDuration = startTime - element.start;
        multiTrackStore.updateElement(trackId, element.id, {
          duration: newDuration,
          trimEnd: element.trimEnd + (element.duration - newDuration),
        });
      } else if (element.start + element.duration > endTime) {
        // Element overlaps at the end
        const trimAmount = endTime - element.start;
        multiTrackStore.updateElement(trackId, element.id, {
          start: endTime,
          duration: element.duration - trimAmount,
          trimStart: element.trimStart + trimAmount,
        });
      }
    }
  }, [multiTrackStore]);
  
  // Helper function to execute cut out on all tracks (default behavior)
  const executeMultiTrackCutOut = useCallback(async (command: string, context: MultiTrackCommandContext): Promise<CommandRoutingResult> => {
    // Parse time range from command
    const timeMatch = command.match(/(\d+(?::\d+)?)\s*[-–]\s*(\d+(?::\d+)?)/);
    if (!timeMatch) {
      return { handled: false, success: false, error: 'Could not parse time range' };
    }
    
    const [, startStr, endStr] = timeMatch;
    const startTime = parseTimeToSeconds(startStr);
    const endTime = parseTimeToSeconds(endStr);
    
    const affectedTracks: string[] = [];
    const affectedElements: string[] = [];
    
    // Apply cut out to all tracks with elements
    for (const track of multiTrackStore.project.timeline.tracks) {
      if (track.elements.length > 0) {
        try {
          await executeCutOutOnTrack(track.id, startTime, endTime);
          affectedTracks.push(track.id);
          
          // Track affected elements (this is approximate since elements may be modified/deleted)
          track.elements.forEach(element => {
            if (element.start < endTime && element.start + element.duration > startTime) {
              affectedElements.push(element.id);
            }
          });
        } catch (error) {
          console.warn(`🎵 [MultiTrackAICommands] Failed to cut out from track ${track.id}:`, error);
        }
      }
    }
    
    return {
      handled: true,
      success: affectedTracks.length > 0,
      message: `Cut out ${endTime - startTime}s from ${affectedTracks.length} track(s)`,
      affectedTracks,
      affectedElements,
    };
  }, [multiTrackStore, executeCutOutOnTrack]);
  
  // Helper function to try interpreting general commands as multi-track operations
  const tryGeneralCommandAsMultiTrack = useCallback(async (command: string, context: MultiTrackCommandContext): Promise<CommandRoutingResult> => {
    // For now, return not handled - this is where we could add more general multi-track interpretations
    // For example: "add text" could automatically create a title track if none exists
    
    const textMatch = command.match(/add\s+text\s+['"]([^'"]+)['"]/i);
    if (textMatch) {
      const [, text] = textMatch;
      
      // Find or create title track
      let titleTrack = multiTrackStore.project.timeline.tracks.find(track => track.kind === 'title');
      if (!titleTrack) {
        const trackId = multiTrackStore.addTrack('title', 'Title Track');
        titleTrack = multiTrackStore.project.timeline.tracks.find(track => track.id === trackId);
      }
      
      if (titleTrack) {
        const elementId = multiTrackStore.addElement(titleTrack.id, {
          name: `Text: ${text}`,
          start: context.currentTime,
          duration: 3,
          trimStart: 0,
          trimEnd: 0,
          metadata: { text, style: 'default' },
        });
        
        return {
          handled: true,
          success: true,
          message: `Added text "${text}" to title track`,
          affectedTracks: [titleTrack.id],
          affectedElements: [elementId],
        };
      }
    }
    
    return { handled: false, success: false };
  }, [multiTrackStore]);
  
  return {
    executeCommand,
    getCommandContext,
    
    // Legacy compatibility
    ...legacyAICommands,
  };
}

// Helper function to parse time strings to seconds
function parseTimeToSeconds(timeStr: string): number {
  if (timeStr.includes(':')) {
    const [minutes, seconds] = timeStr.split(':').map(Number);
    return minutes * 60 + seconds;
  }
  return Number(timeStr);
}