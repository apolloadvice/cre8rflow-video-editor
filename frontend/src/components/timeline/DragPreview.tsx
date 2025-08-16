/**
 * Drag Preview Component
 * 
 * Provides visual feedback during drag and drop operations:
 * - Ghost element preview
 * - Snap guides and magnetic alignment
 * - Collision warnings
 * - Multi-element selection preview
 * - Real-time position feedback
 */

import React from 'react';
import { TimelineElement } from '@/types/timeline';
import { DragState } from '@/hooks/useAdvancedDragDrop';

interface DragPreviewProps {
  dragState: DragState;
  timelineScale: number;
  trackHeight: number;
  className?: string;
}

interface SnapGuideProps {
  position: number;
  timelineScale: number;
  height: number;
  type?: 'element' | 'marker' | 'playhead';
}

const SnapGuide: React.FC<SnapGuideProps> = ({ 
  position, 
  timelineScale, 
  height, 
  type = 'element' 
}) => {
  const x = position * timelineScale;
  
  const getGuideStyle = () => {
    switch (type) {
      case 'marker':
        return 'border-cre8r-yellow border-opacity-80';
      case 'playhead':
        return 'border-cre8r-violet border-opacity-80';
      default:
        return 'border-cre8r-blue border-opacity-60';
    }
  };
  
  return (
    <div
      className={`absolute top-0 border-l-2 border-dashed pointer-events-none z-40 ${getGuideStyle()}`}
      style={{
        left: `${x}px`,
        height: `${height}px`,
      }}
    >
      {/* Guide label */}
      <div className="absolute -top-6 -left-8 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
        {position.toFixed(1)}s
      </div>
    </div>
  );
};

interface ElementGhostProps {
  element: TimelineElement;
  x: number;
  y: number;
  width: number;
  height: number;
  isValid: boolean;
  isSnapped: boolean;
}

const ElementGhost: React.FC<ElementGhostProps> = ({
  element,
  x,
  y,
  width,
  height,
  isValid,
  isSnapped,
}) => {
  const getElementColor = (type?: string) => {
    switch (type) {
      case 'video':
        return 'bg-cre8r-blue';
      case 'audio':
        return 'bg-cre8r-green';
      case 'text':
      case 'title':
        return 'bg-cre8r-yellow';
      case 'image':
        return 'bg-cre8r-purple';
      case 'effect':
        return 'bg-cre8r-red';
      default:
        return 'bg-cre8r-gray-400';
    }
  };
  
  const baseClasses = `absolute rounded pointer-events-none z-50 border-2 transition-all duration-150`;
  
  const validityClasses = isValid
    ? 'border-white border-opacity-80 shadow-lg'
    : 'border-red-500 border-opacity-80 shadow-red-500/30';
    
  const snapClasses = isSnapped
    ? 'shadow-cre8r-blue shadow-lg animate-pulse'
    : '';
  
  const opacityClasses = isValid ? 'opacity-80' : 'opacity-60';
  
  return (
    <div
      className={`${baseClasses} ${getElementColor(element.type)} ${validityClasses} ${snapClasses} ${opacityClasses}`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* Element content preview */}
      <div className="absolute inset-1 bg-black bg-opacity-20 rounded flex items-center justify-center">
        <span className="text-white text-xs font-medium truncate px-1">
          {element.name || `${element.type} ${element.id.slice(0, 8)}`}
        </span>
      </div>
      
      {/* Duration indicator */}
      <div className="absolute -bottom-6 left-0 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
        {element.duration.toFixed(1)}s
      </div>
      
      {/* Invalid drop warning */}
      {!isValid && (
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-red-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          ⚠️ Invalid drop
        </div>
      )}
      
      {/* Snap indicator */}
      {isSnapped && (
        <div className="absolute -top-8 right-0 bg-cre8r-blue text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          📌 Snapped
        </div>
      )}
    </div>
  );
};

interface MultiElementGhostProps {
  elements: TimelineElement[];
  baseX: number;
  baseY: number;
  timelineScale: number;
  trackHeight: number;
  isValid: boolean;
  isSnapped: boolean;
}

const MultiElementGhost: React.FC<MultiElementGhostProps> = ({
  elements,
  baseX,
  baseY,
  timelineScale,
  trackHeight,
  isValid,
  isSnapped,
}) => {
  if (elements.length === 0) return null;
  
  // Calculate relative positions based on the first element
  const primaryElement = elements[0];
  const primaryStart = primaryElement.start;
  
  return (
    <>
      {elements.map((element, index) => {
        const relativeStart = element.start - primaryStart;
        const offsetX = relativeStart * timelineScale;
        const offsetY = index * trackHeight; // Stack vertically for preview
        
        return (
          <ElementGhost
            key={element.id}
            element={element}
            x={baseX + offsetX}
            y={baseY + offsetY}
            width={element.duration * timelineScale}
            height={trackHeight - 4}
            isValid={isValid}
            isSnapped={isSnapped && index === 0} // Only primary element shows snap
          />
        );
      })}
      
      {/* Multi-selection indicator */}
      <div
        className="absolute bg-cre8r-violet bg-opacity-20 border border-cre8r-violet border-dashed rounded pointer-events-none z-49"
        style={{
          left: `${baseX - 4}px`,
          top: `${baseY - 4}px`,
          width: `${Math.max(...elements.map(e => e.duration)) * timelineScale + 8}px`,
          height: `${elements.length * trackHeight + 8}px`,
        }}
      >
        <div className="absolute -top-6 left-0 bg-cre8r-violet text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {elements.length} selected
        </div>
      </div>
    </>
  );
};

const DragPreview: React.FC<DragPreviewProps> = ({
  dragState,
  timelineScale,
  trackHeight,
  className = "",
}) => {
  if (!dragState.isDragging || !dragState.dragPreview) {
    return null;
  }
  
  const { draggedElement, draggedElements, dragPreview, snapPosition, collisionWarning } = dragState;
  
  if (!draggedElement) return null;
  
  const isMultiDrag = draggedElements && draggedElements.length > 1;
  const isSnapped = snapPosition !== undefined;
  const isValid = !collisionWarning;
  
  // Calculate snap guide position if snapping
  const snapGuideX = snapPosition ? snapPosition * timelineScale : null;
  
  return (
    <div className={`absolute inset-0 pointer-events-none z-30 ${className}`}>
      {/* Snap guide */}
      {isSnapped && snapGuideX !== null && (
        <SnapGuide
          position={snapPosition!}
          timelineScale={timelineScale}
          height={trackHeight * 10} // Extend across multiple tracks
          type="element"
        />
      )}
      
      {/* Element ghost(s) */}
      {isMultiDrag ? (
        <MultiElementGhost
          elements={draggedElements!}
          baseX={dragPreview.x - dragPreview.width / 2}
          baseY={dragPreview.y - dragPreview.height / 2}
          timelineScale={timelineScale}
          trackHeight={trackHeight}
          isValid={isValid}
          isSnapped={isSnapped}
        />
      ) : (
        <ElementGhost
          element={draggedElement}
          x={dragPreview.x - dragPreview.width / 2}
          y={dragPreview.y - dragPreview.height / 2}
          width={dragPreview.width}
          height={dragPreview.height}
          isValid={isValid}
          isSnapped={isSnapped}
        />
      )}
      
      {/* Collision warning overlay */}
      {collisionWarning && (
        <div className="absolute inset-0 bg-red-500 bg-opacity-10 border-2 border-red-500 border-dashed rounded pointer-events-none z-45">
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg">
            ⚠️ Cannot drop here - collision detected
          </div>
        </div>
      )}
    </div>
  );
};

export default DragPreview;