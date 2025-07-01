import { useState, useRef, useEffect, forwardRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Download, Settings, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import UndoIcon from "@/components/icons/UndoIcon";
import RedoIcon from "@/components/icons/RedoIcon";
import { useEditorStore } from "@/store/editorStore";
import { useTimelinePlayer } from "@/hooks/useTimelinePlayer";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [useGESMode, setUseGESMode] = useState(false); // Toggle between timeline and GES modes
  const controlsTimeoutRef = useRef<number | null>(null);
  const lastToggleRef = useRef<number | null>(null);
  
  // Get undo/redo functions from store
  const { undo, redo, history } = useEditorStore();
  
  // Use the forwarded ref or fall back to internal ref
  const resolvedRef = (ref as React.RefObject<HTMLVideoElement>) || videoRef;
  
  // Traditional timeline player system
  const {
    isPlaying: isTimelinePlaying,
    currentClip,
    timelineClips,
    togglePlayback: toggleTimelinePlayback,
    stopPlayback: stopTimelinePlayback,
    startPlayback: startTimelinePlayback,
    isReady: timelineReady
  } = useTimelinePlayer(resolvedRef);

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
  const activePlayer = useGESMode ? 'ges' : 'timeline';
  const activeIsPlaying = useGESMode ? gesIsPlaying : isTimelinePlaying;
  const activeIsReady = useGESMode ? gesReady : timelineReady;
  const activeTogglePlayback = useGESMode ? toggleGESPlayback : toggleTimelinePlayback;

  // Update video currentTime when prop changes (only for timeline mode)
  useEffect(() => {
    if (useGESMode) return; // GES handles its own seeking
    
    const video = resolvedRef.current;
    if (video && !isTimelinePlaying && Math.abs(video.currentTime - currentTime) > 0.5) {
      // Only sync when not playing to avoid interference with timeline playback
      const currentClipAtTime = timelineClips.find(clip => 
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
  }, [currentTime, resolvedRef, isTimelinePlaying, timelineClips, useGESMode]);

  // Handle seeking for GES mode
  const handleSeek = async (position: number) => {
    if (useGESMode && gesSeekToPosition) {
      await gesSeekToPosition(position);
    } else {
      // Traditional timeline seeking is handled by the timeline player
      onTimeUpdate(position);
    }
  };

  // Toggle play/pause
  const togglePlayPause = async () => {
    console.log(`🎮 [VideoPlayer] Toggle playback (${activePlayer} mode)`);
    
    if (useGESMode) {
      await toggleGESPlayback();
    } else {
      if (timelineClips.length > 0) {
        toggleTimelinePlayback();
      } else {
        // Fallback to regular video playback if no timeline clips
        const video = resolvedRef.current;
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
  };

  // Toggle between GES and Timeline modes with debouncing
  const togglePlayerMode = useCallback(() => {
    // Debounce to prevent rapid switching
    const now = Date.now();
    if (lastToggleRef.current && now - lastToggleRef.current < 500) {
      return; // Ignore rapid clicks within 500ms
    }
    lastToggleRef.current = now;
    
    console.log(`🎮 [VideoPlayer] Switching from ${activePlayer} to ${useGESMode ? 'timeline' : 'ges'} mode`);
    
    // Stop any current playback before switching
    if (activeIsPlaying) {
      if (useGESMode) {
        toggleGESPlayback();
      } else {
        stopTimelinePlayback();
      }
    }
    
    setUseGESMode(!useGESMode);
  }, [activePlayer, useGESMode, activeIsPlaying, toggleGESPlayback, stopTimelinePlayback]);

  // Toggle mute
  const toggleMute = () => {
    const video = resolvedRef.current;
    if (!video) return;
    
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Handle volume change
  const handleVolumeChange = (values: number[]) => {
    const newVolume = values[0];
    setVolume(newVolume);
    if (resolvedRef.current) {
      resolvedRef.current.volume = newVolume;
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

  // Setup video event listeners (only for timeline mode)
  useEffect(() => {
    if (useGESMode) return; // GES mode doesn't need video element listeners
    
    const video = resolvedRef.current;
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
      // Stop timeline playback when video ends
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
  }, [resolvedRef, onTimeUpdate, onDurationChange, isTimelinePlaying, stopTimelinePlayback, useGESMode]);

  // Player status display
  const getPlayerStatus = () => {
    if (useGESMode) {
      if (gesIsLoading) return "Creating GES timeline...";
      if (gesError) return "GES Error - Check console for details";
      if (!gesHasTimeline && clips && clips.length > 0) return "Building timeline...";
      if (!gesHasTimeline) return "Ready to build timeline";
      if (gesIsPlaying) return "Playing GES timeline";
      return "GES timeline ready";
    } else {
      if (!timelineReady) return "Loading timeline player...";
      if (timelineClips.length === 0) return "Add clips to begin";
      if (isTimelinePlaying) {
        if (currentClip) {
          return `Playing: ${currentClip.name}`;
        }
        return "Timeline playing";
      }
      return `${timelineClips.length} clips ready`;
    }
  };

  return (
    <div 
      className={cn("relative bg-black flex flex-col", className)}
      onMouseMove={showControls}
      onMouseEnter={showControls}
    >
      {/* Video Element - Hidden in GES mode but may still be used for some operations */}
      <video
        ref={resolvedRef}
        src={src}
        className={cn(
          "w-full h-full object-contain",
          useGESMode && "hidden" // Hide video element in GES mode
        )}
        onClick={togglePlayPause}
      />

      {/* GES Mode Preview */}
      {useGESMode && (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white relative">
          <div className="text-center">
            <div className="text-xl mb-4 flex items-center justify-center">
              <div className="w-8 h-8 mr-3 flex-shrink-0">
                {gesIsLoading ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                ) : gesIsPlaying ? (
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <Play className="h-4 w-4 text-white" />
                  </div>
                ) : gesHasTimeline ? (
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                    <Pause className="h-4 w-4 text-white" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center">
                    <Settings className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
              GStreamer Preview
            </div>
            
            <div className="text-sm text-gray-400 mb-2">{getPlayerStatus()}</div>
            
            {/* Timeline clips count when available */}
            {clips && clips.length > 0 && (
              <div className="text-xs text-gray-500 mb-2">
                {clips.filter(c => c.type === 'video').length} video clips, {clips.filter(c => c.type === 'audio').length} audio clips
              </div>
            )}
            
            {/* GES Status Indicator */}
            <div className="flex items-center justify-center space-x-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${isGESAvailable ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span>{isGESAvailable ? 'GES Available' : 'GES Unavailable'}</span>
            </div>
            
            {gesError && (
              <div className="text-red-400 text-xs mt-4 max-w-md bg-red-900/20 p-3 rounded border border-red-500/30">
                <div className="font-semibold mb-1">Error:</div>
                {gesError}
              </div>
            )}
            
            {/* Help text when no clips or not ready */}
            {!gesHasTimeline && !gesIsLoading && !gesError && (
              <div className="text-xs text-gray-500 mt-4 max-w-md">
                Add video clips to the timeline to enable GES preview mode
              </div>
            )}
          </div>
        </div>
      )}

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

          {/* Player Mode Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlayerMode}
            className="text-white hover:bg-white/20 text-xs"
            title={`Switch to ${useGESMode ? 'Timeline' : 'GES'} mode`}
          >
            {useGESMode ? 'GES' : 'TL'}
          </Button>

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

        {/* Timestamp Display (Timeline mode only) */}
        {!useGESMode && (
          <div className="flex justify-end">
            <span className="text-white text-xs font-mono">
              {String(Math.floor(currentTime / 3600)).padStart(2, '0')}:
              {String(Math.floor((currentTime % 3600) / 60)).padStart(2, '0')}:
              {String(Math.floor(currentTime % 60)).padStart(2, '0')}
            </span>
          </div>
        )}

        {/* GES Mode Info */}
        {useGESMode && (
          <div className="text-center text-white text-xs opacity-75">
            GES Preview Mode - Timeline controlled by GStreamer
          </div>
        )}
      </div>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
