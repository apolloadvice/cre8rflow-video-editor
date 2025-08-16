/**
 * Multi-Track Commands Hook
 * 
 * React hook for command-driven editing with:
 * - Natural language command processing
 * - Integration with multi-track store
 * - Command history and undo/redo
 * - Real-time feedback and validation
 * - Preserved cut out functionality
 */

import { useCallback, useState, useRef } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { 
  parseCommand, 
  executeCommand, 
  Command, 
  CommandResult,
  CommandType 
} from '@/lib/commands';

export interface CommandHistory {
  commands: Command[];
  results: CommandResult[];
  currentIndex: number;
}

export interface UseMultiTrackCommandsOptions {
  enableHistory?: boolean;
  maxHistorySize?: number;
  enableAIFallback?: boolean;
  confidenceThreshold?: number;
}

export interface UseMultiTrackCommandsReturn {
  // Command execution
  executeTextCommand: (input: string) => Promise<CommandResult>;
  executeStructuredCommand: (command: Command) => Promise<CommandResult>;
  
  // Command parsing
  parseTextCommand: (input: string) => Command | null;
  
  // History management
  history: CommandHistory;
  canUndo: boolean;
  canRedo: boolean;
  undoLastCommand: () => Promise<void>;
  redoCommand: () => Promise<void>;
  clearHistory: () => void;
  
  // State
  isExecuting: boolean;
  lastResult: CommandResult | null;
  supportedCommands: CommandType[];
  
  // Statistics
  stats: {
    totalCommands: number;
    successfulCommands: number;
    failedCommands: number;
    avgExecutionTime: number;
  };
}

export function useMultiTrackCommands(
  options: UseMultiTrackCommandsOptions = {}
): UseMultiTrackCommandsReturn {
  const {
    enableHistory = true,
    maxHistorySize = 100,
    enableAIFallback = true,
    confidenceThreshold = 0.7,
  } = options;
  
  const store = useMultiTrackStore();
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [history, setHistory] = useState<CommandHistory>({
    commands: [],
    results: [],
    currentIndex: -1,
  });
  
  const executionTimesRef = useRef<number[]>([]);
  
  // Get current context for command parsing
  const getCommandContext = useCallback(() => {
    return {
      selectedElementIds: store.selectedElementIds,
      selectedTrackId: store.selectedElementIds.length > 0 
        ? store.findElement(store.selectedElementIds[0])?.trackId 
        : undefined,
      currentTime: store.currentTime,
    };
  }, [store]);
  
  // Parse text command into structured command
  const parseTextCommand = useCallback((input: string): Command | null => {
    const context = getCommandContext();
    return parseCommand(input, context);
  }, [getCommandContext]);
  
  // Execute structured command
  const executeStructuredCommand = useCallback(async (command: Command): Promise<CommandResult> => {
    setIsExecuting(true);
    const startTime = performance.now();
    
    try {
      // Check confidence threshold
      if (command.confidence !== undefined && command.confidence < confidenceThreshold) {
        throw new Error(`Command confidence too low: ${command.confidence}`);
      }
      
      // Execute the command
      const result = await executeCommand(command, store);
      
      // Track execution time
      const executionTime = performance.now() - startTime;
      executionTimesRef.current.push(executionTime);
      if (executionTimesRef.current.length > 100) {
        executionTimesRef.current.shift();
      }
      
      // Update history
      if (enableHistory && result.success) {
        setHistory(prev => {
          const newCommands = [...prev.commands.slice(0, prev.currentIndex + 1), command];
          const newResults = [...prev.results.slice(0, prev.currentIndex + 1), result];
          
          // Limit history size
          if (newCommands.length > maxHistorySize) {
            newCommands.shift();
            newResults.shift();
          }
          
          return {
            commands: newCommands,
            results: newResults,
            currentIndex: newCommands.length - 1,
          };
        });
      }
      
      setLastResult(result);
      return result;
      
    } catch (error) {
      const errorResult: CommandResult = {
        success: false,
        command,
        affectedElementIds: [],
        affectedTrackIds: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      
      setLastResult(errorResult);
      return errorResult;
      
    } finally {
      setIsExecuting(false);
    }
  }, [store, confidenceThreshold, enableHistory, maxHistorySize]);
  
  // Execute text command (parse + execute)
  const executeTextCommand = useCallback(async (input: string): Promise<CommandResult> => {
    console.log('🎵 [MultiTrackCommands] Processing command:', input);
    
    // Try to parse the command
    const command = parseTextCommand(input);
    
    if (!command) {
      // If parsing fails and AI fallback is enabled, try AI processing
      if (enableAIFallback) {
        console.log('🎵 [MultiTrackCommands] Falling back to AI processing');
        
        // Here you could integrate with the existing AI command system
        // For now, return a parse error
        return {
          success: false,
          command: {
            id: 'unknown',
            type: 'cut_out', // placeholder
            description: input,
            parameters: {},
            timestamp: Date.now(),
          },
          affectedElementIds: [],
          affectedTrackIds: [],
          error: 'Could not understand command. Try: "cut out 10-20", "add text hello", "split at 15"',
        };
      }
      
      return {
        success: false,
        command: {
          id: 'unknown',
          type: 'cut_out', // placeholder
          description: input,
          parameters: {},
          timestamp: Date.now(),
        },
        affectedElementIds: [],
        affectedTrackIds: [],
        error: 'Command not recognized',
      };
    }
    
    console.log('🎵 [MultiTrackCommands] Parsed command:', command);
    return executeStructuredCommand(command);
  }, [parseTextCommand, executeStructuredCommand, enableAIFallback]);
  
  // Undo last command
  const undoLastCommand = useCallback(async () => {
    if (history.currentIndex < 0) return;
    
    const commandToUndo = history.commands[history.currentIndex];
    const resultToUndo = history.results[history.currentIndex];
    
    // Use the multi-track store's undo functionality
    store.undo();
    
    // Update history index
    setHistory(prev => ({
      ...prev,
      currentIndex: prev.currentIndex - 1,
    }));
    
    console.log('🎵 [MultiTrackCommands] Undid command:', commandToUndo.description);
  }, [history, store]);
  
  // Redo command
  const redoCommand = useCallback(async () => {
    if (history.currentIndex >= history.commands.length - 1) return;
    
    const commandToRedo = history.commands[history.currentIndex + 1];
    
    // Use the multi-track store's redo functionality
    store.redo();
    
    // Update history index
    setHistory(prev => ({
      ...prev,
      currentIndex: prev.currentIndex + 1,
    }));
    
    console.log('🎵 [MultiTrackCommands] Redid command:', commandToRedo.description);
  }, [history, store]);
  
  // Clear command history
  const clearHistory = useCallback(() => {
    setHistory({
      commands: [],
      results: [],
      currentIndex: -1,
    });
    executionTimesRef.current = [];
  }, []);
  
  // Calculate statistics
  const stats = {
    totalCommands: history.commands.length,
    successfulCommands: history.results.filter(r => r.success).length,
    failedCommands: history.results.filter(r => !r.success).length,
    avgExecutionTime: executionTimesRef.current.length > 0
      ? executionTimesRef.current.reduce((a, b) => a + b, 0) / executionTimesRef.current.length
      : 0,
  };
  
  // Supported command types
  const supportedCommands: CommandType[] = [
    'cut_out',
    'add_element',
    'move_element',
    'split_element',
    'merge_elements',
    'adjust_timing',
    'add_track',
    'delete_track',
    'add_text',
    'add_overlay',
    'apply_effect',
    'adjust_volume',
    'adjust_speed',
    'set_marker',
    'zoom_to',
    'select_elements',
  ];
  
  return {
    // Command execution
    executeTextCommand,
    executeStructuredCommand,
    
    // Command parsing
    parseTextCommand,
    
    // History management
    history,
    canUndo: history.currentIndex >= 0,
    canRedo: history.currentIndex < history.commands.length - 1,
    undoLastCommand,
    redoCommand,
    clearHistory,
    
    // State
    isExecuting,
    lastResult,
    supportedCommands,
    
    // Statistics
    stats,
  };
}

// Helper function to get user-friendly command examples
export function getCommandExamples(): Record<CommandType, string[]> {
  return {
    cut_out: [
      'cut out 10-20',
      'cut out 1:30-2:00',
      'remove 5 to 15',
    ],
    add_element: [
      'add clip at 10s',
      'insert video at 1:30',
    ],
    move_element: [
      'move to 20s',
      'move clip to 1:45',
    ],
    split_element: [
      'split at 15s',
      'split at 1:30',
    ],
    merge_elements: [
      'merge clips',
      'join elements',
    ],
    adjust_timing: [
      'adjust timing',
      'sync elements',
    ],
    add_track: [
      'add video track',
      'add audio track named "Music"',
    ],
    delete_track: [
      'delete track',
      'remove audio track',
    ],
    add_text: [
      'add text "Hello World"',
      'add text "Title" at 10s for 5s',
    ],
    add_overlay: [
      'add overlay "logo.png"',
      'add overlay "watermark" at 30s',
    ],
    apply_effect: [
      'add fade in',
      'apply blur effect',
    ],
    adjust_volume: [
      'volume 50%',
      'set volume to 80%',
    ],
    adjust_speed: [
      'speed 2x',
      'set speed to 0.5x',
    ],
    set_marker: [
      'add marker',
      'set marker "Scene 1" at 30s',
    ],
    zoom_to: [
      'go to 1:30',
      'jump to 45s',
    ],
    select_elements: [
      'select all',
      'select from 10 to 30',
    ],
  };
}