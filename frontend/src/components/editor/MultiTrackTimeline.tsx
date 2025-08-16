/**
 * Multi-Track Timeline Component
 * 
 * Main timeline container that manages multiple tracks with:
 * - Drag & drop support across tracks
 * - Visual snap indicators and hover states
 * - Integration with global drag store
 * - Professional timeline UX patterns
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { useDragDropEnhanced } from '@/hooks/useDragDropEnhanced';
import { useAdvancedDragDrop } from '@/hooks/useAdvancedDragDrop';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { useTimelineMarkersNew } from '@/hooks/useTimelineMarkersNew';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { TrackKind, Track, TimelineElement } from '@/types/timeline';
import { 
  TIMELINE_CONSTANTS, 
  TRACK_HEIGHTS,
  formatTime 
} from '@/constants/timeline-constants';
import TimelineTrack from './TimelineTrack';
import TimelineRuler from './TimelineRuler';
import TimelinePlayhead from './TimelinePlayhead';
import TimelineMarkers from './TimelineMarkers';
import DragIndicators from './DragIndicators';
import DragCursor from './DragCursor';
import DragPreview from '@/components/timeline/DragPreview';
import DraggableElement from '@/components/timeline/DraggableElement';

interface MultiTrackTimelineProps {
  className?: string;
  showRuler?: boolean;
  showMarkers?: boolean;
  enableKeyboardShortcuts?: boolean;
  onElementSelect?: (elementId: string | null) => void;
  onElementEdit?: (elementId: string, trackId: string) => void;
  onTrackSelect?: (trackId: string | null) => void;
}

export default function MultiTrackTimeline({
  className,
  showRuler = true,
  showMarkers = true,
  enableKeyboardShortcuts = true,
  onElementSelect,
  onElementEdit,
  onTrackSelect,
}: MultiTrackTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineStore = useMultiTrackStore();
  const { project, currentTime, selectedElementIds, scrollX, scrollY } = timelineStore;
  
  // Timeline utilities
  const { 
    zoom, 
    timeToPixels, 
    pixelsToTime, 
    fitToContent,
    zoomToSelection 
  } = useTimelineZoom();
  
  // Markers system
  const {
    markers,
    addMarker,
    updateMarker,
    deleteMarker,
    navigateToMarker
  } = useTimelineMarkersNew();
  
  // Drag & drop system
  const {
    isDragging,
    dragSource,
    dragPreview,
    startElementDrag,
    updateDragPosition,
    handleDrop,
    cancelDrag,
    trackHoverStates,
    validateDrop,
    mouseToTime,
  } = useDragDropEnhanced({
    enableSnapping: true,
    enableAutoScroll: true,
    autoScrollZone: 50,
    autoScrollSpeed: 10,
  });
  
  // Keyboard shortcuts
  useKeyboardShortcuts({
    enabled: enableKeyboardShortcuts,
    onCopy: () => {
      if (selectedElementIds.length > 0) {
        timelineStore.copyElements(selectedElementIds);
      }
    },
    onPaste: () => {
      timelineStore.pasteElements();
    },
    onDelete: () => {
      if (selectedElementIds.length > 0) {
        selectedElementIds.forEach(elementId => {
          const element = timelineStore.findElement(elementId);
          if (element) {
            timelineStore.removeElement(element.trackId, elementId);
          }
        });
        timelineStore.setSelectedElements([]);
      }
    },
    onSelectAll: () => {
      const allElementIds = project.timeline.tracks.flatMap(track => 
        track.elements.map(element => element.id)
      );
      timelineStore.setSelectedElements(allElementIds);
    },
    onUndo: () => timelineStore.undo(),
    onRedo: () => timelineStore.redo(),
    onPlay: () => timelineStore.togglePlayback(),
    onStop: () => {
      timelineStore.setIsPlaying(false);
      timelineStore.setCurrentTime(0);
    },
  });
  
  // Handle mouse events for drag & drop
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    updateDragPosition(event, rect);
  }, [isDragging, updateDragPosition]);
  
  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!isDragging) return;
    
    event.preventDefault();
    
    // Find target track
    const trackElement = (event.target as Element).closest('[data-track-id]');
    const targetTrackId = trackElement?.getAttribute('data-track-id');
    
    if (targetTrackId && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropTime = mouseToTime(event.clientX, rect, scrollX);
      
      handleDrop(
        targetTrackId,
        dropTime,
        (result) => {
          console.log('Drop successful:', result);
        },
        (error) => {
          console.error('Drop failed:', error);
        }
      );
    } else {
      cancelDrag();
    }
  }, [isDragging, handleDrop, cancelDrag, mouseToTime, scrollX]);
  
  // Global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // Handle timeline click for playhead positioning
  const handleTimelineClick = useCallback((event: React.MouseEvent) => {
    if (isDragging) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const clickTime = mouseToTime(event.clientX, rect, scrollX);
    timelineStore.setCurrentTime(clickTime);
  }, [isDragging, mouseToTime, scrollX, timelineStore]);
  
  // Handle element selection
  const handleElementClick = useCallback((elementId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (event.shiftKey) {
      // Add to selection
      const newSelection = selectedElementIds.includes(elementId)
        ? selectedElementIds.filter(id => id !== elementId)
        : [...selectedElementIds, elementId];
      timelineStore.setSelectedElements(newSelection);
    } else if (event.metaKey || event.ctrlKey) {
      // Toggle selection
      timelineStore.setSelectedElements([elementId]);
    } else {
      // Single selection
      timelineStore.setSelectedElements([elementId]);
    }
    
    onElementSelect?.(elementId);
  }, [selectedElementIds, timelineStore, onElementSelect]);
  
  // Handle track selection
  const handleTrackHeaderClick = useCallback((trackId: string) => {
    onTrackSelect?.(trackId);
  }, [onTrackSelect]);
  
  // Handle element drag start
  const handleElementDragStart = useCallback((
    element: TimelineElement,
    track: Track,
    event: React.MouseEvent,
    offset?: { x: number; y: number }
  ) => {
    startElementDrag(element, track, event, offset);
  }, [startElementDrag]);
  
  // Calculate total timeline duration
  const totalDuration = timelineStore.getTotalDuration();
  const timelineWidth = timeToPixels(totalDuration);
  
  return (
    <div 
      ref={containerRef}
      className={cn(
        "multi-track-timeline relative flex flex-col bg-gray-900 text-white overflow-hidden",
        className
      )}
      onClick={handleTimelineClick}
    >
      {/* Timeline Header */}
      <div className="timeline-header flex items-center bg-gray-800 border-b border-gray-700 h-10 px-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium">Timeline</span>
          <span className="text-xs text-gray-400">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
          <span className="text-xs text-gray-400">
            Zoom: {Math.round(zoom * 100)}%
          </span>
        </div>
        
        <div className="flex-1" />
        
        <div className="flex items-center space-x-2">
          <button
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded"
            onClick={fitToContent}
          >
            Fit
          </button>
          {selectedElementIds.length > 0 && (
            <button
              className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 rounded"
              onClick={zoomToSelection}
            >
              Zoom to Selection
            </button>
          )}
        </div>
      </div>
      
      {/* Timeline Content */}
      <div className="timeline-content flex-1 flex overflow-hidden">
        {/* Track Headers */}
        <div className="track-headers w-48 bg-gray-800 border-r border-gray-700 flex-shrink-0">
          <div className="track-headers-container">
            {/* Ruler header spacer */}
            {showRuler && (
              <div 
                className="ruler-header bg-gray-900 border-b border-gray-700"
                style={{ height: TIMELINE_CONSTANTS.rulerHeight }}
              />
            )}
            
            {/* Track headers */}
            {project.timeline.tracks.map(track => (
              <div
                key={track.id}
                className={cn(
                  "track-header flex items-center px-3 border-b border-gray-700 cursor-pointer",
                  "hover:bg-gray-700 transition-colors",
                  trackHoverStates[track.id]?.isDragOver && "bg-blue-900/30"
                )}
                style={{ height: TRACK_HEIGHTS[track.kind] }}
                onClick={() => handleTrackHeaderClick(track.id)}
              >
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: track.color || '#6b7280' }}
                  />
                  <span className="text-sm font-medium truncate">
                    {track.name}
                  </span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <button
                    className={cn(
                      "w-5 h-5 flex items-center justify-center text-xs rounded",
                      track.muted 
                        ? "bg-red-600 text-white" 
                        : "bg-gray-600 hover:bg-gray-500 text-gray-300"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      timelineStore.updateTrack(track.id, { muted: !track.muted });
                    }}
                  >
                    M
                  </button>
                  <button
                    className={cn(
                      "w-5 h-5 flex items-center justify-center text-xs rounded",
                      track.locked 
                        ? "bg-yellow-600 text-white" 
                        : "bg-gray-600 hover:bg-gray-500 text-gray-300"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      timelineStore.updateTrack(track.id, { locked: !track.locked });
                    }}
                  >
                    L
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Timeline Viewport */}
        <div className="timeline-viewport flex-1 overflow-auto">
          <div 
            className="timeline-canvas relative"
            style={{ 
              width: Math.max(timelineWidth + 200, 1000),
              height: 'fit-content'
            }}
          >
            {/* Ruler */}
            {showRuler && (
              <TimelineRuler 
                duration={totalDuration}
                currentTime={currentTime}
                zoom={zoom}
                scrollX={scrollX}
              />
            )}
            
            {/* Markers */}
            {showMarkers && (
              <TimelineMarkers
                markers={markers}
                currentTime={currentTime}
                zoom={zoom}
                scrollX={scrollX}
                onMarkerClick={navigateToMarker}
                onMarkerAdd={addMarker}
                onMarkerUpdate={updateMarker}
                onMarkerDelete={deleteMarker}
              />
            )}
            
            {/* Tracks */}
            <div className="tracks-container">
              {project.timeline.tracks.map(track => (
                <TimelineTrack
                  key={track.id}
                  track={track}
                  elements={track.elements}
                  selectedElementIds={selectedElementIds}
                  currentTime={currentTime}
                  zoom={zoom}
                  scrollX={scrollX}
                  isDragOver={trackHoverStates[track.id]?.isDragOver || false}
                  isValidDrop={trackHoverStates[track.id]?.isValidDrop || false}
                  insertionTime={trackHoverStates[track.id]?.insertionTime || 0}
                  onElementClick={handleElementClick}
                  onElementDragStart={handleElementDragStart}
                  onElementEdit={onElementEdit}
                />
              ))}
            </div>
            
            {/* Playhead */}
            <TimelinePlayhead
              currentTime={currentTime}
              zoom={zoom}
              scrollX={scrollX}
              totalHeight={project.timeline.tracks.reduce(
                (height, track) => height + TRACK_HEIGHTS[track.kind], 
                showRuler ? TIMELINE_CONSTANTS.rulerHeight : 0
              )}
            />
          </div>
        </div>
      </div>
      
      {/* Drag & Drop Visual Feedback */}
      <DragIndicators
        containerRef={containerRef}
        scrollX={scrollX}
        scrollY={scrollY}
      />
      
      {/* Professional Drag Cursor */}
      <DragCursor />
    </div>
  );
}