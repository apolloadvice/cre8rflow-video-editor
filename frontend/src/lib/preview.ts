/**
 * Multi-Track Preview Composition
 * 
 * Handles compositing multiple timeline tracks for preview playback:
 * - Layer-based visual composition (top-down z-order)
 * - Audio mixing from multiple tracks
 * - Time mapping between timeline and source media
 * - Track muting/hiding/effects processing
 */

import { Timeline, Track, TimelineElement, TrackKind } from '@/types/timeline';
import { getElementRenderTime } from '@/types/timeline';

export interface ActiveElements {
  visual: CompositeElement[];
  audio: CompositeElement[];
}

export interface CompositeElement {
  element: TimelineElement;
  track: Track;
  renderTime: number; // Time within the source media
  zIndex: number; // Visual stacking order (higher = on top)
  opacity: number; // Final opacity after track/element settings
  volume: number; // Final volume after track/element settings
  transforms: {
    x: number;
    y: number;
    scale: number;
    rotate: number;
  };
}

export interface PreviewFrame {
  time: number; // Timeline time
  visual: CompositeElement[];
  audio: CompositeElement[];
  resolution: { width: number; height: number };
  fps: number;
  sampleRate: number;
}

/**
 * Get all active elements at a specific timeline time
 */
export function getActiveElements(timeline: Timeline, currentTime: number): ActiveElements {
  const visual: CompositeElement[] = [];
  const audio: CompositeElement[] = [];
  
  // Sort tracks by index (bottom to top for visual stacking)
  const sortedTracks = [...timeline.tracks].sort((a, b) => a.index - b.index);
  
  sortedTracks.forEach((track) => {
    // Skip hidden tracks
    if (track.hidden) return;
    
    track.elements.forEach((element) => {
      // Skip hidden elements
      if (element.hidden) return;
      
      // Check if element is active at current time
      const renderTime = getElementRenderTime(element, currentTime);
      if (renderTime === null) return; // Element not active
      
      // Calculate final opacity and volume
      const elementOpacity = element.opacity ?? 1.0;
      const elementVolume = element.volume ?? 1.0;
      const trackMuted = track.muted ?? false;
      
      const finalOpacity = trackMuted ? 0 : elementOpacity;
      const finalVolume = trackMuted ? 0 : elementVolume;
      
      // Create composite element
      const compositeElement: CompositeElement = {
        element,
        track,
        renderTime,
        zIndex: track.index,
        opacity: finalOpacity,
        volume: finalVolume,
        transforms: {
          x: element.transforms?.x ?? 0,
          y: element.transforms?.y ?? 0,
          scale: element.transforms?.scale ?? 1,
          rotate: element.transforms?.rotate ?? 0,
        },
      };
      
      // Categorize by track type
      if (track.kind === 'audio') {
        if (finalVolume > 0) {
          audio.push(compositeElement);
        }
      } else if (track.kind === 'video' || track.kind === 'title' || track.kind === 'overlay') {
        if (finalOpacity > 0) {
          visual.push(compositeElement);
        }
      }
    });
  });
  
  // Sort visual elements by z-index (lower index = background, higher = foreground)
  visual.sort((a, b) => a.zIndex - b.zIndex);
  
  return { visual, audio };
}

/**
 * Convert timeline time to source media time for an element
 */
export function timelineToSourceTime(element: TimelineElement, timelineTime: number): number {
  const speed = element.speed ?? 1.0;
  const trimStart = element.trimStart ?? 0;
  const relativeTime = timelineTime - element.start;
  return trimStart + (relativeTime * speed);
}

/**
 * Convert source media time to timeline time for an element
 */
export function sourceToTimelineTime(element: TimelineElement, sourceTime: number): number {
  const speed = element.speed ?? 1.0;
  const trimStart = element.trimStart ?? 0;
  return element.start + (sourceTime - trimStart) / speed;
}

/**
 * Calculate the effective duration of an element on the timeline
 */
export function getEffectiveElementDuration(element: TimelineElement): number {
  const speed = element.speed ?? 1.0;
  const trimStart = element.trimStart ?? 0;
  const trimEnd = element.trimEnd ?? 0;
  const effectiveDuration = element.duration - trimStart - trimEnd;
  return effectiveDuration / speed;
}

/**
 * Generate a complete preview frame for rendering
 */
export function generatePreviewFrame(
  timeline: Timeline,
  currentTime: number,
  resolution: { width: number; height: number } = { width: 1920, height: 1080 },
  fps: number = 30,
  sampleRate: number = 48000
): PreviewFrame {
  const activeElements = getActiveElements(timeline, currentTime);
  
  return {
    time: currentTime,
    visual: activeElements.visual,
    audio: activeElements.audio,
    resolution,
    fps,
    sampleRate,
  };
}

/**
 * Calculate audio mix levels for multiple audio elements
 */
export function calculateAudioMix(audioElements: CompositeElement[]): { [elementId: string]: number } {
  const mix: { [elementId: string]: number } = {};
  
  if (audioElements.length === 0) return mix;
  
  // Simple mixing: normalize volumes so they don't exceed 1.0 total
  const totalVolume = audioElements.reduce((sum, elem) => sum + elem.volume, 0);
  const normalizationFactor = totalVolume > 1.0 ? 1.0 / totalVolume : 1.0;
  
  audioElements.forEach(elem => {
    mix[elem.element.id] = elem.volume * normalizationFactor;
  });
  
  return mix;
}

/**
 * Get preload candidates - elements that will be active soon
 */
export function getPreloadCandidates(
  timeline: Timeline,
  currentTime: number,
  lookaheadTime: number = 5.0 // Preload elements starting within 5 seconds
): TimelineElement[] {
  const candidates: TimelineElement[] = [];
  const endTime = currentTime + lookaheadTime;
  
  timeline.tracks.forEach(track => {
    if (track.hidden) return;
    
    track.elements.forEach(element => {
      if (element.hidden) return;
      
      // Check if element will start within the lookahead window
      if (element.start > currentTime && element.start <= endTime) {
        candidates.push(element);
      }
    });
  });
  
  // Sort by start time (earliest first)
  return candidates.sort((a, b) => a.start - b.start);
}

/**
 * Media pool management for efficient loading
 */
export class MediaPool {
  private loadedMedia: Map<string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement> = new Map();
  private loadingPromises: Map<string, Promise<HTMLVideoElement | HTMLAudioElement | HTMLImageElement>> = new Map();
  private maxPoolSize: number = 20;
  
  constructor(maxPoolSize: number = 20) {
    this.maxPoolSize = maxPoolSize;
  }
  
  async loadMedia(mediaId: string, mediaUrl: string, mediaType: 'video' | 'audio' | 'image'): Promise<HTMLVideoElement | HTMLAudioElement | HTMLImageElement> {
    // Return cached media if available
    const cached = this.loadedMedia.get(mediaId);
    if (cached) return cached;
    
    // Return existing loading promise if in progress
    const loadingPromise = this.loadingPromises.get(mediaId);
    if (loadingPromise) return loadingPromise;
    
    // Start loading new media
    const promise = this.createMediaElement(mediaUrl, mediaType);
    this.loadingPromises.set(mediaId, promise);
    
    try {
      const element = await promise;
      this.loadedMedia.set(mediaId, element);
      this.loadingPromises.delete(mediaId);
      
      // Clean up old media if pool is full
      this.cleanupPool();
      
      return element;
    } catch (error) {
      this.loadingPromises.delete(mediaId);
      throw error;
    }
  }
  
  private async createMediaElement(url: string, type: 'video' | 'audio' | 'image'): Promise<HTMLVideoElement | HTMLAudioElement | HTMLImageElement> {
    return new Promise((resolve, reject) => {
      let element: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
      
      switch (type) {
        case 'video':
          element = document.createElement('video');
          (element as HTMLVideoElement).preload = 'metadata';
          (element as HTMLVideoElement).muted = true; // For autoplay policies
          break;
        
        case 'audio':
          element = document.createElement('audio');
          (element as HTMLAudioElement).preload = 'metadata';
          break;
        
        case 'image':
          element = document.createElement('img');
          break;
        
        default:
          reject(new Error(`Unsupported media type: ${type}`));
          return;
      }
      
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Failed to load ${type}: ${url}`));
      
      if (type === 'video' || type === 'audio') {
        (element as HTMLVideoElement | HTMLAudioElement).onloadedmetadata = () => resolve(element);
      }
      
      element.src = url;
    });
  }
  
  private cleanupPool(): void {
    if (this.loadedMedia.size <= this.maxPoolSize) return;
    
    // Remove oldest entries (simple FIFO cleanup)
    const entries = Array.from(this.loadedMedia.entries());
    const toRemove = entries.slice(0, entries.length - this.maxPoolSize);
    
    toRemove.forEach(([mediaId, element]) => {
      this.loadedMedia.delete(mediaId);
      
      // Clean up media element
      if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
    });
  }
  
  getMedia(mediaId: string): HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null {
    return this.loadedMedia.get(mediaId) || null;
  }
  
  preloadMediaList(mediaList: Array<{ id: string; url: string; type: 'video' | 'audio' | 'image' }>): Promise<void[]> {
    const promises = mediaList.map(({ id, url, type }) => 
      this.loadMedia(id, url, type).catch(error => {
        console.warn(`Failed to preload media ${id}:`, error);
      })
    );
    
    return Promise.allSettled(promises) as Promise<void[]>;
  }
  
  clear(): void {
    this.loadedMedia.forEach(element => {
      if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
    });
    
    this.loadedMedia.clear();
    this.loadingPromises.clear();
  }
}

/**
 * Track-specific media pools for better organization
 */
export class TrackMediaPool {
  private pools: Map<TrackKind, MediaPool> = new Map();
  
  constructor() {
    // Initialize pools for each track type
    this.pools.set('video', new MediaPool(10));
    this.pools.set('audio', new MediaPool(15));
    this.pools.set('title', new MediaPool(5));
    this.pools.set('overlay', new MediaPool(5));
    this.pools.set('effect', new MediaPool(5));
  }
  
  getPool(trackKind: TrackKind): MediaPool {
    const pool = this.pools.get(trackKind);
    if (!pool) {
      throw new Error(`No media pool available for track kind: ${trackKind}`);
    }
    return pool;
  }
  
  async loadMedia(trackKind: TrackKind, mediaId: string, mediaUrl: string, mediaType: 'video' | 'audio' | 'image'): Promise<HTMLVideoElement | HTMLAudioElement | HTMLImageElement> {
    const pool = this.getPool(trackKind);
    return pool.loadMedia(mediaId, mediaUrl, mediaType);
  }
  
  getMedia(trackKind: TrackKind, mediaId: string): HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null {
    const pool = this.pools.get(trackKind);
    return pool?.getMedia(mediaId) || null;
  }
  
  preloadForTimeline(timeline: Timeline, currentTime: number, lookaheadTime: number = 5.0): Promise<void[]> {
    const candidates = getPreloadCandidates(timeline, currentTime, lookaheadTime);
    const promises: Promise<void>[] = [];
    
    candidates.forEach(element => {
      if (!element.mediaId) return;
      
      const track = timeline.tracks.find(t => t.elements.some(e => e.id === element.id));
      if (!track) return;
      
      // Determine media type based on track kind
      let mediaType: 'video' | 'audio' | 'image';
      switch (track.kind) {
        case 'video':
        case 'overlay':
          mediaType = 'video'; // Could be video or image, but default to video
          break;
        case 'audio':
          mediaType = 'audio';
          break;
        case 'title':
          mediaType = 'image'; // Text rendered as images/canvas
          break;
        default:
          return;
      }
      
      // Note: In a real implementation, you'd get the URL from a media store
      const mediaUrl = `media/${element.mediaId}`; // Placeholder
      
      const promise = this.loadMedia(track.kind, element.mediaId, mediaUrl, mediaType)
        .catch(error => {
          console.warn(`Failed to preload media for element ${element.id}:`, error);
        });
      
      promises.push(promise);
    });
    
    return Promise.allSettled(promises) as Promise<void[]>;
  }
  
  clearAll(): void {
    this.pools.forEach(pool => pool.clear());
  }
}