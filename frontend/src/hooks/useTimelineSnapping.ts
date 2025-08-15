/**
 * Timeline Snapping Hook
 * 
 * Provides intelligent snapping functionality for timeline elements:
 * - Snap to element boundaries
 * - Snap to markers
 * - Snap to playhead
 * - Snap to frame boundaries
 * - Visual snap indicators
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { quantizeToFrame } from '@/lib/timeline';
import { TimelineElement, Track, Marker } from '@/types/timeline';

export interface SnapPoint {
  time: number;
  type: 'element-start' | 'element-end' | 'marker' | 'playhead' | 'frame';
  id?: string; // ID of element or marker
  name?: string; // Display name for snap indicator
  color?: string; // Color for snap indicator
}

export interface SnapResult {
  snapped: boolean;
  snapTime: number;
  snapPoint?: SnapPoint;
  originalTime: number;
  offset: number; // How much the time was adjusted
}

export interface UseTimelineSnappingOptions {
  enabled?: boolean;
  epsilon?: number; // Snap tolerance in seconds
  snapToElements?: boolean;
  snapToMarkers?: boolean;
  snapToPlayhead?: boolean;
  snapToFrames?: boolean;
  excludeElementId?: string; // Exclude specific element from snapping (e.g., when dragging)
}

export interface UseTimelineSnappingReturn {
  snapEnabled: boolean;
  snapEpsilon: number;
  snapPoints: SnapPoint[];
  snapToTime: (time: number, options?: Partial<UseTimelineSnappingOptions>) => SnapResult;
  snapToNearestFrame: (time: number) => number;
  getSnapPointsAt: (time: number, tolerance?: number) => SnapPoint[];
  setSnapEnabled: (enabled: boolean) => void;
  setSnapEpsilon: (epsilon: number) => void;
  // Visual feedback
  activeSnapPoint: SnapPoint | null;
  setActiveSnapPoint: (point: SnapPoint | null) => void;
}

export function useTimelineSnapping(
  options: UseTimelineSnappingOptions = {}
): UseTimelineSnappingReturn {
  const {
    enabled = true,
    epsilon = 0.1, // 100ms default tolerance
    snapToElements = true,
    snapToMarkers = true,
    snapToPlayhead = true,
    snapToFrames = true,
    excludeElementId,
  } = options;
  
  const store = useMultiTrackStore();
  const [activeSnapPoint, setActiveSnapPoint] = useState<SnapPoint | null>(null);
  
  const snapEnabled = store.snapEnabled && enabled;
  const snapEpsilon = store.project.timeline.snapEpsilon || epsilon;
  
  // Generate all possible snap points
  const snapPoints = useMemo((): SnapPoint[] => {
    const points: SnapPoint[] = [];
    const { timeline } = store.project;
    const { tracks, markers } = timeline;
    
    // Add element boundary snap points
    if (snapToElements) {
      tracks.forEach((track: Track) => {
        track.elements.forEach((element: TimelineElement) => {
          // Skip excluded element
          if (excludeElementId && element.id === excludeElementId) {
            return;
          }
          
          // Element start
          points.push({
            time: element.start,
            type: 'element-start',
            id: element.id,
            name: `${element.name || 'Element'} Start`,
            color: '#3b82f6', // Blue
          });
          
          // Element end
          const endTime = element.start + element.duration;
          points.push({
            time: endTime,
            type: 'element-end',
            id: element.id,
            name: `${element.name || 'Element'} End`,
            color: '#3b82f6', // Blue
          });
        });
      });
    }
    
    // Add marker snap points
    if (snapToMarkers) {
      markers.forEach((marker: Marker) => {
        points.push({
          time: marker.time,
          type: 'marker',
          id: marker.id,
          name: marker.name,
          color: marker.color || '#f59e0b', // Amber
        });
      });
    }
    
    // Add playhead snap point
    if (snapToPlayhead) {
      points.push({
        time: store.currentTime,
        type: 'playhead',
        name: 'Playhead',
        color: '#ef4444', // Red
      });
    }
    
    // Sort points by time
    return points.sort((a, b) => a.time - b.time);
  }, [
    store.project.timeline,
    store.currentTime,
    snapToElements,
    snapToMarkers,
    snapToPlayhead,
    excludeElementId,
  ]);
  
  // Find snap points near a given time
  const getSnapPointsAt = useCallback((time: number, tolerance = snapEpsilon): SnapPoint[] => {
    return snapPoints.filter(point => 
      Math.abs(point.time - time) <= tolerance
    );
  }, [snapPoints, snapEpsilon]);
  
  // Snap to nearest frame boundary
  const snapToNearestFrame = useCallback((time: number): number => {
    if (!snapToFrames) return time;
    return quantizeToFrame(time, store.project.fps);
  }, [snapToFrames, store.project.fps]);
  
  // Main snapping function
  const snapToTime = useCallback((
    time: number, 
    overrideOptions: Partial<UseTimelineSnappingOptions> = {}
  ): SnapResult => {
    const finalOptions = { ...options, ...overrideOptions };
    
    if (!snapEnabled || !finalOptions.enabled) {
      return {
        snapped: false,
        snapTime: time,
        originalTime: time,
        offset: 0,
      };
    }
    
    const tolerance = finalOptions.epsilon || snapEpsilon;
    
    // Find the closest snap point
    let closestPoint: SnapPoint | null = null;
    let closestDistance = Infinity;
    
    snapPoints.forEach(point => {
      const distance = Math.abs(point.time - time);
      
      if (distance <= tolerance && distance < closestDistance) {
        closestDistance = distance;
        closestPoint = point;
      }
    });
    
    if (closestPoint) {
      // Snap to the closest point
      const snapTime = closestPoint.time;
      
      // Apply frame quantization if enabled
      const finalSnapTime = finalOptions.snapToFrames 
        ? snapToNearestFrame(snapTime)
        : snapTime;
      
      return {
        snapped: true,
        snapTime: finalSnapTime,
        snapPoint: closestPoint,
        originalTime: time,
        offset: finalSnapTime - time,
      };
    } else {
      // No snap point found, apply frame snapping if enabled
      const frameSnapTime = finalOptions.snapToFrames 
        ? snapToNearestFrame(time)
        : time;
      
      const frameSnapped = frameSnapTime !== time;
      
      return {
        snapped: frameSnapped,
        snapTime: frameSnapTime,
        originalTime: time,
        offset: frameSnapTime - time,
        snapPoint: frameSnapped ? {
          time: frameSnapTime,
          type: 'frame',
          name: 'Frame',
          color: '#6b7280', // Gray
        } : undefined,
      };
    }
  }, [snapEnabled, snapEpsilon, snapPoints, snapToNearestFrame, options]);
  
  // Store setters
  const setSnapEnabled = useCallback((enabled: boolean) => {
    store.setScroll(store.scrollX, store.scrollY); // Trigger store update
    // Note: snapEnabled is controlled by store.snapEnabled
  }, [store]);
  
  const setSnapEpsilon = useCallback((epsilon: number) => {
    // Update timeline snap epsilon
    const newTimeline = {
      ...store.project.timeline,
      snapEpsilon: Math.max(0.01, Math.min(1.0, epsilon)), // Clamp between 10ms and 1s
    };
    
    store.updateProject({
      timeline: newTimeline,
    });
  }, [store]);
  
  return {
    snapEnabled,
    snapEpsilon,
    snapPoints,
    snapToTime,
    snapToNearestFrame,
    getSnapPointsAt,
    setSnapEnabled,
    setSnapEpsilon,
    activeSnapPoint,
    setActiveSnapPoint,
  };
}

// Hook for visual snap indicators
export function useSnapIndicator() {
  const { activeSnapPoint } = useTimelineSnapping();
  const indicatorRef = useRef<HTMLDivElement>(null);
  
  const showIndicator = useCallback((point: SnapPoint, timelineElement: HTMLElement) => {
    if (!indicatorRef.current || !timelineElement) return;
    
    const indicator = indicatorRef.current;
    const rect = timelineElement.getBoundingClientRect();
    
    // Position indicator at snap point
    // This would need timeline-specific positioning logic
    indicator.style.left = `${point.time * 100}px`; // Simplified positioning
    indicator.style.display = 'block';
    indicator.style.borderColor = point.color || '#3b82f6';
    
    // Show indicator briefly
    setTimeout(() => {
      indicator.style.display = 'none';
    }, 1000);
  }, []);
  
  const hideIndicator = useCallback(() => {
    if (indicatorRef.current) {
      indicatorRef.current.style.display = 'none';
    }
  }, []);
  
  return {
    indicatorRef,
    activeSnapPoint,
    showIndicator,
    hideIndicator,
  };
}

// Utility for creating snap-aware drag handlers
export function useSnapAwareDrag(options: UseTimelineSnappingOptions = {}) {
  const { snapToTime } = useTimelineSnapping(options);
  
  const snapDragTime = useCallback((dragTime: number, originalTime: number) => {
    const result = snapToTime(dragTime, options);
    return result.snapped ? result.snapTime : dragTime;
  }, [snapToTime, options]);
  
  return { snapDragTime };
}