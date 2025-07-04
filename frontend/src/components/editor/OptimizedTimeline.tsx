/**
 * Optimized Timeline Component
 * 
 * Performance optimizations:
 * - Canvas-based rendering for clips
 * - Virtual scrolling for large timelines
 * - Debounced interactions
 * - Cached thumbnail rendering
 * - Memory-efficient clip handling
 * - RAF-based smooth scrolling
 */

import React, { 
  useState, 
  useRef, 
  useEffect, 
  useCallback, 
  useMemo,
  forwardRef,
  useImperativeHandle
} from 'react';
import { cn } from "@/lib/utils";
import { 
  useOptimizedDebounce,
  useOptimizedThrottle,
  useMemoryMonitor,
  useThumbnailCache,
  getOptimizedSettings,
  performanceMeasurement
} from '@/utils/performanceUtils';
import { useAPICache } from '@/hooks/useAPICache';

interface Clip {
  id: string;
  start: number;
  end: number;
  track: number;
  type: string;
  name: string;
  text?: string;
  asset?: string;
  thumbnail?: string;
  file_path?: string;
}

interface OptimizedTimelineProps {
  duration: number;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  clips?: Clip[];
  onClipSelect?: (clipId: string | null) => void;
  selectedClipId?: string | null;
  onVideoDrop?: (file: File, track: number, time: number) => void;
  onVideoAssetDrop?: (videoAsset: any, track: number, time: number) => void;
  onMultipleVideoAssetDrop?: (videoAssets: any[], track: number, time: number) => void;
  onClipUpdate?: (clipId: string, updates: { start?: number; end?: number }) => void;
  onClipMove?: (clipId: string, newTrack: number, newStartTime: number) => void;
  className?: string;
}

interface TimelineState {
  zoom: number;
  scrollX: number;
  isDragging: boolean;
  dragType: 'clip' | 'handle' | 'playhead' | null;
  dragData: any;
}

// Canvas-based clip renderer for better performance
class ClipRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private thumbnailCache: Map<string, HTMLImageElement> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setSize(width: number, height: number) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  renderClip(
    clip: Clip,
    x: number,
    y: number,
    width: number,
    height: number,
    isSelected: boolean,
    pixelsPerSecond: number
  ) {
    const ctx = this.ctx;
    
    // Clip background
    ctx.fillStyle = this.getClipColor(clip.type, isSelected);
    ctx.fillRect(x, y, width, height);
    
    // Clip border
    ctx.strokeStyle = isSelected ? '#8b5cf6' : '#d1d5db';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x, y, width, height);
    
    // Render thumbnail for video clips
    if (clip.type === 'video' && clip.thumbnail) {
      this.renderThumbnail(clip.thumbnail, x + 2, y + 2, width - 4, height - 4);
    }
    
    // Clip text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    const text = this.truncateText(clip.name, width - 8);
    ctx.fillText(text, x + 4, y + height / 2);
    
    // Duration indicator
    const duration = clip.end - clip.start;
    const durationText = this.formatDuration(duration);
    ctx.textAlign = 'right';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(durationText, x + width - 4, y + height - 8);
  }

  private getClipColor(type: string, isSelected: boolean): string {
    const colors = {
      video: isSelected ? '#8b5cf6' : '#6366f1',
      audio: isSelected ? '#10b981' : '#059669',
      text: isSelected ? '#f59e0b' : '#d97706',
      image: isSelected ? '#ef4444' : '#dc2626'
    };
    return colors[type as keyof typeof colors] || colors.video;
  }

  private renderThumbnail(thumbnailSrc: string, x: number, y: number, width: number, height: number) {
    let img = this.thumbnailCache.get(thumbnailSrc);
    
    if (!img) {
      img = new Image();
      img.onload = () => {
        this.thumbnailCache.set(thumbnailSrc, img!);
        // Re-render when thumbnail loads
        requestAnimationFrame(() => {
          this.ctx.drawImage(img!, x, y, width, height);
        });
      };
      img.src = thumbnailSrc;
      return;
    }
    
    this.ctx.drawImage(img, x, y, width, height);
  }

  private truncateText(text: string, maxWidth: number): string {
    const ctx = this.ctx;
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }
    
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  }

  private formatDuration(duration: number): string {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

export const OptimizedTimeline = forwardRef<HTMLDivElement, OptimizedTimelineProps>(({
  duration,
  currentTime,
  onTimeUpdate,
  clips = [],
  onClipSelect,
  selectedClipId,
  onVideoDrop,
  onVideoAssetDrop,
  onMultipleVideoAssetDrop,
  onClipUpdate,
  onClipMove,
  className
}, ref) => {
  // Performance monitoring
  useMemoryMonitor('OptimizedTimeline');
  const optimizedSettings = getOptimizedSettings();

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ClipRenderer | null>(null);
  const animationFrameRef = useRef<number>();

  // State
  const [timelineState, setTimelineState] = useState<TimelineState>({
    zoom: 1,
    scrollX: 0,
    isDragging: false,
    dragType: null,
    dragData: null
  });

  // Expose ref
  useImperativeHandle(ref, () => containerRef.current!, []);

  // Timeline settings
  const TRACK_HEIGHT = 80;
  const HEADER_HEIGHT = 40;
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 10;
  const PIXELS_PER_SECOND_BASE = 50;

  // Calculated values
  const pixelsPerSecond = PIXELS_PER_SECOND_BASE * timelineState.zoom;
  const timelineWidth = duration * pixelsPerSecond;
  const trackCount = Math.max(3, Math.max(...clips.map(clip => clip.track)) + 1);
  const timelineHeight = trackCount * TRACK_HEIGHT + HEADER_HEIGHT;

  // Initialize canvas renderer
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new ClipRenderer(canvasRef.current);
    }
  }, []);

  // Resize canvas when container size changes
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current && rendererRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        rendererRef.current.setSize(width, height);
        scheduleRender();
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Optimized render scheduling
  const scheduleRender = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(() => {
      performanceMeasurement.measure('timeline_render', () => {
        renderTimeline();
      });
    });
  }, []);

  // Main render function
  const renderTimeline = useCallback(() => {
    if (!rendererRef.current || !containerRef.current) return;

    const renderer = rendererRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    
    renderer.clear();

    // Render visible clips only (performance optimization)
    const viewportStart = timelineState.scrollX / pixelsPerSecond;
    const viewportEnd = (timelineState.scrollX + containerRect.width) / pixelsPerSecond;
    
    const visibleClips = clips.filter(clip => 
      clip.end >= viewportStart && clip.start <= viewportEnd
    );

    // Render clips
    visibleClips.forEach(clip => {
      const clipX = clip.start * pixelsPerSecond - timelineState.scrollX;
      const clipY = HEADER_HEIGHT + clip.track * TRACK_HEIGHT;
      const clipWidth = (clip.end - clip.start) * pixelsPerSecond;
      const clipHeight = TRACK_HEIGHT - 4;
      
      renderer.renderClip(
        clip,
        clipX,
        clipY,
        clipWidth,
        clipHeight,
        clip.id === selectedClipId,
        pixelsPerSecond
      );
    });

    // Render playhead
    const playheadX = currentTime * pixelsPerSecond - timelineState.scrollX;
    if (playheadX >= 0 && playheadX <= containerRect.width) {
      const ctx = renderer['ctx'];
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, timelineHeight);
      ctx.stroke();
    }
  }, [clips, currentTime, selectedClipId, timelineState, pixelsPerSecond, timelineHeight]);

  // Schedule render when dependencies change
  useEffect(() => {
    scheduleRender();
  }, [scheduleRender, clips, currentTime, selectedClipId, timelineState]);

  // Debounced zoom handler
  const debouncedZoom = useOptimizedDebounce(
    useCallback((delta: number, centerX: number) => {
      setTimelineState(prev => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * (1 + delta * 0.1)));
        
        // Zoom to cursor position
        const timeAtCursor = (prev.scrollX + centerX) / (PIXELS_PER_SECOND_BASE * prev.zoom);
        const newScrollX = timeAtCursor * PIXELS_PER_SECOND_BASE * newZoom - centerX;
        
        return {
          ...prev,
          zoom: newZoom,
          scrollX: Math.max(0, newScrollX)
        };
      });
    }, []),
    optimizedSettings.debounceDelay / 2
  );

  // Throttled scroll handler
  const throttledScroll = useOptimizedThrottle(
    useCallback((scrollX: number) => {
      setTimelineState(prev => ({
        ...prev,
        scrollX: Math.max(0, Math.min(scrollX, timelineWidth - (containerRef.current?.getBoundingClientRect().width || 0)))
      }));
    }, [timelineWidth]),
    16 // 60fps
  );

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left + timelineState.scrollX;
    const y = e.clientY - rect.top;
    const time = x / pixelsPerSecond;
    const track = Math.floor((y - HEADER_HEIGHT) / TRACK_HEIGHT);

    // Check if clicking on playhead
    const playheadX = currentTime * pixelsPerSecond;
    if (Math.abs(x - playheadX) < 5) {
      setTimelineState(prev => ({
        ...prev,
        isDragging: true,
        dragType: 'playhead',
        dragData: { startX: x }
      }));
      return;
    }

    // Check if clicking on a clip
    const clickedClip = clips.find(clip => 
      time >= clip.start && 
      time <= clip.end && 
      track === clip.track
    );

    if (clickedClip) {
      onClipSelect?.(clickedClip.id);
      
      // Check if clicking on clip edges for resizing
      const clipStartX = clickedClip.start * pixelsPerSecond;
      const clipEndX = clickedClip.end * pixelsPerSecond;
      
      if (Math.abs(x - clipStartX) < 8) {
        setTimelineState(prev => ({
          ...prev,
          isDragging: true,
          dragType: 'handle',
          dragData: { clipId: clickedClip.id, handle: 'start', originalStart: clickedClip.start }
        }));
      } else if (Math.abs(x - clipEndX) < 8) {
        setTimelineState(prev => ({
          ...prev,
          isDragging: true,
          dragType: 'handle',
          dragData: { clipId: clickedClip.id, handle: 'end', originalEnd: clickedClip.end }
        }));
      } else {
        setTimelineState(prev => ({
          ...prev,
          isDragging: true,
          dragType: 'clip',
          dragData: { 
            clipId: clickedClip.id, 
            offsetX: x - clipStartX,
            originalTrack: clickedClip.track,
            originalStart: clickedClip.start
          }
        }));
      }
    } else {
      // Clicking on empty space - seek
      onTimeUpdate(time);
      onClipSelect?.(null);
    }
  }, [clips, currentTime, pixelsPerSecond, timelineState.scrollX, onClipSelect, onTimeUpdate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!timelineState.isDragging) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left + timelineState.scrollX;
    const y = e.clientY - rect.top;
    const time = x / pixelsPerSecond;
    const track = Math.floor((y - HEADER_HEIGHT) / TRACK_HEIGHT);

    if (timelineState.dragType === 'playhead') {
      onTimeUpdate(Math.max(0, Math.min(duration, time)));
    } else if (timelineState.dragType === 'handle' && onClipUpdate) {
      const { clipId, handle } = timelineState.dragData;
      if (handle === 'start') {
        onClipUpdate(clipId, { start: Math.max(0, time) });
      } else {
        onClipUpdate(clipId, { end: Math.min(duration, time) });
      }
    } else if (timelineState.dragType === 'clip' && onClipMove) {
      const { clipId, offsetX, originalStart } = timelineState.dragData;
      const newStartTime = (x - offsetX) / pixelsPerSecond;
      const newTrack = Math.max(0, Math.min(trackCount - 1, track));
      
      onClipMove(clipId, newTrack, Math.max(0, newStartTime));
    }
  }, [timelineState, pixelsPerSecond, duration, trackCount, onTimeUpdate, onClipUpdate, onClipMove]);

  const handleMouseUp = useCallback(() => {
    setTimelineState(prev => ({
      ...prev,
      isDragging: false,
      dragType: null,
      dragData: null
    }));
  }, []);

  // Wheel event for zooming and scrolling
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const centerX = e.clientX - rect.left;
      debouncedZoom(-e.deltaY, centerX);
    } else {
      // Scroll
      throttledScroll(timelineState.scrollX + e.deltaX);
    }
  }, [timelineState.scrollX, debouncedZoom, throttledScroll]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={cn("relative overflow-hidden bg-gray-100 dark:bg-gray-900", className)}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: timelineState.isDragging ? 'grabbing' : 'default' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />
      
      {/* Time ruler */}
      <div 
        className="absolute top-0 left-0 h-10 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700"
        style={{ 
          width: `${timelineWidth}px`,
          transform: `translateX(-${timelineState.scrollX}px)`
        }}
      >
        {/* Time markers */}
        {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 flex flex-col items-center text-xs text-gray-600 dark:text-gray-400"
            style={{ left: `${i * pixelsPerSecond}px` }}
          >
            <div className="w-px h-2 bg-gray-400"></div>
            <span className="mt-1">{i}s</span>
          </div>
        ))}
      </div>

      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex gap-2 bg-white dark:bg-gray-800 rounded-md shadow-md p-1">
        <button
          className="px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          onClick={() => debouncedZoom(-1, 0)}
        >
          -
        </button>
        <span className="px-2 py-1 text-sm">
          {Math.round(timelineState.zoom * 100)}%
        </span>
        <button
          className="px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          onClick={() => debouncedZoom(1, 0)}
        >
          +
        </button>
      </div>

      {/* Performance stats (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-2 left-2 text-xs text-gray-500 bg-white dark:bg-gray-800 p-2 rounded">
          Clips: {clips.length} | Zoom: {timelineState.zoom.toFixed(2)} | 
          Memory: {((performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0).toFixed(1)}MB
        </div>
      )}
    </div>
  );
});

OptimizedTimeline.displayName = 'OptimizedTimeline';

export default OptimizedTimeline;