import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';

interface GESClip {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  file_path: string;
  type: string;
  in_point?: number;
}

interface GESTimelineConfig {
  frame_rate: number;
  width: number;
  height: number;
  sample_rate: number;
  channels: number;
}

interface GESResponse {
  success: boolean;
  message: string;
  data?: any;
}

interface GESPlayerState {
  isReady: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  hasTimeline: boolean;
  currentPosition: number;
  duration: number;
  error: string | null;
}

const DEFAULT_CONFIG: GESTimelineConfig = {
  frame_rate: 30.0,
  width: 1920,
  height: 1080,
  sample_rate: 48000,
  channels: 2
};

export const useGESPlayer = () => {
  const { clips, currentTime, setCurrentTime, duration, setDuration } = useEditorStore();
  
  const [playerState, setPlayerState] = useState<GESPlayerState>({
    isReady: false,
    isPlaying: false,
    isLoading: false,
    hasTimeline: false,
    currentPosition: 0,
    duration: 0,
    error: null
  });

  const apiBaseUrl = 'http://localhost:8000/api';
  const pollIntervalRef = useRef<number>();
  const isInitialized = useRef(false);

  // Convert editor clips to GES format with validation and signed URLs
  const convertClipsToGES = useCallback(async (clips: any[]): Promise<GESClip[]> => {
    console.log(`🎬 [GES] Converting ${clips.length} clips to GES format`);
    
    const validClips = clips.filter(clip => {
        // Validate clip type
        if (!['video', 'audio'].includes(clip.type)) {
          console.log(`🎬 [GES] Skipping clip ${clip.name}: unsupported type ${clip.type}`);
          return false;
        }
        
        // Validate file path
        if (!clip.file_path) {
          console.warn(`🎬 [GES] Skipping clip ${clip.name}: missing file_path`);
          return false;
        }
        
        // Validate timing
        if (clip.start < 0 || clip.end <= clip.start) {
          console.warn(`🎬 [GES] Skipping clip ${clip.name}: invalid timing (start: ${clip.start}, end: ${clip.end})`);
          return false;
        }
        
        return true;
    });

    // Create signed URLs for all valid clips
    const gesClips: GESClip[] = [];
    
    for (const clip of validClips) {
      try {
        console.log(`🎬 [GES] Creating signed URL for ${clip.name} (${clip.file_path})`);
        
        // Create signed URL from Supabase storage path
        const { data: urlData, error } = await supabase.storage
          .from('assets')
          .createSignedUrl(clip.file_path, 3600); // 1 hour expiry
        
        if (error || !urlData?.signedUrl) {
          console.error(`🎬 [GES] ❌ Failed to create signed URL for ${clip.name}:`, error);
          continue; // Skip this clip
        }

        const signedUrl = urlData.signedUrl;
        console.log(`🎬 [GES] ✅ Created signed URL for ${clip.name}: ${signedUrl.substring(0, 80)}...`);
        
        const gesClip: GESClip = {
          id: clip.id,
          name: clip.name,
          start: clip.start,
          end: clip.end,
          duration: clip.end - clip.start,
          file_path: signedUrl, // Use signed HTTPS URL instead of storage path!
          type: clip.type,
          in_point: 0.0
        };
        
        console.log(`🎬 [GES] Converted clip: ${gesClip.name} (${gesClip.start}s-${gesClip.end}s)`);
        gesClips.push(gesClip);
        
      } catch (error) {
        console.error(`🎬 [GES] ❌ Error processing clip ${clip.name}:`, error);
        continue; // Skip this clip
      }
    }
    
    const sortedClips = gesClips.sort((a, b) => a.start - b.start);
    console.log(`🎬 [GES] Successfully converted ${sortedClips.length} valid clips with signed URLs`);
    return sortedClips;
  }, []);

  // Make API request to GES backend
  const gesApiRequest = useCallback(async (endpoint: string, method: string = 'GET', data?: any): Promise<GESResponse> => {
    try {
      console.log(`🎬 [GES] API Request: ${method} ${endpoint}`, data);
      
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(`${apiBaseUrl}${endpoint}`, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: GESResponse = await response.json();
      console.log(`🎬 [GES] API Response:`, result);
      
      return result;
    } catch (error) {
      console.error(`🎬 [GES] API Error for ${endpoint}:`, error);
      throw error;
    }
  }, [apiBaseUrl]);

  // Create timeline from current clips
  const createTimeline = useCallback(async (config: Partial<GESTimelineConfig> = {}): Promise<boolean> => {
    try {
      setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
      
      console.log('🎬 [GES] Converting clips to signed URLs...');
      const gesClips = await convertClipsToGES(clips);
      
      if (gesClips.length === 0) {
        console.log('🎬 [GES] No valid clips to create timeline');
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false,
          error: 'No valid clips available for GES timeline'
        }));
        return false;
      }

      console.log(`🎬 [GES] Creating timeline with ${gesClips.length} clips`);
      
      // Log clip details for debugging
      gesClips.forEach((clip, index) => {
        console.log(`🎬 [GES] Clip ${index + 1}: ${clip.name} (${clip.type}) - ${clip.start}s to ${clip.end}s (${clip.duration}s)`);
        console.log(`🎬 [GES] Clip ${index + 1} URL: ${clip.file_path.substring(0, 80)}...`);
      });

      const timelineConfig = { ...DEFAULT_CONFIG, ...config };
      
      const response = await gesApiRequest('/ges/create-timeline', 'POST', {
        clips: gesClips,
        ...timelineConfig
      });

      if (response.success) {
        const timelineDuration = response.data?.timeline_duration || 0;
        setDuration(timelineDuration);
        
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          hasTimeline: true,
          duration: timelineDuration,
          isReady: true
        }));

        console.log(`🎬 [GES] ✅ Timeline created successfully (${timelineDuration}s)`);
        return true;
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('🎬 [GES] Failed to create timeline:', error);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create timeline'
      }));
      return false;
    }
  }, [clips, gesApiRequest, convertClipsToGES, setDuration]);

  // Start preview server
  const startPreview = useCallback(async (port: number = 8554): Promise<boolean> => {
    try {
      setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await gesApiRequest('/ges/start-preview', 'POST', { port });
      
      if (response.success) {
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          isPlaying: true
        }));
        
        console.log(`🎬 [GES] ✅ Preview started on port ${port}`);
        return true;
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('🎬 [GES] Failed to start preview:', error);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start preview'
      }));
      return false;
    }
  }, [gesApiRequest]);

  // Stop preview server
  const stopPreview = useCallback(async (): Promise<boolean> => {
    try {
      const response = await gesApiRequest('/ges/stop-preview', 'POST');
      
      if (response.success) {
        setPlayerState(prev => ({
          ...prev,
          isPlaying: false
        }));
        
        console.log('🎬 [GES] ✅ Preview stopped');
        return true;
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('🎬 [GES] Failed to stop preview:', error);
      return false;
    }
  }, [gesApiRequest]);

  // Seek to position
  const seekToPosition = useCallback(async (position: number): Promise<boolean> => {
    try {
      const response = await gesApiRequest('/ges/seek', 'POST', { position });
      
      if (response.success) {
        setPlayerState(prev => ({ ...prev, currentPosition: position }));
        setCurrentTime(position);
        console.log(`🎬 [GES] ✅ Seeked to ${position}s`);
        return true;
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('🎬 [GES] Failed to seek:', error);
      return false;
    }
  }, [gesApiRequest, setCurrentTime]);

  // Export timeline
  const exportTimeline = useCallback(async (outputPath: string, format?: string): Promise<boolean> => {
    try {
      setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const response = await gesApiRequest('/ges/export', 'POST', {
        output_path: outputPath,
        format_string: format || 'video/x-h264+audio/mpeg'
      });
      
      if (response.success) {
        setPlayerState(prev => ({ ...prev, isLoading: false }));
        console.log(`🎬 [GES] ✅ Export started: ${outputPath}`);
        return true;
      } else {
        throw new Error(response.message);
      }
    } catch (error) {
      console.error('🎬 [GES] Failed to export:', error);
      setPlayerState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to export'
      }));
      return false;
    }
  }, [gesApiRequest]);

  // Get status from GES service with enhanced monitoring
  const getStatus = useCallback(async () => {
    try {
      const response = await gesApiRequest('/ges/status');
      
      if (response.success && response.data) {
        const { has_timeline, is_running, timeline_duration, clip_count } = response.data;
        
        console.log(`🎬 [GES] Status update: timeline=${has_timeline}, playing=${is_running}, duration=${timeline_duration}s, clips=${clip_count || 0}`);
        
        setPlayerState(prev => ({
          ...prev,
          hasTimeline: has_timeline,
          isPlaying: is_running,
          duration: timeline_duration || 0,
          error: null // Clear any previous errors on successful status
        }));
        
        if (timeline_duration) {
          setDuration(timeline_duration);
        }
      }
    } catch (error) {
      console.warn('🎬 [GES] Failed to get status:', error);
      // Don't set error state for status polling failures to avoid UI flicker
      // but track connection issues
      if (error instanceof Error && error.message.includes('fetch')) {
        setPlayerState(prev => ({
          ...prev,
          error: 'Connection to GES service lost'
        }));
      }
    }
  }, [gesApiRequest, setDuration]);

  // Toggle playback
  const togglePlayback = useCallback(async (): Promise<boolean> => {
    if (playerState.isPlaying) {
      return await stopPreview();
    } else {
      // Ensure timeline exists first
      if (!playerState.hasTimeline) {
        const created = await createTimeline();
        if (!created) return false;
      }
      return await startPreview();
    }
  }, [playerState.isPlaying, playerState.hasTimeline, stopPreview, startPreview, createTimeline]);

  // Initialize GES timeline when clips change
  useEffect(() => {
    if (clips.length > 0 && !isInitialized.current) {
      console.log('🎬 [GES] Initializing timeline with clips');
      createTimeline();
      isInitialized.current = true;
    } else if (clips.length === 0 && isInitialized.current) {
      // Reset when clips are cleared
      isInitialized.current = false;
      setPlayerState(prev => ({
        ...prev,
        hasTimeline: false,
        isReady: false,
        isPlaying: false
      }));
    }
  }, [clips, createTimeline]);

  // Poll for status updates when playing
  useEffect(() => {
    if (playerState.isPlaying) {
      pollIntervalRef.current = window.setInterval(() => {
        getStatus();
      }, 1000); // Poll every second
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = undefined;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [playerState.isPlaying, getStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      
      // Cleanup GES resources
      gesApiRequest('/ges/cleanup', 'POST').catch(console.warn);
    };
  }, [gesApiRequest]);

  return {
    // State
    ...playerState,
    
    // Actions
    createTimeline,
    startPreview,
    stopPreview,
    togglePlayback,
    seekToPosition,
    exportTimeline,
    getStatus,
    
    // Helpers
    isGESAvailable: !playerState.error && playerState.isReady
  };
}; 