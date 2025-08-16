/**
 * Multi-Track Export Adapter
 * 
 * Converts multi-track Timeline to FFmpeg-compatible intervals for professional video export.
 * Extends the existing export interval system with multi-track support for:
 * - Track layering and composition
 * - Audio mixing and volume control
 * - Text overlays and positioning
 * - Effect application and transforms
 * - Frame-accurate multi-track rendering
 */

import { Timeline, Track, TimelineElement, TrackKind, Transform, Effect } from '@/types/timeline';
import { useMediaStore } from '@/store/mediaStore';

// Extended export interval interface for multi-track support
export interface MultiTrackExportInterval {
  // Standard interval data (existing format)
  sourceFile: string;           // Source file path or Supabase URL
  sourceStart: number;          // Seek position in source file (seconds)
  sourceDuration: number;       // Duration to extract from source (seconds)
  timelineStart: number;        // Position in final export timeline (seconds)
  timelineEnd: number;          // End position in final export timeline (seconds)
  clipId: string;              // Reference to timeline element
  clipName: string;            // Display name for debugging
  
  // Multi-track specific fields
  trackKind: TrackKind;        // video, audio, title, overlay, effect
  trackIndex: number;          // Track layering order (higher = on top)
  volume?: number;             // Audio volume multiplier (0.0-2.0)
  opacity?: number;            // Video opacity (0.0-1.0)
  effects?: Effect[];          // Element-level effects
  transforms?: Transform;      // Position, scale, rotation for video/overlay
  
  // Advanced properties
  mixMode?: string;            // Audio mix mode: 'normal', 'ducking', 'overlay'
  blendMode?: string;          // Video blend mode: 'normal', 'multiply', 'screen'
  zIndex?: number;             // Explicit Z-order for complex compositions
}

// Multi-track export configuration
export interface MultiTrackExportConfig {
  composition: {
    width: number;
    height: number;
    fps: number;
    sampleRate: number;
  };
  tracks: {
    videoTracks: number;
    audioTracks: number;
    titleTracks: number;
    overlayTracks: number;
    effectTracks: number;
  };
  options: {
    enableAudioDucking: boolean;
    enableVideoComposition: boolean;
    preserveAspectRatio: boolean;
    enableEffectProcessing: boolean;
  };
}

/**
 * Get the source file path for a timeline element
 */
function getElementSourceFile(element: TimelineElement): string {
  if (!element.mediaId) {
    throw new Error(`Element ${element.id} has no media reference`);
  }
  
  // Get media item from store
  const mediaItems = useMediaStore.getState().mediaItems;
  const mediaItem = mediaItems.find(item => item.id === element.mediaId);
  
  if (!mediaItem) {
    throw new Error(`Media item not found for element ${element.id}`);
  }
  
  return mediaItem.url || mediaItem.file_path || '';
}

/**
 * Convert multi-track Timeline to enhanced export intervals
 */
export function convertTimelineToMultiTrackIntervals(timeline: Timeline): MultiTrackExportInterval[] {
  const intervals: MultiTrackExportInterval[] = [];
  
  // Sort tracks by index to maintain proper layering
  const sortedTracks = [...timeline.tracks].sort((a, b) => a.index - b.index);
  
  sortedTracks.forEach((track) => {
    if (track.hidden || track.elements.length === 0) {
      return; // Skip hidden or empty tracks
    }
    
    track.elements.forEach(element => {
      if (element.hidden) {
        return; // Skip hidden elements
      }
      
      try {
        const sourceFile = getElementSourceFile(element);
        const elementStart = element.start;
        const elementDuration = element.duration;
        const trimStart = element.trimStart || 0;
        const trimEnd = element.trimEnd || 0;
        const effectiveDuration = elementDuration - trimStart - trimEnd;
        
        // Create multi-track interval
        const interval: MultiTrackExportInterval = {
          // Standard interval data
          sourceFile,
          sourceStart: trimStart,
          sourceDuration: effectiveDuration,
          timelineStart: elementStart,
          timelineEnd: elementStart + effectiveDuration,
          clipId: element.id,
          clipName: element.name || `${track.kind}_${track.index}_${element.id.slice(0, 8)}`,
          
          // Multi-track specific
          trackKind: track.kind,
          trackIndex: track.index,
          volume: element.volume || 1.0,
          opacity: element.opacity || 1.0,
          effects: element.effects || [],
          transforms: element.transforms,
          
          // Advanced properties
          mixMode: determineMixMode(track, element),
          blendMode: determineBlendMode(track, element),
          zIndex: calculateZIndex(track, element),
        };
        
        intervals.push(interval);
        
      } catch (error) {
        console.warn(`Failed to process element ${element.id} on track ${track.id}:`, error);
        // Continue processing other elements
      }
    });
  });
  
  // Sort by timeline start time for sequential processing
  return intervals.sort((a, b) => a.timelineStart - b.timelineStart);
}

/**
 * Generate export configuration from timeline
 */
export function generateMultiTrackExportConfig(timeline: Timeline): MultiTrackExportConfig {
  const trackCounts = {
    videoTracks: 0,
    audioTracks: 0,
    titleTracks: 0,
    overlayTracks: 0,
    effectTracks: 0,
  };
  
  timeline.tracks.forEach(track => {
    if (!track.hidden && track.elements.length > 0) {
      switch (track.kind) {
        case 'video':
          trackCounts.videoTracks++;
          break;
        case 'audio':
          trackCounts.audioTracks++;
          break;
        case 'title':
          trackCounts.titleTracks++;
          break;
        case 'overlay':
          trackCounts.overlayTracks++;
          break;
        case 'effect':
          trackCounts.effectTracks++;
          break;
      }
    }
  });
  
  return {
    composition: {
      width: 1920,  // Default HD resolution
      height: 1080,
      fps: 30,
      sampleRate: 48000,
    },
    tracks: trackCounts,
    options: {
      enableAudioDucking: trackCounts.audioTracks > 1,
      enableVideoComposition: trackCounts.videoTracks > 1 || trackCounts.overlayTracks > 0,
      preserveAspectRatio: true,
      enableEffectProcessing: trackCounts.effectTracks > 0,
    },
  };
}

/**
 * Group intervals by track kind for processing
 */
export function groupIntervalsByTrackKind(intervals: MultiTrackExportInterval[]): {
  video: MultiTrackExportInterval[];
  audio: MultiTrackExportInterval[];
  title: MultiTrackExportInterval[];
  overlay: MultiTrackExportInterval[];
  effect: MultiTrackExportInterval[];
} {
  return {
    video: intervals.filter(i => i.trackKind === 'video'),
    audio: intervals.filter(i => i.trackKind === 'audio'),
    title: intervals.filter(i => i.trackKind === 'title'),
    overlay: intervals.filter(i => i.trackKind === 'overlay'),
    effect: intervals.filter(i => i.trackKind === 'effect'),
  };
}

/**
 * Validate multi-track intervals for export
 */
export function validateMultiTrackIntervals(intervals: MultiTrackExportInterval[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (intervals.length === 0) {
    errors.push('No export intervals provided');
    return { isValid: false, errors, warnings };
  }
  
  // Check for missing source files
  intervals.forEach(interval => {
    if (!interval.sourceFile) {
      errors.push(`Missing source file for interval: ${interval.clipName}`);
    }
    
    if (interval.timelineStart < 0) {
      errors.push(`Invalid timeline start for interval: ${interval.clipName}`);
    }
    
    if (interval.sourceDuration <= 0) {
      errors.push(`Invalid source duration for interval: ${interval.clipName}`);
    }
    
    // Warnings for unusual values
    if (interval.volume && (interval.volume > 2.0 || interval.volume < 0)) {
      warnings.push(`Unusual volume value (${interval.volume}) for interval: ${interval.clipName}`);
    }
    
    if (interval.opacity && (interval.opacity > 1.0 || interval.opacity < 0)) {
      warnings.push(`Invalid opacity value (${interval.opacity}) for interval: ${interval.clipName}`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// Helper functions

function determineMixMode(track: Track, element: TimelineElement): string {
  // Default audio mixing strategy
  if (track.kind === 'audio') {
    // Could be enhanced based on track properties or element metadata
    return 'normal';
  }
  return 'normal';
}

function determineBlendMode(track: Track, element: TimelineElement): string {
  // Default video blending strategy
  if (track.kind === 'video' || track.kind === 'overlay') {
    // Could be enhanced based on effects or element properties
    return 'normal';
  }
  return 'normal';
}

function calculateZIndex(track: Track, element: TimelineElement): number {
  // Calculate Z-order based on track kind and index
  const kindPriorities = {
    'effect': 1000,   // Effects on top
    'title': 800,     // Titles above overlays
    'overlay': 600,   // Overlays above video
    'video': 400,     // Video in middle
    'audio': 200,     // Audio (not visible but included for consistency)
  };
  
  const basePriority = kindPriorities[track.kind] || 0;
  return basePriority + track.index;
}

/**
 * Debug utility to log export intervals
 */
export function debugMultiTrackIntervals(intervals: MultiTrackExportInterval[]): void {
  console.group('🎬 Multi-Track Export Intervals');
  
  const grouped = groupIntervalsByTrackKind(intervals);
  
  Object.entries(grouped).forEach(([trackKind, trackIntervals]) => {
    if (trackIntervals.length > 0) {
      console.group(`${trackKind.toUpperCase()} Track (${trackIntervals.length} intervals)`);
      trackIntervals.forEach((interval, index) => {
        console.log(`${index + 1}. ${interval.clipName}:`, {
          source: `${interval.sourceFile} [${interval.sourceStart}s-${interval.sourceStart + interval.sourceDuration}s]`,
          timeline: `${interval.timelineStart}s-${interval.timelineEnd}s`,
          properties: {
            volume: interval.volume,
            opacity: interval.opacity,
            zIndex: interval.zIndex,
          },
        });
      });
      console.groupEnd();
    }
  });
  
  console.groupEnd();
}