import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useCurrentAnimation, useIsAnimating, useOverallProgress } from '@/store/animationStore';

interface TimelineLoadingOverlayProps {
  duration: number;
  timelineWidth: number;
}

const TimelineLoadingOverlay: React.FC<TimelineLoadingOverlayProps> = ({
  duration,
  timelineWidth,
}) => {
  const currentAnimation = useCurrentAnimation();
  const isAnimating = useIsAnimating();
  const overallProgress = useOverallProgress();

  // Safety check - don't render if animation data is incomplete
  if (!isAnimating || !currentAnimation || !currentAnimation.commandText) {
    return null;
  }

  // Additional safety check for required fields
  const safeCurrentOperation = currentAnimation.currentOperationIndex ?? 0;
  const safeTotalOperations = currentAnimation.totalOperations ?? 1;
  const safeOverallProgress = isNaN(overallProgress) ? 0 : overallProgress;

  return (
    <motion.div
      className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-gray-800/90 backdrop-blur-md border border-gray-600 rounded-lg p-6 shadow-xl">
        <div className="flex items-center space-x-4">
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white">
              Processing Timeline
            </h3>
            <p className="text-sm text-gray-300 max-w-xs">
              {currentAnimation.commandText}
            </p>
            <div className="flex items-center space-x-2">
              <div className="w-48 bg-gray-700 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, safeOverallProgress))}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              <span className="text-xs text-gray-400 min-w-[3rem]">
                {Math.max(0, Math.min(100, safeOverallProgress)).toFixed(0)}%
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {safeCurrentOperation + 1} of {safeTotalOperations} operations
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TimelineLoadingOverlay; 