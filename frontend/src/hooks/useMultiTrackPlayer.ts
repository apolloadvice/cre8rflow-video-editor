/**
 * Multi-Track Timeline Player Hook
 * 
 * Manages playback for multi-track timeline with:
 * - Layer-based video composition
 * - Audio mixing from multiple tracks
 * - Synchronized playback across tracks
 * - Efficient media preloading and pooling
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { 
  getActiveElements, 
  generatePreviewFrame, 
  TrackMediaPool, 
  timelineToSourceTime,
  calculateAudioMix,
  type PreviewFrame,
  type CompositeElement
} from '@/lib/preview';

export interface UseTimelinePlayerOptions {
  autoPreload?: boolean;
  preloadLookahead?: number; // Seconds to preload ahead
  enableAudioMixing?: boolean;
  enableVideoComposition?: boolean;
  onFrameRender?: (frame: PreviewFrame) => void;
  onPlaybackError?: (error: Error) => void;
}

export interface UseTimelinePlayerReturn {
  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: TimeRanges | null;
  
  // Controls
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  
  // Current frame data
  currentFrame: PreviewFrame | null;
  activeElements: { visual: CompositeElement[]; audio: CompositeElement[] };
  
  // Media loading
  isLoading: boolean;
  loadProgress: number; // 0-1
  mediaPool: TrackMediaPool;
  
  // Rendering
  canvasRef: React.RefObject<HTMLCanvasElement>;
  audioContext: AudioContext | null;
  
  // Debug info
  stats: {
    framesRendered: number;
    droppedFrames: number;
    renderTime: number; // ms
    audioLatency: number; // ms
  };
}

export function useMultiTrackPlayer(options: UseTimelinePlayerOptions = {}): UseTimelinePlayerReturn {
  const {
    autoPreload = true,
    preloadLookahead = 5.0,
    enableAudioMixing = true,
    enableVideoComposition = true,
    onFrameRender,
    onPlaybackError,
  } = options;
  
  const store = useMultiTrackStore();
  const { project, currentTime, isPlaying, playbackRate } = store;
  
  // Refs for media elements and canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaPoolRef = useRef<TrackMediaPool>(new TrackMediaPool());
  const animationFrameRef = useRef<number>();
  const lastRenderTimeRef = useRef<number>(0);
  
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [stats, setStats] = useState({
    framesRendered: 0,
    droppedFrames: 0,
    renderTime: 0,
    audioLatency: 0,
  });
  
  // Get current active elements
  const activeElements = useMemo(() => {
    return getActiveElements(project.timeline, currentTime);
  }, [project.timeline, currentTime]);
  
  // Generate current frame
  const currentFrame = useMemo(() => {
    return generatePreviewFrame(
      project.timeline,
      currentTime,
      project.resolution,
      project.fps,
      project.sampleRate
    );
  }, [project, currentTime]);
  
  // Initialize audio context
  useEffect(() => {
    if (enableAudioMixing && !audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('Failed to create audio context:', error);
      }
    }
    
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [enableAudioMixing]);
  
  // Preload media when timeline changes
  useEffect(() => {
    if (!autoPreload) return;
    
    let isCancelled = false;
    
    const preloadMedia = async () => {
      setIsLoading(true);
      setLoadProgress(0);
      
      try {
        await mediaPoolRef.current.preloadForTimeline(
          project.timeline,
          currentTime,
          preloadLookahead
        );
        
        if (!isCancelled) {
          setLoadProgress(1);
          setIsLoading(false);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to preload media:', error);
          onPlaybackError?.(error as Error);
          setIsLoading(false);
        }
      }
    };
    
    preloadMedia();
    
    return () => {
      isCancelled = true;
    };
  }, [project.timeline, currentTime, preloadLookahead, autoPreload, onPlaybackError]);
  
  // Render video frame to canvas
  const renderVideoFrame = useCallback((frame: PreviewFrame) => {
    const canvas = canvasRef.current;
    if (!canvas || !enableVideoComposition) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const startTime = performance.now();
    
    // Set canvas size
    canvas.width = frame.resolution.width;
    canvas.height = frame.resolution.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Render each visual element in z-order
    frame.visual.forEach(compositeElement => {
      const { element, track, renderTime, opacity, transforms } = compositeElement;
      
      if (!element.mediaId) return;
      
      const mediaElement = mediaPoolRef.current.getMedia(track.kind, element.mediaId);
      if (!mediaElement) return;
      
      // Save context for transforms
      ctx.save();
      
      // Apply transforms
      ctx.globalAlpha = opacity;
      ctx.translate(canvas.width / 2 + transforms.x, canvas.height / 2 + transforms.y);
      ctx.scale(transforms.scale, transforms.scale);
      ctx.rotate(transforms.rotate * Math.PI / 180);
      
      try {
        if (mediaElement instanceof HTMLVideoElement) {
          // Seek video to correct time
          if (Math.abs(mediaElement.currentTime - renderTime) > 0.1) {
            mediaElement.currentTime = renderTime;
          }
          
          // Draw video frame
          ctx.drawImage(
            mediaElement,
            -canvas.width / 2,
            -canvas.height / 2,
            canvas.width,
            canvas.height
          );
        } else if (mediaElement instanceof HTMLImageElement) {
          // Draw image
          ctx.drawImage(
            mediaElement,
            -canvas.width / 2,
            -canvas.height / 2,
            canvas.width,
            canvas.height
          );
        }
      } catch (error) {
        console.warn('Failed to render element:', error);
      }
      
      // Restore context
      ctx.restore();
    });
    
    const renderTime = performance.now() - startTime;
    
    setStats(prev => ({
      ...prev,
      framesRendered: prev.framesRendered + 1,
      renderTime,
    }));
    
    onFrameRender?.(frame);
  }, [enableVideoComposition, onFrameRender]);
  
  // Handle audio mixing and playback
  const renderAudioFrame = useCallback((frame: PreviewFrame) => {
    if (!enableAudioMixing || !audioContextRef.current || frame.audio.length === 0) {
      return;
    }
    
    const audioContext = audioContextRef.current;
    const audioMix = calculateAudioMix(frame.audio);
    
    frame.audio.forEach(compositeElement => {
      const { element, track, renderTime } = compositeElement;
      
      if (!element.mediaId) return;
      
      const mediaElement = mediaPoolRef.current.getMedia(track.kind, element.mediaId);
      if (!(mediaElement instanceof HTMLAudioElement)) return;
      
      const volume = audioMix[element.id] || 0;
      
      try {
        // Seek audio to correct time
        if (Math.abs(mediaElement.currentTime - renderTime) > 0.1) {
          mediaElement.currentTime = renderTime;
        }
        
        // Set volume
        mediaElement.volume = volume;
        
        // Play if not already playing
        if (mediaElement.paused && isPlaying) {
          mediaElement.play().catch(console.warn);
        } else if (!mediaElement.paused && !isPlaying) {
          mediaElement.pause();
        }
      } catch (error) {
        console.warn('Failed to render audio element:', error);
      }
    });
  }, [enableAudioMixing, isPlaying]);
  
  // Main render loop
  const renderFrame = useCallback(() => {
    const now = performance.now();
    const deltaTime = now - lastRenderTimeRef.current;
    const targetFrameTime = 1000 / project.fps;
    
    if (deltaTime >= targetFrameTime) {
      renderVideoFrame(currentFrame);
      renderAudioFrame(currentFrame);
      lastRenderTimeRef.current = now;
    }
    
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    }
  }, [currentFrame, isPlaying, project.fps, renderVideoFrame, renderAudioFrame]);
  
  // Start/stop render loop based on playback state
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Render single frame when paused
      renderVideoFrame(currentFrame);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, renderFrame, renderVideoFrame, currentFrame]);
  
  // Playback controls
  const play = useCallback(async () => {
    try {
      // Resume audio context if suspended
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      store.setIsPlaying(true);
    } catch (error) {
      console.error('Failed to start playback:', error);
      onPlaybackError?.(error as Error);
    }
  }, [store, onPlaybackError]);
  
  const pause = useCallback(() => {
    store.setIsPlaying(false);
  }, [store]);
  
  const seek = useCallback((time: number) => {
    store.setCurrentTime(time);
  }, [store]);
  
  const setPlaybackRateHandler = useCallback((rate: number) => {
    store.setPlaybackRate(rate);
  }, [store]);
  
  // Calculate total duration
  const duration = useMemo(() => {
    return store.getTotalDuration();
  }, [store]);
  
  // Clean up media pool on unmount
  useEffect(() => {
    return () => {
      mediaPoolRef.current.clearAll();
    };
  }, []);
  
  return {
    // Playback state
    isPlaying,
    currentTime,
    duration,
    buffered: null, // TODO: Implement buffered time ranges
    
    // Controls
    play,
    pause,
    seek,
    setPlaybackRate: setPlaybackRateHandler,
    
    // Current frame data
    currentFrame,
    activeElements,
    
    // Media loading
    isLoading,
    loadProgress,
    mediaPool: mediaPoolRef.current,
    
    // Rendering
    canvasRef,
    audioContext: audioContextRef.current,
    
    // Debug info
    stats,
  };
}