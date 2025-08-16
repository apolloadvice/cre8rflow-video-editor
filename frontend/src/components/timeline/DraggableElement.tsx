/**
 * Draggable Timeline Element Component
 * 
 * Enhanced timeline element with advanced drag and drop capabilities:
 * - Professional drag handles for move and resize
 * - Visual feedback during interactions
 * - Multi-selection support
 * - Keyboard shortcuts integration
 * - Context menu for advanced operations
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TimelineElement } from '@/types/timeline';
import { useAdvancedDragDrop } from '@/hooks/useAdvancedDragDrop';
import { useMultiTrackStore } from '@/store/multiTrackStore';

interface DraggableElementProps {
  element: TimelineElement;
  trackId: string;
  trackHeight: number;
  timelineScale: number;
  timelineLeft: number;
  timelineTop: number;
  isSelected: boolean;
  className?: string;
  onSelect?: (elementId: string, multiSelect?: boolean) => void;
  onContextMenu?: (element: TimelineElement, position: { x: number; y: number }) => void;
}

interface ResizeHandle {
  type: 'start' | 'end';
  cursor: string;
  className: string;
}

const RESIZE_HANDLES: ResizeHandle[] = [
  { type: 'start', cursor: 'w-resize', className: 'left-0 top-0 w-2 h-full' },
  { type: 'end', cursor: 'e-resize', className: 'right-0 top-0 w-2 h-full' },
];

const DraggableElement: React.FC<DraggableElementProps> = ({
  element,
  trackId,
  trackHeight,
  timelineScale,
  timelineLeft,
  timelineTop,
  isSelected,
  className = "",
  onSelect,
  onContextMenu,
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  
  const multiTrackStore = useMultiTrackStore();
  const {
    startDrag,
    updateDrag,
    completeDrag,
    cancelDrag,
    startResize,
    updateResize,
    completeResize,
  } = useAdvancedDragDrop();

  // Calculate element dimensions and position
  const left = element.start * timelineScale;
  const width = element.duration * timelineScale;
  const height = trackHeight - 4; // Small margin

  /**
   * Get element color based on type
   */
  const getElementColor = useCallback((type?: string, selected = false, hovered = false) => {
    const baseColors = {
      video: 'bg-cre8r-blue',
      audio: 'bg-cre8r-green',
      text: 'bg-cre8r-yellow',
      title: 'bg-cre8r-yellow',
      image: 'bg-cre8r-purple',
      effect: 'bg-cre8r-red',
      default: 'bg-cre8r-gray-400',
    };
    
    const color = baseColors[type as keyof typeof baseColors] || baseColors.default;
    
    let opacity = 'bg-opacity-80';
    if (selected) opacity = 'bg-opacity-100';
    else if (hovered) opacity = 'bg-opacity-90';
    
    return `${color} ${opacity}`;
  }, []);

  /**
   * Handle mouse down for drag start
   */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    e.preventDefault();
    e.stopPropagation();
    
    // Select element if not already selected
    if (!isSelected) {
      onSelect?.(element.id, e.shiftKey || e.ctrlKey || e.metaKey);
    }
    
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Check if clicking on resize handles
    const relativeX = e.clientX - rect.left;
    const handleSize = 8; // Resize handle width
    
    if (relativeX <= handleSize) {
      // Start resize from beginning
      setIsResizing('start');
      startResize(element, 'start', { x: e.clientX, y: e.clientY }, { scale: timelineScale });
      return;
    } else if (relativeX >= rect.width - handleSize) {
      // Start resize from end
      setIsResizing('end');
      startResize(element, 'end', { x: e.clientX, y: e.clientY }, { scale: timelineScale });
      return;
    }
    
    // Start drag operation
    setIsDragging(true);
    startDrag(
      element,
      trackId,
      { x: e.clientX, y: e.clientY },
      {
        left: timelineLeft,
        top: timelineTop,
        scale: timelineScale,
        trackHeight: trackHeight,
      }
    );
  }, [
    element, trackId, timelineScale, timelineLeft, timelineTop, trackHeight,
    isSelected, onSelect, startDrag, startResize
  ]);

  /**
   * Handle mouse move during drag/resize
   */
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      updateDrag(
        { x: e.clientX, y: e.clientY },
        { left: timelineLeft, top: timelineTop }
      );
    } else if (isResizing) {
      updateResize(
        isResizing,
        { x: e.clientX, y: e.clientY },
        { left: timelineLeft }
      );
    }
  }, [isDragging, isResizing, updateDrag, updateResize, timelineLeft, timelineTop]);

  /**
   * Handle mouse up to complete drag/resize
   */
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const success = completeDrag(
        { x: e.clientX, y: e.clientY },
        { left: timelineLeft, top: timelineTop }
      );
      
      if (!success) {
        // Drag was cancelled, could show feedback
      }
      
      setIsDragging(false);
    } else if (isResizing) {
      completeResize(
        isResizing,
        { x: e.clientX, y: e.clientY },
        { left: timelineLeft }
      );
      
      setIsResizing(null);
    }
  }, [isDragging, isResizing, completeDrag, completeResize, timelineLeft, timelineTop]);

  /**
   * Handle context menu
   */
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isSelected) {
      onSelect?.(element.id, false);
    }
    
    onContextMenu?.(element, { x: e.clientX, y: e.clientY });
  }, [element, isSelected, onSelect, onContextMenu]);

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isSelected) return;
    
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        multiTrackStore.removeElement(element.id);
        break;
      case 'Escape':
        if (isDragging) {
          cancelDrag();
          setIsDragging(false);
        }
        break;
      case 'c':
        if (e.ctrlKey || e.metaKey) {
          // Copy element (would need clipboard integration)
          e.preventDefault();
        }
        break;
      case 'v':
        if (e.ctrlKey || e.metaKey) {
          // Paste element (would need clipboard integration)
          e.preventDefault();
        }
        break;
    }
  }, [isSelected, element.id, isDragging, multiTrackStore, cancelDrag]);

  // Set up global event listeners for drag operations
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('keydown', handleKeyDown);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp, handleKeyDown]);

  // Set up keyboard listeners when selected
  useEffect(() => {
    if (isSelected) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isSelected, handleKeyDown]);

  // Calculate visual states
  const isInteracting = isDragging || isResizing;
  const showResizeHandles = (isSelected || isHovered) && !isInteracting;
  
  const elementClasses = `
    absolute cursor-move rounded border-2 transition-all duration-150 select-none
    ${getElementColor(element.type, isSelected, isHovered)}
    ${isSelected ? 'border-white border-opacity-100 shadow-lg' : 'border-transparent'}
    ${isInteracting ? 'opacity-70 scale-105 z-50' : 'z-10'}
    ${className}
  `.trim();

  return (
    <div
      ref={elementRef}
      className={elementClasses}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        height: `${height}px`,
        top: '2px',
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
      title={`${element.name || element.type} - ${element.duration.toFixed(1)}s`}
    >
      {/* Element content */}
      <div className="absolute inset-1 bg-black bg-opacity-20 rounded flex items-center px-2 overflow-hidden">
        <div className="flex-1 min-w-0">
          <div className="text-white text-xs font-medium truncate">
            {element.name || `${element.type} ${element.id.slice(0, 8)}`}
          </div>
          {width > 80 && (
            <div className="text-white text-xs opacity-75 truncate">
              {element.duration.toFixed(1)}s
            </div>
          )}
        </div>
        
        {/* Element type icon */}
        <div className="ml-2 text-white text-xs opacity-75">
          {element.type === 'video' && '🎥'}
          {element.type === 'audio' && '🔊'}
          {element.type === 'text' && '📝'}
          {element.type === 'title' && '📝'}
          {element.type === 'image' && '🖼️'}
          {element.type === 'effect' && '✨'}
        </div>
      </div>
      
      {/* Resize handles */}
      {showResizeHandles && RESIZE_HANDLES.map(handle => (
        <div
          key={handle.type}
          className={`absolute ${handle.className} bg-white bg-opacity-50 hover:bg-opacity-80 transition-opacity cursor-${handle.cursor} z-20`}
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsResizing(handle.type);
            startResize(element, handle.type, { x: e.clientX, y: e.clientY }, { scale: timelineScale });
          }}
        >
          {/* Resize handle indicator */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1 h-4 bg-cre8r-gray-800 rounded-full opacity-60" />
          </div>
        </div>
      ))}
      
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute -inset-0.5 border-2 border-cre8r-violet rounded animate-pulse pointer-events-none" />
      )}
      
      {/* Trim indicators */}
      {element.trimStart && element.trimStart > 0 && (
        <div className="absolute left-1 top-1 w-1 h-1 bg-yellow-400 rounded-full" />
      )}
      {element.trimEnd && element.trimEnd > 0 && (
        <div className="absolute right-1 top-1 w-1 h-1 bg-yellow-400 rounded-full" />
      )}
      
      {/* Volume/Opacity indicators */}
      {element.volume !== undefined && element.volume !== 1.0 && (
        <div className="absolute right-1 bottom-1 text-white text-xs bg-black bg-opacity-50 px-1 rounded">
          {Math.round(element.volume * 100)}%
        </div>
      )}
      {element.opacity !== undefined && element.opacity !== 1.0 && (
        <div className="absolute left-1 bottom-1 text-white text-xs bg-black bg-opacity-50 px-1 rounded">
          α{Math.round(element.opacity * 100)}%
        </div>
      )}
    </div>
  );
};

export default DraggableElement;