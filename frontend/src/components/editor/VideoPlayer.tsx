import { useState, useRef, useEffect, forwardRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, VolumeX, Download, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import UndoIcon from "@/components/icons/UndoIcon";
import RedoIcon from "@/components/icons/RedoIcon";
import { useEditorStore } from "@/store/editorStore";
import { useIntervalTimeline } from "@/hooks/useIntervalTimeline";

interface VideoPlayerProps {
  src?: string;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  className?: string;
  rightControl?: React.ReactNode;
  clips?: any[]; // Timeline clips for segment skipping and overlays
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
  src,
  currentTime,
  onTimeUpdate,
  onDurationChange,
  className,
  rightControl,
  clips = [], // timeline clips
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<number | null>(null);
  
  // Get undo/redo functions from store
  const { undo, redo, history } = useEditorStore();
  
  // Use the forwarded ref or fall back to internal ref
  const resolvedRef = (ref as React.RefObject<HTMLVideoElement>) || videoRef;
  
  // Use timeline playback hook
  const {
    isPlaying: isTimelinePlaying,
    currentInterval,
    togglePlayback: toggleTimelinePlayback,
    stopPlayback: stopTimelinePlayback,
    debugIntervals
  } = useIntervalTimeline(resolvedRef);

  // Update video currentTime when prop changes (e.g., from timeline)
  useEffect(() => {
    const video = resolvedRef.current;
    if (video && Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime;
    }
  }, [currentTime, resolvedRef]);

  // Reload video when src changes (ensures proper sync with interval timeline)
  useEffect(() => {
    const video = resolvedRef.current;
    if (video && src) {
      console.log('🎥 [VideoPlayer] Video src changed, reloading:', src);
      video.load(); // Explicitly reload the video element
    }
  }, [src, resolvedRef]);

  // Toggle play/pause - now uses timeline playback
  const togglePlayPause = () => {
    toggleTimelinePlayback();
  };

  // Toggle mute
  const toggleMute = () => {
    const video = resolvedRef.current;
    if (!video) return;
    
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Handle volume change
  const handleVolumeChange = (value: number[]) => {
    const video = resolvedRef.current;
    if (!video) return;
    
    const newVolume = value[0];
    video.volume = newVolume;
    setVolume(newVolume);
    
    if (newVolume === 0 && !isMuted) {
      setIsMuted(true);
      video.muted = true;
    } else if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      video.muted = false;
    }
  };

  // Auto-hide controls after inactivity
  const showControls = () => {
    setIsControlsVisible(true);
    
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    
    controlsTimeoutRef.current = window.setTimeout(() => {
      setIsControlsVisible(false);
    }, 3000);
  };

  // --- Timeline Segment & Overlay Logic ---
  // Parse segments (video parts to play) and overlays (text/image)
  const { segments, overlays } = useMemo(() => {
    // Video segments: type is not 'text' or 'overlay'
    const segments = clips
      .filter((clip) => clip.type !== "text" && clip.type !== "overlay")
      .map((clip) => ({ start: clip.start, end: clip.end }))
      .sort((a, b) => a.start - b.start);
    // Overlays: type is 'text' or 'overlay'
    const overlays = clips
      .filter((clip) => clip.type === "text" || clip.type === "overlay")
      .map((clip) => ({ ...clip }));
    return { segments, overlays };
  }, [clips]);

  // Helper: find the current segment index for a given time
  const getCurrentSegmentIndex = (time: number) => {
    return segments.findIndex(seg => time >= seg.start && time < seg.end);
  };

  // Helper: find the next segment index after a given time
  const getNextSegmentIndex = (time: number) => {
    return segments.findIndex(seg => seg.start > time);
  };

  // --- Segment Skipping Logic ---
  useEffect(() => {
    const video = resolvedRef.current;
    if (!video || segments.length === 0 || isTimelinePlaying) return; // Skip segment handling in timeline mode

    const handleTimeUpdate = () => {
      const t = video.currentTime;
      const segIdx = getCurrentSegmentIndex(t);
      if (segIdx === -1) {
        // Not in any segment: seek to next segment or pause
        const nextIdx = getNextSegmentIndex(t);
        if (nextIdx !== -1) {
          video.currentTime = segments[nextIdx].start;
        } else {
          video.pause();
          stopTimelinePlayback();
        }
      } else {
        // In a segment: if at end, jump to next segment or pause
        const seg = segments[segIdx];
        if (t >= seg.end - 0.03) { // allow for floating point
          const nextIdx = segIdx + 1;
          if (nextIdx < segments.length) {
            video.currentTime = segments[nextIdx].start;
          } else {
            video.pause();
            stopTimelinePlayback();
          }
        }
      }
      // Only call onTimeUpdate if not in timeline mode (to avoid conflicts)
      if (!isTimelinePlaying) {
        onTimeUpdate(video.currentTime);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [resolvedRef, segments, onTimeUpdate, isTimelinePlaying, stopTimelinePlayback]);

  // --- Start at first segment if needed ---
  useEffect(() => {
    const video = resolvedRef.current;
    if (!video || segments.length === 0 || isTimelinePlaying) return; // Skip segment positioning in timeline mode
    if (video.currentTime < segments[0].start || video.currentTime >= segments[0].end) {
      video.currentTime = segments[0].start;
    }
  }, [resolvedRef, segments, isTimelinePlaying]);

  // --- Overlay State ---
  const [activeOverlays, setActiveOverlays] = useState<any[]>([]);

  // Update overlays on timeupdate (use requestAnimationFrame for smoothness)
  useEffect(() => {
    let rafId: number;
    const video = resolvedRef.current;
    if (!video) return;
    const updateOverlays = () => {
      const t = video.currentTime;
      const actives = overlays.filter(ovl => t >= ovl.start && t < ovl.end);
      setActiveOverlays(actives);
      rafId = requestAnimationFrame(updateOverlays);
    };
    rafId = requestAnimationFrame(updateOverlays);
    return () => cancelAnimationFrame(rafId);
  }, [overlays, resolvedRef]);

  // Setup initial event listeners
  useEffect(() => {
    const video = resolvedRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      // In timeline mode, let the timeline playback system handle time updates
      if (!isTimelinePlaying) {
        onTimeUpdate(video.currentTime);
      }
    };

    const handleDurationChange = () => {
      onDurationChange(video.duration);
    };

    const handleEnded = () => {
      // Only stop timeline playback if we're not in timeline mode
      // In timeline mode, let the timeline playback system handle transitions
      if (!isTimelinePlaying) {
        stopTimelinePlayback();
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("ended", handleEnded);

    showControls();

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("ended", handleEnded);
      
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [onTimeUpdate, onDurationChange, resolvedRef, isTimelinePlaying, stopTimelinePlayback]);

  return (
    <div 
      className={cn("relative bg-black flex items-center justify-center", className)}
      onMouseMove={showControls}
    >
      {src ? (
        <>
          <video 
            ref={resolvedRef}
            className="max-h-full max-w-full"
            src={src}
            onClick={togglePlayPause}
          >
            Your browser does not support the video tag.
          </video>
          {/* Overlay Layer */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {activeOverlays.map((ovl, i) => {
              if (ovl.type === "text") {
                // Use clip styling if available, otherwise use defaults
                const clipStyle = ovl.style || {};
                const fontSize = clipStyle.fontSize || '12px';
                const position = clipStyle.position || 'bottom-third';
                const backgroundColor = clipStyle.backgroundColor || 'transparent';
                
                // Position mapping
                const positionClasses = {
                  'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2',
                  'bottom-third': 'bottom-1/3 left-1/2 transform -translate-x-1/2',
                  'center': 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2',
                  'top': 'top-4 left-1/2 transform -translate-x-1/2',
                  'bottom': 'bottom-4 left-1/2 transform -translate-x-1/2'
                };
                
                return (
                  <div 
                    key={i} 
                    className={`absolute text-white font-bold px-2 py-1 ${positionClasses[position] || positionClasses['bottom-third']}`}
                    style={{
                      fontSize: fontSize,
                      backgroundColor: backgroundColor,
                      color: clipStyle.color || '#ffffff',
                      fontWeight: clipStyle.fontWeight || 'bold'
                    }}
                  >
                    {ovl.text}
                  </div>
                );
              } else if (ovl.type === "overlay") {
                return <img key={i} src={ovl.asset} alt="overlay" className="max-h-1/2 max-w-1/2 object-contain" />;
              }
              return null;
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center text-cre8r-gray-400 h-full">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-30"><path d="m10 7 5 3-5 3z"></path><rect width="20" height="14" x="2" y="3" rx="2"></rect><path d="M22 17v4"></path><path d="M2 17v4"></path></svg>
          <p>No video selected</p>
          <p className="text-sm mt-2">Upload or select a video to start editing</p>
        </div>
      )}

      {/* Video controls overlay */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 transition-opacity",
          isControlsVisible ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Updated control bar with centered play/pause and timecode */}
        <div className="grid grid-cols-3 items-center mb-2">
          {/* Left section - Undo/Redo */}
          <div className="flex items-center gap-2">
            {/* Undo button */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
              onClick={undo}
              disabled={history.past.length === 0}
            >
              <UndoIcon className="h-5 w-5" />
            </Button>
            
            {/* Redo button */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
              onClick={redo}
              disabled={history.future.length === 0}
            >
              <RedoIcon className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Center section - Play/Pause and Timecode */}
          <div className="flex items-center justify-center gap-2">
            {/* Play/Pause button */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
              onClick={toggleTimelinePlayback}
            >
              {isTimelinePlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>
            
            {/* Timecode display (rightControl) */}
            {rightControl && <div>{rightControl}</div>}
          </div>

          {/* Right section - Volume, Download, Settings */}
          <div className="flex items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                onClick={toggleMute}
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>
              <div className="w-20">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="h-1"
                />
              </div>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
            >
              <Download className="h-5 w-5" />
            </Button>
            
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
              onClick={debugIntervals}
              title="Debug Interval Tree"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;
