import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';

interface TimelineClip {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  file_path: string;
  type: string;
  signedUrl?: string;
}

interface PlaybackState {
  isPlaying: boolean;
  startTime: number;
  timelineStartPosition: number;
  currentClip?: TimelineClip;
}

export const useTimelinePlayer = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  
  const { clips, currentTime, setCurrentTime, duration, setVideoSrc } = useEditorStore();
  
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    startTime: 0,
    timelineStartPosition: 0
  });
  
  const animationFrameRef = useRef<number>();
  const urlCache = useRef<Map<string, string>>(new Map());
  const switchingRef = useRef<boolean>(false);
  const lastCorrectionRef = useRef<number | null>(null);

  // Centralized function to ensure consistent playback rate
  const ensureNormalPlaybackRate = useCallback((video: HTMLVideoElement, context: string = '') => {
    if (video.playbackRate !== 1.0) {
      video.playbackRate = 1.0;
    }
  }, []);

  // Preload signed URLs for all video clips
  const preloadClipUrls = useCallback(async () => {
    const videoClips = clips
      .filter(clip => clip.type === 'video')
      .sort((a, b) => a.start - b.start);

    const urlPromises = videoClips.map(async (clip) => {
      // Check cache first
      if (urlCache.current.has(clip.file_path)) {
        const cachedUrl = urlCache.current.get(clip.file_path)!;
        return { ...clip, signedUrl: cachedUrl };
      }

      try {
        const { data: urlData, error } = await supabase.storage
          .from('assets')
          .createSignedUrl(clip.file_path, 3600);

        if (error || !urlData?.signedUrl) {
          return clip;
        }

        // Cache the URL
        urlCache.current.set(clip.file_path, urlData.signedUrl);
        
        return { ...clip, signedUrl: urlData.signedUrl };
      } catch (error) {
        return clip;
      }
    });

    const clipsWithUrls = await Promise.all(urlPromises);
    
    // Ensure proper type mapping with duration calculation
    const mappedClips: TimelineClip[] = clipsWithUrls.map(clip => ({
      id: clip.id,
      name: clip.name,
      start: clip.start,
      end: clip.end,
      duration: clip.end - clip.start,
      file_path: clip.file_path || '',
      type: clip.type,
      signedUrl: 'signedUrl' in clip ? clip.signedUrl : undefined
    }));
    
    setTimelineClips(mappedClips);
    
    // Preload the first video for immediate playback
    if (mappedClips.length > 0 && mappedClips[0].signedUrl && videoRef.current) {
      try {
        const video = videoRef.current;
        video.src = mappedClips[0].signedUrl;
        video.load();
        
        // 🔧 FIX: Ensure first clip has correct playback rate
        ensureNormalPlaybackRate(video, `first clip preload: ${mappedClips[0].name}`);
        
        setVideoSrc(mappedClips[0].signedUrl);
      } catch (error) {
      }
    }
    
    return mappedClips;
  }, [clips, videoRef, setVideoSrc, ensureNormalPlaybackRate]);

  // Find clip at specific timeline time using binary search
  const findClipAtTime = useCallback((time: number): TimelineClip | null => {
    if (timelineClips.length === 0) return null;

    let left = 0;
    let right = timelineClips.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const clip = timelineClips[mid];

      if (time >= clip.start && time < clip.end) {
        return clip;
      } else if (time < clip.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return null;
  }, [timelineClips]);

  // Switch to a specific clip instantly
  const switchToClip = useCallback(async (clip: TimelineClip, clipPosition: number): Promise<boolean> => {
    const video = videoRef.current;
    if (!video || !clip.signedUrl) {
      return false;
    }

    // Prevent overlapping switches
    if (switchingRef.current) {
      return false;
    }

    switchingRef.current = true;

    try {
      // Only load if it's a different video source
      if (video.src !== clip.signedUrl) {
        setVideoSrc(clip.signedUrl);
        video.src = clip.signedUrl;
        video.load();

        // Wait for the video to be fully ready for smooth playback
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout loading video'));
          }, 8000);

          const cleanup = () => {
            clearTimeout(timeout);
            video.removeEventListener('canplaythrough', onCanPlayThrough);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onError);
          };

          const onCanPlayThrough = () => {
            cleanup();
            resolve();
          };

          const onLoadedMetadata = () => {
            if (video.readyState >= video.HAVE_CURRENT_DATA) {
              cleanup();
              resolve();
            }
          };

          const onError = (e: Event) => {
            cleanup();
            reject(new Error('Error loading video'));
          };

          // Wait for video to be ready for smooth playback
          video.addEventListener('canplaythrough', onCanPlayThrough);
          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.addEventListener('error', onError);

          // If video is already ready, resolve immediately
          if (video.readyState >= video.HAVE_ENOUGH_DATA) {
            cleanup();
            resolve();
          }
        });
      }

      // Ensure consistent playback rate
      ensureNormalPlaybackRate(video, `during switch to ${clip.name}`);
      
      // Set position within the clip
      video.currentTime = Math.max(0, clipPosition);
      
      // Wait a moment for the seek to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Resume playback if we were playing
      if (playbackState.isPlaying) {
        ensureNormalPlaybackRate(video, `before play() for ${clip.name}`);
        await video.play();
      }

      return true;
    } catch (error) {
      return false;
    } finally {
      switchingRef.current = false;
    }
  }, [videoRef, setVideoSrc, playbackState.isPlaying, ensureNormalPlaybackRate]);

  // Start timeline playback
  const startPlayback = useCallback(async () => {
    if (playbackState.isPlaying) return;

    console.log(`▶️ [TimelinePlayer] Starting playback at ${currentTime.toFixed(2)}s`);
    console.log(`▶️ [TimelinePlayer] Available clips:`, timelineClips.map(c => `${c.name} (${c.start}s-${c.end}s)`));
    
    const currentClip = findClipAtTime(currentTime);
    console.log(`▶️ [TimelinePlayer] Current clip at ${currentTime.toFixed(2)}s:`, currentClip?.name || 'none');
    
    if (currentClip) {
      console.log(`▶️ [TimelinePlayer] Found clip: ${currentClip.name} for playback`);
      
      // Set playing state first to avoid race conditions
      setPlaybackState({
        isPlaying: true,
        startTime: Date.now(),
        timelineStartPosition: currentTime,
        currentClip
      });
      
      const clipPosition = currentTime - currentClip.start;
      const success = await switchToClip(currentClip, clipPosition);
      
      if (!success) {
        console.error(`▶️ [TimelinePlayer] Failed to start playback for ${currentClip.name}`);
        // Reset playing state if failed
        setPlaybackState(prev => ({ ...prev, isPlaying: false }));
      }
    } else {
      // Find next clip and jump to it
      const nextClip = timelineClips.find(clip => clip.start > currentTime);
      if (nextClip) {
        console.log(`▶️ [TimelinePlayer] Jumping to next clip: ${nextClip.name}`);
        setCurrentTime(nextClip.start);
        setTimeout(() => startPlayback(), 50);
      }
    }
  }, [currentTime, findClipAtTime, switchToClip, timelineClips, playbackState.isPlaying, setCurrentTime]);

  // Stop timeline playback
  const stopPlayback = useCallback(() => {
    console.log(`⏸️ [TimelinePlayer] Stopping playback`);
    
    if (animationFrameRef.current) {
      clearTimeout(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }

    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false
    }));
  }, [videoRef]);

  // Toggle playback
  const togglePlayback = useCallback(() => {
    if (playbackState.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [playbackState.isPlaying, stopPlayback, startPlayback]);

  // Timeline update loop
  useEffect(() => {
    console.log('🚨 [DEBUG] Timeline effect triggered, dependencies changed:', {
      isPlaying: playbackState.isPlaying,
      startTime: playbackState.startTime,
      currentClip: playbackState.currentClip?.id
    });
    
    if (!playbackState.isPlaying) return;

    const updateTimeline = () => {
      const elapsed = (Date.now() - playbackState.startTime) / 1000;
      const newTimelineTime = playbackState.timelineStartPosition + elapsed;

      // Update timeline cursor
      console.log('🚨 [DEBUG] setCurrentTime called with:', newTimelineTime.toFixed(3));
      setCurrentTime(newTimelineTime);

      // Check if we've reached the end
      if (newTimelineTime >= duration) {
        console.log(`🏁 [TimelinePlayer] Reached end at ${newTimelineTime.toFixed(2)}s`);
        stopPlayback();
        return;
      }

      // Find the current clip
      const currentClip = findClipAtTime(newTimelineTime);

      if (currentClip) {
        // Check if we need to switch clips
        if (!playbackState.currentClip || currentClip.id !== playbackState.currentClip.id) {
          // Only switch if not already switching
          if (!switchingRef.current) {
            const clipPosition = newTimelineTime - currentClip.start;
            switchToClip(currentClip, clipPosition).then(success => {
              if (success) {
                console.log('🚨 [DEBUG] setPlaybackState called - switching clip to:', currentClip.id);
                setPlaybackState(prev => ({
                  ...prev,
                  currentClip
                }));
              }
            });
          }
        } else {
          // Same clip - apply minimal drift correction to maintain sync
          const clipPosition = newTimelineTime - currentClip.start;
          if (videoRef.current) {
            const video = videoRef.current;
            const videoCurrent = video.currentTime;
            const drift = Math.abs(videoCurrent - clipPosition);
            
            // Ensure playback rate is always correct during playback
            ensureNormalPlaybackRate(video, `during playback sync for ${currentClip.name}`);
            
            // Only correct significant drift (>1.5s) and not too frequently
            if (drift > 1.5) {
              // Check if we haven't corrected recently (throttle corrections)
              const now = Date.now();
              if (!lastCorrectionRef.current || now - lastCorrectionRef.current > 1000) {
                console.log(`🔄 [TimelinePlayer] Correcting drift: ${drift.toFixed(2)}s (playback rate: ${video.playbackRate})`);
                video.currentTime = clipPosition;
                lastCorrectionRef.current = now;
              }
            }
          }
        }
      } else {
        // No clip (gap), pause video but continue timeline
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        
        if (playbackState.currentClip) {
          setPlaybackState(prev => ({
            ...prev,
            currentClip: undefined
          }));
        }
      }

      // Schedule next update with reasonable frequency (20fps with drift correction)
      animationFrameRef.current = window.setTimeout(updateTimeline, 50);
    };

    // Start the update loop
    animationFrameRef.current = window.setTimeout(updateTimeline, 50);

    return () => {
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
      }
    };
  }, [playbackState.isPlaying]); // 🔧 FIX: Only depend on isPlaying to prevent infinite loops

  // Preload URLs when clips change
  useEffect(() => {
    if (clips.length > 0) {
      preloadClipUrls().catch(error => {
        console.error('🚀 [TimelinePlayer] Error preloading clip URLs:', error);
      });
    }
  }, [preloadClipUrls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
      }
      urlCache.current.clear();
    };
  }, []);

  return {
    isPlaying: playbackState.isPlaying,
    currentClip: playbackState.currentClip,
    timelineClips,
    togglePlayback,
    stopPlayback,
    startPlayback,
    isReady: timelineClips.length > 0 && timelineClips.every(clip => clip.signedUrl)
  };
}; 