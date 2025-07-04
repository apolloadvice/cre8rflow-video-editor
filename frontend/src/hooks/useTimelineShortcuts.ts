import { useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useToast } from '@/hooks/use-toast';

interface TimelineShortcutsConfig {
  onMarkIn?: (time: number) => void;
  onMarkOut?: (time: number) => void;
  onSelectAllClips?: () => void;
  onGroupClips?: (clipIds: string[]) => void;
  onRippleDelete?: (clipId: string) => void;
  clips?: any[];
  selectedClipId?: string | null;
  onClipSelect?: (clipId: string | null) => void;
}

export interface TimelineMarks {
  markIn: number | null;
  markOut: number | null;
}

export const useTimelineShortcuts = (config: TimelineShortcutsConfig = {}) => {
  const { toast } = useToast();
  const { 
    currentTime, 
    clips, 
    selectedClipId,
    setCurrentTime,
    deleteClip 
  } = useEditorStore();
  
  const keyListenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  
  // Timeline marks state (In/Out points)
  const marksRef = useRef<TimelineMarks>({
    markIn: null,
    markOut: null
  });
  
  // Ripple mode state  
  const rippleModeRef = useRef<boolean>(false);
  
  // Multi-selection state
  const selectedClipsRef = useRef<Set<string>>(new Set());
  
  // Mark In point (I key)
  const markIn = useCallback(() => {
    const time = currentTime;
    marksRef.current.markIn = time;
    
    console.log(`🎯 [Shortcuts] ⌨️ Mark In set at ${time.toFixed(2)}s`);
    
    if (config.onMarkIn) {
      config.onMarkIn(time);
    }
    
    toast({
      title: "Mark In Set",
      description: `In point marked at ${time.toFixed(2)}s`
    });
  }, [currentTime, config.onMarkIn, toast]);

  // Mark Out point (O key)
  const markOut = useCallback(() => {
    const time = currentTime;
    marksRef.current.markOut = time;
    
    console.log(`🎯 [Shortcuts] ⌨️ Mark Out set at ${time.toFixed(2)}s`);
    
    if (config.onMarkOut) {
      config.onMarkOut(time);
    }
    
    toast({
      title: "Mark Out Set", 
      description: `Out point marked at ${time.toFixed(2)}s`
    });
  }, [currentTime, config.onMarkOut, toast]);

  // Clear marks
  const clearMarks = useCallback(() => {
    marksRef.current.markIn = null;
    marksRef.current.markOut = null;
    
    console.log('🎯 [Shortcuts] ⌨️ Marks cleared');
    
    toast({
      title: "Marks Cleared",
      description: "In and Out points cleared"
    });
  }, [toast]);

  // Toggle ripple mode (R key)
  const toggleRippleMode = useCallback(() => {
    rippleModeRef.current = !rippleModeRef.current;
    
    console.log(`🎯 [Shortcuts] ⌨️ Ripple mode: ${rippleModeRef.current ? 'ON' : 'OFF'}`);
    
    toast({
      title: `Ripple Mode ${rippleModeRef.current ? 'Enabled' : 'Disabled'}`,
      description: rippleModeRef.current 
        ? "Clips will move together when editing"
        : "Clips will edit independently"
    });
  }, [toast]);

  // Select all clips (Ctrl+A)
  const selectAllClips = useCallback(() => {
    const allClipIds = clips.map(clip => clip.id);
    selectedClipsRef.current = new Set(allClipIds);
    
    console.log(`🎯 [Shortcuts] ⌨️ Selected all ${allClipIds.length} clips`);
    
    if (config.onSelectAllClips) {
      config.onSelectAllClips();
    }
    
    toast({
      title: "All Clips Selected",
      description: `${allClipIds.length} clips selected`
    });
  }, [clips, config.onSelectAllClips, toast]);

  // Add/remove clip from multi-selection
  const toggleClipSelection = useCallback((clipId: string, additive: boolean = false) => {
    if (!additive) {
      selectedClipsRef.current.clear();
    }
    
    if (selectedClipsRef.current.has(clipId)) {
      selectedClipsRef.current.delete(clipId);
    } else {
      selectedClipsRef.current.add(clipId);
    }
    
    console.log(`🎯 [Shortcuts] Multi-selection: ${Array.from(selectedClipsRef.current).join(', ')}`);
  }, []);

  // Group selected clips (Ctrl+G)
  const groupSelectedClips = useCallback(() => {
    const selectedIds = Array.from(selectedClipsRef.current);
    
    if (selectedIds.length < 2) {
      toast({
        title: "Cannot Group",
        description: "Select at least 2 clips to group",
        variant: "destructive"
      });
      return;
    }
    
    console.log(`🎯 [Shortcuts] ⌨️ Grouping ${selectedIds.length} clips`);
    
    if (config.onGroupClips) {
      config.onGroupClips(selectedIds);
    }
    
    toast({
      title: "Clips Grouped",
      description: `${selectedIds.length} clips grouped together`
    });
  }, [config.onGroupClips, toast]);

  // Ripple delete (Delete key in ripple mode)
  const rippleDelete = useCallback(() => {
    if (!selectedClipId) {
      toast({
        title: "No Clip Selected",
        description: "Select a clip to delete",
        variant: "destructive"
      });
      return;
    }
    
    console.log(`🎯 [Shortcuts] ⌨️ Ripple delete clip: ${selectedClipId}`);
    
    if (rippleModeRef.current) {
      // In ripple mode, delete and move subsequent clips
      if (config.onRippleDelete) {
        config.onRippleDelete(selectedClipId);
      } else {
        // Fallback to regular delete
        deleteClip(selectedClipId);
      }
      
      toast({
        title: "Ripple Delete",
        description: "Clip deleted, subsequent clips moved"
      });
    } else {
      // Regular delete without moving other clips
      deleteClip(selectedClipId);
      
      toast({
        title: "Clip Deleted",
        description: "Clip removed from timeline"
      });
    }
  }, [selectedClipId, deleteClip, config.onRippleDelete, toast]);

  // Jump to mark in/out points
  const jumpToMarkIn = useCallback(() => {
    if (marksRef.current.markIn !== null) {
      setCurrentTime(marksRef.current.markIn);
      console.log(`🎯 [Shortcuts] ⌨️ Jumped to Mark In: ${marksRef.current.markIn.toFixed(2)}s`);
    }
  }, [setCurrentTime]);

  const jumpToMarkOut = useCallback(() => {
    if (marksRef.current.markOut !== null) {
      setCurrentTime(marksRef.current.markOut);
      console.log(`🎯 [Shortcuts] ⌨️ Jumped to Mark Out: ${marksRef.current.markOut.toFixed(2)}s`);
    }
  }, [setCurrentTime]);

  // Create range selection between marks
  const selectMarkedRange = useCallback(() => {
    const { markIn, markOut } = marksRef.current;
    
    if (markIn === null || markOut === null) {
      toast({
        title: "No Range Marked",
        description: "Set both In (I) and Out (O) points first",
        variant: "destructive"
      });
      return;
    }
    
    const startTime = Math.min(markIn, markOut);
    const endTime = Math.max(markIn, markOut);
    
    // Find clips within the marked range
    const clipsInRange = clips.filter(clip => 
      clip.start < endTime && clip.end > startTime
    );
    
    selectedClipsRef.current = new Set(clipsInRange.map(clip => clip.id));
    
    console.log(`🎯 [Shortcuts] ⌨️ Selected ${clipsInRange.length} clips in marked range`);
    
    toast({
      title: "Range Selected",
      description: `${clipsInRange.length} clips selected between marks`
    });
  }, [clips, toast]);

  // Setup keyboard shortcuts
  const setupKeyboardShortcuts = useCallback(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Handle modifier combinations first
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'a':
            e.preventDefault();
            selectAllClips();
            console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Select All (Ctrl+A)');
            break;
            
          case 'g':
            e.preventDefault();
            groupSelectedClips();
            console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Group Clips (Ctrl+G)');
            break;
        }
        return;
      }
      
      // Handle single key shortcuts
      switch (e.key.toLowerCase()) {
        case 'i':
          e.preventDefault();
          markIn();
          console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Mark In (I)');
          break;
          
        case 'o':
          e.preventDefault();
          markOut();
          console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Mark Out (O)');
          break;
          
        case 'r':
          e.preventDefault();
          toggleRippleMode();
          console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Toggle Ripple Mode (R)');
          break;
          
        case 'delete':
        case 'backspace':
          e.preventDefault();
          rippleDelete();
          console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Delete Clip (Del)');
          break;
          
        case 'escape':
          e.preventDefault();
          // Clear selection and marks
          selectedClipsRef.current.clear();
          clearMarks();
          if (config.onClipSelect) {
            config.onClipSelect(null);
          }
          console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Clear Selection (Esc)');
          break;
          
        case '[':
          e.preventDefault();
          jumpToMarkIn();
          console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Jump to Mark In ([)');
          break;
          
        case ']':
          e.preventDefault();
          jumpToMarkOut();
          console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Jump to Mark Out (])');
          break;
          
        case 'enter':
          if (e.shiftKey) {
            e.preventDefault();
            selectMarkedRange();
            console.log('🎯 [Shortcuts] ⌨️ Keyboard shortcut: Select Marked Range (Shift+Enter)');
          }
          break;
      }
    };
    
    keyListenerRef.current = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    markIn, markOut, clearMarks, toggleRippleMode, selectAllClips, 
    groupSelectedClips, rippleDelete, jumpToMarkIn, jumpToMarkOut, 
    selectMarkedRange, config.onClipSelect
  ]);

  // Setup keyboard shortcuts on mount
  useEffect(() => {
    const cleanup = setupKeyboardShortcuts();
    
    return () => {
      cleanup();
      if (keyListenerRef.current) {
        document.removeEventListener('keydown', keyListenerRef.current);
      }
    };
  }, [setupKeyboardShortcuts]);

  return {
    // State
    marks: marksRef.current,
    isRippleMode: rippleModeRef.current,
    selectedClips: Array.from(selectedClipsRef.current),
    
    // Actions
    markIn,
    markOut,
    clearMarks,
    toggleRippleMode,
    selectAllClips,
    toggleClipSelection,
    groupSelectedClips,
    rippleDelete,
    jumpToMarkIn,
    jumpToMarkOut,
    selectMarkedRange,
    
    // Utilities
    hasMarks: marksRef.current.markIn !== null || marksRef.current.markOut !== null,
    hasMarkRange: marksRef.current.markIn !== null && marksRef.current.markOut !== null,
    multiSelectionCount: selectedClipsRef.current.size
  };
}; 