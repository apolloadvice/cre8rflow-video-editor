import { useState, useRef, useEffect, forwardRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Download, Settings, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import UndoIcon from "@/components/icons/UndoIcon";
import RedoIcon from "@/components/icons/RedoIcon";
import { useEditorStore } from "@/store/editorStore";
import { useTimelinePlayer } from "@/hooks/useTimelinePlayer";
import { useSeamlessTimelinePlayer } from "@/hooks/useSeamlessTimelinePlayer";
import { useGESPlayer } from "@/hooks/useGESPlayer";

interface VideoPlayerProps {
  src?: string;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  className?: string;
  rightControl?: React.ReactNode;
  clips?: any[]; // Timeline clips for reference
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
  src,
  currentTime,
  onTimeUpdate,
  onDurationChange,
  className,
  rightControl,
  clips = [],
}, ref) => {
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [useGESMode, setUseGESMode] = useState(true); // Default to GES mode
  const [useSeamlessMode, setUseSeamlessMode] = useState(true); // Enable seamless mode
  const controlsTimeoutRef = useRef<number | null>(null);
  const lastToggleRef = useRef<number | null>(null);
  
  // Get undo/redo functions from store
  const { undo, redo, history } = useEditorStore();
  
  // Legacy single video element (for fallback)
  const singleVideoRef = useRef<HTMLVideoElement>(null);
  
  // Traditional timeline player system (legacy)
  const {
    isPlaying: isTimelinePlaying,
    currentClip,
    timelineClips: legacyTimelineClips,
    togglePlayback: toggleTimelinePlayback,
    stopPlayback: stopTimelinePlayback,
    startPlayback: startTimelinePlayback,
    isReady: timelineReady
  } = useTimelinePlayer(singleVideoRef);

  // New seamless timeline player system
  const {
    isPlaying: isSeamlessPlaying,
    currentClip: seamlessCurrentClip,
    timelineClips: seamlessTimelineClips,
    togglePlayback: toggleSeamlessPlayback,
    startPlayback: startSeamlessPlayback,
    stopPlayback: stopSeamlessPlayback,
    seekToTime: seekSeamlessToTime,
    isReady: seamlessReady
  } = useSeamlessTimelinePlayer(videoContainerRef);

  // GES player system
  const {
    isReady: gesReady,
    isPlaying: gesIsPlaying,
    isLoading: gesIsLoading,
    hasTimeline: gesHasTimeline,
    error: gesError,
    togglePlayback: toggleGESPlayback,
    seekToPosition: gesSeekToPosition,
    isGESAvailable
  } = useGESPlayer();

  // Determine which player system to use
  const activePlayerType = useGESMode ? 'ges' : (useSeamlessMode ? 'seamless' : 'timeline');
  const activeIsPlaying = useGESMode ? gesIsPlaying : (useSeamlessMode ? isSeamlessPlaying : isTimelinePlaying);
  const activeIsReady = useGESMode ? gesReady : (useSeamlessMode ? seamlessReady : timelineReady);
  const activeTogglePlayback = useGESMode ? toggleGESPlayback : (useSeamlessMode ? toggleSeamlessPlayback : toggleTimelinePlayback);
  const activeTimelineClips = useSeamlessMode ? seamlessTimelineClips : legacyTimelineClips;
  const activeCurrentClip = useSeamlessMode ? seamlessCurrentClip : currentClip;

  // Update video currentTime when prop changes (only for legacy timeline mode)
  useEffect(() => {
    if (useGESMode || useSeamlessMode) return; // GES and seamless modes handle their own seeking
    if (isTimelinePlaying) return; // Don't sync during timeline playback to prevent loops
    
    const video = singleVideoRef.current;
    if (video && Math.abs(video.currentTime - currentTime) > 0.5) {
      const currentClipAtTime = legacyTimelineClips.find(clip => 
        currentTime >= clip.start && currentTime < clip.end
      );
      
      if (currentClipAtTime && currentClipAtTime.signedUrl) {
        const clipPosition = currentTime - currentClipAtTime.start;
        if (video.src !== currentClipAtTime.signedUrl) {
          video.src = currentClipAtTime.signedUrl;
          video.load();
          video.currentTime = clipPosition;
        } else {
          video.currentTime = clipPosition;
        }
      }
    }
  }, [isTimelinePlaying, legacyTimelineClips.length, useGESMode, useSeamlessMode, currentTime]);

  // Handle seeking for different modes
  const handleSeek = async (position: number) => {
    if (useGESMode && gesSeekToPosition) {
      await gesSeekToPosition(position);
    } else if (useSeamlessMode && seekSeamlessToTime) {
      seekSeamlessToTime(position);
    } else {
      // Traditional timeline seeking
      onTimeUpdate(position);
    }
  };

  // Toggle play/pause
  const togglePlayPause = async () => {
    console.log(`🎮 [VideoPlayer] Toggle playback (${activePlayerType} mode) - clips: ${activeTimelineClips.length}`);
    
    if (useGESMode) {
      // Hybrid approach: GES manages timeline progression, seamless player handles video display
      if (activeTimelineClips.length > 0) {
        if (gesIsPlaying) {
          console.log(`🎮 [VideoPlayer] Stopping hybrid playback - GES and seamless video`);
          await toggleGESPlayback();
          if (useSeamlessMode) {
            stopSeamlessPlayback();
          } else {
            stopTimelinePlayback();
          }
        } else {
          console.log(`🎮 [VideoPlayer] Starting hybrid playback - GES timeline sync + seamless video`);
          await toggleGESPlayback();
          
          if (activeTimelineClips.length > 0) {
            if (useSeamlessMode) {
              startSeamlessPlayback();
            } else {
              startTimelinePlayback();
            }
          }
        }
      } else {
        await toggleGESPlayback();
      }
    } else if (useSeamlessMode) {
      // Pure seamless mode
      if (activeTimelineClips.length > 0) {
        toggleSeamlessPlayback();
      } else {
        console.log('🎮 [VideoPlayer] No clips available for seamless playback');
      }
    } else {
      // Traditional timeline mode
      if (activeTimelineClips.length > 0) {
        toggleTimelinePlayback();
      } else {
        // Fallback to regular video playback if no timeline clips
        const video = singleVideoRef.current;
        if (!video) return;
        
        if (isPlaying) {
          video.pause();
          setIsPlaying(false);
        } else {
          video.play().catch(error => {
            if (error.name !== 'AbortError') {
              console.warn('Error playing video:', error);
            }
          });
          setIsPlaying(true);
        }
      }
    }
  }

  // Toggle seamless mode
  const toggleSeamlessMode = useCallback(() => {
    console.log(`🎮 [VideoPlayer] Toggling seamless mode: ${useSeamlessMode ? 'OFF' : 'ON'}`);
    
    // Stop current playback before switching
    if (activeIsPlaying) {
      if (useSeamlessMode) {
        stopSeamlessPlayback();
      } else {
        stopTimelinePlayback();
      }
    }
    
    setUseSeamlessMode(!useSeamlessMode);
  }, [useSeamlessMode, activeIsPlaying, stopSeamlessPlayback, stopTimelinePlayback]);

  // Toggle between GES and Timeline modes with debouncing
  const togglePlayerMode = useCallback(() => {
    // Debounce to prevent rapid switching
    const now = Date.now();
    if (lastToggleRef.current && now - lastToggleRef.current < 500) {
      return;
    }
    lastToggleRef.current = now;
    
    console.log(`🎮 [VideoPlayer] Switching from ${activePlayerType} to ${useGESMode ? 'timeline' : 'ges'} mode`);
    
    // Stop any current playback before switching
    if (activeIsPlaying) {
      if (useGESMode) {
        toggleGESPlayback();
      } else if (useSeamlessMode) {
        stopSeamlessPlayback();
      } else {
        stopTimelinePlayback();
      }
    }
    
    setUseGESMode(!useGESMode);
  }, [activePlayerType, useGESMode, activeIsPlaying, toggleGESPlayback, stopSeamlessPlayback, stopTimelinePlayback]);

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    
    // Apply mute to both video systems
    if (singleVideoRef.current) {
      singleVideoRef.current.muted = !isMuted;
    }
    
    // Apply mute to seamless video elements
    if (videoContainerRef.current) {
      const videos = videoContainerRef.current.querySelectorAll('video');
      videos.forEach(video => {
        video.muted = !isMuted;
      });
    }
  };

  // Handle volume change
  const handleVolumeChange = (values: number[]) => {
    const newVolume = values[0];
    setVolume(newVolume);
    
    // Apply volume to both video systems
    if (singleVideoRef.current) {
      singleVideoRef.current.volume = newVolume;
    }
    
    // Apply volume to seamless video elements
    if (videoContainerRef.current) {
      const videos = videoContainerRef.current.querySelectorAll('video');
      videos.forEach(video => {
        video.volume = newVolume;
      });
    }
    
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  // Show controls
  const showControls = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      setIsControlsVisible(false);
    }, 3000);
  };

  // Setup video event listeners (only for legacy timeline mode)
  useEffect(() => {
    if (useGESMode || useSeamlessMode) return; // GES and seamless modes don't need single video listeners
    
    const video = singleVideoRef.current;
    if (!video) return;

    // Configure video for optimal playback
    video.preload = 'metadata';
    
    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime);
    };

    const handleDurationChange = () => {
      onDurationChange(video.duration || 0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      if (isTimelinePlaying) {
        stopTimelinePlayback();
      }
    };

    const handleLoadedMetadata = () => {
      console.log('🎥 [VideoPlayer] Video metadata loaded:', {
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        playbackRate: video.playbackRate
      });
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    showControls();

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [onTimeUpdate, onDurationChange, isTimelinePlaying, stopTimelinePlayback, useGESMode, useSeamlessMode]);

  // Player status display
  const getPlayerStatus = () => {
    if (useGESMode) {
      if (gesIsLoading) return "Loading timeline...";
      if (gesError) return "Timeline Error - Check console";
      if (!gesHasTimeline && clips && clips.length > 0) return "Building timeline...";
      if (!gesHasTimeline) return "Add clips to timeline";
      if (gesIsPlaying) return "Playing";
      return "Ready to play";
    } else if (useSeamlessMode) {
      if (!seamlessReady) return "Loading seamless player...";
      if (seamlessTimelineClips.length === 0) return "Add clips to begin";
      if (isSeamlessPlaying) {
        if (seamlessCurrentClip) {
          return `Playing: ${seamlessCurrentClip.name} (Seamless)`;
        }
        return "Playing (Seamless)";
      }
      return `${seamlessTimelineClips.length} clips ready (Seamless)`;
    } else {
      if (!timelineReady) return "Loading...";
      if (legacyTimelineClips.length === 0) return "Add clips to begin";
      if (isTimelinePlaying) {
        if (currentClip) {
          return `Playing: ${currentClip.name} (Legacy)`;
        }
        return "Playing (Legacy)";
      }
      return `${legacyTimelineClips.length} clips ready (Legacy)`;
    }
  };

  return (
    <div 
      className={cn("relative bg-black flex flex-col", className)}
      onMouseMove={showControls}
      onMouseEnter={showControls}
    >
      {/* Video Display Container */}
      <div className="relative w-full h-full">
        {/* Seamless Video Container - Contains dual video elements */}
        <div 
          ref={videoContainerRef}
          className={cn(
            "absolute inset-0 w-full h-full",
            (useSeamlessMode && !useGESMode) || (useGESMode && useSeamlessMode) ? "block" : "hidden"
          )}
          onClick={togglePlayPause}
        />
        
        {/* Legacy Single Video Element - Hidden when using seamless mode */}
        <video
          ref={singleVideoRef}
          src={src}
          className={cn(
            "w-full h-full object-contain",
            useSeamlessMode ? "hidden" : "block"
          )}
          onClick={togglePlayPause}
        />
        
        {/* GES Status Overlay - Only show when needed */}
        {useGESMode && (gesIsLoading || gesError || (!gesHasTimeline && clips && clips.length === 0)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 text-white">
            <div className="text-center">
              <div className="text-xl mb-4 flex items-center justify-center">
                <div className="w-8 h-8 mr-3 flex-shrink-0">
                  {gesIsLoading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  ) : gesError ? (
                    <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                      <Settings className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center">
                      <Settings className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                Video Timeline
              </div>
              
              <div className="text-sm text-gray-400 mb-2">{getPlayerStatus()}</div>
              
              {gesError && (
                <div className="text-red-400 text-xs mt-4 max-w-md bg-red-900/20 p-3 rounded border border-red-500/30">
                  <div className="font-semibold mb-1">Error:</div>
                  {gesError}
                </div>
              )}
              
              {!gesHasTimeline && !gesIsLoading && !gesError && (
                <div className="text-xs text-gray-500 mt-4 max-w-md">
                  Drag and drop video clips to the timeline to begin editing
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300",
          isControlsVisible ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Main Controls Row */}
        <div className="flex items-center gap-3 mb-2">
          {/* Play/Pause Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlayPause}
            disabled={useGESMode && gesIsLoading}
            className="text-white hover:bg-white/20"
          >
            {activeIsPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          {/* Seamless Mode Toggle */}
          {!useGESMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSeamlessMode}
              className={cn(
                "text-white hover:bg-white/20",
                useSeamlessMode ? "bg-green-500/20 border border-green-500/50" : "bg-gray-500/20"
              )}
              title={useSeamlessMode ? "Seamless Mode ON" : "Seamless Mode OFF"}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}

          {/* Volume Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="text-white hover:bg-white/20"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={1}
              step={0.1}
              onValueChange={handleVolumeChange}
              className="w-20"
            />
          </div>

          {/* Status Display */}
          <div className="flex-1 text-center">
            <span className="text-white text-xs opacity-75">
              {getPlayerStatus()}
            </span>
          </div>

          {/* Undo/Redo Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={history.past.length === 0}
              className="text-white hover:bg-white/20"
              title="Undo"
            >
              <UndoIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={redo}
              disabled={history.future.length === 0}
              className="text-white hover:bg-white/20"
              title="Redo"
            >
              <RedoIcon className="h-4 w-4" />
            </Button>
          </div>

          {/* Right Control Slot */}
          {rightControl}
        </div>

        {/* Timestamp Display */}
        <div className="flex justify-end">
          <span className="text-white text-xs font-mono">
            {String(Math.floor(currentTime / 3600)).padStart(2, '0')}:
            {String(Math.floor((currentTime % 3600) / 60)).padStart(2, '0')}:
            {String(Math.floor(currentTime % 60)).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
