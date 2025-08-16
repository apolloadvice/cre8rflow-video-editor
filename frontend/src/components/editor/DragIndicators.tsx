/**
 * Drag Indicators Component
 * 
 * Visual feedback system for drag operations with:
 * - Snap line indicators
 * - Drop zone highlights
 * - Conflict warnings
 * - Distance and time measurements
 * - Professional drag cursor
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useDragStore } from '@/store/dragStore';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { useTimelineSnapping } from '@/hooks/useTimelineSnapping';
import { formatTime } from '@/constants/timeline-constants';

interface DragIndicatorsProps {
  containerRef: React.RefObject<HTMLElement>;
  scrollX: number;
  scrollY: number;
  className?: string;
}

export default function DragIndicators({
  containerRef,
  scrollX,
  scrollY,
  className,
}: DragIndicatorsProps) {
  const dragStore = useDragStore();
  const { timeToPixels } = useTimelineZoom();
  const { snapTargets } = useTimelineSnapping({ enabled: true });
  
  const { dragState, trackHoverStates } = dragStore;
  
  // Don't render if not dragging
  if (!dragState.isDragging || !dragState.source) {
    return null;
  }
  
  // Calculate snap line positions
  const snapLines = useMemo(() => {
    const lines: Array<{
      type: 'vertical' | 'horizontal';
      position: number;
      label: string;
      color: string;
    }> = [];
    
    if (dragState.snapTime !== undefined) {
      const snapX = timeToPixels(dragState.snapTime) - scrollX;
      
      lines.push({
        type: 'vertical',
        position: snapX,
        label: formatTime(dragState.snapTime),
        color: '#3b82f6', // blue-500
      });
    }
    
    // Add snap targets that are close to cursor
    if (dragState.cursorTime) {
      snapTargets.forEach(target => {
        const timeDiff = Math.abs(target.time - dragState.cursorTime);
        if (timeDiff <= 0.5) { // Within 0.5 seconds
          const targetX = timeToPixels(target.time) - scrollX;
          
          lines.push({
            type: 'vertical',
            position: targetX,
            label: `${target.type}: ${formatTime(target.time)}`,
            color: getSnapTargetColor(target.type),
          });
        }
      });
    }
    
    return lines;
  }, [dragState.snapTime, dragState.cursorTime, snapTargets, timeToPixels, scrollX]);
  
  // Calculate drop zones with feedback
  const dropZones = useMemo(() => {
    return Object.entries(trackHoverStates).map(([trackId, hoverState]) => ({
      trackId,
      ...hoverState,
    }));
  }, [trackHoverStates]);
  
  return (
    <div className={cn("drag-indicators absolute inset-0 pointer-events-none z-40", className)}>
      {/* Snap lines */}
      {snapLines.map((line, index) => (
        <div key={index}>
          {/* Vertical snap line */}
          {line.type === 'vertical' && (
            <div
              className="absolute top-0 bottom-0 w-0.5 animate-pulse"
              style={{
                left: line.position,
                backgroundColor: line.color,
                boxShadow: `0 0 4px ${line.color}`,
              }}
            >
              {/* Snap label */}
              <div
                className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-medium px-2 py-1 rounded shadow-lg whitespace-nowrap"
                style={{
                  backgroundColor: line.color,
                  color: 'white',
                }}
              >
                {line.label}
              </div>
            </div>
          )}
          
          {/* Horizontal snap line */}
          {line.type === 'horizontal' && (
            <div
              className="absolute left-0 right-0 h-0.5 animate-pulse"
              style={{
                top: line.position,
                backgroundColor: line.color,
                boxShadow: `0 0 4px ${line.color}`,
              }}
            />
          )}
        </div>
      ))}
      
      {/* Drop zone highlights */}
      {dropZones.map(zone => (
        <DropZoneHighlight
          key={zone.trackId}
          zone={zone}
          scrollX={scrollX}
          scrollY={scrollY}
        />
      ))}
      
      {/* Drag ghost/preview */}
      {dragState.currentPos && dragState.preview && (
        <DragGhost
          position={dragState.currentPos}
          preview={dragState.preview}
          isValidDrop={dragState.isValidDrop}
        />
      )}
      
      {/* Measurement indicators */}
      {dragState.source?.originalPosition && dragState.cursorTime && (
        <MeasurementIndicator
          originalTime={dragState.source.originalPosition.time}
          currentTime={dragState.cursorTime}
          scrollX={scrollX}
        />
      )}
    </div>
  );
}

// Drop zone highlight component
function DropZoneHighlight({
  zone,
  scrollX,
  scrollY,
}: {
  zone: any;
  scrollX: number;
  scrollY: number;
}) {
  if (!zone.isDragOver) return null;
  
  return (
    <div className="drop-zone-highlight">
      {/* Insertion indicator */}
      {zone.isValidDrop && zone.insertionTime !== undefined && (
        <div
          className="absolute top-0 bottom-0 w-1 bg-blue-400 animate-pulse"
          style={{
            left: zone.insertionTime - scrollX,
            boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)',
          }}
        >
          {/* Insertion arrows */}
          <div className="absolute -top-2 -left-1 w-3 h-3 bg-blue-400 rotate-45" />
          <div className="absolute -bottom-2 -left-1 w-3 h-3 bg-blue-400 rotate-45" />
        </div>
      )}
      
      {/* Conflict indicators */}
      {zone.conflictsWith && zone.conflictsWith.length > 0 && (
        <div className="absolute inset-0 bg-red-500/20 border-2 border-red-500 border-dashed">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-600 text-white text-xs px-2 py-1 rounded">
            Conflicts with {zone.conflictsWith.length} element{zone.conflictsWith.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// Drag ghost component
function DragGhost({
  position,
  preview,
  isValidDrop,
}: {
  position: { x: number; y: number };
  preview: any;
  isValidDrop: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute text-white text-sm font-medium px-3 py-2 rounded-lg shadow-lg pointer-events-none",
        "transition-colors duration-150",
        isValidDrop ? "bg-blue-600" : "bg-red-600"
      )}
      style={{
        left: position.x + 10,
        top: position.y - 10,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 rounded-full bg-white opacity-75" />
        <span>{preview.name}</span>
        {preview.duration && (
          <span className="opacity-75">({formatTime(preview.duration)})</span>
        )}
      </div>
      
      {/* Drag cursor indicator */}
      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-current" />
    </div>
  );
}

// Measurement indicator component
function MeasurementIndicator({
  originalTime,
  currentTime,
  scrollX,
}: {
  originalTime: number;
  currentTime: number;
  scrollX: number;
}) {
  const { timeToPixels } = useTimelineZoom();
  
  const originalX = timeToPixels(originalTime) - scrollX;
  const currentX = timeToPixels(currentTime) - scrollX;
  const distance = currentTime - originalTime;
  
  if (Math.abs(distance) < 0.1) return null; // Don't show for tiny movements
  
  const leftX = Math.min(originalX, currentX);
  const rightX = Math.max(originalX, currentX);
  const centerX = (leftX + rightX) / 2;
  
  return (
    <div className="measurement-indicator absolute top-2">
      {/* Measurement line */}
      <div
        className="absolute h-0.5 bg-yellow-400 opacity-75"
        style={{
          left: leftX,
          width: rightX - leftX,
          top: 0,
        }}
      />
      
      {/* Start marker */}
      <div
        className="absolute w-0.5 h-4 bg-yellow-400"
        style={{ left: originalX, top: -2 }}
      />
      
      {/* End marker */}
      <div
        className="absolute w-0.5 h-4 bg-yellow-400"
        style={{ left: currentX, top: -2 }}
      />
      
      {/* Distance label */}
      <div
        className="absolute bg-yellow-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap"
        style={{
          left: centerX,
          top: -8,
          transform: 'translateX(-50%)',
        }}
      >
        {distance > 0 ? '+' : ''}{formatTime(Math.abs(distance))}
      </div>
    </div>
  );
}

// Helper function to get snap target colors
function getSnapTargetColor(type: string): string {
  switch (type) {
    case 'element-start':
    case 'element-end':
      return '#10b981'; // emerald-500
    case 'marker':
      return '#8b5cf6'; // violet-500
    case 'playhead':
      return '#ef4444'; // red-500
    case 'frame':
      return '#6b7280'; // gray-500
    default:
      return '#3b82f6'; // blue-500
  }
}