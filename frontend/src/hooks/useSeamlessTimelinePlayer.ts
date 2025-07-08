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
  nextClip?: TimelineClip;
}

interface VideoElement {
  element: HTMLVideoElement;
  isActive: boolean;
  loadedClipId?: string;
}

export const useSeamlessTimelinePlayer = (
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const { clips, currentTime, setCurrentTime, duration, setVideoSrc } = useEditorStore();
  
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
      signedUrl: 'signedUrl' in clip ? clip.signedUrl : undefined
    }));
    
    setTimelineClips(mappedClips);
    
    // Preload the first video for immediate playback
    if (mappedClips.length > 0 && mappedClips[0].signedUrl && videoARef.current) {
      try {
        const video = videoARef.current;
        video.src = mappedClips[0].signedUrl;
        video.load();
        setVideoSrc(mappedClips[0].signedUrl);
      } catch (error) {
        console.error('Error preloading first clip:', error);
      }
    }
    
    return mappedClips;
  }, [clips, setVideoSrc]);

  // Find clip at specific timeline time
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

    // Hide current video
    currentActive.style.display = 'none';
    currentActive.pause();

    // Show next video
    nextActive.style.display = 'block';
    
    // Switch active video reference
    setActiveVideo(activeVideo === 'A' ? 'B' : 'A');
    
    console.log(`🔄 [SeamlessPlayer] Switched from video ${activeVideo} to video ${activeVideo === 'A' ? 'B' : 'A'}`);
  }, [activeVideo, getActiveVideo, getNextVideo]);

  // Preload clip in next video element
  const preloadNextClip = useCallback(async (clip: TimelineClip): Promise<boolean> => {
    const nextVideo = getNextVideo();
    if (!nextVideo || !clip.signedUrl) return false;

    try {
      console.log(`🔄 [SeamlessPlayer] Preloading next clip: ${clip.name}`);
      
      nextVideo.src = clip.signedUrl;
      nextVideo.currentTime = 0; // Start from beginning of next clip
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
            const timelinePosition = currentClip.start + video.currentTime;
            setCurrentTime(timelinePosition);
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

  // Start timeline playback
  const startPlayback = useCallback(async () => {
    if (playbackState.isPlaying) return;

    console.log(`▶️ [SeamlessPlayer] Starting playback at ${currentTime.toFixed(2)}s`);
    
    const currentClip = findClipAtTime(currentTime);
    console.log(`▶️ [SeamlessPlayer] Current clip at ${currentTime.toFixed(2)}s:`, currentClip?.name || 'none');
    
    if (currentClip && currentClip.signedUrl) {
      const activeVideoEl = getActiveVideo();
      if (!activeVideoEl) return;

      try {
        // Setup current clip in active video
        if (activeVideoEl.src !== currentClip.signedUrl) {
          activeVideoEl.src = currentClip.signedUrl;
          activeVideoEl.load();
        }
        
        // Set position within the clip
        const clipPosition = currentTime - currentClip.start;
        activeVideoEl.currentTime = Math.max(0, clipPosition);
        
        // Set playing state
        setPlaybackState({
          isPlaying: true,
          startTime: Date.now(),
          timelineStartPosition: currentTime,
          currentClip
        });
        
        // Start playback
        await activeVideoEl.play();
        
        console.log(`▶️ [SeamlessPlayer] Started playing: ${currentClip.name}`);
      } catch (error) {
        console.error('Error starting playback:', error);
        setPlaybackState(prev => ({ ...prev, isPlaying: false }));
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
  }, [currentTime, findClipAtTime, timelineClips, playbackState.isPlaying, setCurrentTime, getActiveVideo]);

  // Stop timeline playback
  const stopPlayback = useCallback(() => {
    console.log(`⏸️ [SeamlessPlayer] Stopping playback`);
    
    if (animationFrameRef.current) {
      clearTimeout(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    // Pause both videos
    if (videoARef.current) videoARef.current.pause();
    if (videoBRef.current) videoBRef.current.pause();

    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false
    }));
  }, []);

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
        
        // Set position within clip
        const clipPosition = time - clip.start;
        activeVideoEl.currentTime = Math.max(0, clipPosition);
        
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

  // Preload URLs when clips change
  useEffect(() => {
    if (clips.length > 0) {
      preloadClipUrls().catch(error => {
        console.error('🚀 [SeamlessPlayer] Error preloading clip URLs:', error);
      });
    }
  }, [clips, preloadClipUrls]);

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