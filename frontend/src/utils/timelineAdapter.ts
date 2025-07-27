/**
 * Frontend Timeline Adapter - Handles both legacy and OTIO timeline formats
 * Provides unified interface for timeline operations during migration period
 */

import { Clip } from '@/store/editorStore';

// Types for OTIO timeline structure
export interface RationalTime {
  value: number;  // Frame number
  rate: number;   // Frame rate
}

export interface TimeRange {
  start_time: RationalTime;
  duration: RationalTime;
}

export interface MediaReference {
  id: string;
  url: string;
  available_range?: TimeRange;
  metadata: Record<string, any>;
}

export interface OTIOClip {
  _type: 'OTIOClip';
  id: string;
  name: string;
  media_reference: MediaReference;
  source_range?: TimeRange;
}

export interface OTIOGap {
  _type: 'OTIOGap';
  id: string;
  name: string;
  duration: RationalTime;
}

export interface OTIOTrack {
  _type: 'OTIOTrack';
  id: string;
  name: string;
  track_type: 'video' | 'audio' | 'text';
  children: (OTIOClip | OTIOGap)[];
}

export interface OTIOTimeline {
  _type: 'OTIOTimeline';
  id: string;
  name: string;
  fps: number;
  tracks: OTIOTrack[];
}

export interface LegacyTimeline {
  _type?: 'Timeline';
  frame_rate: number;
  duration: number;
  tracks: Array<{
    name: string;
    track_type: string;
    clips: Array<{
      clip_id: string;
      name: string;
      start: number;
      end: number;
      in_point?: number;
      file_path?: string;
      track_type: string;
    }>;
  }>;
}

export type TimelineData = OTIOTimeline | LegacyTimeline;

/**
 * Utility functions for RationalTime
 */
export const RationalTimeUtils = {
  toSeconds: (time: RationalTime): number => {
    return time.value / time.rate;
  },

  fromSeconds: (seconds: number, rate: number): RationalTime => {
    return {
      value: Math.round(seconds * rate),
      rate: rate
    };
  },

  add: (a: RationalTime, b: RationalTime): RationalTime => {
    if (a.rate !== b.rate) {
      throw new Error('Cannot add times with different rates');
    }
    return { value: a.value + b.value, rate: a.rate };
  },

  subtract: (a: RationalTime, b: RationalTime): RationalTime => {
    if (a.rate !== b.rate) {
      throw new Error('Cannot subtract times with different rates');
    }
    return { value: a.value - b.value, rate: a.rate };
  }
};

/**
 * Utility functions for TimeRange
 */
export const TimeRangeUtils = {
  endTime: (range: TimeRange): RationalTime => {
    return RationalTimeUtils.add(range.start_time, range.duration);
  },

  toSeconds: (range: TimeRange): { start: number; end: number; duration: number } => {
    const start = RationalTimeUtils.toSeconds(range.start_time);
    const duration = RationalTimeUtils.toSeconds(range.duration);
    return { start, end: start + duration, duration };
  }
};

/**
 * Timeline Adapter Class - Unified interface for both timeline formats
 */
export class TimelineAdapter {
  private timeline: TimelineData;
  private _isOTIO: boolean;

  constructor(timeline: TimelineData) {
    this.timeline = timeline;
    this._isOTIO = timeline._type === 'OTIOTimeline';
  }

  get isOTIO(): boolean {
    return this._isOTIO;
  }

  get fps(): number {
    if (this._isOTIO) {
      return (this.timeline as OTIOTimeline).fps;
    } else {
      return (this.timeline as LegacyTimeline).frame_rate;
    }
  }

  get durationSeconds(): number {
    if (this._isOTIO) {
      const otioTimeline = this.timeline as OTIOTimeline;
      let maxDuration = 0;
      
      for (const track of otioTimeline.tracks) {
        let trackDuration = 0;
        for (const item of track.children) {
          if (item._type === 'OTIOClip') {
            const clip = item as OTIOClip;
            const clipDuration = clip.source_range 
              ? RationalTimeUtils.toSeconds(clip.source_range.duration)
              : (clip.media_reference.available_range 
                  ? RationalTimeUtils.toSeconds(clip.media_reference.available_range.duration)
                  : 10); // Fallback duration
            trackDuration += clipDuration;
          } else if (item._type === 'OTIOGap') {
            const gap = item as OTIOGap;
            trackDuration += RationalTimeUtils.toSeconds(gap.duration);
          }
        }
        maxDuration = Math.max(maxDuration, trackDuration);
      }
      return maxDuration;
    } else {
      return (this.timeline as LegacyTimeline).duration;
    }
  }

  /**
   * Get clips in standard frontend format
   */
  getClipsForAPI(): Clip[] {
    const clips: Clip[] = [];

    if (this._isOTIO) {
      const otioTimeline = this.timeline as OTIOTimeline;
      
      otioTimeline.tracks.forEach((track, trackIndex) => {
        let timelinePosition = 0;
        
        track.children.forEach((item) => {
          if (item._type === 'OTIOClip') {
            const otioClip = item as OTIOClip;
            const clipDuration = otioClip.source_range 
              ? RationalTimeUtils.toSeconds(otioClip.source_range.duration)
              : (otioClip.media_reference.available_range 
                  ? RationalTimeUtils.toSeconds(otioClip.media_reference.available_range.duration)
                  : 10);

            // 🐛 DEBUG: Log the source range conversion
            const sourceStartSeconds = otioClip.source_range 
              ? RationalTimeUtils.toSeconds(otioClip.source_range.start_time) 
              : 0;
            console.log(`🔧 [TimelineAdapter] Converting OTIO clip: ${otioClip.name}`);
            console.log(`🔧 [TimelineAdapter] Source range:`, otioClip.source_range);
            console.log(`🔧 [TimelineAdapter] Converted in_point: ${sourceStartSeconds}s`);

            const clip: Clip = {
              id: otioClip.id,
              name: otioClip.name,
              start: timelinePosition,
              end: timelinePosition + clipDuration,
              duration: clipDuration,
              in_point: sourceStartSeconds,
              track: trackIndex,
              type: track.track_type,
              file_path: otioClip.media_reference.url,
              _type: "VideoClip",
              effects: []
            };
            
            console.log(`🔧 [TimelineAdapter] Final clip:`, {
              name: clip.name,
              start: clip.start,
              end: clip.end,
              in_point: clip.in_point
            });
            clips.push(clip);
            timelinePosition += clipDuration;
          } else if (item._type === 'OTIOGap') {
            const gap = item as OTIOGap;
            const gapDuration = RationalTimeUtils.toSeconds(gap.duration);
            timelinePosition += gapDuration;
          }
        });
      });
    } else {
      const legacyTimeline = this.timeline as LegacyTimeline;
      
      legacyTimeline.tracks.forEach((track, trackIndex) => {
        track.clips.forEach((legacyClip) => {
          const clip: Clip = {
            id: legacyClip.clip_id,
            name: legacyClip.name,
            start: legacyClip.start / this.fps,
            end: legacyClip.end / this.fps,
            duration: (legacyClip.end - legacyClip.start) / this.fps,
            in_point: (legacyClip.in_point || 0) / this.fps,
            track: trackIndex,
            type: track.track_type,
            file_path: legacyClip.file_path,
            _type: "VideoClip",
            effects: []
          };
          clips.push(clip);
        });
      });
    }

    return clips;
  }

  /**
   * Get raw timeline data
   */
  getTimelineData(): TimelineData {
    return this.timeline;
  }

  /**
   * Detect timeline format from raw data
   */
  static detectFormat(data: any): 'otio' | 'legacy' | 'unknown' {
    if (data._type === 'OTIOTimeline') {
      return 'otio';
    } else if (data.frame_rate !== undefined && data.tracks !== undefined) {
      return 'legacy';
    } else {
      return 'unknown';
    }
  }

  /**
   * Create adapter from raw timeline data
   */
  static fromData(data: any): TimelineAdapter {
    const format = TimelineAdapter.detectFormat(data);
    
    if (format === 'unknown') {
      throw new Error('Unknown timeline format');
    }
    
    return new TimelineAdapter(data as TimelineData);
  }
}

/**
 * API Client Extensions for Timeline Migration
 */
export interface CommandRequestV2 {
  command: string;
  asset_path: string;
  timeline_format?: 'auto' | 'legacy' | 'otio';
  migration_mode?: boolean;
}

export interface CommandResponseV2 {
  status: string;
  applied: boolean;
  timeline: TimelineData;
  message: string;
  logs: string[];
  timeline_format: string;
  migration_performed?: boolean;
}

/**
 * Enhanced API functions that support both timeline formats
 */
export const timelineAPI = {
  /**
   * Execute command using v2 API with migration support
   */
  async executeCommandV2(request: CommandRequestV2): Promise<CommandResponseV2> {
    const response = await fetch('/api/command/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Get timeline format information
   */
  async getTimelineFormat(assetPath: string): Promise<{
    asset_path: string;
    format: 'otio' | 'legacy';
    fps: number;
    duration_seconds: number;
    clip_count: number;
  }> {
    const response = await fetch(`/api/timeline/format/${encodeURIComponent(assetPath)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Migrate timeline to OTIO format
   */
  async migrateToOTIO(assetPath: string): Promise<{
    message: string;
    migration_performed: boolean;
    timeline?: TimelineData;
  }> {
    const response = await fetch(`/api/timeline/migrate/${encodeURIComponent(assetPath)}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Get clips in unified format
   */
  async getClipsV2(assetPath: string): Promise<{
    asset_path: string;
    timeline_format: 'otio' | 'legacy';
    clips: Clip[];
    total_clips: number;
    duration_seconds: number;
  }> {
    const response = await fetch(`/api/timeline/clips/${encodeURIComponent(assetPath)}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }
};

/**
 * Migration Utilities
 */
export const migrationUtils = {
  /**
   * Check if user should be prompted to migrate
   */
  shouldPromptMigration(timelineData: TimelineData): boolean {
    const adapter = new TimelineAdapter(timelineData);
    return !adapter.isOTIO; // Prompt if still using legacy format
  },

  /**
   * Get migration benefits message for UI
   */
  getMigrationMessage(): string {
    return `
      Upgrade to Enhanced Timeline Format:
      • Non-destructive editing - never lose original media
      • Frame-accurate operations
      • Better performance with large projects  
      • Professional industry standard (OpenTimelineIO)
      • Future-proof for advanced features
    `.trim();
  },

  /**
   * Prepare migration analytics data
   */
  getMigrationAnalytics(timelineData: TimelineData): {
    format: 'otio' | 'legacy';
    clip_count: number;
    track_count: number;
    duration_seconds: number;
  } {
    const adapter = new TimelineAdapter(timelineData);
    const clips = adapter.getClipsForAPI();
    
    return {
      format: adapter.isOTIO ? 'otio' : 'legacy',
      clip_count: clips.length,
      track_count: adapter.isOTIO 
        ? (timelineData as OTIOTimeline).tracks.length
        : (timelineData as LegacyTimeline).tracks.length,
      duration_seconds: adapter.durationSeconds
    };
  }
};

/**
 * React Hook for Timeline Migration
 */
export const useTimelineMigration = () => {
  return {
    TimelineAdapter,
    timelineAPI,
    migrationUtils,
    RationalTimeUtils,
    TimeRangeUtils
  };
}; 