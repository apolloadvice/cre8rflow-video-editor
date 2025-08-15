/**
 * Multi-Track Timeline Types for cre8rflow
 * 
 * This file defines the complete type system for the multi-track timeline,
 * following the requirements to support video, audio, title, overlay, and effect tracks.
 */

export type TrackKind = 'video' | 'audio' | 'title' | 'overlay' | 'effect';

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotate: number;
}

export interface Keyframe {
  time: number;
  property: string;
  value: any;
  interpolation?: 'linear' | 'cubic' | 'step';
}

export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  parameters: Record<string, any>;
}

export interface TimelineElement {
  id: string;
  mediaId?: string; // Reference to media in MediaStore
  start: number; // Start time in seconds
  duration: number; // Duration in seconds
  trimStart?: number; // Trim from start in seconds
  trimEnd?: number; // Trim from end in seconds
  speed?: number; // Playback speed multiplier (default: 1.0)
  volume?: number; // Volume multiplier (default: 1.0)
  opacity?: number; // Opacity 0-1 (default: 1.0)
  hidden?: boolean; // Hide this element
  transforms?: Transform; // Position, scale, rotation
  effects?: Effect[]; // Applied effects
  keyframes?: Keyframe[]; // Animation keyframes
  
  // Element metadata
  name?: string; // Display name
  color?: string; // UI color for element
  locked?: boolean; // Prevent editing
}

export interface Track {
  id: string;
  kind: TrackKind;
  index: number; // Track order (0 = bottom, higher = top)
  name: string; // Display name
  muted?: boolean; // Mute track audio/hide visuals
  hidden?: boolean; // Hide track completely
  locked?: boolean; // Prevent editing
  elements: TimelineElement[]; // Non-overlapping elements within track
  
  // Track metadata
  color?: string; // UI color for track
  height?: number; // Custom track height
}

export interface Marker {
  id: string;
  time: number; // Time in seconds
  name: string; // Display name
  color?: string; // UI color
  description?: string; // Optional description
}

export interface Timeline {
  id: string;
  zoom: number; // Zoom level (1.0 = default)
  scrollX: number; // Horizontal scroll position
  markers: Marker[]; // Timeline markers
  tracks: Track[]; // All tracks in order
  playhead: number; // Current playhead position in seconds
  snapEpsilon: number; // Snapping tolerance in seconds
}

export interface Project {
  id: string;
  name: string;
  fps: number; // Frame rate
  sampleRate: number; // Audio sample rate
  resolution: {
    width: number;
    height: number;
  };
  timeline: Timeline;
  
  // Project metadata
  createdAt: string;
  updatedAt: string;
  version: string;
}

// Helper types for creation operations (without auto-generated fields)
export type CreateTimelineElement = Omit<TimelineElement, 'id'>;
export type CreateTrack = Omit<Track, 'id' | 'elements'> & { elements?: CreateTimelineElement[] };
export type CreateMarker = Omit<Marker, 'id'>;

// Utility types for operations
export interface TimeRange {
  start: number;
  end: number;
}

export interface ElementPosition {
  trackId: string;
  elementId: string;
  time: number;
}

export interface TrackSelection {
  trackId: string;
  elementIds: string[];
}

// Validation and utility functions
export function isValidTrackKind(kind: string): kind is TrackKind {
  return ['video', 'audio', 'title', 'overlay', 'effect'].includes(kind);
}

export function canElementGoOnTrack(elementType: 'media' | 'text' | 'effect', trackKind: TrackKind): boolean {
  switch (elementType) {
    case 'media':
      return trackKind === 'video' || trackKind === 'audio';
    case 'text':
      return trackKind === 'title' || trackKind === 'overlay';
    case 'effect':
      return trackKind === 'effect';
    default:
      return false;
  }
}

export function getElementEndTime(element: TimelineElement): number {
  const speed = element.speed ?? 1.0;
  const trimStart = element.trimStart ?? 0;
  const trimEnd = element.trimEnd ?? 0;
  const effectiveDuration = element.duration - trimStart - trimEnd;
  return element.start + (effectiveDuration / speed);
}

export function getElementRenderTime(element: TimelineElement, timelineTime: number): number | null {
  const elementEnd = getElementEndTime(element);
  
  if (timelineTime < element.start || timelineTime >= elementEnd) {
    return null; // Not active at this time
  }
  
  const speed = element.speed ?? 1.0;
  const trimStart = element.trimStart ?? 0;
  const relativeTime = timelineTime - element.start;
  return trimStart + (relativeTime * speed);
}

export function sortTracksByIndex(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => a.index - b.index);
}

export function validateElementNonOverlap(elements: TimelineElement[]): boolean {
  const sorted = [...elements].sort((a, b) => a.start - b.start);
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const currentEnd = getElementEndTime(current);
    
    if (currentEnd > next.start) {
      return false; // Overlap detected
    }
  }
  
  return true;
}

// Default values and constants
export const DEFAULT_TIMELINE: Omit<Timeline, 'id'> = {
  zoom: 1.0,
  scrollX: 0,
  markers: [],
  tracks: [],
  playhead: 0,
  snapEpsilon: 0.1, // 100ms snapping tolerance
};

export const DEFAULT_PROJECT_SETTINGS = {
  fps: 30,
  sampleRate: 48000,
  resolution: {
    width: 1920,
    height: 1080,
  },
};

export const TRACK_KIND_COLORS: Record<TrackKind, string> = {
  video: '#3b82f6', // Blue
  audio: '#10b981', // Green
  title: '#f59e0b', // Amber
  overlay: '#8b5cf6', // Purple
  effect: '#ef4444', // Red
};