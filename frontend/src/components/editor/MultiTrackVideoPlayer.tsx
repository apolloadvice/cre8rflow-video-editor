/**
 * Multi-Track Video Player Component
 * 
 * Renders multi-track timeline with:
 * - Layer-based video composition on canvas
 * - Audio mixing from multiple tracks
 * - Responsive controls and playback
 * - Integration with multi-track store
 */

import { useState, useRef, useEffect, forwardRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Settings, SkipBack, SkipForward, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMultiTrackStore } from "@/store/multiTrackStore";
import { useMultiTrackPlayer } from "@/hooks/useMultiTrackPlayer";
import { formatTime } from "@/constants/timeline-constants";

interface MultiTrackVideoPlayerProps {
  className?: string;
  showControls?: boolean;
  showDebugInfo?: boolean;
  onFullscreen?: () => void;
  autoHideControls?: boolean;
  controlsTimeout?: number; // ms
}

const MultiTrackVideoPlayer = forwardRef<HTMLCanvasElement, MultiTrackVideoPlayerProps>(({
  className,
  showControls = true,
  showDebugInfo = false,
  onFullscreen,
  autoHideControls = true,
  controlsTimeout = 3000,
}, canvasRef) => {
  const store = useMultiTrackStore();
  const { project, currentTime, isPlaying } = store;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<number | null>(null);
  
  // Multi-track player
  const {
    play,
    pause,
    seek,
    duration,
    currentFrame,
    activeElements,
    isLoading,
    loadProgress,
    canvasRef: playerCanvasRef,
    stats,
  } = useMultiTrackPlayer({
    autoPreload: true,
    preloadLookahead: 5.0,
    enableAudioMixing: true,
    enableVideoComposition: true,
    onPlaybackError: (error) => {
      console.error('Playback error:', error);
      store.setError(`Playback error: ${error.message}`);
    },
  });
  
  // Forward canvas ref
  useEffect(() => {
    if (typeof canvasRef === 'function') {
      canvasRef(playerCanvasRef.current);
    } else if (canvasRef) {
      canvasRef.current = playerCanvasRef.current;
    }
  }, [canvasRef, playerCanvasRef]);
  
  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    if (autoHideControls && isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setIsControlsVisible(false);
      }, controlsTimeout);
    }
  }, [autoHideControls, isPlaying, controlsTimeout]);
  
  const showControls = useCallback(() => {
    setIsControlsVisible(true);
    resetControlsTimeout();
  }, [resetControlsTimeout]);
  
  // Handle mouse movement to show controls
  const handleMouseMove = useCallback(() => {
    showControls();
  }, [showControls]);
  
  // Handle click to show controls or play/pause
  const handleContainerClick = useCallback(() => {
    if (!isControlsVisible) {
      showControls();
    } else if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isControlsVisible, isPlaying, showControls, pause, play]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle if container is focused or no input is focused
      const isInputFocused = document.activeElement?.tagName === 'INPUT' || 
                            document.activeElement?.tagName === 'TEXTAREA';
      
      if (isInputFocused) return;
      
      switch (event.key) {
        case ' ':
          event.preventDefault();
          if (isPlaying) {
            pause();
          } else {
            play();
          }
          break;
        
        case 'ArrowLeft':
          event.preventDefault();
          const stepBack = event.shiftKey ? 10 : 1;
          seek(Math.max(0, currentTime - stepBack));
          break;
        
        case 'ArrowRight':
          event.preventDefault();
          const stepForward = event.shiftKey ? 10 : 1;
          seek(Math.min(duration, currentTime + stepForward));
          break;
        
        case 'Home':
          event.preventDefault();
          seek(0);
          break;
        
        case 'End':
          event.preventDefault();
          seek(duration);
          break;
        
        case 'm':
          event.preventDefault();
          setIsMuted(!isMuted);
          break;
        
        case 'f':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            onFullscreen?.();
          }
          break;
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, duration, isMuted, play, pause, seek, onFullscreen]);
  
  // Handle volume change
  const handleVolumeChange = useCallback((newVolume: number[]) => {
    const vol = newVolume[0];
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);
  
  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);
  
  // Handle timeline scrubbing
  const handleTimelineChange = useCallback((newTime: number[]) => {
    seek(newTime[0]);
  }, [seek]);
  
  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);
  
  // Handle step backward/forward
  const handleStepBackward = useCallback(() => {
    seek(Math.max(0, currentTime - 1 / project.fps));
  }, [seek, currentTime, project.fps]);
  
  const handleStepForward = useCallback(() => {
    seek(currentTime + 1 / project.fps);
  }, [seek, currentTime, project.fps]);
  
  // Handle jump backward/forward
  const handleJumpBackward = useCallback(() => {
    seek(Math.max(0, currentTime - 10));
  }, [seek, currentTime]);
  
  const handleJumpForward = useCallback(() => {
    seek(Math.min(duration, currentTime + 10));
  }, [seek, currentTime, duration]);
  
  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);
  
  // Show controls when paused
  useEffect(() => {
    if (!isPlaying) {
      setIsControlsVisible(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    } else {
      resetControlsTimeout();
    }
  }, [isPlaying, resetControlsTimeout]);
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black rounded-lg overflow-hidden group cursor-pointer",
        "focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2",
        className
      )}
      onMouseMove={handleMouseMove}
      onClick={handleContainerClick}
      tabIndex={0}
    >
      {/* Canvas for video composition */}
      <canvas
        ref={playerCanvasRef}
        className="w-full h-full object-contain"
        style={{ aspectRatio: `${project.resolution.width}/${project.resolution.height}` }}
      />
      
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-2" />
            <div className="text-sm">Loading media...</div>
            {loadProgress > 0 && (
              <div className="w-32 h-1 bg-white/20 rounded-full mt-2 overflow-hidden">
                <div 
                  className="h-full bg-white transition-all duration-300"
                  style={{ width: `${loadProgress * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Controls overlay */}
      {showControls && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-300",
            isControlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          {/* Timeline scrubber */}
          <div className="mb-4">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1 / project.fps}
              onValueChange={handleTimelineChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-white/70 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          
          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {/* Play/Pause */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayPause();
                }}
                className="text-white hover:bg-white/20"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>
              
              {/* Stop */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  pause();
                  seek(0);
                }}
                className="text-white hover:bg-white/20"
              >
                <Square className="w-4 h-4" />
              </Button>
              
              {/* Step backward */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepBackward();
                }}
                className="text-white hover:bg-white/20"
                title="Step backward (1 frame)"
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              
              {/* Step forward */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStepForward();
                }}
                className="text-white hover:bg-white/20"
                title="Step forward (1 frame)"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
              
              {/* Volume controls */}
              <div className="flex items-center space-x-2 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMuteToggle();
                  }}
                  className="text-white hover:bg-white/20"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </Button>
                
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-20"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            
            {/* Right controls */}
            <div className="flex items-center space-x-2">
              {/* Settings */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Open settings modal
                }}
                className="text-white hover:bg-white/20"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
              
              {/* Fullscreen button */}
              {onFullscreen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFullscreen();
                  }}
                  className="text-white hover:bg-white/20"
                  title="Fullscreen (F)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Debug info overlay */}
      {showDebugInfo && currentFrame && (
        <div className="absolute top-4 left-4 bg-black/80 text-white text-xs p-2 rounded space-y-1 font-mono">
          <div>Time: {formatTime(currentTime)} / {formatTime(duration)}</div>
          <div>FPS: {project.fps}</div>
          <div>Resolution: {project.resolution.width}x{project.resolution.height}</div>
          <div>Visual layers: {activeElements.visual.length}</div>
          <div>Audio tracks: {activeElements.audio.length}</div>
          <div>Frames rendered: {stats.framesRendered}</div>
          <div>Render time: {stats.renderTime.toFixed(1)}ms</div>
          {stats.droppedFrames > 0 && (
            <div className="text-yellow-400">Dropped frames: {stats.droppedFrames}</div>
          )}
        </div>
      )}
      
      {/* Track info overlay (when multiple tracks active) */}
      {activeElements.visual.length > 1 && isControlsVisible && (
        <div className="absolute top-4 right-4 bg-black/80 text-white text-xs p-2 rounded space-y-1">
          <div className="font-semibold">Active Tracks:</div>
          {activeElements.visual.map((elem, index) => (
            <div key={elem.element.id} className="flex items-center space-x-2">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: elem.track.color || '#3b82f6' }}
              />
              <span>{elem.track.name}</span>
              {elem.opacity < 1 && (
                <span className="text-white/60">({Math.round(elem.opacity * 100)}%)</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

MultiTrackVideoPlayer.displayName = "MultiTrackVideoPlayer";

export default MultiTrackVideoPlayer;