/**
 * Timeline Playhead Component
 * 
 * Visual playhead indicator with:
 * - Current time position
 * - Draggable scrubbing
 * - Visual feedback and styling
 * - Snap-to-frame behavior
 */

import React, { useCallback, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { formatTime } from '@/constants/timeline-constants';

interface TimelinePlayheadProps {
  currentTime: number;
  zoom: number;
  scrollX: number;
  totalHeight: number;
  className?: string;
  onTimeChange?: (time: number) => void;
}

export default function TimelinePlayhead({
  currentTime,
  zoom,
  scrollX,
  totalHeight,
  className,
  onTimeChange,
}: TimelinePlayheadProps) {
  const { timeToPixels, pixelsToTime } = useTimelineZoom();
  const timelineStore = useMultiTrackStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const playheadRef = useRef<HTMLDivElement>(null);
  
  // Calculate playhead position
  const playheadPosition = timeToPixels(currentTime) - scrollX;
  
  // Handle playhead dragging
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setIsDragging(true);
    setDragStartX(event.clientX);
    setDragStartTime(currentTime);
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX;
      const deltaTime = pixelsToTime(deltaX);
      const newTime = Math.max(0, dragStartTime + deltaTime);
      
      // Snap to frames
      const fps = timelineStore.project.fps;
      const frameTime = 1 / fps;
      const snappedTime = Math.round(newTime / frameTime) * frameTime;
      
      timelineStore.setCurrentTime(snappedTime);
      onTimeChange?.(snappedTime);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [currentTime, dragStartX, dragStartTime, pixelsToTime, timelineStore, onTimeChange]);
  
  // Handle click to jump to position
  const handleClick = useCallback((event: React.MouseEvent) => {
    if (isDragging) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickTime = pixelsToTime(clickX + scrollX);
    
    // Snap to frames
    const fps = timelineStore.project.fps;
    const frameTime = 1 / fps;
    const snappedTime = Math.round(clickTime / frameTime) * frameTime;
    
    timelineStore.setCurrentTime(Math.max(0, snappedTime));
    onTimeChange?.(Math.max(0, snappedTime));
  }, [isDragging, pixelsToTime, scrollX, timelineStore, onTimeChange]);
  
  return (
    <>
      {/* Playhead line */}
      <div
        className={cn(
          "absolute top-0 w-0.5 bg-red-400 z-30 pointer-events-none",
          isDragging && "bg-red-500 shadow-lg",
          className
        )}
        style={{
          left: playheadPosition,
          height: totalHeight,
        }}
      />
      
      {/* Playhead handle */}
      <div
        ref={playheadRef}
        className={cn(
          "absolute top-0 w-4 h-6 cursor-pointer z-40",
          "transition-transform duration-150",
          isDragging && "scale-110"
        )}
        style={{
          left: playheadPosition - 8, // Center the handle on the line
          transform: 'translateY(-2px)',
        }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        {/* Playhead triangle */}
        <div className={cn(
          "w-full h-full relative",
          isDragging ? "text-red-500" : "text-red-400"
        )}>
          <svg
            viewBox="0 0 16 24"
            className="w-full h-full drop-shadow-md"
            fill="currentColor"
          >
            <path d="M8 0 L0 8 L0 24 L16 24 L16 8 Z" />
          </svg>
          
          {/* Center line */}
          <div className="absolute left-1/2 top-2 bottom-0 w-0.5 bg-white/80 transform -translate-x-1/2" />
        </div>
        
        {/* Time tooltip when dragging */}
        {isDragging && (
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
            {formatTime(currentTime)}
          </div>
        )}
      </div>
      
      {/* Playhead time display (always visible) */}
      <div
        className="absolute top-0 bg-red-400 text-white text-xs px-2 py-1 rounded-b whitespace-nowrap z-35"
        style={{
          left: Math.max(0, Math.min(playheadPosition - 30, window.innerWidth - 100)),
          transform: 'translateY(-100%)',
        }}
      >
        {formatTime(currentTime)}
      </div>
    </>
  );
}