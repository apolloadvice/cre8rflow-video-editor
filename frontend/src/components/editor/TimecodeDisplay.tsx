
import React from 'react';
import { useCurrentTime, useDuration } from '@/store/editorStore';

const TimecodeDisplay: React.FC = () => {
  const currentTime = useCurrentTime();
  const duration = useDuration();
  
  // Format time to mm:ss.cc
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const centiseconds = Math.floor((time % 1) * 100);
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="flex items-center text-sm font-mono text-cre8r-gray-200">
      <span>{formatTime(currentTime)}</span>
      <span className="mx-1">/</span>
      <span>{formatTime(duration)}</span>
    </div>
  );
};

export default TimecodeDisplay;
