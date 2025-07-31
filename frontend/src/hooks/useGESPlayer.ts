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
  const timelineSyncRef = useRef<number>();
  const playbackStartTimeRef = useRef<number>(0);
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

  // Timeline sync functions - declared early to avoid reference errors
  const stopTimelineSync = useCallback(() => {
    if (timelineSyncRef.current) {
      clearInterval(timelineSyncRef.current);
      timelineSyncRef.current = undefined;
      console.log(`🎬 [GES] Timeline sync stopped`);
    }
  }, []);

  const startTimelineSync = useCallback(() => {
    if (timelineSyncRef.current) {
      clearInterval(timelineSyncRef.current);
    }
    
    playbackStartTimeRef.current = Date.now();
    const startPosition = currentTime;
    
    // 🔍 DEBUG: Track timeline sync start
    console.log(`🔍 [GES] Starting timeline sync from position ${startPosition}s`);
    console.log(`🔍 [GES] Timeline sync captured currentTime: ${currentTime}s, duration: ${playerState.duration}s`);
    
    timelineSyncRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - playbackStartTimeRef.current) / 1000;
      const newPosition = startPosition + elapsed;
      
      // Check if we've reached the end of the timeline
      if (newPosition >= playerState.duration) {
        console.log(`🎬 [GES] Reached end of timeline at ${newPosition}s`);
        setCurrentTime(playerState.duration);
        // Stop timeline sync
        if (timelineSyncRef.current) {
          clearInterval(timelineSyncRef.current);
          timelineSyncRef.current = undefined;
        }
        // Auto-stop playback when timeline ends (call async function)
        gesApiRequest('/ges/stop-preview', 'POST').then(() => {
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
        }).catch(console.warn);
      } else {
        // 🔍 DEBUG: Track every timeline sync update (only occasionally to avoid spam)
        if (Math.floor(newPosition * 10) % 10 === 0) { // Log every 100ms
          console.log(`🔍 [GES] Timeline sync update: ${newPosition.toFixed(2)}s`);
        }
        setCurrentTime(newPosition);
      }
    }, 50); // Update every 50ms for smooth cursor movement
  }, [currentTime, playerState.duration, setCurrentTime, gesApiRequest, setPlayerState]);

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
      // 🔍 DEBUG: Track pause operation sequence
      console.log(`🔍 [GES] stopPreview called - current timeline position: ${currentTime}s`);
      
      const response = await gesApiRequest('/ges/stop-preview', 'POST');
      
      if (response.success) {
        // Stop timeline sync first
        console.log(`🔍 [GES] Stopping timeline sync...`);
        stopTimelineSync();
        
        console.log(`🔍 [GES] Setting player state to not playing - timeline position should remain: ${currentTime}s`);
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
  }, [gesApiRequest, stopTimelineSync, currentTime]);

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
          // ✅ FIX: Prevent GES status from overriding correct frontend duration after cuts
          const clipCount = clips.length;
          
          // Calculate expected duration from current clips to validate GES duration
          const expectedDuration = clips.length > 0 ? Math.max(...clips.map(clip => clip.end)) : 0;
          
          const durationDifference = Math.abs(timeline_duration - expectedDuration);
          const isSignificantDifference = durationDifference > 1.0; // 1 second tolerance
          
          console.log(`🎬 [GES] Duration validation:`, {
            gesDuration: timeline_duration,
            frontendDuration: duration,
            expectedFromClips: expectedDuration,
            difference: durationDifference,
            isSignificant: isSignificantDifference,
            clipCount,
            isPlaybackActive: playerState.isPlaying
          });
          
          // Only update duration if:
          // 1. Not during active playback (to prevent reversion), OR
          // 2. GES duration matches expected frontend duration (within tolerance)
          if (!playerState.isPlaying || !isSignificantDifference) {
            setDuration(timeline_duration);
            console.log(`🎬 [GES] Updated duration to ${timeline_duration}s`);
          } else {
            console.log(`🎬 [GES] ⚠️ Skipped duration update during playback - GES (${timeline_duration}s) differs significantly from expected (${expectedDuration}s)`);
          }
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

  // Toggle playback with timeline sync
  const togglePlayback = useCallback(async (): Promise<boolean> => {
    // 🔍 DEBUG: Track toggle playback operation
    console.log(`🔍 [GES] togglePlayback called - isPlaying: ${playerState.isPlaying}, currentTime: ${currentTime}s`);
    
    if (playerState.isPlaying) {
      console.log(`🔍 [GES] Pausing playback - timeline position should preserve: ${currentTime}s`);
      const stopped = await stopPreview();
      console.log(`🔍 [GES] Pause completed - stopPreview result: ${stopped}, timeline position should still be: ${currentTime}s`);
      // ✅ FIX: Don't reset timeline position on pause - keep current position for seamless resume
      // Removed setCurrentTime(0) to prevent red cursor from snapping back to 00:00
      return stopped;
    } else {
      console.log(`🔍 [GES] Starting playback from position: ${currentTime}s`);
      // Ensure timeline exists first
      if (!playerState.hasTimeline) {
        const created = await createTimeline();
        if (!created) return false;
      }
      
      const started = await startPreview();
      if (started) {
        // Start timeline progress simulation
        console.log(`🔍 [GES] Starting timeline sync from current position: ${currentTime}s`);
        startTimelineSync();
      }
      return started;
    }
  }, [playerState.isPlaying, playerState.hasTimeline, stopPreview, startPreview, createTimeline, currentTime, startTimelineSync]);

  // Initialize GES timeline when clips change
  useEffect(() => {
    if (clips.length > 0) {
      // ✅ FIX: Always recreate timeline when clips change to sync with cut operations
      console.log('🎬 [GES] Creating/updating timeline with clips (clip count changed or timeline needs sync)');
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
      
      if (timelineSyncRef.current) {
        clearInterval(timelineSyncRef.current);
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