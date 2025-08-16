/**
 * Global Drag Store for Timeline
 * 
 * Manages drag and drop state across the entire timeline:
 * - Global drag context that persists across components
 * - Per-track hover states for visual feedback
 * - ID-based drop resolution (never by name)
 * - Autoscroll during drag operations
 * - Reliable hover state clearing
 */

import { create } from 'zustand';
import { generateUUID } from '@/lib/utils';
import { TrackKind } from '@/types/timeline';

export interface DragSource {
  type: 'media' | 'element' | 'text' | 'asset';
  id: string;
  data: any; // Additional data for the drag operation
  trackId?: string; // Source track for element drags
  originalPosition?: {
    trackId: string;
    time: number;
  };
}

export interface DragPreview {
  name: string;
  duration?: number;
  thumbnail?: string;
  color?: string;
}

export interface DragState {
  isDragging: boolean;
  source: DragSource | null;
  preview: DragPreview | null;
  cursorTime: number; // Current time under cursor
  targetTrackId: string | null;
  isValidDrop: boolean;
  dragVersion: number; // Increment to force re-renders
  snapTime?: number; // Snapped time if snapping is active
  
  // Mouse tracking
  startPos: { x: number; y: number } | null;
  currentPos: { x: number; y: number } | null;
  offset: { x: number; y: number } | null; // Offset from element origin
}

export interface TrackHoverState {
  isDragOver: boolean;
  insertionTime: number; // Where the element would be inserted
  insertionIndex: number; // Index in elements array
  snapType: 'none' | 'element-start' | 'element-end' | 'marker' | 'playhead' | 'frame';
  snapId?: string; // ID of snap target
  isValidDrop: boolean;
  conflictsWith: string[]; // IDs of conflicting elements
}

export interface AutoScrollState {
  active: boolean;
  direction: 'left' | 'right';
  speed: number; // pixels per frame
  zone: number; // pixels from edge to trigger scroll
}

export interface DragDropState {
  dragState: DragState;
  trackHoverStates: Record<string, TrackHoverState>;
  autoScroll: AutoScrollState;
  
  // Performance tracking
  lastUpdate: number;
  updateCount: number;
}

export interface DragStore extends DragDropState {
  // Drag lifecycle
  startDrag: (source: DragSource, preview: DragPreview, initialPos: { x: number; y: number }, offset?: { x: number; y: number }) => void;
  updateDrag: (currentPos: { x: number; y: number }, cursorTime: number, targetTrackId?: string | null) => void;
  endDrag: () => void;
  cancelDrag: () => void;
  
  // Track hover management
  setTrackHover: (trackId: string, hoverState: Partial<TrackHoverState>) => void;
  clearTrackHover: (trackId: string) => void;
  clearAllTrackHovers: () => void;
  
  // Validation
  validateDrop: (source: DragSource, targetTrackId: string, time: number) => {
    isValid: boolean;
    reason?: string;
    conflicts?: string[];
  };
  
  // Auto-scroll
  startAutoScroll: (direction: 'left' | 'right', speed: number) => void;
  stopAutoScroll: () => void;
  updateAutoScroll: (containerRect: DOMRect, mouseX: number) => void;
  
  // Utilities
  getDragElementAt: (trackId: string, time: number) => string | null;
  getDropPosition: (trackId: string, time: number) => { index: number; time: number };
  isTrackCompatible: (sourceType: DragSource['type'], targetTrackKind: TrackKind) => boolean;
  
  // Debug helpers
  getDebugInfo: () => {
    dragState: DragState;
    hoverCount: number;
    updateRate: number;
  };
}

// Track compatibility rules
const TRACK_COMPATIBILITY: Record<DragSource['type'], TrackKind[]> = {
  media: ['video', 'audio'],
  element: ['video', 'audio', 'title', 'overlay', 'effect'], // Elements can move between compatible tracks
  text: ['title', 'overlay'],
  asset: ['video', 'audio', 'title', 'overlay'],
};

export const useDragStore = create<DragStore>((set, get) => ({
  // Initial state
  dragState: {
    isDragging: false,
    source: null,
    preview: null,
    cursorTime: 0,
    targetTrackId: null,
    isValidDrop: false,
    dragVersion: 0,
    startPos: null,
    currentPos: null,
    offset: null,
  },
  
  trackHoverStates: {},
  
  autoScroll: {
    active: false,
    direction: 'left',
    speed: 0,
    zone: 50, // 50px from edge
  },
  
  lastUpdate: 0,
  updateCount: 0,
  
  // Drag lifecycle
  startDrag: (source, preview, initialPos, offset = { x: 0, y: 0 }) => {
    const dragId = generateUUID();
    
    set(state => ({
      dragState: {
        isDragging: true,
        source,
        preview,
        cursorTime: 0,
        targetTrackId: null,
        isValidDrop: false,
        dragVersion: state.dragState.dragVersion + 1,
        startPos: initialPos,
        currentPos: initialPos,
        offset,
      },
      trackHoverStates: {}, // Clear all hover states
      autoScroll: {
        ...state.autoScroll,
        active: false,
      },
      lastUpdate: performance.now(),
      updateCount: 0,
    }));
  },
  
  updateDrag: (currentPos, cursorTime, targetTrackId = null) => {
    const now = performance.now();
    
    set(state => {
      const newDragState = {
        ...state.dragState,
        currentPos,
        cursorTime,
        targetTrackId,
        isValidDrop: targetTrackId ? get().validateDrop(
          state.dragState.source!,
          targetTrackId,
          cursorTime
        ).isValid : false,
      };
      
      return {
        dragState: newDragState,
        lastUpdate: now,
        updateCount: state.updateCount + 1,
      };
    });
  },
  
  endDrag: () => {
    set(state => ({
      dragState: {
        isDragging: false,
        source: null,
        preview: null,
        cursorTime: 0,
        targetTrackId: null,
        isValidDrop: false,
        dragVersion: state.dragState.dragVersion + 1,
        startPos: null,
        currentPos: null,
        offset: null,
      },
      trackHoverStates: {}, // Clear all hover states
      autoScroll: {
        ...state.autoScroll,
        active: false,
      },
    }));
  },
  
  cancelDrag: () => {
    // Same as endDrag but could have different semantics
    get().endDrag();
  },
  
  // Track hover management
  setTrackHover: (trackId, hoverState) => {
    set(state => ({
      trackHoverStates: {
        ...state.trackHoverStates,
        [trackId]: {
          isDragOver: false,
          insertionTime: 0,
          insertionIndex: 0,
          snapType: 'none',
          isValidDrop: false,
          conflictsWith: [],
          ...state.trackHoverStates[trackId],
          ...hoverState,
        },
      },
    }));
  },
  
  clearTrackHover: (trackId) => {
    set(state => {
      const newStates = { ...state.trackHoverStates };
      delete newStates[trackId];
      return { trackHoverStates: newStates };
    });
  },
  
  clearAllTrackHovers: () => {
    set({ trackHoverStates: {} });
  },
  
  // Validation
  validateDrop: (source, targetTrackId, time) => {
    if (!source) {
      return { isValid: false, reason: 'No drag source' };
    }
    
    // Get target track from store (would need access to timeline store)
    // For now, assume basic validation
    const isTimeValid = time >= 0;
    const isSourceValid = source.id && source.type;
    
    if (!isTimeValid) {
      return { isValid: false, reason: 'Invalid time position' };
    }
    
    if (!isSourceValid) {
      return { isValid: false, reason: 'Invalid drag source' };
    }
    
    // Check for overlaps (would need timeline data)
    // This is a simplified check - real implementation would check timeline store
    
    return { isValid: true };
  },
  
  // Auto-scroll
  startAutoScroll: (direction, speed) => {
    set(state => ({
      autoScroll: {
        ...state.autoScroll,
        active: true,
        direction,
        speed,
      },
    }));
  },
  
  stopAutoScroll: () => {
    set(state => ({
      autoScroll: {
        ...state.autoScroll,
        active: false,
      },
    }));
  },
  
  updateAutoScroll: (containerRect, mouseX) => {
    const { zone } = get().autoScroll;
    const leftZone = containerRect.left + zone;
    const rightZone = containerRect.right - zone;
    
    if (mouseX < leftZone) {
      // Mouse in left scroll zone
      const intensity = (leftZone - mouseX) / zone;
      const speed = Math.min(10, intensity * 5); // Max 10px per frame
      get().startAutoScroll('left', speed);
    } else if (mouseX > rightZone) {
      // Mouse in right scroll zone
      const intensity = (mouseX - rightZone) / zone;
      const speed = Math.min(10, intensity * 5);
      get().startAutoScroll('right', speed);
    } else {
      // Mouse not in scroll zone
      get().stopAutoScroll();
    }
  },
  
  // Utilities
  getDragElementAt: (trackId, time) => {
    // Would query timeline store to find element at time
    // Simplified implementation
    return null;
  },
  
  getDropPosition: (trackId, time) => {
    // Would calculate insertion position based on timeline data
    // Simplified implementation
    return { index: 0, time };
  },
  
  isTrackCompatible: (sourceType, targetTrackKind) => {
    const compatibleKinds = TRACK_COMPATIBILITY[sourceType];
    return compatibleKinds.includes(targetTrackKind);
  },
  
  // Debug helpers
  getDebugInfo: () => {
    const state = get();
    const now = performance.now();
    const timeDelta = now - state.lastUpdate;
    const updateRate = timeDelta > 0 ? 1000 / timeDelta : 0;
    
    return {
      dragState: state.dragState,
      hoverCount: Object.keys(state.trackHoverStates).length,
      updateRate,
    };
  },
}));

// Hook for drag and drop operations
export function useDragDrop() {
  const store = useDragStore();
  
  // Helper to start media drag
  const startMediaDrag = (
    mediaId: string,
    mediaData: any,
    preview: DragPreview,
    event: React.MouseEvent | MouseEvent
  ) => {
    const source: DragSource = {
      type: 'media',
      id: mediaId,
      data: mediaData,
    };
    
    const initialPos = { x: event.clientX, y: event.clientY };
    store.startDrag(source, preview, initialPos);
  };
  
  // Helper to start element drag
  const startElementDrag = (
    elementId: string,
    trackId: string,
    elementData: any,
    preview: DragPreview,
    event: React.MouseEvent | MouseEvent,
    offset?: { x: number; y: number }
  ) => {
    const source: DragSource = {
      type: 'element',
      id: elementId,
      data: elementData,
      trackId,
      originalPosition: {
        trackId,
        time: elementData.start || 0,
      },
    };
    
    const initialPos = { x: event.clientX, y: event.clientY };
    store.startDrag(source, preview, initialPos, offset);
  };
  
  // Helper to handle drop
  const handleDrop = (
    targetTrackId: string,
    dropTime: number,
    onSuccess?: (result: any) => void,
    onError?: (error: string) => void
  ) => {
    const { dragState } = store;
    
    if (!dragState.isDragging || !dragState.source) {
      onError?.('No active drag operation');
      return;
    }
    
    const validation = store.validateDrop(dragState.source, targetTrackId, dropTime);
    
    if (!validation.isValid) {
      onError?.(validation.reason || 'Invalid drop');
      store.endDrag();
      return;
    }
    
    try {
      // Perform the actual drop operation
      // This would integrate with the timeline store
      const result = {
        source: dragState.source,
        targetTrackId,
        dropTime,
        conflicts: validation.conflicts,
      };
      
      onSuccess?.(result);
      store.endDrag();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Drop failed');
      store.endDrag();
    }
  };
  
  return {
    ...store,
    startMediaDrag,
    startElementDrag,
    handleDrop,
  };
}

// Hook for track drop zones
export function useTrackDropZone(trackId: string, trackKind: TrackKind) {
  const store = useDragStore();
  const { dragState, trackHoverStates } = store;
  
  const hoverState = trackHoverStates[trackId];
  const isCompatible = dragState.source ? 
    store.isTrackCompatible(dragState.source.type, trackKind) : false;
  
  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    
    if (!dragState.isDragging || !isCompatible) return;
    
    store.setTrackHover(trackId, {
      isDragOver: true,
      isValidDrop: isCompatible,
    });
  };
  
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    
    if (!dragState.isDragging || !isCompatible) return;
    
    // Calculate drop position and time
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const time = relativeX / 100; // Simplified - would use zoom level
    
    store.setTrackHover(trackId, {
      isDragOver: true,
      insertionTime: time,
      isValidDrop: isCompatible,
    });
    
    store.updateDrag({ x: event.clientX, y: event.clientY }, time, trackId);
  };
  
  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    
    // Only clear if actually leaving the track (not entering a child)
    const rect = event.currentTarget.getBoundingClientRect();
    const isStillInside = (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
    
    if (!isStillInside) {
      store.clearTrackHover(trackId);
    }
  };
  
  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    
    if (!dragState.isDragging || !isCompatible) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const time = relativeX / 100; // Simplified
    
    // Use the useDragDrop hook's handleDrop method
    // This would be implemented by the consumer
    
    store.clearTrackHover(trackId);
  };
  
  return {
    isDragOver: hoverState?.isDragOver || false,
    isValidDrop: hoverState?.isValidDrop || false,
    insertionTime: hoverState?.insertionTime || 0,
    conflicts: hoverState?.conflictsWith || [],
    
    // Event handlers
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    
    // Styles
    dragOverStyles: hoverState?.isDragOver ? {
      backgroundColor: isCompatible ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
      borderColor: isCompatible ? '#3b82f6' : '#ef4444',
    } : {},
  };
}