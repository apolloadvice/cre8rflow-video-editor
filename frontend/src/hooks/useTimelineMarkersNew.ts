/**
 * Timeline Markers Hook
 * 
 * Provides comprehensive marker management for timeline navigation:
 * - Add/remove/update markers
 * - Navigate between markers
 * - Keyboard shortcuts for marker operations
 * - Visual feedback and indicators
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { Marker } from '@/types/timeline';
import { quantizeToFrame } from '@/lib/timeline';

export interface UseTimelineMarkersOptions {
  enableKeyboardShortcuts?: boolean;
  autoQuantizeToFrames?: boolean;
  defaultMarkerColor?: string;
}

export interface UseTimelineMarkersReturn {
  markers: Marker[];
  addMarker: (time?: number, name?: string, color?: string) => string;
  removeMarker: (markerId: string) => void;
  updateMarker: (markerId: string, updates: Partial<Marker>) => void;
  removeMarkerAt: (time: number, tolerance?: number) => boolean;
  goToMarker: (markerId: string) => void;
  goToNextMarker: () => void;
  goToPrevMarker: () => void;
  getMarkerAt: (time: number, tolerance?: number) => Marker | null;
  getClosestMarker: (time: number) => Marker | null;
  clearAllMarkers: () => void;
  // Bulk operations
  addMarkersFromArray: (markers: Array<{ time: number; name: string; color?: string }>) => string[];
  exportMarkers: () => Array<{ time: number; name: string; color?: string }>;
  importMarkers: (markers: Array<{ time: number; name: string; color?: string }>) => void;
  // Navigation helpers
  isAtMarker: (time?: number, tolerance?: number) => boolean;
  getMarkerIndex: (markerId: string) => number;
  getMarkerByIndex: (index: number) => Marker | null;
}

const DEFAULT_MARKER_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange  
  '#f59e0b', // Amber
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#22c55e', // Green
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
];

export function useTimelineMarkers(options: UseTimelineMarkersOptions = {}): UseTimelineMarkersReturn {
  const {
    enableKeyboardShortcuts = true,
    autoQuantizeToFrames = true,
    defaultMarkerColor = '#3b82f6', // Blue
  } = options;
  
  const store = useMultiTrackStore();
  const { timeline } = store.project;
  const markers = timeline.markers;
  
  // Quantize time to frame if enabled
  const quantizeTime = useCallback((time: number): number => {
    return autoQuantizeToFrames ? quantizeToFrame(time, store.project.fps) : time;
  }, [autoQuantizeToFrames, store.project.fps]);
  
  // Sort markers by time for navigation
  const sortedMarkers = useMemo(() => {
    return [...markers].sort((a, b) => a.time - b.time);
  }, [markers]);
  
  // Add a new marker
  const addMarker = useCallback((
    time?: number, 
    name?: string, 
    color?: string
  ): string => {
    const markerTime = quantizeTime(time ?? store.currentTime);
    
    // Generate a default name if not provided
    const defaultName = name || `Marker ${markers.length + 1}`;
    
    // Use default color or pick from palette
    const markerColor = color || defaultMarkerColor || 
      DEFAULT_MARKER_COLORS[markers.length % DEFAULT_MARKER_COLORS.length];
    
    return store.addMarker(markerTime, defaultName, markerColor);
  }, [quantizeTime, store, markers.length, defaultMarkerColor]);
  
  // Remove marker by ID
  const removeMarker = useCallback((markerId: string) => {
    store.removeMarker(markerId);
  }, [store]);
  
  // Update marker
  const updateMarker = useCallback((markerId: string, updates: Partial<Marker>) => {
    // Quantize time if being updated
    const finalUpdates = { ...updates };
    if (updates.time !== undefined) {
      finalUpdates.time = quantizeTime(updates.time);
    }
    
    store.updateMarker(markerId, finalUpdates);
  }, [store, quantizeTime]);
  
  // Remove marker at specific time
  const removeMarkerAt = useCallback((time: number, tolerance = 0.1): boolean => {
    const marker = markers.find(m => Math.abs(m.time - time) <= tolerance);
    if (marker) {
      removeMarker(marker.id);
      return true;
    }
    return false;
  }, [markers, removeMarker]);
  
  // Navigate to marker
  const goToMarker = useCallback((markerId: string) => {
    store.goToMarker(markerId);
  }, [store]);
  
  // Navigate to next marker
  const goToNextMarker = useCallback(() => {
    const currentTime = store.currentTime;
    const nextMarker = sortedMarkers.find(m => m.time > currentTime);
    
    if (nextMarker) {
      store.setCurrentTime(nextMarker.time);
    } else if (sortedMarkers.length > 0) {
      // Wrap to first marker
      store.setCurrentTime(sortedMarkers[0].time);
    }
  }, [store, sortedMarkers]);
  
  // Navigate to previous marker
  const goToPrevMarker = useCallback(() => {
    const currentTime = store.currentTime;
    const prevMarker = [...sortedMarkers].reverse().find(m => m.time < currentTime);
    
    if (prevMarker) {
      store.setCurrentTime(prevMarker.time);
    } else if (sortedMarkers.length > 0) {
      // Wrap to last marker
      store.setCurrentTime(sortedMarkers[sortedMarkers.length - 1].time);
    }
  }, [store, sortedMarkers]);
  
  // Get marker at specific time
  const getMarkerAt = useCallback((time: number, tolerance = 0.1): Marker | null => {
    return markers.find(m => Math.abs(m.time - time) <= tolerance) || null;
  }, [markers]);
  
  // Get closest marker to time
  const getClosestMarker = useCallback((time: number): Marker | null => {
    if (markers.length === 0) return null;
    
    return markers.reduce((closest, marker) => {
      const currentDistance = Math.abs(marker.time - time);
      const closestDistance = Math.abs(closest.time - time);
      return currentDistance < closestDistance ? marker : closest;
    });
  }, [markers]);
  
  // Clear all markers
  const clearAllMarkers = useCallback(() => {
    markers.forEach(marker => removeMarker(marker.id));
  }, [markers, removeMarker]);
  
  // Bulk operations
  const addMarkersFromArray = useCallback((
    markerData: Array<{ time: number; name: string; color?: string }>
  ): string[] => {
    return markerData.map(({ time, name, color }) => 
      addMarker(time, name, color)
    );
  }, [addMarker]);
  
  const exportMarkers = useCallback(() => {
    return markers.map(({ time, name, color }) => ({ time, name, color }));
  }, [markers]);
  
  const importMarkers = useCallback((
    markerData: Array<{ time: number; name: string; color?: string }>
  ) => {
    // Optionally clear existing markers first
    // clearAllMarkers();
    addMarkersFromArray(markerData);
  }, [addMarkersFromArray]);
  
  // Navigation helpers
  const isAtMarker = useCallback((time?: number, tolerance = 0.1): boolean => {
    const checkTime = time ?? store.currentTime;
    return getMarkerAt(checkTime, tolerance) !== null;
  }, [store.currentTime, getMarkerAt]);
  
  const getMarkerIndex = useCallback((markerId: string): number => {
    return sortedMarkers.findIndex(m => m.id === markerId);
  }, [sortedMarkers]);
  
  const getMarkerByIndex = useCallback((index: number): Marker | null => {
    return sortedMarkers[index] || null;
  }, [sortedMarkers]);
  
  // Keyboard shortcuts
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if no input is focused
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      switch (event.key.toLowerCase()) {
        case 'm':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            addMarker();
          }
          break;
        
        case 'delete':
        case 'backspace':
          if (event.shiftKey) {
            event.preventDefault();
            const currentMarker = getMarkerAt(store.currentTime);
            if (currentMarker) {
              removeMarker(currentMarker.id);
            }
          }
          break;
        
        case 'arrowright':
          if (event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            goToNextMarker();
          }
          break;
        
        case 'arrowleft':
          if (event.ctrlKey && event.shiftKey) {
            event.preventDefault();
            goToPrevMarker();
          }
          break;
        
        case 'n':
          if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
            event.preventDefault();
            goToNextMarker();
          }
          break;
        
        case 'p':
          if ((event.ctrlKey || event.metaKey) && event.shiftKey) {
            event.preventDefault();
            goToPrevMarker();
          }
          break;
        
        // Number keys to jump to specific marker
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            const index = parseInt(event.key) - 1;
            const marker = getMarkerByIndex(index);
            if (marker) {
              goToMarker(marker.id);
            }
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enableKeyboardShortcuts,
    addMarker,
    removeMarker,
    goToNextMarker,
    goToPrevMarker,
    goToMarker,
    getMarkerAt,
    getMarkerByIndex,
    store.currentTime,
  ]);
  
  return {
    markers: sortedMarkers,
    addMarker,
    removeMarker,
    updateMarker,
    removeMarkerAt,
    goToMarker,
    goToNextMarker,
    goToPrevMarker,
    getMarkerAt,
    getClosestMarker,
    clearAllMarkers,
    addMarkersFromArray,
    exportMarkers,
    importMarkers,
    isAtMarker,
    getMarkerIndex,
    getMarkerByIndex,
  };
}

// Hook for marker visualization
export function useMarkerVisualization() {
  const { markers } = useTimelineMarkers();
  const store = useMultiTrackStore();
  
  const getMarkerStyle = useCallback((marker: Marker, containerWidth: number) => {
    const { zoom, scrollX } = store;
    const pixelsPerSecond = 100 * zoom; // Assuming 100px per second at 1x zoom
    
    const markerX = marker.time * pixelsPerSecond - scrollX;
    const isVisible = markerX >= -10 && markerX <= containerWidth + 10;
    
    return {
      left: `${markerX}px`,
      backgroundColor: marker.color || '#3b82f6',
      visibility: isVisible ? 'visible' : 'hidden' as const,
      zIndex: 10,
    };
  }, [store]);
  
  const getMarkerTooltip = useCallback((marker: Marker) => {
    const formatTime = (time: number) => {
      const minutes = Math.floor(time / 60);
      const seconds = (time % 60).toFixed(1);
      return `${minutes}:${seconds.padStart(4, '0')}`;
    };
    
    return `${marker.name} (${formatTime(marker.time)})`;
  }, []);
  
  return {
    markers,
    getMarkerStyle,
    getMarkerTooltip,
  };
}