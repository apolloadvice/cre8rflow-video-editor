import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useCurrentAnimation,
  useIsAnimating,
  useOverallProgress,
  useClipState,
  useClipProgress,
  type ClipAnimation,
} from '@/store/animationStore';
import { useEditorStore } from '@/store/editorStore';
import { cn } from '@/lib/utils';

interface AnimationOverlayProps {
  duration: number;
  zoom: number;
  trackHeight: number;
  timelineWidth: number;
}

const AnimationOverlay: React.FC<AnimationOverlayProps> = ({
  duration,
  zoom,
  trackHeight,
  timelineWidth,
}) => {
  const currentAnimation = useCurrentAnimation();
  const isAnimating = useIsAnimating();
  const overallProgress = useOverallProgress();
  const { clips } = useEditorStore();

  // Safety checks - don't render if animation data is incomplete
  if (!isAnimating || !currentAnimation || !currentAnimation.commandText || !currentAnimation.clipAnimations) {
    return null;
  }

  // Additional safety checks
  const safeOverallProgress = isNaN(overallProgress) ? 0 : Math.max(0, Math.min(100, overallProgress));
  const safeDuration = duration || 1; // Prevent division by zero
  const safeTimelineWidth = timelineWidth || 800; // Fallback width

  // Calculate pixel position for time
  const timeToPixel = (time: number) => (time / safeDuration) * safeTimelineWidth * zoom;

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {/* Overall Progress Indicator */}
      <div className="absolute top-0 left-0 right-0 bg-black/80 backdrop-blur-sm border-b border-gray-600">
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between text-white">
            <span className="text-sm font-medium truncate">
              🎬 {currentAnimation.commandText}
            </span>
            <span className="text-xs text-gray-300 ml-2">
              {safeOverallProgress.toFixed(0)}%
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${safeOverallProgress}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* Clip Processing Indicators */}
      {currentAnimation.clipAnimations.map((clipAnim) => {
        const clip = clips.find(c => c.id === clipAnim.clipId);
        if (!clip) return null;

        return (
          <ClipAnimationIndicator
            key={clipAnim.clipId}
            clipAnim={clipAnim}
            clip={clip}
            timeToPixel={timeToPixel}
            trackHeight={trackHeight}
          />
        );
      })}
    </div>
  );
};

interface ClipAnimationIndicatorProps {
  clipAnim: ClipAnimation;
  clip: any;
  timeToPixel: (time: number) => number;
  trackHeight: number;
}

const ClipAnimationIndicator: React.FC<ClipAnimationIndicatorProps> = ({
  clipAnim,
  clip,
  timeToPixel,
  trackHeight,
}) => {
  const clipState = useClipState(clipAnim.clipId);
  const clipProgress = useClipProgress(clipAnim.clipId);

  // Safety checks
  if (!clip || !clipAnim || typeof clip.start !== 'number' || typeof clip.end !== 'number') {
    return null;
  }

  const safeClipProgress = isNaN(clipProgress) ? 0 : Math.max(0, Math.min(100, clipProgress));
  const safeTrackHeight = trackHeight || 48;

  // Calculate clip position and dimensions
  const clipLeft = timeToPixel(clip.start);
  const clipWidth = Math.max(10, timeToPixel(clip.end) - timeToPixel(clip.start)); // Minimum width
  const clipTop = (clip.track || 0) * safeTrackHeight;

  // Get track-specific height
  const getTrackHeight = (trackIndex: number) => {
    return trackIndex === 0 ? 80 : 48; // Video track is taller
  };

  const clipHeight = getTrackHeight(clip.track || 0) - 4; // Account for margin

  return (
    <AnimatePresence>
      {clipState !== 'idle' && (
        <motion.div
          className="absolute"
          style={{
            left: clipLeft,
            top: clipTop + 2, // Small offset for visual alignment
            width: clipWidth,
            height: clipHeight,
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          {/* Processing State Overlay */}
          <div
            className={cn(
              "relative w-full h-full rounded-md border-2 overflow-hidden",
              {
                "border-blue-400 bg-blue-500/20": clipState === 'processing',
                "border-green-400 bg-green-500/20": clipState === 'completed',
                "border-red-400 bg-red-500/20": clipState === 'error',
              }
            )}
          >
            {/* Pulse Animation for Processing */}
            {clipState === 'processing' && (
              <motion.div
                className="absolute inset-0 bg-blue-400/30 rounded-md"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            {/* Operation-Specific Animations */}
            {clipAnim.operationType === 'cut' && (
              <CutAnimation
                clipAnim={clipAnim}
                clipState={clipState}
                clipProgress={clipProgress}
                clipWidth={clipWidth}
                clipHeight={clipHeight}
              />
            )}

            {clipAnim.operationType === 'text' && (
              <TextAnimation
                clipAnim={clipAnim}
                clipState={clipState}
                clipProgress={clipProgress}
                clipWidth={clipWidth}
                clipHeight={clipHeight}
              />
            )}

            {/* Progress Bar */}
            {clipState === 'processing' && (
              <div className="absolute bottom-1 left-1 right-1 bg-black/50 rounded-full h-1 overflow-hidden">
                <motion.div
                  className="h-full bg-blue-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${safeClipProgress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            )}

            {/* Status Icon */}
            <div className="absolute top-1 right-1">
              {clipState === 'processing' && (
                <motion.div
                  className="w-4 h-4 bg-blue-400 rounded-full flex items-center justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                >
                  <div className="w-2 h-2 bg-white rounded-full" />
                </motion.div>
              )}
              {clipState === 'completed' && (
                <motion.div
                  className="w-4 h-4 bg-green-400 rounded-full flex items-center justify-center text-white text-xs"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  ✓
                </motion.div>
              )}
              {clipState === 'error' && (
                <motion.div
                  className="w-4 h-4 bg-red-400 rounded-full flex items-center justify-center text-white text-xs"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  ✕
                </motion.div>
              )}
            </div>

            {/* Operation Label */}
            <div className="absolute top-1 left-1">
              <span className="text-xs text-white font-medium bg-black/60 px-1 rounded">
                {clipAnim.operationType.toUpperCase()}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface CutAnimationProps {
  clipAnim: ClipAnimation;
  clipState: string;
  clipProgress: number;
  clipWidth: number;
  clipHeight: number;
}

const CutAnimation: React.FC<CutAnimationProps> = ({
  clipAnim,
  clipState,
  clipProgress,
  clipWidth,
  clipHeight,
}) => {
  const [showTrimIndicators, setShowTrimIndicators] = useState(false);

  useEffect(() => {
    if (clipState === 'processing') {
      setShowTrimIndicators(true);
    }
  }, [clipState]);

  const trimStart = clipAnim.metadata?.trimStart || 0;
  const trimEnd = clipAnim.metadata?.trimEnd || 0;

  return (
    <>
      {/* Trim Start Indicator */}
      {showTrimIndicators && trimStart > 0 && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 bg-red-500/60 border-r-2 border-red-400"
          initial={{ width: 0 }}
          animate={{ width: Math.min(clipWidth * 0.2, 20) }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-white font-bold">✂️</span>
          </div>
        </motion.div>
      )}

      {/* Trim End Indicator */}
      {showTrimIndicators && trimEnd > 0 && (
        <motion.div
          className="absolute right-0 top-0 bottom-0 bg-red-500/60 border-l-2 border-red-400"
          initial={{ width: 0 }}
          animate={{ width: Math.min(clipWidth * 0.2, 20) }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-white font-bold">✂️</span>
          </div>
        </motion.div>
      )}

      {/* Cutting Animation Lines */}
      {clipState === 'processing' && (
        <>
          {trimStart > 0 && (
            <motion.div
              className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-300"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: [0, 1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
            />
          )}
          {trimEnd > 0 && (
            <motion.div
              className="absolute right-0 top-0 bottom-0 w-0.5 bg-red-300"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: [0, 1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: 0.6 }}
            />
          )}
        </>
      )}
    </>
  );
};

interface TextAnimationProps {
  clipAnim: ClipAnimation;
  clipState: string;
  clipProgress: number;
  clipWidth: number;
  clipHeight: number;
}

const TextAnimation: React.FC<TextAnimationProps> = ({
  clipAnim,
  clipState,
  clipProgress,
  clipWidth,
  clipHeight,
}) => {
  const [showTextPreview, setShowTextPreview] = useState(false);

  useEffect(() => {
    if (clipState === 'processing' && clipProgress > 30) {
      setShowTextPreview(true);
    }
  }, [clipState, clipProgress]);

  const style = clipAnim.metadata?.style || 'subtitle';
  const text = clipAnim.metadata?.text || '✨ Text';

  return (
    <>
      {/* Text Style Indicator */}
      <div className="absolute top-2 left-2 right-2">
        <motion.div
          className={cn(
            "px-2 py-1 rounded text-xs font-medium text-center",
            {
              "bg-gradient-to-r from-orange-500 to-red-500 text-white": style === 'banger',
              "bg-black/80 text-white": style === 'subtitle',
              "bg-gradient-to-r from-yellow-400 to-yellow-600 text-black": style === 'title',
            }
          )}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {style.toUpperCase()}
        </motion.div>
      </div>

      {/* Text Preview Animation */}
      {showTextPreview && (
        <motion.div
          className="absolute inset-x-2 bottom-8 top-8 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <motion.div
            className={cn(
              "px-2 py-1 rounded text-center max-w-full",
              {
                "bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-xs": style === 'banger',
                "bg-black/90 text-white text-xs": style === 'subtitle',
                "bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold text-sm": style === 'title',
              }
            )}
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="truncate block">{text}</span>
          </motion.div>
        </motion.div>
      )}

      {/* Sparkle Effects for Text Addition */}
      {clipState === 'processing' && (
        <div className="absolute inset-0">
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-yellow-300 rounded-full"
              style={{
                left: `${20 + i * 30}%`,
                top: `${30 + i * 20}%`,
              }}
              animate={{
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.3,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default AnimationOverlay; 