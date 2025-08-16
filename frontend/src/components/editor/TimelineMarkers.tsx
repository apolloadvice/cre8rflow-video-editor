/**
 * Timeline Markers Component
 * 
 * Visual timeline markers with:
 * - Draggable marker positioning
 * - Marker labels and colors
 * - Context menu for editing
 * - Keyboard navigation support
 */

import React, { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { formatTime } from '@/constants/timeline-constants';

export interface TimelineMarker {
  id: string;
  time: number;
  name: string;
  color?: string;
  description?: string;
}

interface TimelineMarkersProps {
  markers: TimelineMarker[];
  currentTime: number;
  zoom: number;
  scrollX: number;
  onMarkerClick: (markerId: string) => void;
  onMarkerAdd: (time: number) => void;
  onMarkerUpdate: (markerId: string, updates: Partial<TimelineMarker>) => void;
  onMarkerDelete: (markerId: string) => void;
  className?: string;
}

export default function TimelineMarkers({
  markers,
  currentTime,
  zoom,
  scrollX,
  onMarkerClick,
  onMarkerAdd,
  onMarkerUpdate,
  onMarkerDelete,
  className,
}: TimelineMarkersProps) {
  const { timeToPixels, pixelsToTime } = useTimelineZoom();
  const [dragMarker, setDragMarker] = useState<{ id: string; startX: number; startTime: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; markerId: string } | null>(null);
  
  // Handle marker drag
  const handleMarkerMouseDown = useCallback((marker: TimelineMarker, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setDragMarker({
      id: marker.id,
      startX: event.clientX,
      startTime: marker.time,
    });
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragMarker) return;
      
      const deltaX = e.clientX - dragMarker.startX;
      const deltaTime = pixelsToTime(deltaX);
      const newTime = Math.max(0, dragMarker.startTime + deltaTime);
      
      onMarkerUpdate(marker.id, { time: newTime });
    };
    
    const handleMouseUp = () => {
      setDragMarker(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [dragMarker, pixelsToTime, onMarkerUpdate]);
  
  // Handle marker click
  const handleMarkerClick = useCallback((marker: TimelineMarker, event: React.MouseEvent) => {
    if (dragMarker) return;
    
    event.stopPropagation();
    onMarkerClick(marker.id);
  }, [dragMarker, onMarkerClick]);
  
  // Handle right-click context menu
  const handleMarkerContextMenu = useCallback((marker: TimelineMarker, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      markerId: marker.id,
    });
  }, []);
  
  // Handle double-click to add marker
  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickTime = pixelsToTime(clickX + scrollX);
    
    onMarkerAdd(Math.max(0, clickTime));
  }, [pixelsToTime, scrollX, onMarkerAdd]);
  
  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);
  
  // Handle marker deletion
  const handleDeleteMarker = useCallback(() => {
    if (contextMenu) {
      onMarkerDelete(contextMenu.markerId);
      closeContextMenu();
    }
  }, [contextMenu, onMarkerDelete, closeContextMenu]);
  
  return (
    <>
      {/* Markers container */}
      <div
        className={cn("absolute top-0 left-0 right-0 h-8 z-20", className)}
        onDoubleClick={handleDoubleClick}
      >
        {markers.map(marker => {
          const markerPosition = timeToPixels(marker.time) - scrollX;
          const isVisible = markerPosition >= -20 && markerPosition <= window.innerWidth + 20;
          
          if (!isVisible) return null;
          
          return (
            <div
              key={marker.id}
              className="absolute top-0 cursor-pointer group"
              style={{ left: markerPosition }}
              onMouseDown={(e) => handleMarkerMouseDown(marker, e)}
              onClick={(e) => handleMarkerClick(marker, e)}
              onContextMenu={(e) => handleMarkerContextMenu(marker, e)}
            >
              {/* Marker flag */}
              <div
                className={cn(
                  "w-4 h-6 relative transition-transform duration-150",
                  dragMarker?.id === marker.id && "scale-110"
                )}
                style={{ transform: 'translateX(-50%)' }}
              >
                <svg
                  viewBox="0 0 16 24"
                  className="w-full h-full drop-shadow-md"
                  fill={marker.color || '#10b981'}
                >
                  <path d="M2 0 L2 24 L14 12 L2 0 Z" />
                </svg>
              </div>
              
              {/* Marker line */}
              <div
                className="absolute top-6 w-0.5 bg-current opacity-60"
                style={{
                  left: '50%',
                  height: '100vh',
                  transform: 'translateX(-50%)',
                  color: marker.color || '#10b981',
                }}
              />
              
              {/* Marker tooltip */}
              <div className="absolute top-7 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <div className="bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
                  <div className="font-medium">{marker.name}</div>
                  <div className="text-gray-400">{formatTime(marker.time)}</div>
                  {marker.description && (
                    <div className="text-gray-500 text-xs">{marker.description}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Context menu */}
      {contextMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50"
            onClick={closeContextMenu}
          />
          
          {/* Menu */}
          <div
            className="fixed bg-gray-800 border border-gray-600 rounded shadow-lg z-50 py-1"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
          >
            <button
              className="w-full px-3 py-1 text-left text-sm text-white hover:bg-gray-700"
              onClick={() => {
                const marker = markers.find(m => m.id === contextMenu.markerId);
                if (marker) {
                  const newName = prompt('Marker name:', marker.name);
                  if (newName) {
                    onMarkerUpdate(marker.id, { name: newName });
                  }
                }
                closeContextMenu();
              }}
            >
              Rename
            </button>
            <button
              className="w-full px-3 py-1 text-left text-sm text-white hover:bg-gray-700"
              onClick={() => {
                const marker = markers.find(m => m.id === contextMenu.markerId);
                if (marker) {
                  const newDescription = prompt('Marker description:', marker.description || '');
                  if (newDescription !== null) {
                    onMarkerUpdate(marker.id, { description: newDescription });
                  }
                }
                closeContextMenu();
              }}
            >
              Edit Description
            </button>
            <div className="border-t border-gray-600 my-1" />
            <button
              className="w-full px-3 py-1 text-left text-sm text-red-400 hover:bg-gray-700"
              onClick={handleDeleteMarker}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}