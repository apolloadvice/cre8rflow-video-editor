import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore, findClipAtTimelinePosition } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';

interface TimelineClip {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  file_path: string;
  type: string;
  in_point: number; // Position in source video file (seconds)
  signedUrl?: string;
}

interface PlaybackState {
  isPlaying: boolean;
  startTime: number;
  timelineStartPosition: number;
  currentClip?: TimelineClip;
  nextClip?: TimelineClip;
  isInGap?: boolean;
  gapStart?: number;
  gapEnd?: number;
}

interface VideoElement {
  element: HTMLVideoElement;
  isActive: boolean;
  loadedClipId?: string;
}

export const useSeamlessTimelinePlayer = (
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const { clips, currentTime, setCurrentTime, duration, setVideoSrc, setIsPlaying } = useEditorStore();
  
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    startTime: 0,
    timelineStartPosition: 0
  });
  
  // Dual video elements for seamless playback
  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const [activeVideo, setActiveVideo] = useState<'A' | 'B'>('A');
  
  const animationFrameRef = useRef<number>();
  const urlCache = useRef<Map<string, string>>(new Map());
  const switchingRef = useRef<boolean>(false);
  const lastCorrectionRef = useRef<number | null>(null);

  // Initialize dual video elements
  useEffect(() => {
    if (!containerRef.current) return;

    // Create video A if it doesn't exist
    if (!videoARef.current) {
      const videoA = document.createElement('video');
      videoA.setAttribute('playsinline', 'true');
      videoA.muted = false;
      videoA.preload = 'auto';
      videoA.style.width = '100%';
      videoA.style.height = '100%';
      videoA.style.objectFit = 'contain';
      videoA.style.display = 'block';
      videoA.style.position = 'absolute';
      videoA.style.top = '0';
      videoA.style.left = '0';
      containerRef.current.appendChild(videoA);
      videoARef.current = videoA;
    }

    // Create video B if it doesn't exist
    if (!videoBRef.current) {
      const videoB = document.createElement('video');
      videoB.setAttribute('playsinline', 'true');
      videoB.muted = false;
      videoB.preload = 'auto';
      videoB.style.width = '100%';
      videoB.style.height = '100%';
      videoB.style.objectFit = 'contain';
      videoB.style.display = 'none'; // Hidden initially
      videoB.style.position = 'absolute';
      videoB.style.top = '0';
      videoB.style.left = '0';
      containerRef.current.appendChild(videoB);
      videoBRef.current = videoB;
    }

    return () => {
      // Cleanup video elements
      if (videoARef.current && containerRef.current?.contains(videoARef.current)) {
        containerRef.current.removeChild(videoARef.current);
        videoARef.current = null;
      }
      if (videoBRef.current && containerRef.current?.contains(videoBRef.current)) {
        containerRef.current.removeChild(videoBRef.current);
        videoBRef.current = null;
      }
    };
  }, [containerRef]);

  // Get active and next video elements
  const getActiveVideo = useCallback((): HTMLVideoElement | null => {
    return activeVideo === 'A' ? videoARef.current : videoBRef.current;
  }, [activeVideo]);

  const getNextVideo = useCallback((): HTMLVideoElement | null => {
    return activeVideo === 'A' ? videoBRef.current : videoARef.current;
  }, [activeVideo]);

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
      in_point: clip.in_point || 0, // Include in_point for proper video positioning
      signedUrl: 'signedUrl' in clip ? clip.signedUrl : undefined
    }));
    
    console.log('🔧 [SeamlessPlayer] Mapped timeline clips with in_point values:', mappedClips.map(c => ({
      name: c.name,
      start: c.start,
      end: c.end,
      in_point: c.in_point
    })));
    
    // ✅ FIX: Only update timeline clips if they've actually changed to prevent unnecessary store updates
    const hasClipsChanged = timelineClips.length !== mappedClips.length || 
      mappedClips.some((newClip, index) => {
        const oldClip = timelineClips[index];
        return !oldClip || 
          oldClip.id !== newClip.id ||
          oldClip.start !== newClip.start ||
          oldClip.end !== newClip.end ||
          oldClip.in_point !== newClip.in_point ||
          oldClip.signedUrl !== newClip.signedUrl;
      });
    
    if (hasClipsChanged) {
      console.log('🔧 [SeamlessPlayer] Timeline clips changed, updating state');
      setTimelineClips(mappedClips);
    } else {
      console.log('🔧 [SeamlessPlayer] Timeline clips unchanged, skipping state update to prevent duration reversion');
    }
    
    // Preload the first video for immediate playback
    if (mappedClips.length > 0 && mappedClips[0].signedUrl && videoARef.current) {
      try {
        const firstClip = mappedClips[0];
        const video = videoARef.current;
        video.src = firstClip.signedUrl;
        video.currentTime = firstClip.in_point; // ✅ FIX: Set to in_point for cut clips
        video.load();
        setVideoSrc(firstClip.signedUrl);
        console.log(`🔄 [SeamlessPlayer] Preloaded first clip "${firstClip.name}" in video A with in_point: ${firstClip.in_point}s`);
      } catch (error) {
        console.error('Error preloading first clip:', error);
      }
    }
    
    return mappedClips;
  }, [clips, setVideoSrc]);

  // Find clip at specific timeline time with gap awareness
  const findClipAtTimeWithGaps = useCallback((time: number): { 
    clip: TimelineClip | null; 
    isInGap: boolean; 
    gapStart?: number; 
    gapEnd?: number; 
  } => {
    if (timelineClips.length === 0) {
      return { clip: null, isInGap: false };
    }

    // Convert TimelineClip[] to Clip[] format for the gap-aware function
    const clipsForGapCheck = timelineClips.map(tc => ({
      id: tc.id,
      name: tc.name,
      start: tc.start,
      end: tc.end,
      duration: tc.duration,
      in_point: tc.in_point, // Use actual in_point for proper video positioning
      track: 0,
      type: tc.type,
      file_path: tc.file_path
    }));

    const result = findClipAtTimelinePosition(clipsForGapCheck, time);
    
    if (result.clip) {
      // Find the corresponding TimelineClip with signedUrl
      const timelineClip = timelineClips.find(tc => tc.id === result.clip!.id);
      return {
        clip: timelineClip || null,
        isInGap: false
      };
    } else if (result.isInGap) {
      return {
        clip: null,
        isInGap: true,
        gapStart: result.gapStart,
        gapEnd: result.gapEnd
      };
    }

    return { clip: null, isInGap: false };
  }, [timelineClips]);

  // Legacy function for compatibility - now uses gap-aware logic
  const findClipAtTime = useCallback((time: number): TimelineClip | null => {
    const result = findClipAtTimeWithGaps(time);
    return result.clip;
  }, [findClipAtTimeWithGaps]);

  // Find next clip after current time
  const findNextClip = useCallback((currentClip: TimelineClip | null): TimelineClip | null => {
    if (!currentClip) return null;

    return timelineClips.find(clip => clip.start >= currentClip.end) || null;
  }, [timelineClips]);

  // Switch active video element (seamless transition)
  const switchActiveVideo = useCallback(() => {
    const currentActive = getActiveVideo();
    const nextActive = getNextVideo();
    
    if (!currentActive || !nextActive) return;

    console.log(`🔄 [SeamlessPlayer] SWITCHING VIDEOS: ${activeVideo} → ${activeVideo === 'A' ? 'B' : 'A'}`);
    console.log(`🔄 [SeamlessPlayer] Current video ${activeVideo} src:`, currentActive.src);
    console.log(`🔄 [SeamlessPlayer] Next video ${activeVideo === 'A' ? 'B' : 'A'} src:`, nextActive.src);

    // Hide current video
    currentActive.style.display = 'none';
    currentActive.pause();

    // Show next video
    nextActive.style.display = 'block';
    
    // Switch active video reference
    const newActiveVideo = activeVideo === 'A' ? 'B' : 'A';
    setActiveVideo(newActiveVideo);
    
    console.log(`🔄 [SeamlessPlayer] Switched from video ${activeVideo} to video ${newActiveVideo}`);
  }, [activeVideo, getActiveVideo, getNextVideo]);

  // Preload clip in next video element
  const preloadNextClip = useCallback(async (clip: TimelineClip): Promise<boolean> => {
    const nextVideo = getNextVideo();
    if (!nextVideo || !clip.signedUrl) return false;

    try {
      console.log(`🔄 [SeamlessPlayer] Preloading next clip: ${clip.name} in video ${activeVideo === 'A' ? 'B' : 'A'}`);
      console.log(`🔧 [SeamlessPlayer] PRELOAD DEBUG: Setting up next clip with in_point offset`, {
        clipName: clip.name,
        clipStart: clip.start,
        clipEnd: clip.end,
        clipInPoint: clip.in_point,
        clipDuration: clip.duration,
        willSetVideoTime: clip.in_point,
        nextVideoElement: activeVideo === 'A' ? 'B' : 'A'
      });
      
      nextVideo.src = clip.signedUrl;
      nextVideo.currentTime = clip.in_point; // ✅ FIX: Start from in_point offset for cut clips
      nextVideo.load();
      
      // Wait for preload to complete
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout preloading next clip'));
        }, 5000);

        const cleanup = () => {
          clearTimeout(timeout);
          nextVideo.removeEventListener('canplaythrough', onCanPlayThrough);
          nextVideo.removeEventListener('loadedmetadata', onLoadedMetadata);
          nextVideo.removeEventListener('error', onError);
        };

        const onCanPlayThrough = () => {
          cleanup();
          resolve();
        };

        const onLoadedMetadata = () => {
          if (nextVideo.readyState >= nextVideo.HAVE_CURRENT_DATA) {
            cleanup();
            resolve();
          }
        };

        const onError = (e: Event) => {
          cleanup();
          reject(new Error('Error preloading next clip'));
        };

        nextVideo.addEventListener('canplaythrough', onCanPlayThrough);
        nextVideo.addEventListener('loadedmetadata', onLoadedMetadata);
        nextVideo.addEventListener('error', onError);

        // If video is already ready, resolve immediately
        if (nextVideo.readyState >= nextVideo.HAVE_ENOUGH_DATA) {
          cleanup();
          resolve();
        }
      });

      return true;
    } catch (error) {
      console.error('Error preloading next clip:', error);
      return false;
    }
  }, [getNextVideo]);

  // Setup video event listeners for seamless playback
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    
    if (!videoA || !videoB) return;

    // Setup event listeners for both videos
    const setupVideoEvents = (video: HTMLVideoElement, videoId: 'A' | 'B') => {
      const onPlaying = () => {
        if (activeVideo === videoId) {
          console.log(`▶️ [SeamlessPlayer] Video ${videoId} started playing`);
          
          // Preload next clip when current clip starts playing
          const currentClip = playbackState.currentClip;
          if (currentClip) {
            const nextClip = findNextClip(currentClip);
            if (nextClip) {
              preloadNextClip(nextClip);
            }
          }
        }
      };

      const onEnded = () => {
        if (activeVideo === videoId && playbackState.isPlaying) {
          console.log(`🏁 [SeamlessPlayer] Video ${videoId} ended - switching to next clip`);
          
          // Find next clip
          const currentClip = playbackState.currentClip;
          if (currentClip) {
            const nextClip = findNextClip(currentClip);
            if (nextClip) {
              // Switch to next video element (seamless transition)
              switchActiveVideo();
              
              // Update playback state
              setPlaybackState(prev => ({
                ...prev,
                currentClip: nextClip,
                timelineStartPosition: nextClip.start,
                startTime: Date.now()
              }));
              
              // Start playing the next video
              const nextVideo = getNextVideo();
              if (nextVideo) {
                // ✅ CRITICAL FIX: Ensure currentTime is set to in_point before playing
                const clipPosition = nextClip.in_point;
                nextVideo.currentTime = clipPosition;
                console.log(`🔧 [SeamlessPlayer] SEAMLESS SWITCH: Setting next clip position to in_point`, {
                  nextClipName: nextClip.name,
                  nextClipInPoint: nextClip.in_point,
                  setVideoTime: clipPosition
                });
                
                nextVideo.play().catch(error => {
                  console.error('Error playing next clip:', error);
                });
              }
            } else {
              // No more clips, stop playback
              console.log('🏁 [SeamlessPlayer] No more clips - stopping playback');
              stopPlayback();
            }
          }
        }
      };

      const onTimeUpdate = () => {
        if (activeVideo === videoId) {
          // Update timeline position based on current video time
          const currentClip = playbackState.currentClip;
          if (currentClip) {
            // ✅ CRITICAL FIX: Account for in_point offset when calculating timeline position
            const timelinePosition = currentClip.start + (video.currentTime - currentClip.in_point);
            
            // ✅ NEW FIX: Clamp timeline position to duration boundary
            const clampedTimelinePosition = Math.min(timelinePosition, duration);
            setCurrentTime(clampedTimelinePosition);
            
            // ✅ NEW FIX: Stop playback if we've reached timeline duration
            if (timelinePosition >= duration) {
              console.log(`🏁 [SeamlessPlayer] Timeline position (${timelinePosition.toFixed(2)}s) reached duration (${duration}s), stopping playback`);
              video.pause();
              stopPlayback();
              return;
            }
            
            // ✅ CRITICAL FIX: Enforce clip boundaries - stop video when clip ends
            const clipEndInVideoTime = currentClip.in_point + currentClip.duration;
            if (video.currentTime >= clipEndInVideoTime) {
              console.log(`🛑 [SeamlessPlayer] Video ${videoId} reached clip end (${clipEndInVideoTime}s), triggering clip end`);
              video.pause();
              
              // Trigger the onEnded handler to switch to next clip
              if (playbackState.isPlaying) {
                // Find and switch to next clip
                const nextClip = findNextClip(currentClip);
                if (nextClip && nextClip.start < duration) {
                  console.log(`🎬 [SeamlessPlayer] Switching from clip "${currentClip.name}" to "${nextClip.name}"`);
                  switchActiveVideo();
                  
                  // Update playback state
                  setPlaybackState(prev => ({
                    ...prev,
                    currentClip: nextClip,
                    timelineStartPosition: nextClip.start,
                    startTime: Date.now()
                  }));
                  
                  // Start playing the next video
                  const nextVideo = getNextVideo();
                  if (nextVideo) {
                    const clipPosition = nextClip.in_point;
                    nextVideo.currentTime = clipPosition;
                    console.log(`🔧 [SeamlessPlayer] Starting next clip at in_point: ${clipPosition}s`);
                    
                    nextVideo.play().catch(error => {
                      console.error('Error playing next clip:', error);
                    });
                  }
                } else {
                  // No more clips or next clip beyond duration, stop playback
                  console.log('🏁 [SeamlessPlayer] No more clips or reached timeline duration - stopping playback');
                  stopPlayback();
                }
              }
            }
          }
        }
      };

      video.addEventListener('playing', onPlaying);
      video.addEventListener('ended', onEnded);
      video.addEventListener('timeupdate', onTimeUpdate);

      return () => {
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('timeupdate', onTimeUpdate);
      };
    };

    const cleanupA = setupVideoEvents(videoA, 'A');
    const cleanupB = setupVideoEvents(videoB, 'B');

    return () => {
      cleanupA();
      cleanupB();
    };
  }, [activeVideo, playbackState, switchActiveVideo, getNextVideo, findNextClip, preloadNextClip, setCurrentTime]);

  // Start timeline playback with gap awareness
  const startPlayback = useCallback(async () => {
    if (playbackState.isPlaying) return;

    console.log(`▶️ [SeamlessPlayer] Starting playback at ${currentTime.toFixed(2)}s`);
    
    // Use gap-aware clip detection
    const timelineState = findClipAtTimeWithGaps(currentTime);
    console.log(`▶️ [SeamlessPlayer] Timeline state at ${currentTime.toFixed(2)}s:`, {
      clip: timelineState.clip?.name || 'none',
      isInGap: timelineState.isInGap,
      gapRange: timelineState.isInGap ? `${timelineState.gapStart?.toFixed(2)}-${timelineState.gapEnd?.toFixed(2)}s` : 'none'
    });
    console.log(`🔧 [SeamlessPlayer] CLIP LOOKUP DEBUG:`, {
      requestedTime: currentTime,
      foundClip: timelineState.clip ? {
        name: timelineState.clip.name,
        id: timelineState.clip.id,
        start: timelineState.clip.start,
        end: timelineState.clip.end,
        in_point: timelineState.clip.in_point
      } : null,
      totalTimelineClips: timelineClips.length,
      allClips: timelineClips.map(c => ({name: c.name, start: c.start, end: c.end, in_point: c.in_point}))
    });
    
    if (timelineState.isInGap) {
      // We're in a gap - continue timeline progression but don't play video
      console.log(`⏸️ [SeamlessPlayer] In gap (${timelineState.gapStart?.toFixed(2)}-${timelineState.gapEnd?.toFixed(2)}s) - timeline continues without video`);
      
      // Set gap playback state
      setPlaybackState({
        isPlaying: true,
        startTime: Date.now(),
        timelineStartPosition: currentTime,
        currentClip: undefined,
        isInGap: true,
        gapStart: timelineState.gapStart,
        gapEnd: timelineState.gapEnd
      });
      
      // ✅ NEW FIX: Sync with editor store to prevent Timeline duration recalculation during gap playback
      setIsPlaying(true);
      
      // Start gap progression timer
      startGapProgression(timelineState.gapEnd!);
      
    } else if (timelineState.clip && timelineState.clip.signedUrl) {
      const activeVideoEl = getActiveVideo();
      if (!activeVideoEl) return;

      try {
        // Setup current clip in active video
        if (activeVideoEl.src !== timelineState.clip.signedUrl) {
          console.log(`🔄 [SeamlessPlayer] Loading new video source for clip "${timelineState.clip.name}" in video ${activeVideo}`);
          activeVideoEl.src = timelineState.clip.signedUrl;
          activeVideoEl.load();
        } else {
          console.log(`🔄 [SeamlessPlayer] Video source already loaded for clip "${timelineState.clip.name}" in video ${activeVideo}`);
        }
        
        // Set position within the clip, accounting for in_point offset
        const clipPosition = currentTime - timelineState.clip.start + timelineState.clip.in_point;
        activeVideoEl.currentTime = Math.max(0, clipPosition);
        console.log(`🎬 [SeamlessPlayer] Setting video position: timeline=${currentTime}s, clipStart=${timelineState.clip.start}s, inPoint=${timelineState.clip.in_point}s → video=${clipPosition}s`);
        console.log(`🔧 [SeamlessPlayer] DETAILED CLIP DEBUG:`, {
          clipName: timelineState.clip.name,
          clipId: timelineState.clip.id,
          clipStart: timelineState.clip.start,
          clipEnd: timelineState.clip.end,
          clipInPoint: timelineState.clip.in_point,
          clipDuration: timelineState.clip.duration,
          allTimelineClips: timelineClips.map(c => ({name: c.name, start: c.start, end: c.end, in_point: c.in_point}))
        });
        
        // Set playing state
        setPlaybackState({
          isPlaying: true,
          startTime: Date.now(),
          timelineStartPosition: currentTime,
          currentClip: timelineState.clip,
          isInGap: false
        });
        
        // ✅ NEW FIX: Sync with editor store to prevent Timeline duration recalculation during playback
        setIsPlaying(true);
        
        // Start playback
        await activeVideoEl.play();
        
        console.log(`▶️ [SeamlessPlayer] Started playing: ${timelineState.clip.name}`);
      } catch (error) {
        console.error('Error starting playback:', error);
        setPlaybackState(prev => ({ ...prev, isPlaying: false }));
        setIsPlaying(false); // ✅ NEW FIX: Sync with editor store
      }
    } else {
      // Find next clip and jump to it
      const nextClip = timelineClips.find(clip => clip.start > currentTime);
      if (nextClip) {
        console.log(`▶️ [SeamlessPlayer] Jumping to next clip: ${nextClip.name}`);
        setCurrentTime(nextClip.start);
        setTimeout(() => startPlayback(), 50);
      }
    }
  }, [currentTime, findClipAtTimeWithGaps, timelineClips, playbackState.isPlaying, setCurrentTime, getActiveVideo]);

  // Handle timeline progression during gaps
  const startGapProgression = useCallback((gapEndTime: number) => {
    const progressGap = () => {
      if (!playbackState.isPlaying || !playbackState.isInGap) return;
      
      const elapsed = (Date.now() - playbackState.startTime) / 1000;
      const newTimelineTime = playbackState.timelineStartPosition + elapsed;
      
      // Check if we've reached the timeline duration boundary
      if (newTimelineTime >= duration) {
        console.log(`🏁 [SeamlessPlayer] Gap progression reached timeline duration (${duration}s), stopping playback`);
        setCurrentTime(duration);
        
        // Stop playback at timeline boundary
        setPlaybackState(prev => ({ ...prev, isPlaying: false }));
        setIsPlaying(false); // ✅ NEW FIX: Sync with editor store
        
        // Pause active video
        const activeVideoEl = getActiveVideo();
        if (activeVideoEl) {
          activeVideoEl.pause();
        }
        
        // Clear animation frame
        if (animationFrameRef.current) {
          clearTimeout(animationFrameRef.current);
          animationFrameRef.current = undefined;
        }
        return;
      }
      
      if (newTimelineTime >= gapEndTime) {
        // Gap ended, find next clip and resume playback
        console.log(`⏭️ [SeamlessPlayer] Gap ended at ${gapEndTime.toFixed(2)}s, seeking next clip`);
        setCurrentTime(gapEndTime);
        
        // Look for clip at gap end position
        const nextTimelineState = findClipAtTimeWithGaps(gapEndTime);
        if (nextTimelineState.clip) {
          // Resume normal playback with next clip
          setTimeout(() => startPlayback(), 50);
        } else {
          // Still in gap or no more clips
          const nextClip = timelineClips.find(clip => clip.start > gapEndTime);
          if (nextClip) {
            setCurrentTime(nextClip.start);
            setTimeout(() => startPlayback(), 50);
          } else {
            // No more clips, stop playback by setting state
            console.log(`🏁 [SeamlessPlayer] No more clips after gap, stopping at timeline duration`);
            setCurrentTime(Math.min(newTimelineTime, duration));
            setPlaybackState(prev => ({ ...prev, isPlaying: false }));
            setIsPlaying(false); // ✅ NEW FIX: Sync with editor store
            
            // Pause active video
            const activeVideoEl = getActiveVideo();
            if (activeVideoEl) {
              activeVideoEl.pause();
            }
            
            // Clear animation frame
            if (animationFrameRef.current) {
              clearTimeout(animationFrameRef.current);
              animationFrameRef.current = undefined;
            }
          }
        }
      } else {
        // Continue gap progression, but clamp to duration boundary
        const clampedTime = Math.min(newTimelineTime, duration);
        setCurrentTime(clampedTime);
        
        // If we've reached duration boundary, stop
        if (clampedTime >= duration) {
          console.log(`🏁 [SeamlessPlayer] Gap progression reached timeline duration boundary, stopping playback`);
          setPlaybackState(prev => ({ ...prev, isPlaying: false }));
          setIsPlaying(false); // ✅ NEW FIX: Sync with editor store
          
          // Pause active video
          const activeVideoEl = getActiveVideo();
          if (activeVideoEl) {
            activeVideoEl.pause();
          }
          
          // Clear animation frame
          if (animationFrameRef.current) {
            clearTimeout(animationFrameRef.current);
            animationFrameRef.current = undefined;
          }
        } else {
          animationFrameRef.current = setTimeout(progressGap, 50) as any;
        }
      }
    };
    
    // Start gap progression
    animationFrameRef.current = setTimeout(progressGap, 50) as any;
  }, [playbackState, setCurrentTime, findClipAtTimeWithGaps, timelineClips, getActiveVideo, duration]);

  // Stop timeline playback
  const stopPlayback = useCallback(() => {
    // 🔍 DEBUG: Track seamless player stop
    console.log(`🔍 [SeamlessPlayer] Stopping playback - current timeline position: ${currentTime}s`);
    
    if (animationFrameRef.current) {
      clearTimeout(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    // Pause both videos
    if (videoARef.current) videoARef.current.pause();
    if (videoBRef.current) videoBRef.current.pause();

    console.log(`🔍 [SeamlessPlayer] Setting playback state to false - timeline position should remain: ${currentTime}s`);
    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false
    }));
    
    // ✅ NEW FIX: Sync with editor store to allow Timeline duration recalculation after playback stops
    console.log(`🔍 [SeamlessPlayer] Syncing with editor store - setIsPlaying(false)`);
    setIsPlaying(false);
  }, [setIsPlaying, currentTime]);

  // Toggle playback
  const togglePlayback = useCallback(() => {
    if (playbackState.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [playbackState.isPlaying, stopPlayback, startPlayback]);

  // Seek to specific time
  const seekToTime = useCallback((time: number) => {
    console.log(`⏭️ [SeamlessPlayer] Seeking to ${time.toFixed(2)}s`);
    
    const clip = findClipAtTime(time);
    if (clip && clip.signedUrl) {
      const activeVideoEl = getActiveVideo();
      if (activeVideoEl) {
        // Load clip if different
        if (activeVideoEl.src !== clip.signedUrl) {
          activeVideoEl.src = clip.signedUrl;
          activeVideoEl.load();
        }
        
        // Set position within clip, accounting for in_point offset
        const clipPosition = time - clip.start + clip.in_point;
        activeVideoEl.currentTime = Math.max(0, clipPosition);
        console.log(`🎬 [SeamlessPlayer] Seeking: timeline=${time}s, clipStart=${clip.start}s, inPoint=${clip.in_point}s → video=${clipPosition}s`);
        
        // Update state
        setPlaybackState(prev => ({
          ...prev,
          currentClip: clip,
          timelineStartPosition: time,
          startTime: Date.now()
        }));
      }
    }
    
    setCurrentTime(time);
  }, [findClipAtTime, getActiveVideo, setCurrentTime]);

  // Reset video elements and preload URLs when clips change
  useEffect(() => {
    // ✅ FIX: Skip clip reprocessing during active playback to prevent duration reversion
    if (playbackState.isPlaying) {
      console.log('🔧 [SeamlessPlayer] Skipping clip reprocessing during active playback to prevent duration reversion');
      return;
    }
    
    if (clips.length > 0) {
      console.log('🔧 [SeamlessPlayer] Clips changed, resetting video elements and preloading URLs with new clips:', clips.map(c => ({
        name: c.name,
        start: c.start,
        end: c.end,
        in_point: c.in_point
      })));
      
      // Reset video elements to clear any old video data
      if (videoARef.current) {
        videoARef.current.src = '';
        videoARef.current.load();
        console.log('🔄 [SeamlessPlayer] Reset video A');
      }
      if (videoBRef.current) {
        videoBRef.current.src = '';
        videoBRef.current.load();
        console.log('🔄 [SeamlessPlayer] Reset video B');
      }
      
      // Reset active video to A
      setActiveVideo('A');
      
      preloadClipUrls().catch(error => {
        console.error('🚀 [SeamlessPlayer] Error preloading clip URLs:', error);
      });
    }
  }, [clips, preloadClipUrls]); // ✅ FIX: Removed playbackState.isPlaying to prevent reset during pause

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
      }
    };
  }, []);

  return {
    isPlaying: playbackState.isPlaying,
    currentClip: playbackState.currentClip,
    timelineClips,
    togglePlayback,
    startPlayback,
    stopPlayback,
    seekToTime,
    isReady: timelineClips.length > 0
  };
}; 