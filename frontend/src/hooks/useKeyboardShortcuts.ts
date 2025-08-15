/**
 * Keyboard Shortcuts Hook for Timeline
 * 
 * Provides comprehensive keyboard shortcut management for the timeline:
 * - Playback controls (space, arrow keys)
 * - Editing operations (split, delete, copy, paste)
 * - Navigation (markers, zoom, selection)
 * - Track operations (mute, solo, lock)
 * - Customizable and conflict-free shortcuts
 */

import { useCallback, useEffect, useRef } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { useTimelineZoom } from './useTimelineZoom';
import { useTimelineMarkers } from './useTimelineMarkersNew';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  description: string;
  category: 'playback' | 'editing' | 'navigation' | 'selection' | 'tracks' | 'zoom';
  action: () => void;
  disabled?: boolean;
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  enablePlaybackShortcuts?: boolean;
  enableEditingShortcuts?: boolean;
  enableNavigationShortcuts?: boolean;
  enableSelectionShortcuts?: boolean;
  enableTrackShortcuts?: boolean;
  enableZoomShortcuts?: boolean;
  customShortcuts?: KeyboardShortcut[];
}

export interface UseKeyboardShortcutsReturn {
  shortcuts: KeyboardShortcut[];
  handleKeyDown: (event: KeyboardEvent) => boolean; // Returns true if handled
  isShortcutActive: (shortcut: KeyboardShortcut, event: KeyboardEvent) => boolean;
  addCustomShortcut: (shortcut: KeyboardShortcut) => void;
  removeCustomShortcut: (key: string) => void;
  getShortcutByKey: (key: string, modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }) => KeyboardShortcut | null;
  getShortcutsByCategory: (category: KeyboardShortcut['category']) => KeyboardShortcut[];
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}): UseKeyboardShortcutsReturn {
  const {
    enabled = true,
    enablePlaybackShortcuts = true,
    enableEditingShortcuts = true,
    enableNavigationShortcuts = true,
    enableSelectionShortcuts = true,
    enableTrackShortcuts = true,
    enableZoomShortcuts = true,
    customShortcuts = [],
  } = options;
  
  const store = useMultiTrackStore();
  const { zoomIn, zoomOut, resetZoom, fitToContent, fitToSelection } = useTimelineZoom();
  const { addMarker, goToNextMarker, goToPrevMarker } = useTimelineMarkers();
  const customShortcutsRef = useRef<KeyboardShortcut[]>(customShortcuts);
  
  // Update custom shortcuts ref when prop changes
  useEffect(() => {
    customShortcutsRef.current = customShortcuts;
  }, [customShortcuts]);
  
  // Define all built-in shortcuts
  const builtInShortcuts: KeyboardShortcut[] = [
    // Playback shortcuts
    ...(enablePlaybackShortcuts ? [
      {
        key: ' ', // Space
        description: 'Play/Pause',
        category: 'playback' as const,
        action: () => store.setIsPlaying(!store.isPlaying),
      },
      {
        key: 'Home',
        description: 'Go to beginning',
        category: 'playback' as const,
        action: () => store.setCurrentTime(0),
      },
      {
        key: 'End',
        description: 'Go to end',
        category: 'playback' as const,
        action: () => store.setCurrentTime(store.getTotalDuration()),
      },
      {
        key: 'ArrowLeft',
        description: 'Step backward (1 frame)',
        category: 'playback' as const,
        action: () => {
          const frameTime = 1 / store.project.fps;
          store.setCurrentTime(Math.max(0, store.currentTime - frameTime));
        },
      },
      {
        key: 'ArrowRight',
        description: 'Step forward (1 frame)',
        category: 'playback' as const,
        action: () => {
          const frameTime = 1 / store.project.fps;
          store.setCurrentTime(store.currentTime + frameTime);
        },
      },
      {
        key: 'ArrowLeft',
        shiftKey: true,
        description: 'Step backward (1 second)',
        category: 'playback' as const,
        action: () => store.setCurrentTime(Math.max(0, store.currentTime - 1)),
      },
      {
        key: 'ArrowRight',
        shiftKey: true,
        description: 'Step forward (1 second)',
        category: 'playback' as const,
        action: () => store.setCurrentTime(store.currentTime + 1),
      },
      {
        key: 'j',
        description: 'Rewind',
        category: 'playback' as const,
        action: () => store.setCurrentTime(Math.max(0, store.currentTime - 5)),
      },
      {
        key: 'k',
        description: 'Play/Pause',
        category: 'playback' as const,
        action: () => store.setIsPlaying(!store.isPlaying),
      },
      {
        key: 'l',
        description: 'Fast forward',
        category: 'playback' as const,
        action: () => store.setCurrentTime(store.currentTime + 5),
      },
    ] : []),
    
    // Editing shortcuts
    ...(enableEditingShortcuts ? [
      {
        key: 's',
        ctrlKey: true,
        description: 'Split elements at playhead',
        category: 'editing' as const,
        action: () => store.splitElementsAt(store.currentTime),
      },
      {
        key: 'x',
        ctrlKey: true,
        description: 'Cut selected elements',
        category: 'editing' as const,
        action: () => {
          // TODO: Implement cut operation
          console.log('Cut not yet implemented');
        },
      },
      {
        key: 'c',
        ctrlKey: true,
        description: 'Copy selected elements',
        category: 'editing' as const,
        action: () => {
          // TODO: Implement copy operation
          console.log('Copy not yet implemented');
        },
      },
      {
        key: 'v',
        ctrlKey: true,
        description: 'Paste elements',
        category: 'editing' as const,
        action: () => {
          // TODO: Implement paste operation
          console.log('Paste not yet implemented');
        },
      },
      {
        key: 'Delete',
        description: 'Delete selected elements',
        category: 'editing' as const,
        action: () => {
          store.selection.selectedElements.forEach(({ trackId, elementId }) => {
            store.removeElement(trackId, elementId);
          });
          store.clearSelection();
        },
      },
      {
        key: 'Backspace',
        description: 'Delete selected elements',
        category: 'editing' as const,
        action: () => {
          store.selection.selectedElements.forEach(({ trackId, elementId }) => {
            store.removeElement(trackId, elementId);
          });
          store.clearSelection();
        },
      },
      {
        key: 'd',
        ctrlKey: true,
        description: 'Duplicate selected elements',
        category: 'editing' as const,
        action: () => {
          store.selection.selectedElements.forEach(({ trackId, elementId }) => {
            store.duplicateElement(trackId, elementId);
          });
        },
      },
      {
        key: 'z',
        ctrlKey: true,
        description: 'Undo',
        category: 'editing' as const,
        action: () => store.undo(),
      },
      {
        key: 'y',
        ctrlKey: true,
        description: 'Redo',
        category: 'editing' as const,
        action: () => store.redo(),
      },
      {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        description: 'Redo',
        category: 'editing' as const,
        action: () => store.redo(),
      },
    ] : []),
    
    // Navigation shortcuts
    ...(enableNavigationShortcuts ? [
      {
        key: 'm',
        ctrlKey: true,
        description: 'Add marker at playhead',
        category: 'navigation' as const,
        action: () => addMarker(),
      },
      {
        key: 'ArrowRight',
        ctrlKey: true,
        shiftKey: true,
        description: 'Go to next marker',
        category: 'navigation' as const,
        action: () => goToNextMarker(),
      },
      {
        key: 'ArrowLeft',
        ctrlKey: true,
        shiftKey: true,
        description: 'Go to previous marker',
        category: 'navigation' as const,
        action: () => goToPrevMarker(),
      },
      {
        key: 'g',
        description: 'Toggle snapping',
        category: 'navigation' as const,
        action: () => store.toggleSnapping(),
      },
      {
        key: 'r',
        description: 'Toggle ripple editing',
        category: 'navigation' as const,
        action: () => store.enableRippleEditing(!store.featureFlags.rippleEditingEnabled),
      },
    ] : []),
    
    // Selection shortcuts
    ...(enableSelectionShortcuts ? [
      {
        key: 'a',
        ctrlKey: true,
        description: 'Select all elements',
        category: 'selection' as const,
        action: () => store.selectAll(),
      },
      {
        key: 'Escape',
        description: 'Clear selection',
        category: 'selection' as const,
        action: () => store.clearSelection(),
      },
      {
        key: 'i',
        description: 'Select elements in range (in point)',
        category: 'selection' as const,
        action: () => {
          // TODO: Implement in point setting
          console.log('In point not yet implemented');
        },
      },
      {
        key: 'o',
        description: 'Select elements in range (out point)',
        category: 'selection' as const,
        action: () => {
          // TODO: Implement out point setting
          console.log('Out point not yet implemented');
        },
      },
    ] : []),
    
    // Track shortcuts
    ...(enableTrackShortcuts ? [
      {
        key: '1',
        description: 'Select track 1',
        category: 'tracks' as const,
        action: () => {
          const track = store.getTrackByIndex(0);
          if (track) store.selectTrack(track.id);
        },
      },
      {
        key: '2',
        description: 'Select track 2',
        category: 'tracks' as const,
        action: () => {
          const track = store.getTrackByIndex(1);
          if (track) store.selectTrack(track.id);
        },
      },
      {
        key: '3',
        description: 'Select track 3',
        category: 'tracks' as const,
        action: () => {
          const track = store.getTrackByIndex(2);
          if (track) store.selectTrack(track.id);
        },
      },
      {
        key: '4',
        description: 'Select track 4',
        category: 'tracks' as const,
        action: () => {
          const track = store.getTrackByIndex(3);
          if (track) store.selectTrack(track.id);
        },
      },
      {
        key: '5',
        description: 'Select track 5',
        category: 'tracks' as const,
        action: () => {
          const track = store.getTrackByIndex(4);
          if (track) store.selectTrack(track.id);
        },
      },
    ] : []),
    
    // Zoom shortcuts
    ...(enableZoomShortcuts ? [
      {
        key: '=',
        ctrlKey: true,
        description: 'Zoom in',
        category: 'zoom' as const,
        action: () => zoomIn(),
      },
      {
        key: '+',
        ctrlKey: true,
        description: 'Zoom in',
        category: 'zoom' as const,
        action: () => zoomIn(),
      },
      {
        key: '-',
        ctrlKey: true,
        description: 'Zoom out',
        category: 'zoom' as const,
        action: () => zoomOut(),
      },
      {
        key: '0',
        ctrlKey: true,
        description: 'Reset zoom',
        category: 'zoom' as const,
        action: () => resetZoom(),
      },
      {
        key: '0',
        ctrlKey: true,
        shiftKey: true,
        description: 'Fit to content',
        category: 'zoom' as const,
        action: () => fitToContent(),
      },
      {
        key: 'f',
        ctrlKey: true,
        description: 'Fit to selection',
        category: 'zoom' as const,
        action: () => fitToSelection(),
      },
    ] : []),
  ];
  
  // Combine built-in and custom shortcuts
  const allShortcuts = [...builtInShortcuts, ...customShortcutsRef.current];
  
  // Check if a shortcut matches an event
  const isShortcutActive = useCallback((shortcut: KeyboardShortcut, event: KeyboardEvent): boolean => {
    const keyMatches = shortcut.key.toLowerCase() === event.key.toLowerCase();
    const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey;
    const shiftMatches = !!shortcut.shiftKey === event.shiftKey;
    const altMatches = !!shortcut.altKey === event.altKey;
    const metaMatches = !!shortcut.metaKey === event.metaKey;
    
    return keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches && !shortcut.disabled;
  }, []);
  
  // Main keyboard event handler
  const handleKeyDown = useCallback((event: KeyboardEvent): boolean => {
    if (!enabled) return false;
    
    // Skip if input is focused (unless it's a global shortcut)
    const isInputFocused = document.activeElement?.tagName === 'INPUT' || 
                          document.activeElement?.tagName === 'TEXTAREA' ||
                          document.activeElement?.contentEditable === 'true';
    
    if (isInputFocused) {
      // Only allow certain global shortcuts when input is focused
      const globalKeys = ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
      if (!globalKeys.includes(event.key) && !event.ctrlKey && !event.metaKey) {
        return false;
      }
    }
    
    // Find matching shortcut
    const activeShortcut = allShortcuts.find(shortcut => isShortcutActive(shortcut, event));
    
    if (activeShortcut) {
      event.preventDefault();
      event.stopPropagation();
      
      try {
        activeShortcut.action();
        return true;
      } catch (error) {
        console.error('Error executing keyboard shortcut:', error);
        return false;
      }
    }
    
    return false;
  }, [enabled, allShortcuts, isShortcutActive]);
  
  // Utility functions
  const addCustomShortcut = useCallback((shortcut: KeyboardShortcut) => {
    customShortcutsRef.current = [...customShortcutsRef.current, shortcut];
  }, []);
  
  const removeCustomShortcut = useCallback((key: string) => {
    customShortcutsRef.current = customShortcutsRef.current.filter(s => s.key !== key);
  }, []);
  
  const getShortcutByKey = useCallback((
    key: string,
    modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
  ): KeyboardShortcut | null => {
    return allShortcuts.find(shortcut => 
      shortcut.key.toLowerCase() === key.toLowerCase() &&
      !!shortcut.ctrlKey === !!modifiers.ctrl &&
      !!shortcut.shiftKey === !!modifiers.shift &&
      !!shortcut.altKey === !!modifiers.alt &&
      !!shortcut.metaKey === !!modifiers.meta
    ) || null;
  }, [allShortcuts]);
  
  const getShortcutsByCategory = useCallback((category: KeyboardShortcut['category']): KeyboardShortcut[] => {
    return allShortcuts.filter(shortcut => shortcut.category === category);
  }, [allShortcuts]);
  
  // Setup global event listener
  useEffect(() => {
    if (!enabled) return;
    
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [enabled, handleKeyDown]);
  
  return {
    shortcuts: allShortcuts,
    handleKeyDown,
    isShortcutActive,
    addCustomShortcut,
    removeCustomShortcut,
    getShortcutByKey,
    getShortcutsByCategory,
  };
}

// Hook for displaying keyboard shortcuts help
export function useKeyboardShortcutsHelp() {
  const { shortcuts, getShortcutsByCategory } = useKeyboardShortcuts();
  
  const formatShortcut = useCallback((shortcut: KeyboardShortcut): string => {
    const modifiers = [];
    if (shortcut.ctrlKey) modifiers.push('Ctrl');
    if (shortcut.shiftKey) modifiers.push('Shift');
    if (shortcut.altKey) modifiers.push('Alt');
    if (shortcut.metaKey) modifiers.push('Cmd');
    
    const key = shortcut.key === ' ' ? 'Space' : shortcut.key;
    
    return [...modifiers, key].join(' + ');
  }, []);
  
  const getShortcutsHelp = useCallback(() => {
    const categories = ['playback', 'editing', 'navigation', 'selection', 'tracks', 'zoom'] as const;
    
    return categories.map(category => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      shortcuts: getShortcutsByCategory(category).map(shortcut => ({
        keys: formatShortcut(shortcut),
        description: shortcut.description,
      }))
    }));
  }, [getShortcutsByCategory, formatShortcut]);
  
  return {
    shortcuts,
    formatShortcut,
    getShortcutsHelp,
  };
}