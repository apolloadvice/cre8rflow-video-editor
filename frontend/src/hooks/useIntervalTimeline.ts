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

  // Load video for an interval (simplified since URLs are preloaded)
  const loadInterval = useCallback(async (interval: TimelineInterval): Promise<boolean> => {
    const clipId = interval.clip.id;
    
    // Check if already loading
    if (loadingPromises.current.has(clipId)) {
      return loadingPromises.current.get(clipId)!;
    }

    console.log(`📼 [VideoLoader] Loading interval: ${interval.clip.name}`);

    const loadPromise = (async () => {
      try {
        // URL should already be preloaded
        if (!interval.videoUrl) {
          console.error(`📼 [VideoLoader] No preloaded URL for ${interval.clip.name}. Interval tree may not be ready.`);
          return false;
        }

        // Load video into element
        if (videoRef.current) {
          return new Promise<boolean>((resolve) => {
            const video = videoRef.current!;

            const handleLoadedData = () => {
              video.removeEventListener('loadeddata', handleLoadedData);
              video.removeEventListener('error', handleError);
              interval.loaded = true;
              console.log(`📼 [VideoLoader] ✅ Loaded ${interval.clip.name}`);
              console.log(`📼 [VideoLoader] Video ready state:`, {
                readyState: video.readyState,
                duration: video.duration,
                src: video.src ? video.src.substring(0, 80) + '...' : 'None'
              });
              resolve(true);
            };

            const handleError = () => {
              video.removeEventListener('loadeddata', handleLoadedData);
              video.removeEventListener('error', handleError);
              console.error(`📼 [VideoLoader] ❌ Failed to load ${interval.clip.name}`);
              resolve(false);
            };

            console.log(`📼 [VideoLoader] Adding event listeners for ${interval.clip.name}`);
            video.addEventListener('loadeddata', handleLoadedData);
            video.addEventListener('error', handleError);

            console.log(`📼 [VideoLoader] Setting video src to: ${interval.videoUrl.substring(0, 80)}...`);
            setVideoSrc(interval.videoUrl);
            video.src = interval.videoUrl;
            
            console.log(`📼 [VideoLoader] Calling video.load() for ${interval.clip.name}`);
            video.load();
            
            console.log(`📼 [VideoLoader] Video element after load() call:`, {
              src: video.src ? video.src.substring(0, 80) + '...' : 'None',
              readyState: video.readyState,
              networkState: video.networkState
            });
          });
        }

        return false;
      } catch (error) {
        console.error(`📼 [VideoLoader] Error loading ${interval.clip.name}:`, error);
        return false;
      } finally {
        loadingPromises.current.delete(clipId);
      }
    })();

    loadingPromises.current.set(clipId, loadPromise);
    return loadPromise;
  }, [videoRef, setVideoSrc]);

  // Start timeline playback
  const startPlayback = useCallback(async () => {
    if (playbackState.isPlaying) return;

    console.log(`▶️ [Timeline] Starting playback at ${currentTime.toFixed(2)}s`);
    
    const currentInterval = findIntervalAtTime(currentTime);
    
    if (currentInterval) {
      console.log(`▶️ [Timeline] Found interval: ${currentInterval.clip.name}`);
      
      // Load the current interval
      const loaded = await loadInterval(currentInterval);
      if (!loaded) {
        console.error(`▶️ [Timeline] Failed to load initial interval`);
        return;
      }

      // Set video position within the clip
      const clipPosition = currentTime - currentInterval.start;
      if (videoRef.current) {
        videoRef.current.currentTime = clipPosition;
        
        try {
          await videoRef.current.play();
        } catch (error) {
          if (error.name !== 'AbortError') {
            console.warn('Error starting video playback:', error);
          }
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
  }, [currentTime, findIntervalAtTime, loadInterval, intervals, videoRef, playbackState.isPlaying]);

  // Stop timeline playback
  const stopPlayback = useCallback(() => {
    console.log(`⏸️ [Timeline] Stopping playback`);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
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

  // Timeline update loop using requestAnimationFrame
  useEffect(() => {
    if (!playbackState.isPlaying) return;

    const updateTimeline = () => {
      const elapsed = (Date.now() - playbackState.startTime) / 1000;
      const newTimelineTime = playbackState.timelineStartPosition + elapsed;

      // Update timeline cursor
      setCurrentTime(Math.min(newTimelineTime, duration));

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
           
           // Update state immediately to prevent duplicate switches
           setPlaybackState(prev => ({
             ...prev,
             currentInterval
           }));
           
           // Load new interval asynchronously
           loadInterval(currentInterval).then(loaded => {
             console.log(`🔄 [Timeline] Load result for ${currentInterval.clip.name}: ${loaded}`);
             if (loaded && videoRef.current) {
               const clipPosition = newTimelineTime - currentInterval.start;
               console.log(`🔄 [Timeline] Setting video position to ${clipPosition.toFixed(2)}s in ${currentInterval.clip.name}`);
               console.log(`🔄 [Timeline] Video element state before position set:`, {
                 src: videoRef.current.src ? videoRef.current.src.substring(0, 80) + '...' : 'None',
                 readyState: videoRef.current.readyState,
                 duration: videoRef.current.duration,
                 currentTime: videoRef.current.currentTime.toFixed(2),
                 paused: videoRef.current.paused
               });
               
               // Wait a bit for the video to be ready
               setTimeout(() => {
                 if (videoRef.current) {
                   videoRef.current.currentTime = clipPosition;
                   videoRef.current.play().catch(error => {
                     if (error.name !== 'AbortError') {
                       console.warn('Error playing video:', error);
                     }
                   });
                   
                   console.log(`🔄 [Timeline] After setting position:`, {
                     currentTime: videoRef.current.currentTime.toFixed(2),
                     paused: videoRef.current.paused
                   });
                 }
               }, 100);
             } else {
               console.warn(`🔄 [Timeline] Failed to load interval or no video ref:`, {
                 loaded,
                 hasVideoRef: !!videoRef.current,
                 intervalName: currentInterval.clip.name
               });
             }
           }).catch(error => {
             console.error(`🔄 [Timeline] Error loading interval ${currentInterval.clip.name}:`, error);
           });
                  } else {
           // Same interval, sync video position
           const clipPosition = newTimelineTime - currentInterval.start;
           if (videoRef.current) {
             const drift = Math.abs(videoRef.current.currentTime - clipPosition);
             if (drift > 0.2) { // Increased threshold to avoid unnecessary seeks
               console.log(`🔄 [Timeline] Syncing video position - drift: ${drift.toFixed(3)}s`);
               videoRef.current.currentTime = clipPosition;
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
    loadInterval,
    setCurrentTime,
    stopPlayback,
    duration,
    videoRef
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