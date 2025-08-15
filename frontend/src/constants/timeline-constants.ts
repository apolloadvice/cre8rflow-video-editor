/**
 * Timeline Constants for Multi-Track System
 * 
 * Centralized constants for timeline rendering, layout, and behavior.
 * These constants ensure consistency across all timeline components.
 */

import { TrackKind } from '@/types/timeline';

// Visual constants
export const TIMELINE_CONSTANTS = {
  // Zoom and scale
  PIXELS_PER_SECOND: 100, // Base pixels per second at 1x zoom
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10.0,
  DEFAULT_ZOOM: 1.0,
  ZOOM_STEP: 0.25,
  ZOOM_WHEEL_SENSITIVITY: 0.001,
  
  // Track dimensions
  TRACK_HEIGHT_VIDEO: 60,
  TRACK_HEIGHT_AUDIO: 40,
  TRACK_HEIGHT_TITLE: 50,
  TRACK_HEIGHT_OVERLAY: 45,
  TRACK_HEIGHT_EFFECT: 35,
  TRACK_HEADER_WIDTH: 150,
  TRACK_SPACING: 2,
  
  // Element dimensions
  MIN_ELEMENT_WIDTH: 10, // Minimum pixels for an element
  ELEMENT_BORDER_WIDTH: 1,
  ELEMENT_CORNER_RADIUS: 4,
  HANDLE_WIDTH: 8, // Width of resize handles
  
  // Timeline UI
  RULER_HEIGHT: 40,
  PLAYHEAD_WIDTH: 2,
  PLAYHEAD_HANDLE_SIZE: 12,
  MARKER_WIDTH: 2,
  MARKER_HEIGHT: 20,
  
  // Snapping
  DEFAULT_SNAP_EPSILON: 0.1, // 100ms tolerance
  SNAP_INDICATOR_WIDTH: 1,
  SNAP_INDICATOR_COLOR: '#3b82f6',
  
  // Selection
  SELECTION_BOX_BORDER_WIDTH: 1,
  SELECTION_BOX_COLOR: '#3b82f6',
  SELECTION_BOX_OPACITY: 0.2,
  MULTI_SELECT_COLOR: '#6366f1',
  
  // Animation
  SMOOTH_SCROLL_DURATION: 200,
  ZOOM_ANIMATION_DURATION: 150,
  ELEMENT_TRANSITION_DURATION: 100,
  
  // Performance
  VIEWPORT_BUFFER: 100, // Extra pixels to render outside viewport
  MAX_VISIBLE_ELEMENTS: 1000, // Maximum elements to render at once
  DEBOUNCE_SCROLL: 16, // ~60fps debouncing
  DEBOUNCE_RESIZE: 100,
  
  // Default durations
  DEFAULT_IMAGE_DURATION: 5,
  DEFAULT_TEXT_DURATION: 3,
  DEFAULT_TRANSITION_DURATION: 0.5,
  DEFAULT_FADE_DURATION: 1,
  
  // Colors
  COLORS: {
    BACKGROUND: '#1f2937',
    TRACK_BACKGROUND: '#374151',
    TRACK_BORDER: '#4b5563',
    ELEMENT_BACKGROUND: '#6b7280',
    ELEMENT_BORDER: '#9ca3af',
    SELECTED_BACKGROUND: '#3b82f6',
    SELECTED_BORDER: '#1d4ed8',
    MUTED_BACKGROUND: '#6b7280',
    LOCKED_BACKGROUND: '#ef4444',
    HIDDEN_OPACITY: 0.5,
  },
} as const;

// Track-specific constants
export const TRACK_CONSTANTS: Record<TrackKind, {
  height: number;
  color: string;
  icon: string;
  maxElements?: number;
  allowOverlap?: boolean;
}> = {
  video: {
    height: TIMELINE_CONSTANTS.TRACK_HEIGHT_VIDEO,
    color: '#3b82f6', // Blue
    icon: 'video',
    allowOverlap: false,
  },
  audio: {
    height: TIMELINE_CONSTANTS.TRACK_HEIGHT_AUDIO,
    color: '#10b981', // Green
    icon: 'audio',
    allowOverlap: false,
  },
  title: {
    height: TIMELINE_CONSTANTS.TRACK_HEIGHT_TITLE,
    color: '#f59e0b', // Amber
    icon: 'type',
    allowOverlap: true, // Titles can overlap for transitions
  },
  overlay: {
    height: TIMELINE_CONSTANTS.TRACK_HEIGHT_OVERLAY,
    color: '#8b5cf6', // Purple
    icon: 'layers',
    allowOverlap: true, // Overlays can overlap
  },
  effect: {
    height: TIMELINE_CONSTANTS.TRACK_HEIGHT_EFFECT,
    color: '#ef4444', // Red
    icon: 'wand',
    allowOverlap: true, // Effects can overlap
  },
} as const;

// Helper functions for track layout
export function getTrackHeight(kind: TrackKind): number {
  return TRACK_CONSTANTS[kind].height;
}

export function getTrackColor(kind: TrackKind): string {
  return TRACK_CONSTANTS[kind].color;
}

export function getCumulativeHeightBefore(tracks: Array<{ kind: TrackKind; index: number }>, trackIndex: number): number {
  return tracks
    .filter(track => track.index < trackIndex)
    .reduce((total, track) => total + getTrackHeight(track.kind) + TIMELINE_CONSTANTS.TRACK_SPACING, 0);
}

export function getTotalTracksHeight(tracks: Array<{ kind: TrackKind }>): number {
  if (tracks.length === 0) return 0;
  
  const totalTrackHeight = tracks.reduce((total, track) => total + getTrackHeight(track.kind), 0);
  const totalSpacing = Math.max(0, tracks.length - 1) * TIMELINE_CONSTANTS.TRACK_SPACING;
  
  return totalTrackHeight + totalSpacing;
}

// Time formatting utilities
export function formatTimecode(seconds: number, fps: number = 30): string {
  const totalFrames = Math.round(seconds * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }
  
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  
  if (mins > 0) {
    return `${mins}:${secs.padStart(4, '0')}`;
  }
  
  return `${secs}s`;
}

// Frame quantization utilities
export function snapTimeToFrame(time: number, fps: number): number {
  const frameDuration = 1 / fps;
  return Math.round(time / frameDuration) * frameDuration;
}

export function timeToFrame(time: number, fps: number): number {
  return Math.round(time * fps);
}

export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

// Scale and zoom utilities
export function getPixelsPerSecond(zoomLevel: number): number {
  return TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
}

export function timeToPixels(time: number, zoomLevel: number): number {
  return time * getPixelsPerSecond(zoomLevel);
}

export function pixelsToTime(pixels: number, zoomLevel: number): number {
  const pps = getPixelsPerSecond(zoomLevel);
  return pps > 0 ? pixels / pps : 0;
}

// Element positioning utilities
export function getElementWidth(duration: number, zoomLevel: number): number {
  return Math.max(TIMELINE_CONSTANTS.MIN_ELEMENT_WIDTH, timeToPixels(duration, zoomLevel));
}

export function getElementPosition(startTime: number, zoomLevel: number, scrollX: number = 0): number {
  return timeToPixels(startTime, zoomLevel) - scrollX;
}

// Viewport and culling utilities
export function isElementVisible(
  elementStart: number,
  elementDuration: number,
  zoomLevel: number,
  scrollX: number,
  viewportWidth: number
): boolean {
  const elementLeft = getElementPosition(elementStart, zoomLevel, scrollX);
  const elementWidth = getElementWidth(elementDuration, zoomLevel);
  const elementRight = elementLeft + elementWidth;
  
  const buffer = TIMELINE_CONSTANTS.VIEWPORT_BUFFER;
  return elementRight >= -buffer && elementLeft <= viewportWidth + buffer;
}

export function getVisibleTimeRange(
  scrollX: number,
  viewportWidth: number,
  zoomLevel: number
): { start: number; end: number } {
  const buffer = TIMELINE_CONSTANTS.VIEWPORT_BUFFER;
  const start = pixelsToTime(scrollX - buffer, zoomLevel);
  const end = pixelsToTime(scrollX + viewportWidth + buffer, zoomLevel);
  
  return { start: Math.max(0, start), end };
}

// Keyboard shortcut display utilities
export function getShortcutDisplay(keys: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean; key: string }): string {
  const modifiers = [];
  
  // Use platform-appropriate modifier names
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  
  if (keys.ctrl) modifiers.push(isMac ? '⌃' : 'Ctrl');
  if (keys.shift) modifiers.push(isMac ? '⇧' : 'Shift');
  if (keys.alt) modifiers.push(isMac ? '⌥' : 'Alt');
  if (keys.meta) modifiers.push(isMac ? '⌘' : 'Win');
  
  // Format special keys
  const keyDisplay = {
    ' ': 'Space',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'Backspace': '⌫',
    'Delete': 'Del',
    'Enter': '↵',
    'Escape': 'Esc',
    'Tab': '⇥',
  }[keys.key] || keys.key.toUpperCase();
  
  return [...modifiers, keyDisplay].join(isMac ? '' : '+');
}

// Animation easing functions
export const EASING = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => t * (2 - t),
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
} as const;

// Export everything for easy importing
export * from './timeline-constants';