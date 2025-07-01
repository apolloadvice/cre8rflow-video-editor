import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { supabase } from '@/integrations/supabase/client';

interface TimelineClip {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  file_path: string;
  type: string;
}

interface TimelineInterval {
  start: number;
  end: number;
  clip: TimelineClip;
  videoUrl?: string;
  loaded: boolean;
}

interface PlaybackState {
  isPlaying: boolean;
  startTime: number;
  timelineStartPosition: number;
  currentInterval?: TimelineInterval;
}

export const useIntervalTimeline = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const { clips, currentTime, setCurrentTime, duration, setVideoSrc } = useEditorStore();
  
  // Timeline intervals sorted by start time
  const [intervals, setIntervals] = useState<TimelineInterval[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    startTime: 0,
    timelineStartPosition: 0
  });
  
  const animationFrameRef = useRef<number>();
  const loadingPromises = useRef<Map<string, Promise<boolean>>>(new Map());

  // Preload signed URLs for all intervals
  const preloadIntervalUrls = useCallback(async (intervals: TimelineInterval[]) => {
    console.log('🚀 [IntervalTree] Preloading signed URLs for', intervals.length, 'intervals');
    
    const urlPromises = intervals.map(async (interval) => {
      try {
        const { data: urlData, error } = await supabase.storage
          .from('assets')
          .createSignedUrl(interval.clip.file_path, 3600);

        if (error || !urlData?.signedUrl) {
          console.error(`🚀 [IntervalTree] Failed to create signed URL for ${interval.clip.name}:`, error);
          return interval;
        }

        interval.videoUrl = urlData.signedUrl;
        console.log(`🚀 [IntervalTree] ✅ Preloaded URL for ${interval.clip.name}`);
        return interval;
      } catch (error) {
        console.error(`🚀 [IntervalTree] Error preloading URL for ${interval.clip.name}:`, error);
        return interval;
      }
    });

    const updatedIntervals = await Promise.all(urlPromises);
    setIntervals(updatedIntervals);
    
    console.log('🚀 [IntervalTree] Preload complete. Intervals with URLs:', 
      updatedIntervals.filter(i => i.videoUrl).length
    );
  }, []);

  // Build interval tree from clips
  const buildIntervals = useCallback(async () => {
    console.log('🌳 [IntervalTree] Building intervals from clips:', clips.length);
    
    const videoClips = clips
      .filter(clip => clip.type === 'video')
      .map(clip => ({
        id: clip.id,
        name: clip.name,
        start: clip.start,
        end: clip.end,
        duration: clip.end - clip.start,
        file_path: clip.file_path,
        type: clip.type
      }))
      .sort((a, b) => a.start - b.start);

    const newIntervals: TimelineInterval[] = videoClips.map(clip => ({
      start: clip.start,
      end: clip.end,
      clip,
      loaded: false
    }));

    console.log('🌳 [IntervalTree] Created intervals:', newIntervals.map(i => ({
      start: i.start,
      end: i.end,
      name: i.clip.name
    })));

    // Immediately preload URLs for all intervals
    await preloadIntervalUrls(newIntervals);
  }, [clips, preloadIntervalUrls]);

  // Binary search to find interval at specific time
  const findIntervalAtTime = useCallback((time: number): TimelineInterval | null => {
    if (intervals.length === 0) return null;

    // Binary search for the interval containing this time
    let left = 0;
    let right = intervals.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const interval = intervals[mid];

      if (time >= interval.start && time < interval.end) {
        return interval;
      } else if (time < interval.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return null;
  }, [intervals]);

  // Load video for an interval (simplified - just checks if URL is ready)
  const loadInterval = useCallback(async (interval: TimelineInterval): Promise<boolean> => {
    const clipId = interval.clip.id;
    
    // Check if already loading
    if (loadingPromises.current.has(clipId)) {
      return loadingPromises.current.get(clipId)!;
    }

    console.log(`📼 [VideoLoader] Checking interval: ${interval.clip.name}`);

    const loadPromise = (async () => {
      try {
        // URL should already be preloaded
        if (!interval.videoUrl) {
          console.error(`📼 [VideoLoader] No preloaded URL for ${interval.clip.name}. Interval tree may not be ready.`);
          return false;
        }

        // Just verify video element exists - actual loading handled in timeline update
        if (videoRef.current) {
          console.log(`📼 [VideoLoader] ✅ URL ready for ${interval.clip.name}`);
          interval.loaded = true;
          return true;
        }

        console.error(`📼 [VideoLoader] No video element available`);
        return false;
      } catch (error) {
        console.error(`📼 [VideoLoader] Error checking ${interval.clip.name}:`, error);
        return false;
      } finally {
        loadingPromises.current.delete(clipId);
      }
    })();

    loadingPromises.current.set(clipId, loadPromise);
    return loadPromise;
  }, [videoRef]);

  // Start timeline playback
  const startPlayback = useCallback(async () => {
    if (playbackState.isPlaying) return;

    console.log(`▶️ [Timeline] Starting playback at ${currentTime.toFixed(2)}s`);
    
    const currentInterval = findIntervalAtTime(currentTime);
    
    if (currentInterval) {
      console.log(`▶️ [Timeline] Found interval: ${currentInterval.clip.name}`);
      
      // Check if URL is ready
      if (!currentInterval.videoUrl) {
        console.error(`▶️ [Timeline] No video URL for ${currentInterval.clip.name}`);
        return;
      }

      // Check if we're resuming the same video (pause/resume case)
      const resumingSameVideo = playbackState.currentInterval && 
                                playbackState.currentInterval.clip.id === currentInterval.clip.id &&
                                videoRef.current && 
                                videoRef.current.src === currentInterval.videoUrl;

      if (resumingSameVideo) {
        // Just resume playing the current video without reloading
        console.log(`▶️ [Timeline] Resuming playback of: ${currentInterval.clip.name}`);
        const clipPosition = currentTime - currentInterval.start;
        
        if (videoRef.current) {
          videoRef.current.currentTime = clipPosition;
          console.log(`▶️ [Timeline] Resuming at position ${clipPosition.toFixed(2)}s`);
          videoRef.current.play().catch(error => {
            if (error.name !== 'AbortError') {
              console.warn('Error resuming video playback:', error);
            }
          });
        }
      } else {
        // Load new video or initial start
        if (videoRef.current) {
          console.log(`▶️ [Timeline] Setting up initial video: ${currentInterval.clip.name}`);
          
          // Set video source
          setVideoSrc(currentInterval.videoUrl);
          videoRef.current.src = currentInterval.videoUrl;
          videoRef.current.load();
          
          // Wait for video to be ready then start playback
          const handleCanPlay = () => {
            if (videoRef.current) {
              videoRef.current.removeEventListener('canplay', handleCanPlay);
              
              // Set position within the clip
              const clipPosition = currentTime - currentInterval.start;
              videoRef.current.currentTime = clipPosition;
              
              console.log(`▶️ [Timeline] Starting playback at position ${clipPosition.toFixed(2)}s`);
              videoRef.current.play().catch(error => {
                if (error.name !== 'AbortError') {
                  console.warn('Error starting video playback:', error);
                }
              });
            }
          };
          
          videoRef.current.addEventListener('canplay', handleCanPlay);
        }
      }

      setPlaybackState({
        isPlaying: true,
        startTime: Date.now(),
        timelineStartPosition: currentTime,
        currentInterval
      });
    } else {
      // Find next interval
      const nextInterval = intervals.find(interval => interval.start > currentTime);
      if (nextInterval) {
        console.log(`▶️ [Timeline] Jumping to next interval: ${nextInterval.clip.name}`);
        setCurrentTime(nextInterval.start);
        // Restart after state update
        setTimeout(() => startPlayback(), 50);
      }
    }
  }, [currentTime, findIntervalAtTime, intervals, videoRef, playbackState.isPlaying, playbackState.currentInterval, setVideoSrc]);

  // Stop timeline playback
  const stopPlayback = useCallback(() => {
    console.log(`⏸️ [Timeline] Stopping playback at timeline position: ${currentTime.toFixed(2)}s`);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }

    // Preserve current interval when pausing - DON'T reset it
    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false
      // Keep currentInterval so we resume from the right video
    }));
  }, [videoRef, currentTime]);

  // Toggle playback
  const togglePlayback = useCallback(() => {
    if (playbackState.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [playbackState.isPlaying, stopPlayback, startPlayback]);

  // Timeline update loop using requestAnimationFrame
  useEffect(() => {
    if (!playbackState.isPlaying) return;

    const updateTimeline = () => {
      const elapsed = (Date.now() - playbackState.startTime) / 1000;
      const newTimelineTime = playbackState.timelineStartPosition + elapsed;

      // Update timeline cursor smoothly
      setCurrentTime(newTimelineTime);

      // Check if we've reached the end
      if (newTimelineTime >= duration) {
        console.log(`🏁 [Timeline] Reached end at ${newTimelineTime.toFixed(2)}s`);
        stopPlayback();
        return;
      }

      // Find the current interval
      const currentInterval = findIntervalAtTime(newTimelineTime);

      if (currentInterval) {
                 // Check if we need to switch intervals
         if (!playbackState.currentInterval || currentInterval.clip.id !== playbackState.currentInterval.clip.id) {
           console.log(`🔄 [Timeline] Switching to interval: ${currentInterval.clip.name} at ${newTimelineTime.toFixed(2)}s`);
           console.log(`🔄 [Timeline] Previous interval:`, playbackState.currentInterval ? playbackState.currentInterval.clip.name : 'None');
           console.log(`🔄 [Timeline] New interval:`, currentInterval.clip.name);
           console.log(`🔄 [Timeline] Video src will change from:`, videoRef.current?.src);
           console.log(`🔄 [Timeline] Video src will change to:`, currentInterval.videoUrl);
           
           // Switch video immediately and synchronously
           if (currentInterval.videoUrl && videoRef.current) {
             // At clip boundary - detailed logging
             const previousClipName = playbackState.currentInterval?.clip.name || 'None';
             console.log(`🔄 Switching from ${previousClipName} to ${currentInterval.clip.name} at ${newTimelineTime.toFixed(2)}s`);
             
             // Update state immediately to prevent interference
             setPlaybackState(prev => ({
               ...prev,
               currentInterval
             }));
             
             // Update store video source for reactive components
             setVideoSrc(currentInterval.videoUrl);
             
             // Calculate position within the new clip
             const clipPosition = newTimelineTime - currentInterval.start;
             
             // 1. Set new source immediately
             console.log(`🔄 [Step 1] Setting new source immediately: ${currentInterval.videoUrl.split('/').pop()?.split('?')[0]}`);
             videoRef.current.src = currentInterval.videoUrl;
             
             // 2. Load the new video
             console.log(`🔄 [Step 2] Loading new video with load()`);
             videoRef.current.load();
             
             // 3. Set position immediately (will be approximate until video loads)
             console.log(`🔄 [Step 3] Setting position to ${clipPosition.toFixed(2)}s immediately`);
             videoRef.current.currentTime = clipPosition;
             
             // 4. Ensure consistent playback rate before attempting to play
             console.log(`🔄 [Step 4] Setting playback rate to 1.0 before attempting play`);
             videoRef.current.playbackRate = 1.0;
             
             // 5. Try to play immediately (may fail until loaded, that's OK)
             console.log(`🔄 [Step 5] Attempting to resume playback immediately`);
             videoRef.current.play().catch(error => {
               // This is expected to fail initially, we'll retry when loaded
               console.log(`🔄 [Info] Initial play failed (expected): ${error.name}`);
             });
             
             // 6. Set up load handlers for when video is actually ready
             const handleLoadSuccess = () => {
               if (videoRef.current && playbackState.isPlaying) {
                 videoRef.current.removeEventListener('loadeddata', handleLoadSuccess);
                 videoRef.current.removeEventListener('canplay', handleLoadSuccess);
                 
                 // Re-sync position and ensure playback continues
                 const currentTimelineTime = playbackState.timelineStartPosition + (Date.now() - playbackState.startTime) / 1000;
                 const updatedClipPosition = currentTimelineTime - currentInterval.start;
                 
                 console.log(`🔄 [Step 6] Video loaded, re-syncing position to ${updatedClipPosition.toFixed(2)}s`);
                 videoRef.current.currentTime = updatedClipPosition;
                 
                 // Ensure playback rate is correct after loading
                 videoRef.current.playbackRate = 1.0;
                 
                 videoRef.current.play().catch(error => {
                   if (error.name !== 'AbortError') {
                     console.warn('Error playing loaded video:', error);
                   }
                 });
                 
                 console.log(`✅ Successfully loaded and synced ${currentInterval.clip.name}`);
               }
             };
             
             videoRef.current.addEventListener('loadeddata', handleLoadSuccess);
             videoRef.current.addEventListener('canplay', handleLoadSuccess);
             
             console.log(`✅ Initiated switch to ${currentInterval.clip.name} (loading in background)`);
           } else {
             console.error(`🔄 [Timeline] Cannot switch - missing videoUrl or videoRef`, {
               hasUrl: !!currentInterval.videoUrl,
               hasVideoRef: !!videoRef.current
             });
           }
                  } else {
           // Same interval, sync video position and ensure correct playback rate
           const clipPosition = newTimelineTime - currentInterval.start;
           if (videoRef.current) {
             const video = videoRef.current;
             const drift = Math.abs(video.currentTime - clipPosition);
             
             // Ensure playback rate is always correct during sync
             if (video.playbackRate !== 1.0) {
               console.log(`🔄 [Timeline] Correcting playback rate from ${video.playbackRate} to 1.0 during sync`);
               video.playbackRate = 1.0;
             }
             
             if (drift > 2.0) { // Much higher threshold to avoid excessive sync corrections
               console.log(`🔄 [Timeline] Syncing video position - drift: ${drift.toFixed(3)}s (playback rate: ${video.playbackRate})`);
               console.log(`🔄 [Debug] Sync details:`, {
                 timelineTime: newTimelineTime.toFixed(3),
                 currentInterval: currentInterval.clip.name,
                 intervalStart: currentInterval.start.toFixed(3),
                 expectedPosition: clipPosition.toFixed(3),
                 actualVideoTime: video.currentTime.toFixed(3),
                 playbackRate: video.playbackRate,
                 videoSrc: video.src.split('/').pop()?.split('?')[0]
               });
               video.currentTime = clipPosition;
             }
           }
         }
      } else {
        // No interval (gap), pause video but continue timeline
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        
        if (playbackState.currentInterval) {
          setPlaybackState(prev => ({
            ...prev,
            currentInterval: undefined
          }));
        }
      }

      // Schedule next update
      animationFrameRef.current = requestAnimationFrame(updateTimeline);
    };

    animationFrameRef.current = requestAnimationFrame(updateTimeline);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    playbackState.isPlaying,
    playbackState.startTime,
    playbackState.timelineStartPosition,
    playbackState.currentInterval,
    findIntervalAtTime,
    stopPlayback,
    duration,
    videoRef,
    setVideoSrc
  ]);

  // Rebuild intervals when clips change
  useEffect(() => {
    buildIntervals().catch(error => {
      console.error('🌳 [IntervalTree] Error building intervals:', error);
    });
  }, [buildIntervals]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      loadingPromises.current.clear();
    };
  }, []);

  // Debug function to log current interval tree state
  const debugIntervals = useCallback(() => {
    console.log('🐛 [IntervalTree] Current state:');
    console.log('🐛 [IntervalTree] Total intervals:', intervals.length);
    intervals.forEach((interval, index) => {
      console.log(`🐛 [IntervalTree] ${index}: ${interval.clip.name} (${interval.start}s-${interval.end}s) URL:${interval.videoUrl ? '✅' : '❌'} Loaded:${interval.loaded ? '✅' : '❌'}`);
    });
  }, [intervals]);

  return {
    isPlaying: playbackState.isPlaying,
    currentInterval: playbackState.currentInterval,
    intervals,
    togglePlayback,
    stopPlayback,
    startPlayback,
    debugIntervals
  };
}; 