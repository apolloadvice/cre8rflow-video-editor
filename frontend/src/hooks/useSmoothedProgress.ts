import { useState, useEffect, useRef } from 'react';

/**
 * Calculate appropriate animation time based on video duration
 * Matches examples: 30s video -> 10s, 60s video -> 20s
 */
const getAnimationTime = (videoDurationSeconds: number): number => {
  if (!isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
    return 20; // Default if unknown duration
  }
  // Animate to 99% in one third of the video duration
  return videoDurationSeconds / 3;
};

/**
 * Hook that provides fake smooth progress animation based on video duration
 * Simulates realistic export progress that scales with content length
 */
export const useVideoProgressAnimation = (
  jobStatus: string,
  videoDurationSeconds: number = 60, // Default to 1 minute if unknown
  startSignal?: number // changes when a new job appears; resets animation
) => {
  const [progress, setProgress] = useState<number>(() => (jobStatus === 'completed' ? 100 : 0));
  const rafIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const baseProgressRef = useRef<number>(0);

  const cancelRaf = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };

  const startAnimation = () => {
    const durationMs = getAnimationTime(videoDurationSeconds) * 1000;
    baseProgressRef.current = 0;
    setProgress(0);
    startTimeRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const elapsed = now - (startTimeRef.current || now);
      const additional = (elapsed / durationMs) * 99; // scale to 0..99
      const next = Math.min(99, baseProgressRef.current + additional);
      setProgress(prev => (next > prev ? next : prev));

      if (next < 99 && (jobStatus === 'processing' || jobStatus === 'queued' || jobStatus === 'pending' || jobStatus === 'starting')) {
        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    cancelRaf();

    const isActiveStatus = jobStatus === 'processing' || jobStatus === 'queued' || jobStatus === 'pending' || jobStatus === 'starting';

    // Start animation only when status is active. startSignal can retrigger when active, but should not start by itself.
    if (isActiveStatus) {
      startAnimation();
    } else if (jobStatus === 'completed') {
      setProgress(100);
      cancelRaf();
    } else if (jobStatus === 'failed' || jobStatus === 'cancelled') {
      cancelRaf();
    } else {
      cancelRaf();
    }

    return () => {
      cancelRaf();
    };
  }, [jobStatus, videoDurationSeconds, startSignal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRaf();
    }
  }, []);

  return Math.min(Math.max(progress, 0), 100);
};

/**
 * Hook specifically designed for export job progress with video duration
 * Provides fake animation that scales with content length
 */
export const useExportJobProgress = (
  job: { status: string }, 
  videoDurationSeconds?: number,
  startSignal?: number
) => {
  return useVideoProgressAnimation(job.status, videoDurationSeconds, startSignal);
};