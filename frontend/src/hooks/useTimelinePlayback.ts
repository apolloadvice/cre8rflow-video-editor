import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { supabase } from '@/integrations/supabase/client';

interface TimelinePlaybackState {
  isPlaying: boolean;
  currentClipId: string | null;
  playbackStartTime: number;
  timelineStartTime: number;
}

export const useTimelinePlayback = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const {
    currentTime,
    duration,
    setCurrentTime,
    clips,
    setVideoSrc,
    getAssetById
  } = useEditorStore();

  const [playbackState, setPlaybackState] = useState<TimelinePlaybackState>({
    isPlaying: false,
    currentClipId: null,
    playbackStartTime: 0,
    timelineStartTime: 0
  });

  // Debug state changes
  useEffect(() => {
    console.log(`🔄 [State] Playback state changed:`, {
      isPlaying: playbackState.isPlaying,
      currentClipId: playbackState.currentClipId,
      playbackStartTime: playbackState.playbackStartTime,
      timelineStartTime: playbackState.timelineStartTime
    });
  }, [playbackState]);

  const intervalRef = useRef<NodeJS.Timeout>();
  const startTimeRef = useRef<number>(0);

  // Find the clip that should be playing at a given timeline time
  const findClipAtTime = useCallback((timelineTime: number) => {
    const matchingClips = clips.filter(clip => 
      timelineTime >= clip.start && 
      timelineTime < clip.end &&
      clip.type === 'video' // Only consider video clips for playback
    );
    
    return matchingClips[0] || null;
  }, [clips]);

  // Get the next video clip after the current time
  const getNextClip = useCallback((timelineTime: number) => {
    const videoClips = clips
      .filter(clip => clip.type === 'video' && clip.start > timelineTime)
      .sort((a, b) => a.start - b.start);
    return videoClips[0] || null;
  }, [clips]);

  // Load a video clip for playback
  const loadClip = useCallback(async (clip: any) => {
    console.log(`📁 [LoadClip] Starting load for: ${clip.name}`);
    console.log(`📁 [LoadClip] Clip details:`, { id: clip.id, file_path: clip.file_path, start: clip.start, end: clip.end });
    
    let videoUrl = null;
    let assetFilePath = clip.file_path;

    // Try to get asset info if we have a clip name that matches an asset
    if (!assetFilePath && clip.name && getAssetById) {
      console.log(`📁 [LoadClip] No file_path, searching for asset by name: ${clip.name}`);
      // Look for an asset with matching name
      const matchingAsset = useEditorStore.getState().assets.find(asset => 
        asset.name === clip.name || asset.file_path.includes(clip.name)
      );
      if (matchingAsset) {
        assetFilePath = matchingAsset.file_path;
        console.log(`📁 [LoadClip] Found matching asset:`, { name: matchingAsset.name, file_path: matchingAsset.file_path });
      } else {
        console.log(`📁 [LoadClip] No matching asset found for: ${clip.name}`);
      }
    }

    if (assetFilePath) {
      console.log(`📁 [LoadClip] Creating signed URL for: ${assetFilePath}`);
      try {
        const { data: urlData, error } = await supabase.storage
          .from('assets')
          .createSignedUrl(assetFilePath, 3600);
        
        if (!error && urlData?.signedUrl) {
          videoUrl = urlData.signedUrl;
          console.log(`📁 [LoadClip] ✅ Got signed URL: ${videoUrl.substring(0, 80)}...`);
        } else {
          console.log(`📁 [LoadClip] ❌ Failed to get signed URL:`, error);
        }
      } catch (e) {
        console.error('📁 [LoadClip] Error creating signed URL for timeline playback:', e);
      }
    } else {
      console.log(`📁 [LoadClip] ❌ No asset file path available`);
    }

    if (videoUrl && videoRef.current) {
      console.log(`📁 [LoadClip] Loading video into element...`);
      return new Promise<boolean>((resolve) => {
        const video = videoRef.current;
        if (!video) {
          console.log(`📁 [LoadClip] ❌ No video ref available`);
          resolve(false);
          return;
        }

        console.log(`📁 [LoadClip] Video element before load:`, {
          src: video.src ? video.src.substring(0, 50) + '...' : 'None',
          readyState: video.readyState,
          currentTime: video.currentTime.toFixed(2)
        });

        const handleLoadedData = () => {
          console.log(`📁 [LoadClip] ✅ Video loadeddata event fired`);
          console.log(`📁 [LoadClip] Video after load:`, {
            duration: video.duration.toFixed(2),
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          });
          video.removeEventListener('loadeddata', handleLoadedData);
          video.removeEventListener('error', handleError);
          resolve(true);
        };

        const handleError = () => {
          console.log(`📁 [LoadClip] ❌ Video error event fired:`, video.error);
          video.removeEventListener('error', handleError);
          video.removeEventListener('loadeddata', handleLoadedData);
          resolve(false);
        };

        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('error', handleError);
        
        console.log(`📁 [LoadClip] Setting video src and calling load()...`);
        setVideoSrc(videoUrl);
        video.src = videoUrl;
        video.load();
      });
    }

    console.log(`📁 [LoadClip] ❌ Cannot load - no video URL or video ref`);
    return false;
  }, [getAssetById, setVideoSrc, videoRef]);

  // Start timeline playback
  const startTimelinePlayback = useCallback(async () => {
    if (playbackState.isPlaying) return;

    console.log(`🎬 [Timeline] Starting playback at time ${currentTime}s`);
    console.log(`🎬 [Timeline] Available clips:`, clips.map(c => ({ 
      id: c.id, 
      name: c.name, 
      start: c.start, 
      end: c.end, 
      type: c.type,
      file_path: c.file_path 
    })));

    const currentClip = findClipAtTime(currentTime);
    console.log(`🎬 [Timeline] Found clip at current time:`, currentClip);
    
    if (currentClip) {
      // Load the current clip
      console.log(`🎬 [Timeline] Loading clip: ${currentClip.name}`);
      const loaded = await loadClip(currentClip);
      console.log(`🎬 [Timeline] Clip loaded successfully:`, loaded);
      if (!loaded) return;

      // Calculate the position within the clip
      const clipStartTime = currentTime - currentClip.start;
      
      if (videoRef.current) {
        videoRef.current.currentTime = clipStartTime;
        try {
          await videoRef.current.play();
        } catch (error) {
          // Ignore AbortError which happens when play is interrupted by a new load
          if (error.name !== 'AbortError') {
            console.warn('Error playing video:', error);
          }
        }
      }

      setPlaybackState({
        isPlaying: true,
        currentClipId: currentClip.id,
        playbackStartTime: Date.now(),
        timelineStartTime: currentTime
      });

      startTimeRef.current = Date.now();
    } else {
      // No clip at current time, find the next clip
      const nextClip = getNextClip(currentTime);
      console.log(`🎬 [Timeline] No clip at current time, next clip:`, nextClip);
      if (nextClip) {
        // Jump to the start of the next clip
        setCurrentTime(nextClip.start);
        setTimeout(() => startTimelinePlayback(), 100);
      }
    }
  }, [currentTime, findClipAtTime, loadClip, getNextClip, setCurrentTime, playbackState.isPlaying, videoRef, clips]);

  // Stop timeline playback
  const stopTimelinePlayback = useCallback(() => {
    console.log('🛑 [Timeline] Stopping timeline playback');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }

    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false
    }));
  }, [videoRef]);

  // Toggle timeline playback
  const toggleTimelinePlayback = useCallback(() => {
    if (playbackState.isPlaying) {
      stopTimelinePlayback();
    } else {
      startTimelinePlayback();
    }
  }, [playbackState.isPlaying, stopTimelinePlayback, startTimelinePlayback]);

  // Timeline playback update loop
  useEffect(() => {
    console.log(`⏰ [Interval] Effect triggered - isPlaying: ${playbackState.isPlaying}`);
    
    if (!playbackState.isPlaying) {
      console.log(`⏰ [Interval] Not playing, clearing interval if exists`);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
        console.log(`⏰ [Interval] Cleared existing interval`);
      }
      return;
    }

    console.log(`⏰ [Interval] Starting new interval for timeline playback`);
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - playbackState.playbackStartTime) / 1000;
      const newTimelineTime = playbackState.timelineStartTime + elapsed;

      // Always update the timeline cursor first
      setCurrentTime(Math.min(newTimelineTime, duration));

      // Check if we've reached the end of the timeline
      if (newTimelineTime >= duration) {
        console.log(`🎬 [Timeline] Reached end of timeline at ${newTimelineTime.toFixed(2)}s (duration: ${duration.toFixed(2)}s)`);
        stopTimelinePlayback();
        return;
      }

      // Find the clip that should be playing at the current timeline time
      const currentClip = findClipAtTime(newTimelineTime);
      
      console.log(`🔍 [Timeline] Frame update at ${newTimelineTime.toFixed(2)}s:`);
      console.log(`🔍 [Timeline] Current clip:`, currentClip ? { id: currentClip.id, name: currentClip.name, start: currentClip.start, end: currentClip.end } : 'None');
      console.log(`🔍 [Timeline] Playback state currentClipId:`, playbackState.currentClipId);
      console.log(`🔍 [Timeline] Video element:`, videoRef.current ? { 
        src: videoRef.current.src ? videoRef.current.src.substring(0, 50) + '...' : 'None',
        currentTime: videoRef.current.currentTime.toFixed(2),
        readyState: videoRef.current.readyState,
        paused: videoRef.current.paused
      } : 'None');
      
      if (currentClip) {
        // We're in a clip
        const clipPosition = newTimelineTime - currentClip.start;
        console.log(`🔍 [Timeline] Should be at position ${clipPosition.toFixed(2)}s within clip`);
        
        if (currentClip.id !== playbackState.currentClipId) {
          // We've entered a new clip - load it
          console.log(`🎬 [Timeline] Switching to clip: ${currentClip.name} at ${newTimelineTime.toFixed(2)}s`);
          console.log(`🎬 [Timeline] Previous clip ID: ${playbackState.currentClipId} → New clip ID: ${currentClip.id}`);
          
          loadClip(currentClip).then((loaded) => {
            console.log(`🎬 [Timeline] Clip load result for ${currentClip.name}:`, loaded);
            if (loaded && videoRef.current) {
              // Calculate position within the clip
              const updatedClipPosition = newTimelineTime - currentClip.start;
              console.log(`🎬 [Timeline] Setting video time to ${updatedClipPosition.toFixed(2)}s within clip`);
              console.log(`🎬 [Timeline] Video before time set:`, {
                currentTime: videoRef.current.currentTime.toFixed(2),
                readyState: videoRef.current.readyState,
                src: videoRef.current.src ? videoRef.current.src.substring(0, 50) + '...' : 'None'
              });
              
              videoRef.current.currentTime = Math.max(0, updatedClipPosition);
              
              videoRef.current.play().catch((error) => {
                // Ignore AbortError which happens when play is interrupted by a new load
                if (error.name !== 'AbortError') {
                  console.warn('Error playing video:', error);
                }
              });
              
              console.log(`🎬 [Timeline] Video after time set:`, {
                currentTime: videoRef.current.currentTime.toFixed(2),
                readyState: videoRef.current.readyState
              });
              
              // Update the current clip ID without resetting timeline progression
              console.log(`🎬 [Timeline] Updating playback state from ${playbackState.currentClipId} to ${currentClip.id}`);
              setPlaybackState(prev => ({
                ...prev,
                currentClipId: currentClip.id
              }));
            } else {
              console.warn(`🎬 [Timeline] Failed to load or no video ref for clip: ${currentClip.name}`);
            }
          }).catch((error) => {
            console.warn(`🎬 [Timeline] Failed to load clip: ${currentClip.name}`, error);
          });
        } else {
          // We're still in the same clip - sync video position
          console.log(`🔄 [Timeline] Staying in same clip, syncing position`);
          if (videoRef.current) {
            const videoDrift = Math.abs(videoRef.current.currentTime - clipPosition);
            console.log(`🔄 [Timeline] Video drift: ${videoDrift.toFixed(2)}s (video: ${videoRef.current.currentTime.toFixed(2)}s, expected: ${clipPosition.toFixed(2)}s)`);
            
            if (videoDrift > 0.5) {
              console.log(`🔄 [Timeline] Correcting video position from ${videoRef.current.currentTime.toFixed(2)}s to ${clipPosition.toFixed(2)}s`);
              videoRef.current.currentTime = Math.max(0, clipPosition);
            }
          }
        }
      } else {
        // We're not in any clip (gap between clips)
        // Pause the video but continue timeline progression
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
        
        // Update state to indicate no current clip
        if (playbackState.currentClipId !== null) {
          setPlaybackState(prev => ({
            ...prev,
            currentClipId: null
          }));
        }
      }
    }, 50); // Update every 50ms for smoother playback

    return () => {
      console.log(`⏰ [Interval] Main effect cleanup called`);
      if (intervalRef.current) {
        console.log(`⏰ [Interval] Clearing interval in main cleanup`);
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [
    playbackState.isPlaying,
    playbackState.currentClipId,
    playbackState.playbackStartTime,
    playbackState.timelineStartTime,
    findClipAtTime,
    loadClip,
    setCurrentTime,
    stopTimelinePlayback,
    duration,
    videoRef
  ]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      console.log(`⏰ [Interval] Unmount cleanup called`);
      if (intervalRef.current) {
        console.log(`⏰ [Interval] Clearing interval in unmount cleanup`);
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, []);

  return {
    isTimelinePlaying: playbackState.isPlaying,
    currentPlayingClipId: playbackState.currentClipId,
    toggleTimelinePlayback,
    stopTimelinePlayback
  };
}; 