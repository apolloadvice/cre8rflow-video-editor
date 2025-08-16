/**
 * Drag Cursor Component
 * 
 * Professional drag cursor that follows mouse during drag operations with:
 * - Element preview and metadata
 * - Real-time position and timing info
 * - Visual state indicators (valid/invalid drop)
 * - Snap feedback and measurements
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useDragStore } from '@/store/dragStore';
import { formatTime } from '@/constants/timeline-constants';

interface DragCursorProps {
  className?: string;
}

export default function DragCursor({ className }: DragCursorProps) {
  const { dragState } = useDragStore();
  
  // Don't render if not dragging
  if (!dragState.isDragging || !dragState.source || !dragState.currentPos) {
    return null;
  }
  
  const { source, preview, currentPos, cursorTime, isValidDrop, snapTime } = dragState;
  
  return (
    <div
      className={cn(
        "drag-cursor fixed pointer-events-none z-50",
        "transition-transform duration-100 ease-out",
        className
      )}
      style={{
        left: currentPos.x,
        top: currentPos.y,
        transform: 'translate(12px, -50%)', // Offset from actual cursor
      }}
    >
      {/* Main cursor card */}
      <div className={cn(
        "bg-gray-900 border-2 rounded-lg shadow-2xl text-white text-sm",
        "min-w-48 p-3",
        isValidDrop 
          ? "border-blue-500 shadow-blue-500/25" 
          : "border-red-500 shadow-red-500/25"
      )}>
        {/* Header with element info */}
        <div className="flex items-center space-x-2 mb-2">
          <div className={cn(
            "w-3 h-3 rounded-full flex-shrink-0",
            isValidDrop ? "bg-blue-500" : "bg-red-500"
          )} />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">
              {preview?.name || source.id}
            </div>
            <div className="text-xs text-gray-400">
              {getSourceTypeLabel(source.type)}
            </div>
          </div>
        </div>
        
        {/* Element metadata */}
        <div className="space-y-1 text-xs">
          {preview?.duration && (
            <div className="flex justify-between">
              <span className="text-gray-400">Duration:</span>
              <span>{formatTime(preview.duration)}</span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span className="text-gray-400">Time:</span>
            <span className="font-mono">
              {formatTime(cursorTime)}
              {snapTime !== undefined && snapTime !== cursorTime && (
                <span className="text-blue-400 ml-1">
                  → {formatTime(snapTime)}
                </span>
              )}
            </span>
          </div>
          
          {source.originalPosition && (
            <div className="flex justify-between">
              <span className="text-gray-400">Move:</span>
              <span className={cn(
                "font-mono",
                cursorTime - source.originalPosition.time > 0 
                  ? "text-green-400" 
                  : cursorTime - source.originalPosition.time < 0 
                    ? "text-yellow-400" 
                    : "text-gray-400"
              )}>
                {cursorTime - source.originalPosition.time > 0 ? '+' : ''}
                {formatTime(Math.abs(cursorTime - source.originalPosition.time))}
              </span>
            </div>
          )}
        </div>
        
        {/* Drop state indicator */}
        <div className={cn(
          "mt-2 px-2 py-1 rounded text-xs font-medium text-center",
          isValidDrop 
            ? "bg-blue-600 text-white" 
            : "bg-red-600 text-white"
        )}>
          {isValidDrop ? (
            <>
              <span>✓ Drop Here</span>
              {snapTime !== undefined && (
                <span className="block text-blue-200">Snap: {formatTime(snapTime)}</span>
              )}
            </>
          ) : (
            <span>✗ Invalid Drop</span>
          )}
        </div>
      </div>
      
      {/* Connection line to actual cursor */}
      <div className="absolute top-1/2 -left-3 w-3 h-0.5 bg-gray-600 transform -translate-y-1/2" />
      <div className="absolute top-1/2 -left-1 w-1 h-1 bg-gray-600 rounded-full transform -translate-y-1/2" />
    </div>
  );
}

// Helper function to get readable source type labels
function getSourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case 'media':
      return 'Media Asset';
    case 'element':
      return 'Timeline Element';
    case 'text':
      return 'Text Element';
    case 'asset':
      return 'Asset';
    default:
      return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  }
}