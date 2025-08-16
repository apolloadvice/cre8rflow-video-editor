/**
 * Enhanced Drag and Drop Hook for Timeline
 * 
 * Provides comprehensive drag and drop functionality:
 * - Integration with global drag store and timeline store
 * - ID-based drop resolution with conflict detection
 * - Snapping-aware drag operations
 * - Autoscroll during drag
 * - Performance optimized updates
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDragStore, type DragSource, type DragPreview } from '@/store/dragStore';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { useTimelineSnapping } from './useTimelineSnapping';
import { useTimelineZoom } from './useTimelineZoom';
import { TrackKind, TimelineElement, Track } from '@/types/timeline';

export interface DragDropOptions {
  enableSnapping?: boolean;
  enableAutoScroll?: boolean;
  autoScrollZone?: number; // pixels from edge to trigger scroll
  autoScrollSpeed?: number; // max pixels per frame
  dragThreshold?: number; // pixels to move before starting drag
  updateInterval?: number; // ms between updates (for performance)
}

export interface DropResult {
  success: boolean;
  trackId: string;
  elementId?: string;
  time: number;
  conflicts: string[];
  snapped: boolean;
  snapTime?: number;
}

export function useDragDropEnhanced(options: DragDropOptions = {}) {
  const {
    enableSnapping = true,
    enableAutoScroll = true,
    autoScrollZone = 50,
    autoScrollSpeed = 10,
    dragThreshold = 5,
    updateInterval = 16, // ~60fps
  } = options;
  
  const dragStore = useDragStore();
  const timelineStore = useMultiTrackStore();
  const { snapToTime } = useTimelineSnapping({ enabled: enableSnapping });
  const { pixelsToTime, timeToPixels } = useTimelineZoom();
  
  const lastUpdateRef = useRef<number>(0);
  const autoScrollRef = useRef<{ 
    animationFrame?: number;
    direction?: 'left' | 'right';
    speed: number;
  }>({ speed: 0 });
  
  // Convert mouse position to timeline time
  const mouseToTime = useCallback((
    mouseX: number,
    containerRect: DOMRect,
    scrollX: number = 0
  ): number => {
    const relativeX = mouseX - containerRect.left + scrollX;
    return pixelsToTime(relativeX);
  }, [pixelsToTime]);
  
  // Convert timeline time to mouse position
  const timeToMouse = useCallback((
    time: number,
    containerRect: DOMRect,
    scrollX: number = 0
  ): number => {
    const pixels = timeToPixels(time);
    return pixels - scrollX + containerRect.left;
  }, [timeToPixels]);
  
  // Find conflicts when dropping an element
  const findDropConflicts = useCallback((
    targetTrackId: string,
    startTime: number,
    duration: number,
    excludeElementId?: string
  ): string[] => {
    const track = timelineStore.project.timeline.tracks.find(t => t.id === targetTrackId);
    if (!track) return [];
    
    const endTime = startTime + duration;
    const conflicts: string[] = [];
    
    track.elements.forEach(element => {
      if (excludeElementId && element.id === excludeElementId) return;
      
      const elementEnd = element.start + element.duration;
      
      // Check for overlap
      if (startTime < elementEnd && endTime > element.start) {
        conflicts.push(element.id);
      }
    });
    
    return conflicts;
  }, [timelineStore.project.timeline.tracks]);
  
  // Validate drop position
  const validateDrop = useCallback((
    source: DragSource,
    targetTrackId: string,
    dropTime: number
  ): { isValid: boolean; reason?: string; conflicts: string[] } => {
    // Find target track
    const targetTrack = timelineStore.project.timeline.tracks.find(t => t.id === targetTrackId);
    if (!targetTrack) {
      return { isValid: false, reason: 'Target track not found', conflicts: [] };
    }
    
    // Check track compatibility
    const isCompatible = dragStore.isTrackCompatible(source.type, targetTrack.kind);
    if (!isCompatible) {
      return { 
        isValid: false, 
        reason: `${source.type} cannot be placed on ${targetTrack.kind} track`, 
        conflicts: [] 
      };
    }
    
    // Check if track is locked
    if (targetTrack.locked) {
      return { isValid: false, reason: 'Target track is locked', conflicts: [] };
    }
    
    // Get element duration
    let duration = 5; // Default duration
    if (source.type === 'element' && source.data) {
      duration = source.data.duration || 5;
    } else if (source.data?.duration) {
      duration = source.data.duration;
    }
    
    // Check for conflicts
    const excludeId = source.type === 'element' ? source.id : undefined;
    const conflicts = findDropConflicts(targetTrackId, dropTime, duration, excludeId);
    
    // Allow drops with conflicts (user can resolve them)
    return { isValid: true, conflicts };
  }, [timelineStore.project.timeline.tracks, dragStore, findDropConflicts]);
  
  // Start dragging a media item
  const startMediaDrag = useCallback((
    mediaId: string,
    mediaData: any,
    event: React.MouseEvent,
    preview?: Partial<DragPreview>
  ) => {
    const source: DragSource = {
      type: 'media',
      id: mediaId,
      data: mediaData,
    };
    
    const fullPreview: DragPreview = {
      name: mediaData.name || 'Untitled',
      duration: mediaData.duration,
      thumbnail: mediaData.thumbnail,
      color: '#3b82f6',
      ...preview,
    };
    
    const initialPos = { x: event.clientX, y: event.clientY };
    dragStore.startDrag(source, fullPreview, initialPos);
  }, [dragStore]);
  
  // Start dragging a timeline element
  const startElementDrag = useCallback((
    element: TimelineElement,
    track: Track,
    event: React.MouseEvent,
    offset?: { x: number; y: number }
  ) => {
    const source: DragSource = {
      type: 'element',
      id: element.id,
      data: element,
      trackId: track.id,
      originalPosition: {
        trackId: track.id,
        time: element.start,
      },
    };
    
    const preview: DragPreview = {
      name: element.name || 'Element',
      duration: element.duration,
      color: track.color || '#6b7280',
    };
    
    const initialPos = { x: event.clientX, y: event.clientY };
    dragStore.startDrag(source, preview, initialPos, offset);
  }, [dragStore]);
  
  // Update drag position
  const updateDragPosition = useCallback((
    event: MouseEvent,
    containerRect: DOMRect,
    targetTrackId?: string
  ) => {
    const now = performance.now();
    
    // Throttle updates for performance
    if (now - lastUpdateRef.current < updateInterval) {
      return;
    }
    lastUpdateRef.current = now;
    
    const currentPos = { x: event.clientX, y: event.clientY };
    const scrollX = timelineStore.scrollX;
    const rawTime = mouseToTime(event.clientX, containerRect, scrollX);
    
    // Apply snapping if enabled
    let finalTime = rawTime;
    let snapTime: number | undefined;
    
    if (enableSnapping && targetTrackId) {
      const snapResult = snapToTime(rawTime, {
        excludeElementId: dragStore.dragState.source?.id,
      });
      
      if (snapResult.snapped) {
        finalTime = snapResult.snapTime;
        snapTime = snapResult.snapTime;
      }
    }
    
    // Update drag store
    dragStore.updateDrag(currentPos, finalTime, targetTrackId);
    
    // Update auto-scroll
    if (enableAutoScroll) {
      updateAutoScroll(containerRect, event.clientX);
    }
  }, [
    dragStore,
    timelineStore.scrollX,
    mouseToTime,
    snapToTime,
    enableSnapping,
    enableAutoScroll,
    updateInterval,
  ]);
  
  // Handle auto-scroll
  const updateAutoScroll = useCallback((containerRect: DOMRect, mouseX: number) => {
    const leftZone = containerRect.left + autoScrollZone;
    const rightZone = containerRect.right - autoScrollZone;
    
    if (mouseX < leftZone) {
      // Scroll left
      const intensity = Math.min(1, (leftZone - mouseX) / autoScrollZone);
      const speed = intensity * autoScrollSpeed;
      
      if (!autoScrollRef.current.animationFrame) {
        autoScrollRef.current.direction = 'left';
        autoScrollRef.current.speed = speed;
        startAutoScrollLoop();
      }
    } else if (mouseX > rightZone) {
      // Scroll right
      const intensity = Math.min(1, (mouseX - rightZone) / autoScrollZone);
      const speed = intensity * autoScrollSpeed;
      
      if (!autoScrollRef.current.animationFrame) {
        autoScrollRef.current.direction = 'right';
        autoScrollRef.current.speed = speed;
        startAutoScrollLoop();
      }
    } else {
      // Stop auto-scroll
      stopAutoScroll();
    }
  }, [autoScrollZone, autoScrollSpeed]);
  
  const startAutoScrollLoop = useCallback(() => {
    const scroll = () => {
      const { direction, speed } = autoScrollRef.current;
      
      if (direction && speed > 0) {
        const delta = direction === 'left' ? -speed : speed;
        const newScrollX = Math.max(0, timelineStore.scrollX + delta);
        timelineStore.setScroll(newScrollX, timelineStore.scrollY);
        
        autoScrollRef.current.animationFrame = requestAnimationFrame(scroll);
      } else {
        autoScrollRef.current.animationFrame = undefined;
      }
    };
    
    autoScrollRef.current.animationFrame = requestAnimationFrame(scroll);
  }, [timelineStore]);
  
  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current.animationFrame) {
      cancelAnimationFrame(autoScrollRef.current.animationFrame);
      autoScrollRef.current.animationFrame = undefined;
    }
    autoScrollRef.current.speed = 0;
  }, []);
  
  // Perform drop operation
  const performDrop = useCallback((
    targetTrackId: string,
    dropTime: number
  ): DropResult => {
    const { dragState } = dragStore;
    
    if (!dragState.isDragging || !dragState.source) {
      return {
        success: false,
        trackId: targetTrackId,
        time: dropTime,
        conflicts: [],
        snapped: false,
      };
    }
    
    // Validate drop
    const validation = validateDrop(dragState.source, targetTrackId, dropTime);
    
    if (!validation.isValid) {
      return {
        success: false,
        trackId: targetTrackId,
        time: dropTime,
        conflicts: validation.conflicts,
        snapped: false,
      };
    }
    
    try {
      const { source } = dragState;
      let elementId: string | undefined;
      
      if (source.type === 'element') {
        // Move existing element
        if (source.trackId && source.trackId !== targetTrackId) {
          // Moving between tracks
          timelineStore.moveElement(source.id, source.trackId, targetTrackId, dropTime);
        } else {
          // Moving within same track
          timelineStore.updateElement(targetTrackId, source.id, { start: dropTime });
        }
        elementId = source.id;
      } else if (source.type === 'media') {
        // Add new media element
        elementId = timelineStore.addElement(targetTrackId, {
          mediaId: source.id,
          name: source.data?.name || 'Untitled',
          start: dropTime,
          duration: source.data?.duration || 5,
          trimStart: 0,
          trimEnd: 0,
          speed: 1.0,
          volume: 1.0,
          opacity: 1.0,
        });
      } else if (source.type === 'text') {
        // Add new text element
        elementId = timelineStore.addElement(targetTrackId, {
          name: source.data?.name || 'Text',
          start: dropTime,
          duration: source.data?.duration || 3,
          trimStart: 0,
          trimEnd: 0,
          // Text-specific properties would go here
        });
      }
      
      return {
        success: true,
        trackId: targetTrackId,
        elementId,
        time: dropTime,
        conflicts: validation.conflicts,
        snapped: !!dragState.snapTime,
        snapTime: dragState.snapTime,
      };
    } catch (error) {
      console.error('Drop operation failed:', error);
      return {
        success: false,
        trackId: targetTrackId,
        time: dropTime,
        conflicts: validation.conflicts,
        snapped: false,
      };
    }
  }, [dragStore, validateDrop, timelineStore]);
  
  // Handle drop with automatic cleanup
  const handleDrop = useCallback((
    targetTrackId: string,
    dropTime: number,
    onSuccess?: (result: DropResult) => void,
    onError?: (error: string) => void
  ) => {
    const result = performDrop(targetTrackId, dropTime);
    
    if (result.success) {
      onSuccess?.(result);
    } else {
      onError?.('Drop operation failed');
    }
    
    // Clean up
    stopAutoScroll();
    dragStore.endDrag();
  }, [performDrop, stopAutoScroll, dragStore]);
  
  // Cancel drag operation
  const cancelDrag = useCallback(() => {
    stopAutoScroll();
    dragStore.cancelDrag();
  }, [stopAutoScroll, dragStore]);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);
  
  return {
    // State
    isDragging: dragStore.dragState.isDragging,
    dragSource: dragStore.dragState.source,
    dragPreview: dragStore.dragState.preview,
    
    // Actions
    startMediaDrag,
    startElementDrag,
    updateDragPosition,
    handleDrop,
    cancelDrag,
    
    // Utilities
    validateDrop,
    findDropConflicts,
    mouseToTime,
    timeToMouse,
    
    // Store access
    dragStore,
    trackHoverStates: dragStore.trackHoverStates,
  };
}