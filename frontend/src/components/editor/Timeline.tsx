import { useState, useRef, useEffect, useCallback, forwardRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { debounce } from "lodash";
import Playhead from "./Playhead";
import AnimationOverlay from "./AnimationOverlay";
import TimelineLoadingOverlay from "./TimelineLoadingOverlay";
import { useEditorStore, useCurrentGESProjectId, useMultiSelection, useGESClipsByLayer, useGESProjectActions, LayerType, getLayerName, getLayerColor } from "@/store/editorStore";
import { useTimelineMarkers } from "@/hooks/useTimelineMarkers";
import { useTimelineShortcuts } from "@/hooks/useTimelineShortcuts";
import { snapGESTimelinePosition, GESSnapRequest, GESSnapResponse } from "@/api/apiClient";
import TimelineContextMenu from "./TimelineContextMenu";
import useTimelinePersistence from "@/hooks/useTimelinePersistence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, Music, Type, Zap, Image, Eye, EyeOff, Lock, Unlock } from "lucide-react";

interface TimelineProps {
  duration: number;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  clips?: {
    id: string;
    start: number;
    end: number;
    track: number;
    type?: string;
    name?: string;
    text?: string;
    asset?: string;
    thumbnail?: string;
  }[];
  onClipSelect?: (clipId: string | null) => void;
  selectedClipId?: string | null;
  onVideoDrop?: (file: File, track: number, time: number) => void;
  onVideoAssetDrop?: (videoAsset: any, track: number, time: number) => void;
  onMultipleVideoAssetDrop?: (videoAssets: any[], track: number, time: number) => void;
  onClipUpdate?: (clipId: string, updates: { start?: number; end?: number }) => void;
  onClipMove?: (clipId: string, newTrack: number, newStartTime: number) => void;
  // GES Integration Props
  gesMode?: boolean;
  onGESModeToggle?: (enabled: boolean) => void;
  onLayerSelect?: (layer: LayerType) => void;
  selectedLayer?: LayerType;
}

const Timeline = forwardRef<HTMLDivElement, TimelineProps>(({
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
  gesMode = false,
  onGESModeToggle,
  onLayerSelect,
  selectedLayer,
}, ref) => {
  // Timeline markers integration
  const currentProjectId = useCurrentGESProjectId();
  const markersHook = useTimelineMarkers(currentProjectId || undefined);
  
  // Multi-selection support
  const multiSelection = useMultiSelection();
  
  // GES integration
  const gesClipsByLayer = useGESClipsByLayer(currentProjectId);
  const gesProjectActions = useGESProjectActions();
  
  // Layer visibility state
  const [layerVisibility, setLayerVisibility] = useState<Record<LayerType, boolean>>({
    [LayerType.MAIN]: true,
    [LayerType.OVERLAY]: true,
    [LayerType.TEXT]: true,
    [LayerType.EFFECTS]: true,
    [LayerType.AUDIO]: true,
  });
  
  // Layer lock state
  const [layerLocked, setLayerLocked] = useState<Record<LayerType, boolean>>({
    [LayerType.MAIN]: false,
    [LayerType.OVERLAY]: false,
    [LayerType.TEXT]: false,
    [LayerType.EFFECTS]: false,
    [LayerType.AUDIO]: false,
  });
  
  // Note: Auto-enable GES mode is handled by EditorContent to prevent infinite loops
  
  // Professional keyboard shortcuts integration - memoize callbacks to prevent re-renders
  const shortcutCallbacks = useMemo(() => ({
    onMarkIn: (time: number) => {
      console.log('🎯 [Timeline] Mark In set via shortcut at:', time);
      // Visual indicator could be added here
    },
    onMarkOut: (time: number) => {
      console.log('🎯 [Timeline] Mark Out set via shortcut at:', time);
      // Visual indicator could be added here
    },
    onSelectAllClips: () => {
      console.log('🎯 [Timeline] All clips selected via shortcut');
      multiSelection.selectAll();
    },
    onGroupClips: (clipIds: string[]) => {
      console.log('🎯 [Timeline] Grouping clips via shortcut:', clipIds);
      // Future: implement clip grouping logic
    },
    onRippleDelete: (clipId: string) => {
      console.log('🎯 [Timeline] Ripple delete via shortcut:', clipId);
      // Implement ripple delete logic
      const { deleteClip } = useEditorStore.getState();
      deleteClip(clipId);
      
      // Note: Ripple mode check removed for simplicity - always perform ripple delete
      // Get current clips from store to avoid stale closure
      const currentClips = useEditorStore.getState().clips;
      const deletedClip = currentClips.find(c => c.id === clipId);
      if (deletedClip) {
        const clipDuration = deletedClip.end - deletedClip.start;
        const subsequentClips = currentClips.filter(c => 
          c.track === deletedClip.track && c.start >= deletedClip.end
        );
        
        // Move subsequent clips backward to fill the gap
        subsequentClips.forEach(clip => {
          if (onClipUpdate) {
            onClipUpdate(clip.id, {
              start: clip.start - clipDuration,
              end: clip.end - clipDuration
            });
          }
        });
      }
    },
  }), [multiSelection, onClipUpdate]);

  const shortcutsHook = useTimelineShortcuts({
    ...shortcutCallbacks,
    clips,
    selectedClipId,
    onClipSelect
  });
  
  // Pre-compute thumbnail styles to avoid recalculating on every render
  const thumbnailStyles = useMemo(() => {
    const styles: Record<string, any> = {};
    clips.forEach(clip => {
      if (clip.thumbnail) {
        styles[clip.id] = {
          backgroundImage: `url(${clip.thumbnail})`,
          backgroundSize: "contain",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        };
      }
    });
    
    if (clips.length > 0) {
      console.log("🖼️ [Timeline] Computed thumbnail styles for", Object.keys(styles).length, "clips");
    }
    
    return styles;
  }, [clips]); // Fixed: Use clips directly instead of creating new array on every render

  // Create a stable debounced function using useRef to prevent infinite loops
  const debouncedDurationAnalysisRef = useRef(
    debounce(() => {
      const currentClips = useEditorStore.getState().clips;
      const currentDuration = useEditorStore.getState().duration;
      
      if (currentClips.length > 0) {
        const totalIndividualDuration = currentClips.reduce((sum, clip) => sum + (clip.end - clip.start), 0);
        const maxEnd = Math.max(...currentClips.map(clip => clip.end));
        
        // Duration analysis (reduced logging)
        // console.log("🎬 [Timeline] DURATION ANALYSIS:", {
        //   clipsCount: currentClips.length,
        //   totalDuration: totalIndividualDuration.toFixed(2),
        //   maxEnd: maxEnd.toFixed(2),
        //   timelineDuration: currentDuration.toFixed(2),
        // });
      }
    }, 500)
  );

  // Trigger analysis when clips or duration change, but use a stable debounced function
  useEffect(() => {
    if (clips.length > 0) {
      debouncedDurationAnalysisRef.current();
    }
  }, [clips.length, duration]); // Only depend on clips.length and duration, not the clips array itself

  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Timeline state persistence - re-enabled after fixing debounced duration analysis
  const persistence = useTimelinePersistence(currentProjectId, {
    autoSaveEnabled: true,
    saveDebounceMs: 2000,
    autoZoomPersistence: true
  });
  
  // Use persisted state instead of local state
  const zoom = persistence.zoom;
  const thumbnailsVisible = persistence.thumbnailsVisible;
  const isAutoZoom = persistence.isAutoZoom;
  
  const [isDraggingHandle, setIsDraggingHandle] = useState<{ clipId: string; handle: 'start' | 'end' } | null>(null);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; dragStartX: number; clipStartTime: number } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ track: number; time: number; insertionIndex?: number; snapType?: string; snapped?: boolean } | null>(null);
  const [dragCursor, setDragCursor] = useState<{ x: number; y: number } | null>(null);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    menuType: 'clip' | 'timeline' | 'empty';
    targetClipId?: string;
    timelinePosition?: number;
  }>({
    visible: false,
    x: 0,
    y: 0,
    menuType: 'empty'
  });
  
  // Use the forwarded ref or fall back to internal ref
  const resolvedRef = (ref as React.RefObject<HTMLDivElement>) || timelineRef;

  // Convert clips to snap API format
  const convertClipsForSnapAPI = useCallback((
    clipsToConvert: Array<{
      id: string;
      start: number;
      end: number;
      track: number;
      type?: string;
      name?: string;
      asset?: string;
    }>, 
    trackFilter?: number
  ) => {
    return clipsToConvert
      .filter(clip => trackFilter === undefined || clip.track === trackFilter)
      .map(clip => ({
        id: clip.id,
        name: clip.name || clip.id,
        start: clip.start,
        end: clip.end,
        duration: clip.end - clip.start,
        file_path: clip.asset || "",
        type: clip.type || "video",
        track: clip.track,
        in_point: 0
      }));
  }, []);

  // Enhanced snap calculation using backend API
  const calculateSnapPosition = useCallback(async (
    targetPosition: number, 
    trackIndex: number, 
    excludeClipId?: string
  ): Promise<{ snappedPosition: number; snapType: string; snapped: boolean; insertionIndex: number }> => {
    try {
      // Filter out the clip being dragged
      const filteredClips = clips.filter(clip => clip.id !== excludeClipId);
      const snapClips = convertClipsForSnapAPI(filteredClips, trackIndex);
      
      const snapRequest: GESSnapRequest = {
        target_position: targetPosition,
        clips: snapClips,
        track_filter: trackIndex,
        snap_threshold: 2.0, // 2 second snap threshold
        include_timeline_markers: true
      };

      const response = await snapGESTimelinePosition(snapRequest);
      
      if (response.success && response.data) {
        return {
          snappedPosition: response.data.snapped_position,
          snapType: response.data.snap_type,
          snapped: response.data.snapped,
          insertionIndex: response.data.insertion_index
        };
      }
    } catch (error) {
      console.warn('🎯 [Timeline] Snap API failed, using fallback:', error);
    }
    
    // Fallback to existing logic if API fails
    const otherClipsOnTrack = clips.filter(c => c.id !== excludeClipId && c.track === trackIndex);
    const sortedClips = otherClipsOnTrack.sort((a, b) => a.start - b.start);
    
    let insertionIndex = 0;
    for (let i = 0; i < sortedClips.length; i++) {
      const currentClip = sortedClips[i];
      if (targetPosition < currentClip.start) {
        insertionIndex = i;
        break;
      }
      if (i === sortedClips.length - 1) {
        insertionIndex = sortedClips.length;
        break;
      }
    }
    
    return {
      snappedPosition: targetPosition,
      snapType: "none",
      snapped: false,
      insertionIndex
    };
  }, [clips, convertClipsForSnapAPI]);

  // Context menu action handler
  const handleContextMenuAction = useCallback((action: string, data?: { clipId?: string; timelinePosition?: number; menuType: 'clip' | 'timeline' | 'empty' }) => {
    console.log('🎯 [Timeline] Context menu action:', action, data);
    
    switch (action) {
      case 'cut_clip':
        if (data?.clipId) {
          console.log('✂️ [Timeline] Cut clip:', data.clipId);
          // TODO: Implement cut functionality
        }
        break;
        
      case 'copy_clip':
        if (data?.clipId) {
          console.log('📋 [Timeline] Copy clip:', data.clipId);
          // TODO: Implement copy functionality
        }
        break;
        
      case 'delete_clip':
        if (data?.clipId) {
          console.log('🗑️ [Timeline] Delete clip:', data.clipId);
          const { deleteClip } = useEditorStore.getState();
          deleteClip(data.clipId);
        }
        break;
        
      // Enhanced bulk operations
      case 'bulk_delete':
        if (multiSelection.selectedClipIds.length > 0) {
          console.log('🗑️ [Timeline] Bulk delete clips:', multiSelection.selectedClipIds);
          multiSelection.bulkDeleteClips(multiSelection.selectedClipIds);
        }
        break;
        
      case 'bulk_copy':
        if (multiSelection.selectedClipIds.length > 0) {
          console.log('📋 [Timeline] Bulk copy clips:', multiSelection.selectedClipIds);
          multiSelection.bulkCopyClips(multiSelection.selectedClipIds, 5.0); // 5 second offset
        }
        break;
        
      case 'bulk_move':
        if (multiSelection.selectedClipIds.length > 0 && data?.timelinePosition !== undefined) {
          console.log('🔄 [Timeline] Bulk move clips:', multiSelection.selectedClipIds);
          multiSelection.bulkMoveClips(multiSelection.selectedClipIds, 0, data.timelinePosition); // Move to track 0
        }
        break;
        
      case 'duplicate_clip':
        if (data?.clipId) {
          console.log('📄 [Timeline] Duplicate clip:', data.clipId);
          const clipToDuplicate = clips.find(c => c.id === data.clipId);
          if (clipToDuplicate && onVideoAssetDrop) {
            // Create a duplicate 1 second later
            const newStartTime = clipToDuplicate.end + 1;
            onVideoAssetDrop({
              ...clipToDuplicate,
              name: `${clipToDuplicate.name || 'Clip'} Copy`
            }, clipToDuplicate.track, newStartTime);
          }
        }
        break;
        
      case 'split_clip':
        if (data?.clipId) {
          console.log('✂️ [Timeline] Split clip at playhead:', data.clipId);
          // TODO: Implement split functionality
        }
        break;
        
      case 'ripple_delete':
        if (data?.clipId) {
          console.log('🌊 [Timeline] Ripple delete:', data.clipId);
          shortcutsHook.rippleDelete?.();
        }
        break;
        
      case 'select_all':
        console.log('🎯 [Timeline] Select all clips');
        multiSelection.selectAll();
        break;
        
      case 'deselect_all':
        console.log('❌ [Timeline] Deselect all clips');
        multiSelection.clearSelection();
        onClipSelect?.(null);
        break;
        
      case 'add_marker':
        console.log('📍 [Timeline] Add marker at:', data?.timelinePosition);
        if (data?.timelinePosition !== undefined) {
          markersHook.addMarker({
            position: data.timelinePosition,
            name: `Marker ${markersHook.markerCount + 1}`,
            color: '#ff0000'
          });
        }
        break;
        
      case 'zoom_fit':
        console.log('↔️ [Timeline] Zoom to fit');
        persistence.updateAutoZoom(true);
        // Calculate optimal zoom to fit all clips
        const maxTime = Math.max(...clips.map(c => c.end), 60);
        const containerWidth = 800; // Approximate timeline width
        const optimalZoom = Math.max(0.3, Math.min(3, containerWidth / (maxTime * 50)));
        persistence.updateZoom(optimalZoom);
        break;
        
      case 'zoom_in':
        console.log('🔍 [Timeline] Zoom in');
        persistence.updateZoom(Math.min(3, zoom + 0.2));
        persistence.updateAutoZoom(false);
        break;
        
      case 'zoom_out':
        console.log('🔍 [Timeline] Zoom out');
        persistence.updateZoom(Math.max(0.3, zoom - 0.2));
        persistence.updateAutoZoom(false);
        break;
        
      default:
        console.log('❓ [Timeline] Unhandled context menu action:', action);
    }
  }, [shortcutsHook, clips, onClipSelect, onVideoAssetDrop, markersHook, zoom, persistence, multiSelection]);
  
  // Add effect to force duration recalculation when clips change - debounced to prevent excessive calls
  const debouncedRecalculateDuration = useCallback(
    debounce(() => {
      if (clips.length > 0) {
        const maxEnd = Math.max(...clips.map(clip => clip.end));
        console.log("🎬 [Timeline] Calculated maxEnd:", maxEnd);
        console.log("🎬 [Timeline] Current duration vs maxEnd:", duration, "vs", maxEnd);
        
        // If duration doesn't match, force recalculation
        if (Math.abs(duration - maxEnd) > 0.1) {
          console.log("🎬 [Timeline] Duration mismatch detected, forcing recalculation");
          const { recalculateDuration } = useEditorStore.getState();
          recalculateDuration();
        }
      }
    }, 100), // Debounce by 100ms
    [clips, duration]
  );

  useEffect(() => {
    // console.log("🎬 [Timeline] Clips changed, scheduling duration recalculation");
    debouncedRecalculateDuration();
  }, [clips, debouncedRecalculateDuration]);
  
  // Get effective clips and calculate dynamic track count
  const effectiveClips = useMemo(() => {
    if (gesMode && currentProjectId) {
      const timelineClips: any[] = [];
      
      Object.entries(gesClipsByLayer || {}).forEach(([layerStr, clips]) => {
        const layer = parseInt(layerStr) as LayerType;
        if (!layerVisibility[layer]) return;
        
        const clipArray = Array.isArray(clips) ? clips : [];
        clipArray.forEach(clip => {
          timelineClips.push({
            id: clip.id,
            start: clip.start_time,
            end: clip.start_time + clip.duration,
            track: layer,
            type: clip.clip_type,
            name: clip.metadata?.text || `Clip ${clip.id.slice(-4)}`,
            text: clip.metadata?.text,
            asset: clip.asset_id,
            thumbnail: '',
            _gesClip: clip
          });
        });
      });
      
      return timelineClips;
    }
    return clips;
  }, [gesMode, currentProjectId, gesClipsByLayer, layerVisibility, clips]);
  
  const maxTrack = effectiveClips.length > 0 ? Math.max(...effectiveClips.map(clip => clip.track)) : 0;
  const trackCount = Math.max(maxTrack + 1, 3); // Minimum 3 tracks, expand as needed

  // Get track height based on track index - video track (track 0) is taller
  const getTrackHeight = (trackIndex: number) => {
    if (trackIndex === 0) {
      // Video track: height for iPhone aspect ratio (16:9) thumbnails
      // Using 80px height to accommodate proper video thumbnails
      return 80;
    }
    // Other tracks (overlay, text, etc.) keep original size
    return 48;
  };

  // Get clip height based on track index
  const getClipHeight = (trackIndex: number) => {
    if (trackIndex === 0) {
      return 76; // 4px margin from track height of 80px
    }
    return 40; // Original clip height for other tracks
  };

  // GES Layer Helper Functions
  const getLayerIcon = (layer: LayerType) => {
    switch (layer) {
      case LayerType.MAIN:
        return Video;
      case LayerType.OVERLAY:
        return Image;
      case LayerType.TEXT:
        return Type;
      case LayerType.EFFECTS:
        return Zap;
      case LayerType.AUDIO:
        return Music;
      default:
        return Video;
    }
  };
  
  const toggleLayerVisibility = (layer: LayerType) => {
    setLayerVisibility(prev => ({
      ...prev,
      [layer]: !prev[layer]
    }));
  };
  
  const toggleLayerLock = (layer: LayerType) => {
    setLayerLocked(prev => ({
      ...prev,
      [layer]: !prev[layer]
    }));
  };
  
  const handleLayerSelect = (layer: LayerType) => {
    onLayerSelect?.(layer);
  };
  


  // Dynamic zoom calculation based on content
  const calculateOptimalZoom = useCallback(() => {
    if (!resolvedRef.current || clips.length === 0 || !isAutoZoom) return zoom;
    
    // Get timeline container width
    const containerWidth = resolvedRef.current.getBoundingClientRect().width;
    if (containerWidth === 0) return zoom;
    
    // Calculate total content duration and minimum clip width requirements
    const contentDuration = duration;
    const clipCount = clips.length;
    
    // Base zoom calculation: ensure content fits well in viewport
    // Minimum of 50px per clip for readability, but also ensure total duration is well visible
    const minPixelsPerSecond = 20; // Minimum pixels per second for readability
    const maxPixelsPerSecond = 100; // Maximum to prevent over-zooming
    const idealPixelsPerSecond = Math.max(minPixelsPerSecond, Math.min(maxPixelsPerSecond, containerWidth / Math.max(contentDuration, 30)));
    
    // Calculate zoom level
    const baseZoom = idealPixelsPerSecond / (containerWidth / Math.max(contentDuration, 30));
    
    // Adjust based on number of clips for better UX
    const clipDensityFactor = Math.min(1.5, 1 + (clipCount * 0.05)); // Slight zoom boost for more clips
    
    const calculatedZoom = Math.max(0.3, Math.min(3, baseZoom * clipDensityFactor));
    
    console.log("🔍 [Timeline] Zoom calculation:", {
      containerWidth,
      contentDuration,
      clipCount,
      idealPixelsPerSecond,
      baseZoom,
      clipDensityFactor,
      calculatedZoom
    });
    
    return calculatedZoom;
  }, [resolvedRef, clips.length, duration, isAutoZoom]);
  
  // Auto-zoom effect when content changes
  useEffect(() => {
    if (isAutoZoom && clips.length > 0) {
      const optimalZoom = calculateOptimalZoom();
      if (Math.abs(optimalZoom - zoom) > 0.1) { // Only update if significant change
        persistence.updateZoom(optimalZoom);
      }
    }
  }, [clips.length, duration, isAutoZoom, calculateOptimalZoom, persistence]);
  
  // Effect to handle duration changes - log when duration changes
  useEffect(() => {
    console.log('🎬 [Timeline] Duration changed to:', duration);
    console.log('🎬 [Timeline] Current clips count:', clips.length);
    
    // If we have clips but duration is still 0, there might be an issue
    if (clips.length > 0 && duration === 0) {
      console.warn('🎬 [Timeline] Warning: We have clips but duration is 0!');
    }
  }, [duration, clips.length]);

  // Zoom to fit content function
  const zoomToFit = () => {
    const optimalZoom = calculateOptimalZoom();
    persistence.updateZoom(optimalZoom);
    persistence.updateAutoZoom(true);
  };

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Generate time markers based on duration and zoom
  const generateTimeMarkers = () => {
    const markers = [];
    
    // Handle case where duration is 0 or very small
    if (duration <= 0) {
      return markers;
    }
    
    // Dynamic step size based on duration for better spacing
    let step = 5; // Default 5 second intervals
    
    if (duration <= 30) {
      step = 5; // 5 second intervals for short durations
    } else if (duration <= 120) {
      step = 10; // 10 second intervals for medium durations  
    } else if (duration <= 600) {
      step = 30; // 30 second intervals for longer durations
    } else {
      step = 60; // 1 minute intervals for very long durations
    }
    
    // Remove excessive logging - only log when step changes significantly
    // console.log(`🎬 [Timeline] Generating markers with duration=${duration}, step=${step}`);
    
    for (let i = 0; i <= duration; i += step) {
      markers.push(
        <div
          key={i}
          className="absolute h-3 border-l border-cre8r-gray-600 text-xs text-cre8r-gray-400"
          style={{ left: `${(i / duration) * 100}%` }}
        >
          <span className="absolute top-3 left-1">{formatTime(i)}</span>
        </div>
      );
    }
    
    // Always add a marker at the very end if it's not already there
    const lastMarkerTime = Math.floor(duration / step) * step;
    if (lastMarkerTime < duration) {
      markers.push(
        <div
          key="end"
          className="absolute h-3 border-l border-cre8r-gray-600 text-xs text-cre8r-gray-400"
          style={{ left: '100%' }}
        >
          <span className="absolute top-3 left-1">{formatTime(duration)}</span>
        </div>
      );
    }
    
    return markers;
  };

  // Get color for clip based on type
  const getClipStyle = (type?: string) => {
    switch (type) {
      case "text":
        return "from-green-700 to-green-500";  // Green for text elements
      case "overlay":
        return "from-orange-700 to-orange-500";  // Orange for overlay elements
      case "video":
        return "from-cre8r-violet-dark to-cre8r-violet";  // Keep purple for video
      case "trim":
        return "from-blue-700 to-blue-500";
      case "highlight":
        return "from-yellow-700 to-yellow-500";
      case "subtitle":
        return "from-green-700 to-green-500";
      case "audio":
        return "from-purple-700 to-purple-500";
      case "color":
        return "from-orange-700 to-orange-500";
      case "crop":
        return "from-pink-700 to-pink-500";
      case "cut":
        return "from-red-700 to-red-500";
      case "fade":
        return "from-indigo-700 to-indigo-500";
      case "zoom":
        return "from-emerald-700 to-emerald-500";
      case "speed":
        return "from-amber-700 to-amber-500";
      case "brightness":
        return "from-sky-700 to-sky-500";
      case "textOverlay":
        return "from-green-700 to-green-500";  // Also green for consistency with text
      default:
        return "from-cre8r-violet-dark to-cre8r-violet";  // Default purple for video elements
    }
  };

  // Debounced function to handle thumbnail updates on zoom changes
  const debouncedThumbnailUpdate = useCallback(
    debounce((newZoom) => {
      // This would trigger a re-fetch of thumbnails at appropriate resolution
      console.log("Updating thumbnails for zoom level:", newZoom);
    }, 300),
    []
  );

  // Effect to handle zoom changes for thumbnails
  useEffect(() => {
    if (thumbnailsVisible) {
      debouncedThumbnailUpdate(zoom);
    }
  }, [zoom, thumbnailsVisible, debouncedThumbnailUpdate]);

  // Handle timeline click to update current time
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!resolvedRef.current) return;

    const rect = resolvedRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickedTime = (x / rect.width) * duration;
    
    // Check if user clicked on a marker (with tolerance for easy clicking)
    const clickedMarker = markersHook.getMarkerAtPosition(clickedTime, 1.0); // 1 second tolerance
    
    if (clickedMarker) {
      // Navigate to the clicked marker
      console.log('🎯 [Timeline] Clicked on marker:', clickedMarker.name);
      markersHook.goToMarker(clickedMarker.id);
    } else {
      // Normal timeline click - seek to position
      // Allow cursor to reach the end of the timeline duration (which includes the last clip)
      onTimeUpdate(Math.max(0, clickedTime));
    }
  };

  // Handle clip drag start
  const handleClipDragStart = (e: React.DragEvent, clip: any) => {
    console.log('🎬 [Timeline] Starting clip drag:', clip.id);
    
    // Set drag data for the clip being moved
    e.dataTransfer.setData("application/json", JSON.stringify({
      type: "TIMELINE_CLIP",
      clipId: clip.id,
      originalTrack: clip.track,
      originalStart: clip.start
    }));
    e.dataTransfer.effectAllowed = "move";
    
    // Store drag state
    const rect = resolvedRef.current?.getBoundingClientRect();
    if (rect) {
      const dragStartX = e.clientX - rect.left;
      setDraggingClip({
        clipId: clip.id,
        dragStartX,
        clipStartTime: clip.start
      });
    }
    
    // Add global mouse move listener for better tracking
    document.addEventListener('dragover', handleGlobalDragOver);
  };
  
  // Global drag over handler for better tracking
  const handleGlobalDragOver = useCallback((e: DragEvent) => {
    if (!draggingClip || !resolvedRef.current) return;
    
    e.preventDefault();
    
    const timelineRect = resolvedRef.current.getBoundingClientRect();
    
    // Update cursor position relative to timeline for visual tracking
    const relativeX = e.clientX - timelineRect.left;
    const relativeY = e.clientY - timelineRect.top;
    
    setDragCursor({
      x: relativeX,
      y: relativeY
    });
    
    // Check if mouse is over the timeline
    const isOverTimeline = e.clientX >= timelineRect.left && e.clientX <= timelineRect.right &&
                          e.clientY >= timelineRect.top && e.clientY <= timelineRect.bottom;
    
          if (isOverTimeline) {
        const headerHeight = 28;
        let trackIndex = 0;
        let currentY = headerHeight;
        
        // Calculate which track based on cumulative heights
        for (let i = 0; i < trackCount; i++) {
          const trackHeight = getTrackHeight(i) + 4; // Add gap
          if (relativeY >= currentY && relativeY < currentY + trackHeight) {
            trackIndex = i;
            break;
          }
          currentY += trackHeight;
          if (i === trackCount - 1) {
            trackIndex = trackCount - 1; // Default to last track if beyond all tracks
          }
        }
        
        if (trackIndex >= 0 && trackIndex < trackCount) {
          const rawDropTime = (relativeX / timelineRect.width) * duration;
          
          // Use async snap for enhanced positioning (with fallback for immediate UI feedback)
          calculateSnapPosition(rawDropTime, trackIndex, draggingClip.clipId)
            .then(snapResult => {
              setDropIndicator({ 
                track: trackIndex, 
                time: snapResult.snappedPosition, 
                insertionIndex: snapResult.insertionIndex,
                snapType: snapResult.snapType,
                snapped: snapResult.snapped
              });
            })
            .catch(() => {
              // Fallback to basic positioning if snap API fails
              setDropIndicator({ track: trackIndex, time: rawDropTime, insertionIndex: 0 });
            });
        } else {
          setDropIndicator(null);
        }
      } else {
        setDropIndicator(null);
      }
  }, [draggingClip, clips, duration, trackCount, getTrackHeight]);

  // Handle clip drag end
  const handleClipDragEnd = (e: React.DragEvent) => {
    console.log('🎬 [Timeline] Ending clip drag');
    setDraggingClip(null);
    setDropIndicator(null);
    setDragCursor(null);
    
    // Remove global listener
    document.removeEventListener('dragover', handleGlobalDragOver);
  };
  
  // Handle global drag over for the entire timeline
  const handleTimelineDragOver = (e: React.DragEvent) => {
    if (!draggingClip) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Find which track the mouse is over
    const timelineRect = resolvedRef.current?.getBoundingClientRect();
    if (!timelineRect) return;
    
    const relativeY = e.clientY - timelineRect.top;
    const trackHeight = 48 + 4; // Track height + gap (h-12 = 48px + gap-1 = 4px)
    const headerHeight = 28; // Time markers height (h-6 = 24px + margin)
    const trackIndex = Math.floor((relativeY - headerHeight) / trackHeight);
    

    
    // Only update if we're over a valid track
    if (trackIndex >= 0 && trackIndex < trackCount) {
      updateDropIndicator(e, trackIndex);
    } else {
      // Clear drop indicator if not over a valid track
      setDropIndicator(null);
    }
  };
  
  // Handle drag leave from timeline
  const handleTimelineDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving the timeline container
    const rect = resolvedRef.current?.getBoundingClientRect();
    if (rect) {
      const isOutside = e.clientX < rect.left || e.clientX > rect.right || 
                       e.clientY < rect.top || e.clientY > rect.bottom;
      if (isOutside) {
        setDropIndicator(null);
      }
    }
  };

  // Handle drag over for video dropping and clip moving
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => {
    e.preventDefault();
    e.stopPropagation(); // Always prevent event bubbling
    
    // If we're dragging a clip, let the global handler manage the drop indicator
    if (draggingClip) {
      return;
    }
    
    const target = e.currentTarget as HTMLDivElement;
    target.style.backgroundColor = "rgba(139, 92, 246, 0.1)"; // Highlight drop zone
    
    // Use async updateDropIndicator for enhanced snap functionality
    updateDropIndicator(e, trackIndex);
    
    target.style.borderLeft = "2px solid rgba(139, 92, 246, 0.8)";
    target.style.borderLeftStyle = "dashed";
  };
  
  // Enhanced drop indicator with snap functionality
  const updateDropIndicator = useCallback(async (e: React.DragEvent | React.MouseEvent, trackIndex: number) => {
    const rect = resolvedRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const rawDropTime = (x / rect.width) * duration;
      
      // Use snap API for enhanced positioning
      const excludeClipId = draggingClip?.clipId;
      const snapResult = await calculateSnapPosition(rawDropTime, trackIndex, excludeClipId);
      
      const finalDropTime = snapResult.snappedPosition;
      
      console.log('🎯 [Timeline] Snap result:', {
        raw: rawDropTime.toFixed(2),
        final: finalDropTime.toFixed(2),
        type: snapResult.snapType,
        snapped: snapResult.snapped
      });
      
      // Update drop indicator with enhanced snap information
      setDropIndicator({ 
        track: trackIndex, 
        time: finalDropTime, 
        insertionIndex: snapResult.insertionIndex,
        snapType: snapResult.snapType,
        snapped: snapResult.snapped
      });
    }
  }, [duration, draggingClip, calculateSnapPosition, resolvedRef]);

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event from bubbling up to parent components
    
    // If we're dragging a clip, let the global handler manage the drop indicator
    if (draggingClip) {
      return;
    }
    
    const target = e.currentTarget as HTMLDivElement;
    target.style.backgroundColor = "";
    target.style.borderLeft = "";
    target.style.borderLeftStyle = "";
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event from bubbling up to parent components
    const target = e.currentTarget as HTMLDivElement;
    target.style.backgroundColor = "";
    target.style.borderLeft = "";
    target.style.borderLeftStyle = "";
    setDropIndicator(null);
    
    // Check if this is a file drop or a video asset drop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // This is a file drop
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("video/")) return;

      const rect = resolvedRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const dropTime = (x / rect.width) * duration;

      onVideoDrop?.(file, trackIndex, dropTime);
    } else {
      // Check if this is a video asset drop or clip move
      try {
        const assetData = e.dataTransfer.getData("application/json");
        if (assetData) {
          const asset = JSON.parse(assetData);
          
          if (asset.type === "TIMELINE_CLIP") {
            // This is a clip being moved within the timeline
            console.log('🎬 [Timeline] Clip move detected:', asset.clipId);
            
            const rect = resolvedRef.current?.getBoundingClientRect();
            if (!rect) return;

            const x = e.clientX - rect.left;
            const newStartTime = (x / rect.width) * duration;
            
            // Only move if position or track changed
            if (asset.originalTrack !== trackIndex || Math.abs(asset.originalStart - newStartTime) > 0.1) {
              console.log('🎬 [Timeline] Moving clip to track', trackIndex, 'at time', newStartTime);
              onClipMove?.(asset.clipId, trackIndex, Math.max(0, newStartTime));
            }
            
            return;
          }
          
          if (asset.type === "ASSET") {
            // This is an asset from our AssetsTabs
            console.log("Asset dropped:", asset.asset);
            // Here you would handle the asset drop based on its type
            // For now, we'll just pass it to onVideoAssetDrop if it's a video
            if (asset.asset.type === "video") {
              const rect = resolvedRef.current?.getBoundingClientRect();
              if (!rect) return;
              
              const x = e.clientX - rect.left;
              const dropTime = (x / rect.width) * duration;
              
              onVideoAssetDrop?.(asset.asset, trackIndex, dropTime);
            }
          } else if (asset.type === "MULTIPLE_ASSETS") {
            // This is a multiple asset drop from AssetPanel
            console.log("🎬 [Timeline] Multiple assets dropped:", asset.assets.map((a: any) => a.name));
            
            const rect = resolvedRef.current?.getBoundingClientRect();
            if (!rect) return;

            const x = e.clientX - rect.left;
            const dropTime = (x / rect.width) * duration;
            
            // Disable auto-zoom temporarily to prevent it from firing during multi-drop
            persistence.updateAutoZoom(false);
            
            onMultipleVideoAssetDrop?.(asset.assets, trackIndex, dropTime);
            
            // Re-enable auto-zoom after a short delay to allow all clips to be added
            setTimeout(() => {
              persistence.updateAutoZoom(true);
            }, 500);
          } else {
            // This is a regular video asset drop (from AssetPanel)
            const rect = resolvedRef.current?.getBoundingClientRect();
            if (!rect) return;

            const x = e.clientX - rect.left;
            const dropTime = (x / rect.width) * duration;
            
            onVideoAssetDrop?.(asset, trackIndex, dropTime);
          }
        }
      } catch (error) {
        console.error("Error parsing dragged asset:", error);
      }
    }
  };

  // Handle mouse down on trim handles
  const handleTrimHandleMouseDown = (
    e: React.MouseEvent,
    clipId: string,
    handle: 'start' | 'end'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingHandle({ clipId, handle });
    
    // Add event listeners for mousemove and mouseup
    document.addEventListener('mousemove', handleTrimHandleMouseMove);
    document.addEventListener('mouseup', handleTrimHandleMouseUp);
  };
  
  // Handle mouse move when dragging trim handles
  const handleTrimHandleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingHandle || !resolvedRef.current) return;
    
    const { clipId, handle } = isDraggingHandle;
    const clipToUpdate = clips.find(clip => clip.id === clipId);
    
    if (!clipToUpdate) return;
    
    const rect = resolvedRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const draggedTime = (x / rect.width) * duration;
    
    // Calculate the new start/end time with constraints
    if (handle === 'start') {
      // Don't allow start time to go past end time - 1 second minimum duration
      const newStart = Math.min(Math.max(0, draggedTime), clipToUpdate.end - 1);
      onClipUpdate?.(clipId, { start: newStart });
    } else if (handle === 'end') {
      // Don't allow end time to go before start time + 1 second minimum duration
      const newEnd = Math.max(Math.min(duration, draggedTime), clipToUpdate.start + 1);
      onClipUpdate?.(clipId, { end: newEnd });
    }
  }, [isDraggingHandle, clips, duration, onClipUpdate, resolvedRef]);
  
  // Handle mouse up to end dragging
  const handleTrimHandleMouseUp = useCallback(() => {
    setIsDraggingHandle(null);
    
    // Remove event listeners
    document.removeEventListener('mousemove', handleTrimHandleMouseMove);
    document.removeEventListener('mouseup', handleTrimHandleMouseUp);
  }, [handleTrimHandleMouseMove]);
  
  // Clean up event listeners on component unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleTrimHandleMouseMove);
      document.removeEventListener('mouseup', handleTrimHandleMouseUp);
      document.removeEventListener('dragover', handleGlobalDragOver);
    };
  }, [handleTrimHandleMouseMove, handleTrimHandleMouseUp, handleGlobalDragOver]);

  return (
    <>
      <div className="h-full flex flex-col bg-cre8r-gray-900 border-t border-cre8r-gray-700 select-none">
        <div className="flex items-center justify-between p-2 bg-cre8r-gray-800 border-b border-cre8r-gray-700">
        <div className="flex items-center gap-2">
          <button 
            className="p-1 hover:bg-cre8r-gray-700 rounded" 
            onClick={() => {
              persistence.updateZoom(Math.max(0.5, zoom - 0.1));
              persistence.updateAutoZoom(false); // Disable auto-zoom when manually adjusting
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-minus"><path d="M5 12h14"/></svg>
          </button>
          <span className="text-xs text-cre8r-gray-300">{Math.round(zoom * 100)}%</span>
          <button 
            className="p-1 hover:bg-cre8r-gray-700 rounded" 
            onClick={() => {
              persistence.updateZoom(Math.min(2, zoom + 0.1));
              persistence.updateAutoZoom(false); // Disable auto-zoom when manually adjusting
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
          <button
            className={`p-1 hover:bg-cre8r-gray-700 rounded text-xs ${thumbnailsVisible ? 'text-cre8r-violet' : 'text-cre8r-gray-400'}`}
            onClick={() => persistence.updateThumbnailsVisible(!thumbnailsVisible)}
          >
            {thumbnailsVisible ? 'Hide Thumbnails' : 'Show Thumbnails'}
          </button>
          <button
            className="p-1 hover:bg-cre8r-gray-700 rounded text-xs text-cre8r-gray-300 hover:text-white"
            onClick={zoomToFit}
            title="Zoom to fit all content"
          >
            Fit
          </button>
          <button
            className={`p-1 hover:bg-cre8r-gray-700 rounded text-xs ${
              isAutoZoom ? 'text-cre8r-violet' : 'text-cre8r-gray-400'
            }`}
            onClick={() => persistence.updateAutoZoom(!isAutoZoom)}
            title="Auto-zoom when content changes"
          >
            Auto
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-cre8r-gray-200">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          
          {/* Ripple Mode indicator */}
          <div className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
            shortcutsHook.isRippleMode 
              ? 'bg-orange-600 text-white' 
              : 'bg-cre8r-gray-700 text-cre8r-gray-400'
          }`}
            title={shortcutsHook.isRippleMode ? 'Ripple Mode ON - Press R to toggle' : 'Ripple Mode OFF - Press R to toggle'}
          >
            <span>🌊</span>
            <span>{shortcutsHook.isRippleMode ? 'RIPPLE' : 'NORMAL'}</span>
          </div>

          {/* Mark In/Out indicators */}
          {(shortcutsHook.hasMarks) && (
            <div className="flex items-center gap-1 px-2 py-1 bg-cre8r-gray-700 rounded text-xs">
              {shortcutsHook.marks.markIn !== null && (
                <div 
                  className="flex items-center gap-1 text-green-400 cursor-pointer hover:text-green-300"
                  onClick={shortcutsHook.jumpToMarkIn}
                  title={`Mark In: ${shortcutsHook.marks.markIn?.toFixed(2)}s - Click to jump or press [`}
                >
                  <span>⏮️</span>
                  <span>IN</span>
                </div>
              )}
              {shortcutsHook.marks.markOut !== null && (
                <div 
                  className="flex items-center gap-1 text-red-400 cursor-pointer hover:text-red-300"
                  onClick={shortcutsHook.jumpToMarkOut}
                  title={`Mark Out: ${shortcutsHook.marks.markOut?.toFixed(2)}s - Click to jump or press ]`}
                >
                  <span>⏭️</span>
                  <span>OUT</span>
                </div>
              )}
              {shortcutsHook.hasMarkRange && (
                <button
                  onClick={shortcutsHook.selectMarkedRange}
                  className="text-blue-400 hover:text-blue-300 ml-1"
                  title="Select clips in marked range - Shift+Enter"
                >
                  📍
                </button>
              )}
            </div>
          )}

          {/* Multi-selection indicator */}
          {shortcutsHook.multiSelectionCount > 0 && (
            <div className="px-2 py-1 text-xs bg-blue-600 text-white rounded">
              {shortcutsHook.multiSelectionCount} selected
            </div>
          )}

          {/* Persistence status indicator */}
          {currentProjectId && (
            <div className="flex items-center gap-2 text-xs text-cre8r-gray-400">
              {/* Timeline state persistence indicator */}
              <div className="flex items-center gap-1">
                <div 
                  className={`w-2 h-2 rounded-full ${
                    persistence.isLoading ? 'bg-yellow-500 animate-pulse' : 
                    persistence.isSaving ? 'bg-blue-500 animate-pulse' :
                    persistence.lastError ? 'bg-red-500' : 
                    persistence.isReady ? 'bg-green-500' : 'bg-cre8r-gray-600'
                  }`}
                />
                <span 
                  title={
                    persistence.lastError ? `Error: ${persistence.lastError}` :
                    persistence.isSaving ? 'Saving timeline state...' :
                    persistence.isLoading ? 'Loading timeline state...' :
                    `Saved: ${persistence.metrics.saveCount} times`
                  }
                >
                  💾
                </span>
              </div>
              
              {/* Markers status indicator */}
              <div className="flex items-center gap-1">
                <div 
                  className={`w-2 h-2 rounded-full ${
                    markersHook.isLoading ? 'bg-yellow-500 animate-pulse' : 
                    markersHook.error ? 'bg-red-500' : 
                    markersHook.hasMarkers ? 'bg-green-500' : 'bg-cre8r-gray-600'
                  }`}
                />
                <span title={markersHook.error || `${markersHook.markerCount} markers loaded`}>
                  {markersHook.markerCount}M
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-x-auto overflow-y-hidden p-2 bg-cre8r-gray-900">
        {/* Timeline with markers */}
        <div 
          ref={resolvedRef}
          className="relative h-full"
          style={{ 
            width: `${Math.max(100 * zoom, 100)}%`, 
            // Ensure minimum width for timeline interaction even with short durations
            minWidth: duration > 0 ? `${Math.max(800, duration * 20)}px` : "800px"
          }}
          onClick={(e) => {
            // Deselect any selected clip when clicking empty timeline space
            if (e.target === e.currentTarget) {
              onClipSelect?.(null);
            }
            handleTimelineClick(e);
            // Close context menu on any click
            if (contextMenu.visible) {
              setContextMenu(prev => ({ ...prev, visible: false }));
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Calculate timeline position from mouse position
            if (!resolvedRef.current) return;
            const rect = resolvedRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const clickedTime = (x / rect.width) * duration;
            
            console.log('🖱️ [Timeline] Right-click on main timeline at position:', clickedTime.toFixed(2));
            setContextMenu({
              visible: true,
              x: e.clientX,
              y: e.clientY,
              menuType: 'timeline',
              timelinePosition: clickedTime
            });
          }}
          onDragOver={handleTimelineDragOver}
          onDragLeave={handleTimelineDragLeave}
        >
          {/* Drag tracking line - positioned relative to timeline */}
          {draggingClip && dragCursor && (
            <div
              className="absolute pointer-events-none z-[60] w-0.5 bg-cre8r-violet shadow-lg"
              style={{
                left: dragCursor.x,
                top: 0,
                bottom: 0,
                height: '100%'
              }}
            >
              {/* Circular indicator at cursor position */}
              <div 
                className="absolute w-3 h-3 bg-cre8r-violet rounded-full shadow-lg"
                style={{
                  left: '-5px',
                  top: dragCursor.y - 6
                }}
              />
            </div>
          )}
          
          {/* Time markers */}
          <div className="h-6 border-b border-cre8r-gray-700 relative mb-1">
            {generateTimeMarkers()}
            
            {/* Mark In/Out visual indicators on timeline */}
            {shortcutsHook.marks.markIn !== null && (
              <div
                className="absolute top-0 bottom-0 w-1 bg-green-500 cursor-pointer group z-20"
                style={{
                  left: `${(shortcutsHook.marks.markIn / duration) * 100}%`
                }}
                onClick={shortcutsHook.jumpToMarkIn}
                title={`Mark In: ${shortcutsHook.marks.markIn.toFixed(2)}s - Click to jump`}
              >
                <div className="absolute -top-2 -left-1 w-3 h-3 bg-green-500 transform rotate-45"></div>
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 px-1 py-0.5 bg-green-500 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  IN
                </div>
              </div>
            )}
            
            {shortcutsHook.marks.markOut !== null && (
              <div
                className="absolute top-0 bottom-0 w-1 bg-red-500 cursor-pointer group z-20"
                style={{
                  left: `${(shortcutsHook.marks.markOut / duration) * 100}%`
                }}
                onClick={shortcutsHook.jumpToMarkOut}
                title={`Mark Out: ${shortcutsHook.marks.markOut.toFixed(2)}s - Click to jump`}
              >
                <div className="absolute -top-2 -left-1 w-3 h-3 bg-red-500 transform rotate-45"></div>
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 px-1 py-0.5 bg-red-500 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  OUT
                </div>
              </div>
            )}

            {/* Mark range highlight */}
            {shortcutsHook.hasMarkRange && (
              <div
                className="absolute top-0 bottom-0 bg-blue-500 bg-opacity-20 border-l border-r border-blue-500 pointer-events-none"
                style={{
                  left: `${(Math.min(shortcutsHook.marks.markIn!, shortcutsHook.marks.markOut!) / duration) * 100}%`,
                  width: `${(Math.abs(shortcutsHook.marks.markOut! - shortcutsHook.marks.markIn!) / duration) * 100}%`
                }}
              />
            )}
            
            {/* Timeline Markers */}
            {markersHook.markers.map((marker) => (
              <div
                key={marker.id}
                className="absolute top-0 bottom-0 w-0.5 cursor-pointer group hover:w-1 transition-all"
                style={{
                  left: `${(marker.position / duration) * 100}%`,
                  backgroundColor: marker.color
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  markersHook.goToMarker(marker.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Right-click on marker to delete it
                  if (window.confirm(`Delete marker "${marker.name}"?`)) {
                    markersHook.removeMarker(marker.id);
                  }
                }}
                title={`${marker.name} (${marker.position.toFixed(2)}s)${marker.note ? ` - ${marker.note}` : ''}`}
              >
                {/* Marker flag icon */}
                <div
                  className="absolute -top-1 -left-1.5 w-3 h-3 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: marker.color }}
                >
                  <svg 
                    viewBox="0 0 12 12" 
                    className="w-full h-full text-white fill-current"
                  >
                    <path d="M1 1 L10 1 L8 6 L10 11 L1 11 Z" />
                  </svg>
                </div>
                
                {/* Marker label on hover */}
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  {marker.name}
                </div>
              </div>
            ))}
          </div>

          {/* Tracks without labels - full width */}
          <div className="flex flex-col gap-1">
            {gesMode && currentProjectId ? (
              // GES Mode: Layer-based rendering
              Object.values(LayerType).filter(value => typeof value === 'number').map((layer) => {
                const LayerIcon = getLayerIcon(layer);
                const layerColor = getLayerColor(layer);
                const isSelected = selectedLayer === layer;
                const isVisible = layerVisibility[layer];
                const isLocked = layerLocked[layer];
                                 const layerClips = effectiveClips.filter(clip => clip.track === layer);
                
                return (
                  <div key={layer} className="relative">
                    {/* Layer Header */}
                    <div 
                      className={cn(
                        "flex items-center gap-2 px-3 py-1 border-b border-cre8r-gray-700 cursor-pointer transition-colors",
                        isSelected 
                          ? "bg-cre8r-violet/20 border-cre8r-violet/30" 
                          : "hover:bg-cre8r-gray-700/50"
                      )}
                      onClick={() => handleLayerSelect(layer)}
                    >
                      <div 
                        className="w-4 h-4 rounded flex items-center justify-center"
                        style={{ backgroundColor: layerColor + '20', color: layerColor }}
                      >
                        <LayerIcon className="h-3 w-3" />
                      </div>
                      <span className="text-xs font-medium text-white flex-1">
                        {getLayerName(layer)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-cre8r-gray-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLayerVisibility(layer);
                          }}
                        >
                          {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-cre8r-gray-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLayerLock(layer);
                          }}
                        >
                          {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Layer Track */}
                    <div 
                      className={cn(
                        "w-full bg-cre8r-gray-800 rounded border border-cre8r-gray-700 relative",
                        !isVisible && "opacity-30",
                        isLocked && "cursor-not-allowed"
                      )}
                      style={{ height: `${getTrackHeight(layer)}px` }}
                      onDragOver={!isLocked ? (e) => handleDragOver(e, layer) : undefined}
                      onDragLeave={!isLocked ? handleDragLeave : undefined}
                      onDrop={!isLocked ? (e) => handleDrop(e, layer) : undefined}
                      onContextMenu={(e) => {
                        if (isLocked) return;
                        
                        const clickedElement = e.target as HTMLElement;
                        const isClipElement = clickedElement.closest('[draggable="true"]');
                        
                        if (!isClipElement) {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const relativeX = e.clientX - rect.left;
                          const timelinePosition = (relativeX / rect.width) * duration;
                          
                          setContextMenu({
                            visible: true,
                            x: e.clientX,
                            y: e.clientY,
                            menuType: 'empty',
                            timelinePosition
                          });
                        }
                      }}
                    >
                      {/* Render clips for this layer */}
                      {layerClips.map((clip) => {
                        const isDragging = draggingClip?.clipId === clip.id;
                        const clipHeight = getClipHeight(layer);
                        const marginTop = (getTrackHeight(layer) - clipHeight) / 2;
                        
                        return (
                          <div
                            key={clip.id}
                            draggable={!isLocked}
                            className={cn(
                              "absolute rounded overflow-hidden cursor-move hover:opacity-100 transition-opacity",
                              selectedClipId === clip.id ? "border-2 border-white ring-2 ring-cre8r-violet opacity-100" : 
                              multiSelection.selectedClipIds.includes(clip.id) ? "border-2 border-blue-400 ring-2 ring-blue-400 opacity-100" :
                              "opacity-90 hover:ring-1 hover:ring-white border-0",
                              isDragging && "opacity-30 z-50 scale-95 transition-all duration-200",
                              isLocked && "cursor-not-allowed"
                            )}
                            style={{
                              left: `${(clip.start / duration) * 100}%`,
                              width: `${((clip.end - clip.start) / duration) * 100}%`,
                              height: `${clipHeight}px`,
                              top: `${marginTop}px`,
                              backgroundColor: layerColor + '40'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLocked) return;
                              
                              if (e.ctrlKey || e.metaKey) {
                                multiSelection.toggleSelection(clip.id);
                              } else {
                                onClipSelect?.(clip.id);
                                multiSelection.setSelectedClipIds([clip.id]);
                              }
                            }}
                            onContextMenu={(e) => {
                              if (isLocked) return;
                              
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY,
                                menuType: 'clip',
                                targetClipId: clip.id,
                                timelinePosition: clip.start
                              });
                              onClipSelect?.(clip.id);
                            }}
                            onDragStart={!isLocked ? (e) => handleClipDragStart(e, clip) : undefined}
                            onDragEnd={!isLocked ? handleClipDragEnd : undefined}
                            title={clip.name || clip.text || clip.asset || "Edit"}
                          >
                            <div className="h-full w-full bg-gradient-to-r from-black/20 to-transparent flex items-center justify-center px-2">
                              <span className="text-xs text-white truncate font-medium">
                                {clip.name || clip.text || clip.asset || formatTime(clip.end - clip.start)}
                              </span>
                            </div>
                            {/* Trim handles */}
                            {!isLocked && (
                              <>
                                <div 
                                  className="absolute left-0 top-0 bottom-0 w-3 hover:bg-white hover:bg-opacity-30 cursor-w-resize z-10"
                                  onMouseDown={(e) => handleTrimHandleMouseDown(e, clip.id, 'start')}
                                  onDragStart={(e) => e.preventDefault()}
                                  title="Trim start"
                                >
                                  <div className="h-full w-1 bg-white opacity-60 mx-auto"></div>
                                </div>
                                <div 
                                  className="absolute right-0 top-0 bottom-0 w-3 hover:bg-white hover:bg-opacity-30 cursor-e-resize z-10"
                                  onMouseDown={(e) => handleTrimHandleMouseDown(e, clip.id, 'end')}
                                  onDragStart={(e) => e.preventDefault()}
                                  title="Trim end"
                                >
                                  <div className="h-full w-1 bg-white opacity-60 mx-auto"></div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Drop indicator for layers */}
                      {dropIndicator && dropIndicator.track === layer && (
                        <div className="absolute top-0 bottom-0 pointer-events-none z-50">
                          <div
                            className={`absolute top-0 bottom-0 w-1 shadow-lg transition-colors ${
                              dropIndicator.snapped 
                                ? 'bg-green-500 shadow-green-500/50' 
                                : 'bg-cre8r-violet shadow-cre8r-violet/50'
                            }`}
                            style={{
                              left: `${(dropIndicator.time / duration) * 100}%`,
                              transform: 'translateX(-50%)'
                            }}
                          >
                            <div className={`absolute -top-2 -left-1.5 w-3 h-3 rounded-full shadow-lg ${
                              dropIndicator.snapped ? 'bg-green-500' : 'bg-cre8r-violet'
                            }`}></div>
                            <div className={`absolute -bottom-2 -left-1.5 w-3 h-3 rounded-full shadow-lg ${
                              dropIndicator.snapped ? 'bg-green-500' : 'bg-cre8r-violet'
                            }`}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              // Traditional Mode: Track-based rendering
              Array.from({ length: trackCount }).map((_, index) => (
              <div 
                key={index}
                className="w-full bg-cre8r-gray-800 rounded border border-cre8r-gray-700 relative"
                style={{ height: `${getTrackHeight(index)}px` }}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onContextMenu={(e) => {
                  // Only show context menu if clicking on empty area (not on a clip)
                  const clickedElement = e.target as HTMLElement;
                  const isClipElement = clickedElement.closest('[draggable="true"]');
                  
                  if (!isClipElement) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🖱️ [Timeline] Right-click on empty timeline area, track:', index);
                    
                    // Calculate timeline position from mouse position
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const relativeX = e.clientX - rect.left;
                    const timelinePosition = (relativeX / rect.width) * duration;
                    
                    setContextMenu({
                      visible: true,
                      x: e.clientX,
                      y: e.clientY,
                      menuType: 'empty',
                      timelinePosition
                    });
                  }
                }}
              >
                {/* Render all clips for this track */}
                {effectiveClips.filter(clip => clip.track === index).map((clip) => {
                  const isDragging = draggingClip?.clipId === clip.id;
                  const clipHeight = getClipHeight(index);
                  const marginTop = (getTrackHeight(index) - clipHeight) / 2; // Center clip in track
                  
                  return (
                    <div
                      key={clip.id}
                      draggable
                      className={cn(
                        "absolute rounded overflow-hidden cursor-move hover:opacity-100 transition-opacity",
                        // Enhanced multi-selection visual feedback
                        selectedClipId === clip.id ? "border-2 border-white ring-2 ring-cre8r-violet opacity-100" : 
                        multiSelection.selectedClipIds.includes(clip.id) ? "border-2 border-blue-400 ring-2 ring-blue-400 opacity-100" :
                        "opacity-90 hover:ring-1 hover:ring-white border-0",
                        isDragging && "opacity-30 z-50 scale-95 transition-all duration-200"
                      )}
                      style={{
                        left: `${(clip.start / duration) * 100}%`,
                        width: `${((clip.end - clip.start) / duration) * 100}%`,
                        height: `${clipHeight}px`,
                        top: `${marginTop}px`,
                        ...(thumbnailsVisible && thumbnailStyles[clip.id] ? thumbnailStyles[clip.id] : {})
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        
                        // Enhanced multi-selection support
                        if (e.ctrlKey || e.metaKey) {
                          // Ctrl+Click for multi-selection
                          console.log('🎯 [Timeline] Ctrl+Click - Toggle selection:', clip.id);
                          multiSelection.toggleSelection(clip.id);
                        } else {
                          // Regular click - single selection
                          console.log('[Timeline] Single click - Select:', clip.id);
                          onClipSelect?.(clip.id);
                          multiSelection.setSelectedClipIds([clip.id]);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('🖱️ [Timeline] Right-click on clip:', clip.id);
                        setContextMenu({
                          visible: true,
                          x: e.clientX,
                          y: e.clientY,
                          menuType: 'clip',
                          targetClipId: clip.id,
                          timelinePosition: clip.start
                        });
                        onClipSelect?.(clip.id); // Select the clip when right-clicking
                      }}
                      onDragStart={(e) => handleClipDragStart(e, clip)}
                      onDragEnd={handleClipDragEnd}
                      title={clip.name || clip.text || clip.asset || "Edit"}
                    >
                    <div className={`h-full w-full ${clip.track === 0 && clip.thumbnail ? '' : `bg-gradient-to-r ${getClipStyle(clip.type)}`} flex items-center justify-center px-2 ${clip.track === 0 && clip.thumbnail ? 'bg-black bg-opacity-40' : 'bg-opacity-70'}`}>
                      <span className={`text-xs text-white truncate font-medium ${clip.track === 0 && clip.thumbnail ? 'text-shadow' : ''}`}>
                        {clip.name || clip.text || clip.asset || formatTime(clip.end - clip.start)}
                      </span>
                    </div>
                    {/* Left trim handle */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-3 hover:bg-white hover:bg-opacity-30 cursor-w-resize z-10"
                      onMouseDown={(e) => handleTrimHandleMouseDown(e, clip.id, 'start')}
                      onDragStart={(e) => e.preventDefault()} // Prevent drag from trim handles
                      title="Trim start"
                    >
                      <div className="h-full w-1 bg-white opacity-60 mx-auto"></div>
                    </div>
                    {/* Right trim handle */}
                    <div 
                      className="absolute right-0 top-0 bottom-0 w-3 hover:bg-white hover:bg-opacity-30 cursor-e-resize z-10"
                      onMouseDown={(e) => handleTrimHandleMouseDown(e, clip.id, 'end')}
                      onDragStart={(e) => e.preventDefault()} // Prevent drag from trim handles
                      title="Trim end"
                    >
                      <div className="h-full w-1 bg-white opacity-60 mx-auto"></div>
                    </div>
                  </div>
                  );
                })}
                  
                    {/* Enhanced drop indicator with snap feedback */}
                    {dropIndicator && dropIndicator.track === index && (
                    <div className="absolute top-0 bottom-0 pointer-events-none z-50">
                    {/* Insertion line indicator with snap styling */}
                    <div
                    className={`absolute top-0 bottom-0 w-1 shadow-lg transition-colors ${
                      dropIndicator.snapped 
                        ? 'bg-green-500 shadow-green-500/50' 
                        : 'bg-cre8r-violet shadow-cre8r-violet/50'
                    }`}
                    style={{
                    left: `${(dropIndicator.time / duration) * 100}%`,
                      transform: 'translateX(-50%)'
                      }}
                    >
                    <div className={`absolute -top-2 -left-1.5 w-3 h-3 rounded-full shadow-lg ${
                      dropIndicator.snapped ? 'bg-green-500' : 'bg-cre8r-violet'
                    }`}></div>
                      <div className={`absolute -bottom-2 -left-1.5 w-3 h-3 rounded-full shadow-lg ${
                        dropIndicator.snapped ? 'bg-green-500' : 'bg-cre8r-violet'
                      }`}></div>
                    </div>
                    
                    {/* Enhanced insertion position label with snap info */}
                    {draggingClip && dropIndicator.insertionIndex !== undefined && (
                    <div
                    className={`absolute -top-8 px-2 py-1 text-white text-xs rounded shadow-lg whitespace-nowrap ${
                      dropIndicator.snapped 
                        ? 'bg-green-500' 
                        : 'bg-cre8r-violet'
                    }`}
                    style={{
                    left: `${(dropIndicator.time / duration) * 100}%`,
                      transform: 'translateX(-50%)'
                      }}
                    >
                      {dropIndicator.snapped ? (
                        <>
                          <span className="font-semibold">🎯 Snapped to {dropIndicator.snapType?.replace('_', ' ')}</span>
                          <br />
                          <span className="text-xs opacity-90">Position {dropIndicator.insertionIndex + 1}</span>
                        </>
                      ) : (
                        `Insert at position ${dropIndicator.insertionIndex + 1}`
                      )}
                      </div>
                      )}
                      </div>
                )}
              </div>
            ))
            )}
          </div>

          {/* Playhead */}
          <Playhead timelineRef={resolvedRef} />
          
          {/* Animation Overlay */}
          <AnimationOverlay
            duration={duration}
            zoom={zoom}
            trackHeight={getTrackHeight(0)}
            timelineWidth={resolvedRef.current?.getBoundingClientRect().width || 800}
          />
          
          {/* Timeline Loading Overlay */}
          <TimelineLoadingOverlay
            duration={duration}
            timelineWidth={resolvedRef.current?.getBoundingClientRect().width || 800}
          />
        </div>
      </div>
      
      {/* Keyboard shortcuts help bar */}
      <div className="text-xs text-cre8r-gray-500 px-2 py-1 bg-cre8r-gray-900 border-t border-cre8r-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span><strong>I</strong> Mark In</span>
          <span><strong>O</strong> Mark Out</span>
          <span><strong>M</strong> Add Marker</span>
          <span><strong>R</strong> Ripple Mode</span>
          <span><strong>Del</strong> Delete</span>
        </div>
        <div className="flex items-center gap-4">
          <span><strong>Ctrl+A</strong> Select All</span>
          <span><strong>Ctrl+G</strong> Group</span>
          <span><strong>[/]</strong> Jump to Marks</span>
          <span><strong>Esc</strong> Clear</span>
        </div>
      </div>
      
      {/* Timeline Context Menu */}
      <TimelineContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        menuType={contextMenu.menuType}
        selectedClipId={contextMenu.targetClipId}
        clipCount={multiSelection.selectedClipIds.length > 0 ? multiSelection.selectedClipIds.length : clips.length}
        timelinePosition={contextMenu.timelinePosition || 0}
        onAction={handleContextMenuAction}
        onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
      />
      </div>
    </>
  );
});

Timeline.displayName = "Timeline";

export default Timeline;
