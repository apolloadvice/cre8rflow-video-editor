/**
 * Timeline Ruler Component
 * 
 * Time ruler with:
 * - Time markings and labels
 * - Frame-accurate grid
 * - Responsive tick intervals
 * - Professional timeline aesthetics
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useTimelineZoom } from '@/hooks/useTimelineZoom';
import { formatTime, TIMELINE_CONSTANTS } from '@/constants/timeline-constants';

interface TimelineRulerProps {
  duration: number;
  currentTime: number;
  zoom: number;
  scrollX: number;
  className?: string;
}

export default function TimelineRuler({
  duration,
  currentTime,
  zoom,
  scrollX,
  className,
}: TimelineRulerProps) {
  const { timeToPixels } = useTimelineZoom();
  
  // Calculate tick intervals based on zoom level
  const tickIntervals = useMemo(() => {
    const pixelsPerSecond = timeToPixels(1);
    
    // Define intervals in seconds with their minimum pixel spacing
    const intervals = [
      { interval: 0.1, minPixels: 10 },    // 100ms
      { interval: 0.2, minPixels: 15 },    // 200ms
      { interval: 0.5, minPixels: 20 },    // 500ms
      { interval: 1, minPixels: 30 },      // 1s
      { interval: 2, minPixels: 40 },      // 2s
      { interval: 5, minPixels: 50 },      // 5s
      { interval: 10, minPixels: 60 },     // 10s
      { interval: 30, minPixels: 80 },     // 30s
      { interval: 60, minPixels: 100 },    // 1m
      { interval: 300, minPixels: 150 },   // 5m
      { interval: 600, minPixels: 200 },   // 10m
    ];
    
    // Find appropriate interval based on zoom
    const majorInterval = intervals.find(({ interval, minPixels }) => 
      pixelsPerSecond * interval >= minPixels
    ) || intervals[intervals.length - 1];
    
    // Minor ticks are typically 1/5 of major interval
    const minorInterval = {
      interval: majorInterval.interval / 5,
      minPixels: majorInterval.minPixels / 5,
    };
    
    return { major: majorInterval, minor: minorInterval };
  }, [timeToPixels]);
  
  // Generate tick marks
  const ticks = useMemo(() => {
    const majorTicks: Array<{ time: number; position: number; label: string }> = [];
    const minorTicks: Array<{ time: number; position: number }> = [];
    
    const { major, minor } = tickIntervals;
    const startTime = Math.floor(scrollX / timeToPixels(1) / major.interval) * major.interval;
    const endTime = startTime + (window.innerWidth + scrollX) / timeToPixels(1) + major.interval;
    
    // Generate major ticks
    for (let time = startTime; time <= endTime; time += major.interval) {
      if (time < 0) continue;
      
      const position = timeToPixels(time) - scrollX;
      if (position >= -100 && position <= window.innerWidth + 100) {
        majorTicks.push({
          time,
          position,
          label: formatTime(time),
        });
      }
    }
    
    // Generate minor ticks
    for (let time = startTime; time <= endTime; time += minor.interval) {
      if (time < 0) continue;
      
      // Skip minor ticks that coincide with major ticks
      const isMajorTick = Math.abs(time % major.interval) < 0.001;
      if (isMajorTick) continue;
      
      const position = timeToPixels(time) - scrollX;
      if (position >= -50 && position <= window.innerWidth + 50) {
        minorTicks.push({
          time,
          position,
        });
      }
    }
    
    return { major: majorTicks, minor: minorTicks };
  }, [duration, zoom, scrollX, tickIntervals, timeToPixels]);
  
  return (
    <div
      className={cn(
        "timeline-ruler relative bg-gray-800 border-b border-gray-600 select-none",
        className
      )}
      style={{ height: TIMELINE_CONSTANTS.rulerHeight }}
    >
      {/* Background grid pattern */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            90deg,
            transparent,
            transparent ${timeToPixels(tickIntervals.major.interval) - 1}px,
            #ffffff ${timeToPixels(tickIntervals.major.interval)}px
          )`,
          backgroundPosition: `${-scrollX}px 0`,
        }}
      />
      
      {/* Minor tick marks */}
      {ticks.minor.map(({ time, position }, index) => (
        <div
          key={`minor-${time}-${index}`}
          className="absolute bottom-0 w-px bg-gray-500"
          style={{
            left: position,
            height: '40%',
          }}
        />
      ))}
      
      {/* Major tick marks and labels */}
      {ticks.major.map(({ time, position, label }, index) => (
        <div
          key={`major-${time}-${index}`}
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: position }}
        >
          {/* Tick mark */}
          <div className="w-px bg-gray-300 h-3" />
          
          {/* Time label */}
          <div className="text-xs text-gray-300 mt-1 px-1 whitespace-nowrap">
            {label}
          </div>
        </div>
      ))}
      
      {/* Current time indicator */}
      <div
        className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
        style={{ left: timeToPixels(currentTime) - scrollX }}
      >
        {/* Current time label */}
        <div className="absolute -top-1 left-1 bg-red-400 text-white text-xs px-1 rounded whitespace-nowrap">
          {formatTime(currentTime)}
        </div>
      </div>
      
      {/* Zoom level indicator */}
      <div className="absolute top-1 right-2 text-xs text-gray-400">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}