/**
 * Timeline Utilities for Multi-Track System
 * 
 * Provides frame quantization, time calculations, and timeline operations.
 */

import { Timeline, Track, TimelineElement, TrackKind } from '@/types/timeline';
import { generateUUID } from './utils';

/**
 * Quantize time to the nearest frame boundary
 */
export function quantizeToFrame(time: number, fps: number): number {
  const frameDuration = 1 / fps;
  return Math.round(time / frameDuration) * frameDuration;
}

/**
 * Convert time to frame number
 */
export function timeToFrame(time: number, fps: number): number {
  return Math.round(time * fps);
}

/**
 * Convert frame number to time
 */
export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

/**
 * Format time as timecode (HH:MM:SS:FF)
 */
export function formatTimecode(time: number, fps: number): string {
  const totalFrames = Math.round(time * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

/**
 * Parse timecode string to time in seconds
 */
export function parseTimecode(timecode: string, fps: number): number {
  const parts = timecode.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid timecode format. Expected HH:MM:SS:FF');
  }
  
  const [hours, minutes, seconds, frames] = parts.map(p => parseInt(p, 10));
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const totalFrames = totalSeconds * fps + frames;
  
  return totalFrames / fps;
}

/**
 * Interval Tree Node for fast time-based queries
 */
export class IntervalNode {
  start: number;
  end: number;
  max: number;
  element: TimelineElement;
  left: IntervalNode | null = null;
  right: IntervalNode | null = null;
  
  constructor(element: TimelineElement) {
    this.element = element;
    this.start = element.start;
    this.end = element.start + element.duration;
    this.max = this.end;
  }
}

/**
 * Interval Tree for efficient time-based element queries
 */
export class IntervalTree {
  root: IntervalNode | null = null;
  
  insert(element: TimelineElement): void {
    this.root = this._insert(this.root, new IntervalNode(element));
  }
  
  private _insert(node: IntervalNode | null, newNode: IntervalNode): IntervalNode {
    if (!node) {
      return newNode;
    }
    
    if (newNode.start <= node.start) {
      node.left = this._insert(node.left, newNode);
    } else {
      node.right = this._insert(node.right, newNode);
    }
    
    node.max = Math.max(node.max, newNode.max);
    return node;
  }
  
  query(start: number, end: number): TimelineElement[] {
    const result: TimelineElement[] = [];
    this._query(this.root, start, end, result);
    return result;
  }
  
  private _query(node: IntervalNode | null, start: number, end: number, result: TimelineElement[]): void {
    if (!node) return;
    
    // Check if current node overlaps with query range
    if (node.start <= end && node.end >= start) {
      result.push(node.element);
    }
    
    // Recursively search children if they might contain overlapping intervals
    if (node.left && node.left.max >= start) {
      this._query(node.left, start, end, result);
    }
    
    if (node.right && node.start <= end) {
      this._query(node.right, start, end, result);
    }
  }
  
  rebuild(elements: TimelineElement[]): void {
    this.root = null;
    elements.forEach(element => this.insert(element));
  }
}

/**
 * Track with optimized interval tree for element queries
 */
export class OptimizedTrack {
  track: Track;
  intervalTree: IntervalTree;
  
  constructor(track: Track) {
    this.track = track;
    this.intervalTree = new IntervalTree();
    this.rebuildIndex();
  }
  
  rebuildIndex(): void {
    this.intervalTree.rebuild(this.track.elements);
  }
  
  getElementsAt(time: number): TimelineElement[] {
    return this.intervalTree.query(time, time);
  }
  
  getElementsInRange(start: number, end: number): TimelineElement[] {
    return this.intervalTree.query(start, end);
  }
  
  addElement(element: TimelineElement): void {
    this.track.elements.push(element);
    this.intervalTree.insert(element);
  }
  
  removeElement(elementId: string): void {
    this.track.elements = this.track.elements.filter(e => e.id !== elementId);
    this.rebuildIndex(); // Rebuild since we don't have efficient deletion
  }
  
  updateElement(elementId: string, updates: Partial<TimelineElement>): void {
    const index = this.track.elements.findIndex(e => e.id === elementId);
    if (index !== -1) {
      this.track.elements[index] = { ...this.track.elements[index], ...updates };
      this.rebuildIndex(); // Rebuild if timing changed
    }
  }
}

/**
 * Timeline Manager with optimized tracks
 */
export class TimelineManager {
  timeline: Timeline;
  optimizedTracks: Map<string, OptimizedTrack>;
  
  constructor(timeline: Timeline) {
    this.timeline = timeline;
    this.optimizedTracks = new Map();
    this.rebuildIndexes();
  }
  
  rebuildIndexes(): void {
    this.optimizedTracks.clear();
    this.timeline.tracks.forEach(track => {
      this.optimizedTracks.set(track.id, new OptimizedTrack(track));
    });
  }
  
  getActiveElementsAt(time: number): { visual: TimelineElement[], audio: TimelineElement[] } {
    const visual: TimelineElement[] = [];
    const audio: TimelineElement[] = [];
    
    // Sort tracks by index (bottom to top)
    const sortedTracks = [...this.timeline.tracks].sort((a, b) => a.index - b.index);
    
    sortedTracks.forEach(track => {
      if (track.hidden) return;
      
      const optimizedTrack = this.optimizedTracks.get(track.id);
      if (!optimizedTrack) return;
      
      const elements = optimizedTrack.getElementsAt(time);
      
      elements.forEach(element => {
        if (element.hidden) return;
        
        if (track.kind === 'audio') {
          if (!track.muted && !element.volume || element.volume > 0) {
            audio.push(element);
          }
        } else if (track.kind === 'video' || track.kind === 'title' || track.kind === 'overlay') {
          if (!track.muted) {
            visual.push(element);
          }
        }
      });
    });
    
    return { visual, audio };
  }
  
  addTrack(kind: TrackKind, name?: string): Track {
    const maxIndex = Math.max(-1, ...this.timeline.tracks.map(t => t.index));
    
    const track: Track = {
      id: generateUUID(),
      kind,
      index: maxIndex + 1,
      name: name || `${kind} Track ${maxIndex + 2}`,
      elements: [],
    };
    
    this.timeline.tracks.push(track);
    this.optimizedTracks.set(track.id, new OptimizedTrack(track));
    
    return track;
  }
  
  removeTrack(trackId: string): void {
    this.timeline.tracks = this.timeline.tracks.filter(t => t.id !== trackId);
    this.optimizedTracks.delete(trackId);
  }
  
  addElementToTrack(trackId: string, element: TimelineElement): void {
    const optimizedTrack = this.optimizedTracks.get(trackId);
    if (optimizedTrack) {
      optimizedTrack.addElement(element);
    }
  }
  
  removeElementFromTrack(trackId: string, elementId: string): void {
    const optimizedTrack = this.optimizedTracks.get(trackId);
    if (optimizedTrack) {
      optimizedTrack.removeElement(elementId);
    }
  }
  
  updateElement(trackId: string, elementId: string, updates: Partial<TimelineElement>): void {
    const optimizedTrack = this.optimizedTracks.get(trackId);
    if (optimizedTrack) {
      optimizedTrack.updateElement(elementId, updates);
    }
  }
  
  getTotalDuration(): number {
    let maxDuration = 0;
    
    this.timeline.tracks.forEach(track => {
      track.elements.forEach(element => {
        const endTime = element.start + element.duration;
        maxDuration = Math.max(maxDuration, endTime);
      });
    });
    
    return maxDuration;
  }
}

/**
 * Create a default track for a given kind
 */
export function createDefaultTrack(kind: TrackKind, index: number): Track {
  return {
    id: generateUUID(),
    kind,
    index,
    name: `${kind.charAt(0).toUpperCase() + kind.slice(1)} Track ${index + 1}`,
    elements: [],
  };
}

/**
 * Create a default timeline with optional initial tracks
 */
export function createDefaultTimeline(projectId: string, trackKinds: TrackKind[] = ['video']): Timeline {
  const tracks = trackKinds.map((kind, index) => createDefaultTrack(kind, index));
  
  return {
    id: generateUUID(),
    zoom: 1.0,
    scrollX: 0,
    markers: [],
    tracks,
    playhead: 0,
    snapEpsilon: 0.1,
  };
}

/**
 * Migrate legacy single-track data to multi-track format
 */
export function migrateLegacyTimeline(legacyClips: any[]): Timeline {
  const videoTrack = createDefaultTrack('video', 0);
  
  // Convert legacy clips to timeline elements
  videoTrack.elements = legacyClips.map(clip => ({
    id: generateUUID(),
    mediaId: clip.id || clip.mediaId,
    start: clip.startTime || clip.start || 0,
    duration: clip.duration || 5,
    trimStart: clip.trimStart || 0,
    trimEnd: clip.trimEnd || 0,
    speed: clip.speed || 1.0,
    volume: clip.volume || 1.0,
    opacity: clip.opacity || 1.0,
    name: clip.name || 'Untitled',
  }));
  
  return {
    id: generateUUID(),
    zoom: 1.0,
    scrollX: 0,
    markers: [],
    tracks: [videoTrack],
    playhead: 0,
    snapEpsilon: 0.1,
  };
}