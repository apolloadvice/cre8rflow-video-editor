import { useCallback, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { Clip } from '../store/editorStore';
import axios from 'axios';

// Base URL for the backend API
const API_BASE_URL = 'http://localhost:8000/api';

// Timeline schema version for GES compatibility
const TIMELINE_SCHEMA_VERSION = "2.0";

// Type definitions for timeline sync
export interface TimelineData {
  version: string;
  timeline: {
    frame_rate: number;
    width: number;
    height: number;
    sample_rate: number;
    channels: number;
    duration: number;
  };
  clips: TimelineClip[];
  transitions: any[];
  metadata: {
    created_at: string;
    updated_at: string;
    schema_version: string;
  };
}

export interface TimelineClip {
  id: string;
  name: string;
  file_path?: string;
  timeline_start: number;
  timeline_end: number;
  duration: number;
  in_point: number;
  track: number;
  type: string;
  effects: any[];
}

export interface TimelineSaveRequest {
  asset_path: string;
  timeline_json: TimelineData;
}

export interface TimelineLoadRequest {
  asset_path: string;
}

export interface TimelineLoadResponse {
  status: string;
  timeline_json?: TimelineData;
  message: string;
  schema_version: string;
}

export interface TimelineSyncOptions {
  validateAssets?: boolean;
  allowPartialLoad?: boolean;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

/**
 * Timeline synchronization hook for seamless frontend-backend data flow.
 * Handles saving and loading timeline data using the GES-compatible v2.0 schema.
 */
export const useTimelineSync = (options: TimelineSyncOptions = {}) => {
  const {
    clips,
    setClips,
    activeVideoAsset,
    setDuration,
    pushToHistory
  } = useEditorStore();
  
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const {
    validateAssets = true,
    allowPartialLoad = true,
    autoSave = false,
    autoSaveInterval = 30000 // 30 seconds
  } = options;

  /**
   * Convert frontend clips to GES-compatible timeline data
   */
  const createTimelineData = useCallback((clips: Clip[], asset_path?: string): TimelineData => {
    const now = new Date().toISOString();
    
    // Calculate timeline duration
    const duration = clips.length > 0 
      ? Math.max(...clips.map(c => c.end), 0)
      : 0;
    
    // Convert clips to timeline format
    const timelineClips: TimelineClip[] = clips.map(clip => ({
      id: clip.id,
      name: clip.name,
      file_path: clip.file_path || asset_path,
      timeline_start: clip.start,
      timeline_end: clip.end,
      duration: clip.duration,
      in_point: clip.in_point || 0,
      track: clip.track,
      type: clip.type,
      effects: clip.effects || []
    }));

    return {
      version: TIMELINE_SCHEMA_VERSION,
      timeline: {
        frame_rate: 30.0,
        width: 1920,
        height: 1080,
        sample_rate: 48000,
        channels: 2,
        duration
      },
      clips: timelineClips,
      transitions: [],
      metadata: {
        created_at: now,
        updated_at: now,
        schema_version: TIMELINE_SCHEMA_VERSION
      }
    };
  }, []);

  /**
   * Convert timeline data back to frontend clips
   */
  const parseTimelineData = useCallback((timelineData: TimelineData): Clip[] => {
    if (!timelineData.clips) {
      console.warn('🔄 [TimelineSync] No clips found in timeline data');
      return [];
    }

    return timelineData.clips.map(timelineClip => ({
      id: timelineClip.id,
      name: timelineClip.name,
      start: timelineClip.timeline_start,
      end: timelineClip.timeline_end,
      duration: timelineClip.duration,
      in_point: timelineClip.in_point || 0,
      track: timelineClip.track,
      type: timelineClip.type,
      file_path: timelineClip.file_path,
      _type: "VideoClip",
      effects: timelineClip.effects || []
    }));
  }, []);

  /**
   * Save timeline to backend using enhanced schema
   */
  const saveTimeline = useCallback(async (assetPath?: string): Promise<{ success: boolean; message: string }> => {
    try {
      const targetAssetPath = assetPath || activeVideoAsset?.file_path;
      
      if (!targetAssetPath) {
        throw new Error('No asset path specified for timeline save');
      }

      console.log('🔄 [TimelineSync] Saving timeline for asset:', targetAssetPath);
      console.log('🔄 [TimelineSync] Clips to save:', clips.length);

      const timelineData = createTimelineData(clips, targetAssetPath);
      
      const payload: TimelineSaveRequest = {
        asset_path: targetAssetPath,
        timeline_json: timelineData
      };

      const response = await axios.post(`${API_BASE_URL}/timeline/save`, payload);
      
      console.log('✅ [TimelineSync] Timeline saved successfully');
      
      return {
        success: true,
        message: response.data.message || 'Timeline saved successfully'
      };
      
    } catch (error: any) {
      console.error('❌ [TimelineSync] Save failed:', error);
      
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to save timeline';
      
      return {
        success: false,
        message: errorMessage
      };
    }
  }, [clips, activeVideoAsset, createTimelineData]);

  /**
   * Load timeline from backend using enhanced schema
   */
  const loadTimeline = useCallback(async (assetPath: string): Promise<{ success: boolean; message: string; clips?: Clip[] }> => {
    try {
      console.log('🔄 [TimelineSync] Loading timeline for asset:', assetPath);

      const payload: TimelineLoadRequest = {
        asset_path: assetPath
      };

      const response = await axios.post<TimelineLoadResponse>(`${API_BASE_URL}/timeline/load`, payload);
      
      if (response.data.status !== 'ok' || !response.data.timeline_json) {
        throw new Error(response.data.message || 'Failed to load timeline');
      }

      const loadedClips = parseTimelineData(response.data.timeline_json);
      
      console.log('✅ [TimelineSync] Timeline loaded successfully');
      console.log('🔄 [TimelineSync] Loaded clips:', loadedClips.length);
      
      // Update store state
      pushToHistory(); // Save current state to history before loading
      setClips(loadedClips);
      
      // Update timeline duration
      if (response.data.timeline_json.timeline.duration) {
        setDuration(response.data.timeline_json.timeline.duration);
      }

      return {
        success: true,
        message: response.data.message || 'Timeline loaded successfully',
        clips: loadedClips
      };
      
    } catch (error: any) {
      console.error('❌ [TimelineSync] Load failed:', error);
      
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to load timeline';
      
      return {
        success: false,
        message: errorMessage
      };
    }
  }, [setClips, setDuration, pushToHistory, parseTimelineData]);

  /**
   * Load timeline using robust loader with detailed error handling
   */
  const loadTimelineRobust = useCallback(async (assetPath: string): Promise<{ success: boolean; message: string; clips?: Clip[]; stats?: any }> => {
    try {
      console.log('🔄 [TimelineSync] Loading timeline (robust) for asset:', assetPath);

      const payload = {
        asset_path: assetPath,
        validate_assets: validateAssets,
        allow_partial_load: allowPartialLoad
      };

      const response = await axios.post(`${API_BASE_URL}/timeline/load-robust`, payload);
      
      if (response.data.status !== 'ok' || !response.data.timeline_json) {
        throw new Error(response.data.message || 'Failed to load timeline');
      }

      const loadedClips = parseTimelineData(response.data.timeline_json);
      
      console.log('✅ [TimelineSync] Timeline loaded (robust) successfully');
      console.log('🔄 [TimelineSync] Loaded clips:', loadedClips.length);
      
      if (response.data.loading_stats) {
        console.log('📊 [TimelineSync] Loading stats:', response.data.loading_stats);
      }
      
      // Update store state
      pushToHistory(); // Save current state to history before loading
      setClips(loadedClips);
      
      // Update timeline duration
      if (response.data.timeline_json.timeline.duration) {
        setDuration(response.data.timeline_json.timeline.duration);
      }

      return {
        success: true,
        message: response.data.message || 'Timeline loaded successfully',
        clips: loadedClips,
        stats: response.data.loading_stats
      };
      
    } catch (error: any) {
      console.error('❌ [TimelineSync] Robust load failed:', error);
      
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to load timeline';
      
      return {
        success: false,
        message: errorMessage
      };
    }
  }, [validateAssets, allowPartialLoad, setClips, setDuration, pushToHistory, parseTimelineData]);

  /**
   * Auto-save functionality
   */
  const scheduleAutoSave = useCallback(() => {
    if (!autoSave || !activeVideoAsset?.file_path) return;
    
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Schedule new save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      console.log('🔄 [TimelineSync] Auto-saving timeline...');
      const result = await saveTimeline();
      if (result.success) {
        console.log('✅ [TimelineSync] Auto-save completed');
      } else {
        console.error('❌ [TimelineSync] Auto-save failed:', result.message);
      }
    }, autoSaveInterval);
  }, [autoSave, activeVideoAsset, autoSaveInterval, saveTimeline]);

  /**
   * Sync current timeline state with backend
   */
  const syncTimeline = useCallback(async (assetPath?: string): Promise<{ success: boolean; message: string }> => {
    const targetAssetPath = assetPath || activeVideoAsset?.file_path;
    
    if (!targetAssetPath) {
      return {
        success: false,
        message: 'No asset path available for sync'
      };
    }

    // Save current state first
    const saveResult = await saveTimeline(targetAssetPath);
    
    if (!saveResult.success) {
      return saveResult;
    }

    // Then reload to ensure consistency
    const loadResult = await loadTimeline(targetAssetPath);
    
    return {
      success: loadResult.success,
      message: loadResult.success 
        ? 'Timeline synchronized successfully' 
        : loadResult.message
    };
  }, [activeVideoAsset, saveTimeline, loadTimeline]);

  /**
   * Clear auto-save timeout on unmount
   */
  const cleanup = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  }, []);

  // Schedule auto-save when clips change
  if (autoSave && clips.length > 0) {
    scheduleAutoSave();
  }

  return {
    // Core sync functions
    saveTimeline,
    loadTimeline,
    loadTimelineRobust,
    syncTimeline,
    
    // Utility functions
    createTimelineData,
    parseTimelineData,
    
    // Auto-save controls
    scheduleAutoSave,
    cleanup,
    
    // Status
    isAutoSaveEnabled: autoSave,
    currentClipsCount: clips.length,
    hasActiveAsset: Boolean(activeVideoAsset?.file_path)
  };
}; 