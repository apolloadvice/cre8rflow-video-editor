/**
 * Timeline Zoom Hook
 * 
 * Provides professional zoom controls for the timeline:
 * - Zoom in/out with mouse wheel and keyboard
 * - Fit to content functionality
 * - Zoom to selection
 * - Maintains zoom center point
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';

export interface ZoomConstants {
  MIN: number;
  MAX: number;
  DEFAULT: number;
  STEP: number;
  WHEEL_SENSITIVITY: number;
  FIT_PADDING: number; // Pixels to add around content when fitting
}

export const ZOOM_CONSTANTS: ZoomConstants = {
  MIN: 0.1,
  MAX: 10.0,
  DEFAULT: 1.0,
  STEP: 0.25,
  WHEEL_SENSITIVITY: 0.001, // How sensitive mouse wheel zoom is
  FIT_PADDING: 100, // Extra pixels around content when fitting
};

export interface UseTimelineZoomOptions {
  containerRef?: React.RefObject<HTMLElement>;
  isInTimeline?: boolean;
  pixelsPerSecond?: number; // How many pixels represent one second at 1x zoom
}

export interface UseTimelineZoomReturn {
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitToContent: () => void;
  fitToSelection: () => void;
  handleWheel: (event: WheelEvent) => void;
  getPixelsPerSecond: () => number;
  timeToPixels: (time: number) => number;
  pixelsToTime: (pixels: number) => number;
}

export function useTimelineZoom(options: UseTimelineZoomOptions = {}): UseTimelineZoomReturn {
  const { 
    containerRef, 
    isInTimeline = true, 
    pixelsPerSecond = 100 // Default: 100 pixels per second at 1x zoom
  } = options;
  
  const store = useMultiTrackStore();
  const zoomLevel = store.zoom;
  const wheelTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Clamp zoom to valid range
  const clampZoom = useCallback((zoom: number): number => {
    return Math.max(ZOOM_CONSTANTS.MIN, Math.min(ZOOM_CONSTANTS.MAX, zoom));
  }, []);
  
  // Set zoom level with validation
  const setZoomLevel = useCallback((zoom: number) => {
    const clampedZoom = clampZoom(zoom);
    store.setZoom(clampedZoom);
  }, [clampZoom, store]);
  
  // Basic zoom controls
  const zoomIn = useCallback(() => {
    setZoomLevel(zoomLevel + ZOOM_CONSTANTS.STEP);
  }, [zoomLevel, setZoomLevel]);
  
  const zoomOut = useCallback(() => {
    setZoomLevel(zoomLevel - ZOOM_CONSTANTS.STEP);
  }, [zoomLevel, setZoomLevel]);
  
  const resetZoom = useCallback(() => {
    setZoomLevel(ZOOM_CONSTANTS.DEFAULT);
  }, [setZoomLevel]);
  
  // Advanced zoom controls
  const fitToContent = useCallback(() => {
    const totalDuration = store.getTotalDuration();
    const container = containerRef?.current;
    
    if (!container || totalDuration <= 0) {
      setZoomLevel(ZOOM_CONSTANTS.DEFAULT);
      return;
    }
    
    const containerWidth = container.clientWidth;
    const contentWidth = totalDuration * pixelsPerSecond;
    const targetWidth = containerWidth - ZOOM_CONSTANTS.FIT_PADDING;
    
    if (contentWidth > 0) {
      const newZoom = Math.min(ZOOM_CONSTANTS.MAX, targetWidth / contentWidth);
      setZoomLevel(Math.max(ZOOM_CONSTANTS.MIN, newZoom));
      
      // Reset scroll to start
      store.setScroll(0, store.scrollY);
    }
  }, [store, containerRef, pixelsPerSecond, setZoomLevel]);
  
  const fitToSelection = useCallback(() => {
    const { selection, project } = store;
    const container = containerRef?.current;
    
    if (!container || selection.selectedElements.length === 0) {
      return;
    }
    
    // Calculate bounds of selected elements
    let minStart = Infinity;
    let maxEnd = -Infinity;
    
    selection.selectedElements.forEach(({ trackId, elementId }) => {
      const track = project.timeline.tracks.find(t => t.id === trackId);
      const element = track?.elements.find(e => e.id === elementId);
      
      if (element) {
        minStart = Math.min(minStart, element.start);
        maxEnd = Math.max(maxEnd, element.start + element.duration);
      }
    });
    
    if (minStart < Infinity && maxEnd > -Infinity) {
      const selectionDuration = maxEnd - minStart;
      const containerWidth = container.clientWidth;
      const targetWidth = containerWidth - ZOOM_CONSTANTS.FIT_PADDING;
      
      if (selectionDuration > 0) {
        const contentWidth = selectionDuration * pixelsPerSecond;
        const newZoom = Math.min(ZOOM_CONSTANTS.MAX, targetWidth / contentWidth);
        setZoomLevel(Math.max(ZOOM_CONSTANTS.MIN, newZoom));
        
        // Center on selection
        const selectionCenter = (minStart + maxEnd) / 2;
        const newScrollX = Math.max(0, 
          selectionCenter * pixelsPerSecond * newZoom - containerWidth / 2
        );
        store.setScroll(newScrollX, store.scrollY);
      }
    }
  }, [store, containerRef, pixelsPerSecond, setZoomLevel]);
  
  // Mouse wheel zoom handler
  const handleWheel = useCallback((event: WheelEvent) => {
    if (!isInTimeline) return;
    
    // Check for zoom modifier (Ctrl/Cmd key or horizontal scroll)
    const isZoomGesture = event.ctrlKey || event.metaKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    
    if (!isZoomGesture) return;
    
    event.preventDefault();
    
    // Use deltaY for vertical wheel, deltaX for horizontal wheel/trackpad
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    const zoomDirection = delta > 0 ? -1 : 1;
    const zoomAmount = zoomDirection * ZOOM_CONSTANTS.STEP;
    
    // Apply zoom with mouse position as center point
    const container = containerRef?.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const scrollX = store.scrollX;
      
      // Calculate the time at mouse position before zoom
      const timeAtMouse = (scrollX + mouseX) / (pixelsPerSecond * zoomLevel);
      
      // Apply zoom
      const newZoom = clampZoom(zoomLevel + zoomAmount);
      setZoomLevel(newZoom);
      
      // Adjust scroll to keep mouse position at same time
      const newPixelsAtMouse = timeAtMouse * pixelsPerSecond * newZoom;
      const newScrollX = Math.max(0, newPixelsAtMouse - mouseX);
      
      // Debounce scroll update to avoid too many state updates
      clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => {
        store.setScroll(newScrollX, store.scrollY);
      }, 16); // ~60fps
    } else {
      // No container reference, just zoom without adjusting scroll
      setZoomLevel(zoomLevel + zoomAmount);
    }
  }, [
    isInTimeline, 
    containerRef, 
    zoomLevel, 
    store, 
    pixelsPerSecond, 
    clampZoom, 
    setZoomLevel
  ]);
  
  // Utility functions for time/pixel conversion
  const getPixelsPerSecond = useCallback(() => {
    return pixelsPerSecond * zoomLevel;
  }, [pixelsPerSecond, zoomLevel]);
  
  const timeToPixels = useCallback((time: number) => {
    return time * getPixelsPerSecond();
  }, [getPixelsPerSecond]);
  
  const pixelsToTime = useCallback((pixels: number) => {
    const pps = getPixelsPerSecond();
    return pps > 0 ? pixels / pps : 0;
  }, [getPixelsPerSecond]);
  
  // Clean up wheel timeout on unmount
  useEffect(() => {
    return () => {
      if (wheelTimeoutRef.current) {
        clearTimeout(wheelTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToContent,
    fitToSelection,
    handleWheel,
    getPixelsPerSecond,
    timeToPixels,
    pixelsToTime,
  };
}

// Keyboard shortcuts for zoom
export function useTimelineZoomShortcuts() {
  const { zoomIn, zoomOut, resetZoom, fitToContent, fitToSelection } = useTimelineZoom();
  
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if no input is focused
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      switch (event.key) {
        case '+':
        case '=':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomIn();
          }
          break;
        
        case '-':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomOut();
          }
          break;
        
        case '0':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            if (event.shiftKey) {
              fitToContent();
            } else {
              resetZoom();
            }
          }
          break;
        
        case 'f':
        case 'F':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            fitToSelection();
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom, fitToContent, fitToSelection]);
}