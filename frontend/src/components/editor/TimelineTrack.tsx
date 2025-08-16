/**
 * Timeline Track Component
 * 
 * Individual track in the multi-track timeline with:
 * - Drop zone for elements
 * - Visual hover states and drag feedback
 * - Element rendering and interaction
 * - Track-specific styling and behavior
 */

import React, { useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Track, TimelineElement, TrackKind } from '@/types/timeline';
import { useTrackDropZone } from '@/store/dragStore';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { TRACK_HEIGHTS, TRACK_COLORS } from '@/constants/timeline-constants';
import TimelineElementComponent from './TimelineElement';

interface TimelineTrackProps {
  track: Track;
  elements: TimelineElement[];
  selectedElementIds: string[];
  currentTime: number;
  zoom: number;
  scrollX: number;
  isDragOver: boolean;
  isValidDrop: boolean;
  insertionTime: number;
  onElementClick: (elementId: string, event: React.MouseEvent) => void;
  onElementDragStart: (
    element: TimelineElement,
    track: Track,
    event: React.MouseEvent,
    offset?: { x: number; y: number }
  ) => void;
  onElementEdit?: (elementId: string, trackId: string) => void;
}

export default function TimelineTrack({
  track,
  elements,
  selectedElementIds,
  currentTime,
  zoom,
  scrollX,
  isDragOver,
  isValidDrop,
  insertionTime,
  onElementClick,
  onElementDragStart,
  onElementEdit,
}: TimelineTrackProps) {
  const { timeToPixels } = useTimelineZoom();
  
  // Drop zone functionality
  const {
    isDragOver: dropZoneActive,
    isValidDrop: dropZoneValid,
    dragOverStyles,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useTrackDropZone(track.id, track.kind);
  
  // Calculate track dimensions
  const trackHeight = TRACK_HEIGHTS[track.kind];
  const trackColor = track.color || TRACK_COLORS[track.kind];
  
  // Sort elements by start time for proper rendering order
  const sortedElements = useMemo(() => {
    return [...elements].sort((a, b) => a.start - b.start);
  }, [elements]);
  
  // Handle element interactions
  const handleElementClick = useCallback((elementId: string, event: React.MouseEvent) => {
    onElementClick(elementId, event);
  }, [onElementClick]);
  
  const handleElementDragStart = useCallback((
    element: TimelineElement,
    event: React.MouseEvent
  ) => {
    // Calculate offset from element start to mouse position
    const elementRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const offset = {
      x: event.clientX - elementRect.left,
      y: event.clientY - elementRect.top,
    };
    
    onElementDragStart(element, track, event, offset);
  }, [onElementDragStart, track]);
  
  const handleElementDoubleClick = useCallback((elementId: string) => {
    onElementEdit?.(elementId, track.id);
  }, [onElementEdit, track.id]);
  
  // Calculate insertion indicator position
  const insertionX = timeToPixels(insertionTime);
  
  // Track style based on state
  const trackStyle = useMemo(() => ({
    height: trackHeight,
    backgroundColor: track.muted ? '#374151' : '#1f2937',
    opacity: track.locked ? 0.7 : 1,
    ...dragOverStyles,
  }), [trackHeight, track.muted, track.locked, dragOverStyles]);
  
  return (
    <div
      className={cn(
        "timeline-track relative border-b border-gray-700 overflow-hidden",
        isDragOver && "ring-2 ring-blue-500 ring-opacity-50",
        dropZoneActive && "bg-blue-900/20",
        !isValidDrop && dropZoneActive && "bg-red-900/20",
        track.locked && "cursor-not-allowed"
      )}
      style={trackStyle}
      data-track-id={track.id}
      data-track-kind={track.kind}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Track background pattern */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent 49px,
            ${trackColor} 50px,
            ${trackColor} 51px
          )`
        }}
      />
      
      {/* Track content area */}
      <div className="track-content relative h-full">
        {/* Elements */}
        {sortedElements.map(element => (
          <TimelineElementComponent
            key={element.id}
            element={element}
            track={track}
            isSelected={selectedElementIds.includes(element.id)}
            currentTime={currentTime}
            zoom={zoom}
            scrollX={scrollX}
            onClick={handleElementClick}
            onDragStart={handleElementDragStart}
            onDoubleClick={handleElementDoubleClick}
          />
        ))}
        
        {/* Drop insertion indicator */}
        {(isDragOver || dropZoneActive) && isValidDrop && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-blue-400 shadow-lg z-10"
            style={{
              left: insertionX - scrollX,
              opacity: 0.8,
            }}
          >
            {/* Insertion arrow */}
            <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-400 rotate-45" />
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-blue-400 rotate-45" />
          </div>
        )}
        
        {/* Invalid drop indicator */}
        {(isDragOver || dropZoneActive) && !isValidDrop && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <div className="text-red-400 text-xs font-medium bg-red-900/80 px-2 py-1 rounded">
              Invalid Drop
            </div>
          </div>
        )}
      </div>
      
      {/* Track mute/lock overlay */}
      {(track.muted || track.locked) && (
        <div className="absolute inset-0 bg-gray-900/30 flex items-center justify-center">
          {track.muted && (
            <div className="text-red-400 text-xs font-medium bg-red-900/80 px-2 py-1 rounded mr-2">
              MUTED
            </div>
          )}
          {track.locked && (
            <div className="text-yellow-400 text-xs font-medium bg-yellow-900/80 px-2 py-1 rounded">
              LOCKED
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Get track icon based on kind
function getTrackIcon(kind: TrackKind) {
  switch (kind) {
    case 'video':
      return '🎬';
    case 'audio':
      return '🎵';
    case 'title':
      return '💬';
    case 'overlay':
      return '🖼️';
    case 'effect':
      return '✨';
    default:
      return '📁';
  }
}