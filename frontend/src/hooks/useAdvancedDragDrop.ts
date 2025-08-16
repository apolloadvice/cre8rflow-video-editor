/**
 * Advanced Drag & Drop Hook for Multi-Track Timeline
 * 
 * Provides sophisticated drag and drop functionality for professional timeline editing:
 * - Cross-track element dragging with visual feedback
 * - Timeline snapping and quantization
 * - Drag preview with ghost elements
 * - Multi-selection drag support
 * - Collision detection and resolution
 * - Magnetic timeline guides
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { TimelineElement, Track, TrackKind, Transform } from '@/types/timeline';

export interface DragState {
  isDragging: boolean;
  draggedElement?: TimelineElement;
  draggedElements?: TimelineElement[]; // For multi-selection
  sourceTrackId?: string;
  targetTrackId?: string;
  dragPreview?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  snapPosition?: number;
  showSnapGuides?: boolean;
  collisionWarning?: boolean;
}

export interface DropTarget {
  trackId: string;
  trackKind: TrackKind;
  position: number;
  canAccept: boolean;
  reason?: string;
}

export interface DragPreviewOptions {
  showGhost: boolean;
  showSnapping: boolean;
  snapToGrid: boolean;
  snapThreshold: number; // pixels
  magneticGuides: boolean;
}

const DEFAULT_PREVIEW_OPTIONS: DragPreviewOptions = {
  showGhost: true,
  showSnapping: true,
  snapToGrid: true,
  snapThreshold: 10,
  magneticGuides: true,
};

export function useAdvancedDragDrop(options: Partial<DragPreviewOptions> = {}) {
  const multiTrackStore = useMultiTrackStore();
  const [dragState, setDragState] = useState<DragState>({ isDragging: false });
  const [previewOptions] = useState<DragPreviewOptions>({ ...DEFAULT_PREVIEW_OPTIONS, ...options });
  
  const dragRef = useRef<{
    startPosition: { x: number; y: number };
    startTime: number;
    timelineScale: number;
    trackHeight: number;
    snapGuides: number[];
  }>({
    startPosition: { x: 0, y: 0 },
    startTime: 0,
    timelineScale: 1,
    trackHeight: 80,
    snapGuides: [],
  });

  /**
   * Calculate timeline position from mouse coordinates
   */
  const calculateTimelinePosition = useCallback((mouseX: number, timelineLeft: number): number => {
    const relativeX = mouseX - timelineLeft;
    const timePosition = relativeX / dragRef.current.timelineScale;
    
    if (previewOptions.snapToGrid) {
      // Snap to 0.1 second intervals
      const snapInterval = 0.1;
      return Math.round(timePosition / snapInterval) * snapInterval;
    }
    
    return Math.max(0, timePosition);
  }, [previewOptions.snapToGrid]);

  /**
   * Calculate target track from mouse coordinates
   */
  const calculateTargetTrack = useCallback((mouseY: number, timelineTop: number): string | null => {
    const timeline = multiTrackStore.project.timeline;
    if (!timeline) return null;
    
    const relativeY = mouseY - timelineTop;
    const trackIndex = Math.floor(relativeY / dragRef.current.trackHeight);
    
    if (trackIndex >= 0 && trackIndex < timeline.tracks.length) {
      return timeline.tracks[trackIndex].id;
    }
    
    return null;
  }, [multiTrackStore.project.timeline]);

  /**
   * Check if drop is valid for target track
   */
  const validateDropTarget = useCallback((
    element: TimelineElement,
    targetTrackId: string,
    position: number
  ): DropTarget => {
    const timeline = multiTrackStore.project.timeline;
    if (!timeline) {
      return { trackId: targetTrackId, trackKind: 'video', position, canAccept: false, reason: 'No timeline' };
    }
    
    const targetTrack = timeline.tracks.find(t => t.id === targetTrackId);
    if (!targetTrack) {
      return { trackId: targetTrackId, trackKind: 'video', position, canAccept: false, reason: 'Track not found' };
    }
    
    // Check track kind compatibility
    const isCompatible = isElementCompatibleWithTrack(element, targetTrack.kind);
    if (!isCompatible) {
      return {
        trackId: targetTrackId,
        trackKind: targetTrack.kind,
        position,
        canAccept: false,
        reason: `${element.type || 'Element'} not compatible with ${targetTrack.kind} track`
      };
    }
    
    // Check for collisions with existing elements
    const elementEnd = position + element.duration;
    const hasCollision = targetTrack.elements.some(existing => {
      if (existing.id === element.id) return false; // Don't collide with self
      
      const existingEnd = existing.start + existing.duration;
      return !(elementEnd <= existing.start || position >= existingEnd);
    });
    
    if (hasCollision) {
      return {
        trackId: targetTrackId,
        trackKind: targetTrack.kind,
        position,
        canAccept: false,
        reason: 'Collision with existing element'
      };
    }
    
    return {
      trackId: targetTrackId,
      trackKind: targetTrack.kind,
      position,
      canAccept: true
    };
  }, [multiTrackStore.project.timeline]);

  /**
   * Check element compatibility with track kind
   */
  const isElementCompatibleWithTrack = useCallback((element: TimelineElement, trackKind: TrackKind): boolean => {
    // Basic compatibility rules
    switch (trackKind) {
      case 'video':
        return element.type === 'video' || element.type === 'image';
      case 'audio':
        return element.type === 'audio';
      case 'title':
        return element.type === 'text' || element.type === 'title';
      case 'overlay':
        return element.type === 'video' || element.type === 'image' || element.type === 'text';
      case 'effect':
        return element.type === 'effect' || element.type === 'filter';
      default:
        return true; // Allow on unknown tracks
    }
  }, []);

  /**
   * Generate snap guides from existing elements
   */
  const generateSnapGuides = useCallback((): number[] => {
    const timeline = multiTrackStore.project.timeline;
    if (!timeline || !previewOptions.magneticGuides) return [];
    
    const guides = new Set<number>();
    
    // Add guides from all element start and end positions
    timeline.tracks.forEach(track => {
      track.elements.forEach(element => {
        guides.add(element.start);
        guides.add(element.start + element.duration);
      });
    });
    
    // Add timeline markers if they exist
    if (timeline.markers) {
      timeline.markers.forEach(marker => {
        guides.add(marker.time);
      });
    }
    
    return Array.from(guides).sort((a, b) => a - b);
  }, [multiTrackStore.project.timeline, previewOptions.magneticGuides]);

  /**
   * Find nearest snap position
   */
  const findSnapPosition = useCallback((position: number, snapGuides: number[]): number | undefined => {
    if (!previewOptions.showSnapping) return undefined;
    
    const snapThreshold = previewOptions.snapThreshold / dragRef.current.timelineScale;
    
    for (const guide of snapGuides) {
      if (Math.abs(position - guide) <= snapThreshold) {
        return guide;
      }
    }
    
    return undefined;
  }, [previewOptions.showSnapping, previewOptions.snapThreshold]);

  /**
   * Start drag operation
   */
  const startDrag = useCallback((
    element: TimelineElement,
    sourceTrackId: string,
    mousePosition: { x: number; y: number },
    timelineConfig: {
      left: number;
      top: number;
      scale: number;
      trackHeight: number;
    }
  ) => {
    // Update drag reference
    dragRef.current = {
      startPosition: mousePosition,
      startTime: element.start,
      timelineScale: timelineConfig.scale,
      trackHeight: timelineConfig.trackHeight,
      snapGuides: generateSnapGuides(),
    };
    
    // Check if element is part of current selection
    const selectedElements = multiTrackStore.selectedElementIds;
    const isDragMultiple = selectedElements.includes(element.id) && selectedElements.length > 1;
    
    const timeline = multiTrackStore.project.timeline;
    const draggedElements = isDragMultiple && timeline
      ? timeline.tracks.flatMap(track => 
          track.elements.filter(el => selectedElements.includes(el.id))
        )
      : [element];
    
    setDragState({
      isDragging: true,
      draggedElement: element,
      draggedElements: isDragMultiple ? draggedElements : undefined,
      sourceTrackId,
      dragPreview: {
        x: mousePosition.x,
        y: mousePosition.y,
        width: element.duration * timelineConfig.scale,
        height: timelineConfig.trackHeight - 4,
      },
      showSnapGuides: previewOptions.magneticGuides,
    });
  }, [multiTrackStore.selectedElementIds, multiTrackStore.project.timeline, generateSnapGuides, previewOptions.magneticGuides]);

  /**
   * Update drag position during drag operation
   */
  const updateDrag = useCallback((
    mousePosition: { x: number; y: number },
    timelineConfig: { left: number; top: number }
  ) => {
    if (!dragState.isDragging || !dragState.draggedElement) return;
    
    const timelinePosition = calculateTimelinePosition(mousePosition.x, timelineConfig.left);
    const targetTrackId = calculateTargetTrack(mousePosition.y, timelineConfig.top);
    
    // Find snap position
    const snapPosition = findSnapPosition(timelinePosition, dragRef.current.snapGuides);
    const finalPosition = snapPosition !== undefined ? snapPosition : timelinePosition;
    
    // Validate drop target
    const dropTarget = targetTrackId 
      ? validateDropTarget(dragState.draggedElement, targetTrackId, finalPosition)
      : null;
    
    setDragState(prev => ({
      ...prev,
      targetTrackId: targetTrackId || undefined,
      dragPreview: {
        ...prev.dragPreview!,
        x: mousePosition.x,
        y: mousePosition.y,
      },
      snapPosition: snapPosition,
      collisionWarning: dropTarget ? !dropTarget.canAccept : false,
    }));
  }, [dragState.isDragging, dragState.draggedElement, calculateTimelinePosition, calculateTargetTrack, findSnapPosition, validateDropTarget]);

  /**
   * Complete drag operation
   */
  const completeDrag = useCallback((
    mousePosition: { x: number; y: number },
    timelineConfig: { left: number; top: number }
  ) => {
    if (!dragState.isDragging || !dragState.draggedElement) return false;
    
    const timelinePosition = calculateTimelinePosition(mousePosition.x, timelineConfig.left);
    const targetTrackId = calculateTargetTrack(mousePosition.y, timelineConfig.top);
    
    if (!targetTrackId) {
      cancelDrag();
      return false;
    }
    
    // Find snap position
    const snapPosition = findSnapPosition(timelinePosition, dragRef.current.snapGuides);
    const finalPosition = Math.max(0, snapPosition !== undefined ? snapPosition : timelinePosition);
    
    // Validate drop
    const dropTarget = validateDropTarget(dragState.draggedElement, targetTrackId, finalPosition);
    if (!dropTarget.canAccept) {
      cancelDrag();
      return false;
    }
    
    // Handle multi-element drag
    if (dragState.draggedElements && dragState.draggedElements.length > 1) {
      // Calculate offset for each element
      const primaryElement = dragState.draggedElement;
      const timeOffset = finalPosition - primaryElement.start;
      
      // Move all selected elements
      dragState.draggedElements.forEach(element => {
        const newPosition = Math.max(0, element.start + timeOffset);
        multiTrackStore.moveElementToTrack(element.id, targetTrackId, newPosition);
      });
    } else {
      // Move single element
      multiTrackStore.moveElementToTrack(dragState.draggedElement.id, targetTrackId, finalPosition);
    }
    
    // Clear drag state
    setDragState({ isDragging: false });
    return true;
  }, [dragState, calculateTimelinePosition, calculateTargetTrack, findSnapPosition, validateDropTarget, multiTrackStore]);

  /**
   * Cancel drag operation
   */
  const cancelDrag = useCallback(() => {
    setDragState({ isDragging: false });
  }, []);

  /**
   * Handle element resize via drag
   */
  const startResize = useCallback((
    element: TimelineElement,
    handle: 'start' | 'end',
    mousePosition: { x: number; y: number },
    timelineConfig: { scale: number }
  ) => {
    dragRef.current.timelineScale = timelineConfig.scale;
    dragRef.current.snapGuides = generateSnapGuides();
    
    setDragState({
      isDragging: true,
      draggedElement: element,
      dragPreview: {
        x: mousePosition.x,
        y: mousePosition.y,
        width: element.duration * timelineConfig.scale,
        height: 80,
      },
    });
  }, [generateSnapGuides]);

  /**
   * Update resize operation
   */
  const updateResize = useCallback((
    handle: 'start' | 'end',
    mousePosition: { x: number; y: number },
    timelineConfig: { left: number }
  ) => {
    if (!dragState.isDragging || !dragState.draggedElement) return;
    
    const timelinePosition = calculateTimelinePosition(mousePosition.x, timelineConfig.left);
    const element = dragState.draggedElement;
    
    let newStart = element.start;
    let newDuration = element.duration;
    
    if (handle === 'start') {
      newStart = Math.max(0, Math.min(timelinePosition, element.start + element.duration - 0.1));
      newDuration = element.start + element.duration - newStart;
    } else {
      const newEnd = Math.max(element.start + 0.1, timelinePosition);
      newDuration = newEnd - element.start;
    }
    
    // Find snap position
    const snapGuides = dragRef.current.snapGuides;
    const snapPosition = findSnapPosition(
      handle === 'start' ? newStart : newStart + newDuration,
      snapGuides
    );
    
    if (snapPosition !== undefined) {
      if (handle === 'start') {
        newStart = snapPosition;
        newDuration = element.start + element.duration - newStart;
      } else {
        newDuration = snapPosition - element.start;
      }
    }
    
    setDragState(prev => ({
      ...prev,
      snapPosition: snapPosition,
    }));
  }, [dragState.isDragging, dragState.draggedElement, calculateTimelinePosition, findSnapPosition]);

  /**
   * Complete resize operation
   */
  const completeResize = useCallback((
    handle: 'start' | 'end',
    mousePosition: { x: number; y: number },
    timelineConfig: { left: number }
  ) => {
    if (!dragState.isDragging || !dragState.draggedElement) return false;
    
    const timelinePosition = calculateTimelinePosition(mousePosition.x, timelineConfig.left);
    const element = dragState.draggedElement;
    
    let newStart = element.start;
    let newDuration = element.duration;
    
    if (handle === 'start') {
      newStart = Math.max(0, Math.min(timelinePosition, element.start + element.duration - 0.1));
      newDuration = element.start + element.duration - newStart;
    } else {
      const newEnd = Math.max(element.start + 0.1, timelinePosition);
      newDuration = newEnd - element.start;
    }
    
    // Apply snap if found
    const snapGuides = dragRef.current.snapGuides;
    const snapPosition = findSnapPosition(
      handle === 'start' ? newStart : newStart + newDuration,
      snapGuides
    );
    
    if (snapPosition !== undefined) {
      if (handle === 'start') {
        newStart = snapPosition;
        newDuration = element.start + element.duration - newStart;
      } else {
        newDuration = snapPosition - element.start;
      }
    }
    
    // Update element
    multiTrackStore.updateElement(element.id, {
      start: newStart,
      duration: newDuration,
    });
    
    setDragState({ isDragging: false });
    return true;
  }, [dragState, calculateTimelinePosition, findSnapPosition, multiTrackStore]);

  // Cleanup drag state on unmount
  useEffect(() => {
    return () => {
      setDragState({ isDragging: false });
    };
  }, []);

  return {
    // State
    dragState,
    previewOptions,
    
    // Drag operations
    startDrag,
    updateDrag,
    completeDrag,
    cancelDrag,
    
    // Resize operations
    startResize,
    updateResize,
    completeResize,
    
    // Utilities
    validateDropTarget,
    generateSnapGuides,
    isElementCompatibleWithTrack,
  };
}