/**
 * Timeline Element Component
 * 
 * Individual draggable element within a timeline track with:
 * - Drag handles for trimming
 * - Visual selection states
 * - Thumbnail and waveform display
 * - Context menu integration
 * - Keyboard shortcuts
 */

import React, { useCallback, useMemo, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { TimelineElement, Track, TrackKind } from '@/types/timeline';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { formatTime } from '@/constants/timeline-constants';

interface TimelineElementProps {
  element: TimelineElement;
  track: Track;
  isSelected: boolean;
  currentTime: number;
  zoom: number;
  scrollX: number;
  onClick: (elementId: string, event: React.MouseEvent) => void;
  onDragStart: (element: TimelineElement, event: React.MouseEvent) => void;
  onDoubleClick: (elementId: string) => void;
  onTrimStart?: (elementId: string, newTrimStart: number) => void;
  onTrimEnd?: (elementId: string, newTrimEnd: number) => void;
  onMove?: (elementId: string, newStart: number) => void;
}

export default function TimelineElementComponent({
  element,
  track,
  isSelected,
  currentTime,
  zoom,
  scrollX,
  onClick,
  onDragStart,
  onDoubleClick,
  onTrimStart,
  onTrimEnd,
  onMove,
}: TimelineElementProps) {
  const { timeToPixels } = useTimelineZoom();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<'start' | 'end' | 'body' | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);
  
  // Calculate element dimensions and position
  const elementStart = timeToPixels(element.start);
  const elementWidth = timeToPixels(element.duration);
  const elementEnd = elementStart + elementWidth;
  
  // Calculate playhead position relative to element
  const playheadInElement = currentTime >= element.start && currentTime <= element.start + element.duration;
  const playheadPosition = playheadInElement ? timeToPixels(currentTime - element.start) : -1;
  
  // Calculate trim indicators
  const trimStartWidth = timeToPixels(element.trimStart);
  const trimEndWidth = timeToPixels(element.trimEnd);
  const contentWidth = elementWidth - trimStartWidth - trimEndWidth;
  
  // Element styling based on track type and state
  const elementStyle = useMemo(() => {
    const baseColor = getElementColor(track.kind, element);
    const opacity = track.muted ? 0.5 : (element.opacity || 1);
    
    return {
      left: elementStart - scrollX,
      width: elementWidth,
      backgroundColor: isSelected ? adjustColor(baseColor, 20) : baseColor,
      opacity,
      transform: `scaleY(${element.speed || 1})`,
      border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
      boxShadow: isSelected ? '0 0 0 1px #3b82f6' : 'none',
    };
  }, [elementStart, elementWidth, scrollX, track.kind, track.muted, element, isSelected]);
  
  // Handle mouse events
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (track.locked) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const relativeX = event.clientX - rect.left;
    const handleWidth = 8; // Width of resize handles
    
    // Determine what was clicked
    let handle: 'start' | 'end' | 'body';
    if (relativeX <= handleWidth) {
      handle = 'start';
    } else if (relativeX >= rect.width - handleWidth) {
      handle = 'end';
    } else {
      handle = 'body';
    }
    
    setDragHandle(handle);
    setIsDragging(true);
    
    if (handle === 'body') {
      onDragStart(element, event);
    }
    
    // Add global mouse event listeners for drag operations
    const handleMouseMove = (e: MouseEvent) => {
      if (!rect) return;
      
      const deltaX = e.clientX - event.clientX;
      const deltaTime = deltaX / zoom * 0.1; // Convert pixels to time
      
      switch (handle) {
        case 'start':
          const newTrimStart = Math.max(0, element.trimStart + deltaTime);
          onTrimStart?.(element.id, newTrimStart);
          break;
        case 'end':
          const newTrimEnd = Math.max(0, element.trimEnd - deltaTime);
          onTrimEnd?.(element.id, newTrimEnd);
          break;
        case 'body':
          const newStart = Math.max(0, element.start + deltaTime);
          onMove?.(element.id, newStart);
          break;
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      setDragHandle(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [track.locked, element, zoom, onDragStart, onTrimStart, onTrimEnd, onMove]);
  
  const handleClick = useCallback((event: React.MouseEvent) => {
    if (track.locked) return;
    onClick(element.id, event);
  }, [track.locked, element.id, onClick]);
  
  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    if (track.locked) return;
    event.stopPropagation();
    onDoubleClick(element.id);
  }, [track.locked, element.id, onDoubleClick]);
  
  // Get element display name
  const displayName = element.name || `${track.kind}-${element.id.slice(0, 8)}`;
  
  return (
    <div
      ref={elementRef}
      className={cn(
        "timeline-element absolute top-1 bottom-1 rounded cursor-pointer select-none",
        "transition-all duration-150",
        isHovered && "shadow-lg",
        isDragging && "shadow-xl z-10",
        track.locked && "cursor-not-allowed opacity-50",
        dragHandle === 'start' && "cursor-w-resize",
        dragHandle === 'end' && "cursor-e-resize",
        dragHandle === 'body' && "cursor-move"
      )}
      style={elementStyle}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={`${displayName} (${formatTime(element.start)} - ${formatTime(element.start + element.duration)})`}
    >
      {/* Trim start indicator */}
      {element.trimStart > 0 && (
        <div 
          className="absolute left-0 top-0 bottom-0 bg-black/30 border-r border-white/20"
          style={{ width: trimStartWidth }}
        />
      )}
      
      {/* Element content */}
      <div 
        className="element-content relative h-full flex items-center px-2 overflow-hidden"
        style={{ 
          marginLeft: trimStartWidth,
          width: contentWidth,
        }}
      >
        {/* Background pattern for different track types */}
        {getElementBackground(track.kind, element)}
        
        {/* Element name */}
        <div className="relative z-10 text-xs font-medium text-white truncate">
          {displayName}
        </div>
        
        {/* Speed indicator */}
        {element.speed && element.speed !== 1 && (
          <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs px-1 rounded-bl">
            {element.speed}x
          </div>
        )}
        
        {/* Volume indicator for audio elements */}
        {track.kind === 'audio' && element.volume !== undefined && element.volume !== 1 && (
          <div className="absolute bottom-0 right-0 bg-green-600 text-white text-xs px-1 rounded-tl">
            {Math.round(element.volume * 100)}%
          </div>
        )}
      </div>
      
      {/* Trim end indicator */}
      {element.trimEnd > 0 && (
        <div 
          className="absolute right-0 top-0 bottom-0 bg-black/30 border-l border-white/20"
          style={{ width: trimEndWidth }}
        />
      )}
      
      {/* Playhead indicator within element */}
      {playheadInElement && playheadPosition >= 0 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-20"
          style={{ left: playheadPosition }}
        />
      )}
      
      {/* Resize handles */}
      {isSelected && !track.locked && (
        <>
          {/* Start handle */}
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-blue-400 cursor-w-resize opacity-0 hover:opacity-100 transition-opacity" />
          {/* End handle */}
          <div className="absolute right-0 top-0 bottom-0 w-2 bg-blue-400 cursor-e-resize opacity-0 hover:opacity-100 transition-opacity" />
        </>
      )}
      
      {/* Selection border */}
      {isSelected && (
        <div className="absolute inset-0 border-2 border-blue-400 rounded pointer-events-none" />
      )}
    </div>
  );
}

// Helper functions
function getElementColor(trackKind: TrackKind, element: TimelineElement): string {
  switch (trackKind) {
    case 'video':
      return '#1e40af'; // blue-800
    case 'audio':
      return '#059669'; // emerald-600
    case 'title':
      return '#7c3aed'; // violet-600
    case 'overlay':
      return '#dc2626'; // red-600
    case 'effect':
      return '#ea580c'; // orange-600
    default:
      return '#6b7280'; // gray-500
  }
}

function adjustColor(color: string, lightness: number): string {
  // Simple color adjustment - in a real app you'd use a proper color library
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * lightness);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

function getElementBackground(trackKind: TrackKind, element: TimelineElement): React.ReactNode {
  switch (trackKind) {
    case 'video':
      return (
        <div className="absolute inset-0 opacity-20">
          <div className="w-full h-full bg-gradient-to-r from-blue-600 to-blue-800" />
        </div>
      );
    case 'audio':
      return (
        <div className="absolute inset-0 opacity-20">
          <div className="w-full h-full bg-gradient-to-r from-green-600 to-green-800" />
          {/* Simple waveform representation */}
          <div className="absolute bottom-0 left-0 right-0 h-1/3">
            <div className="w-full h-full bg-gradient-to-t from-green-400 to-transparent" />
          </div>
        </div>
      );
    case 'title':
      return (
        <div className="absolute inset-0 opacity-20 flex items-center justify-center">
          <span className="text-2xl">Aa</span>
        </div>
      );
    case 'overlay':
      return (
        <div className="absolute inset-0 opacity-20">
          <div className="w-full h-full bg-gradient-to-br from-red-600 to-pink-600" />
        </div>
      );
    case 'effect':
      return (
        <div className="absolute inset-0 opacity-20">
          <div className="w-full h-full bg-gradient-to-r from-orange-600 to-yellow-600" />
          <div className="absolute inset-0 animate-pulse bg-white/10" />
        </div>
      );
    default:
      return null;
  }
}