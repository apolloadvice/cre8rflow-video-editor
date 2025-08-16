/**
 * Export Performance Monitor Hook
 * 
 * Provides performance monitoring and optimization for multi-track exports:
 * - Export progress tracking and estimation
 * - Performance metrics collection
 * - Error analysis and user-friendly messaging
 * - Export optimization recommendations
 */

import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface ExportPerformanceMetrics {
  startTime: number;
  estimatedDuration: number;
  actualProgress: number;
  exportSpeed: number; // MB/s or processing ratio
  remainingTime: number;
  complexity: {
    intervalCount: number;
    trackCounts: Record<string, number>;
    hasComplexFeatures: boolean;
    estimatedComplexity: number;
  };
}

export interface ExportOptimizationSuggestion {
  type: 'quality' | 'complexity' | 'resources' | 'format';
  severity: 'info' | 'warning' | 'error';
  title: string;
  description: string;
  actionable: boolean;
  suggestion?: string;
}

export function useExportPerformance() {
  const { toast } = useToast();
  const [performanceMetrics, setPerformanceMetrics] = useState<ExportPerformanceMetrics | null>(null);
  const [optimizationSuggestions, setOptimizationSuggestions] = useState<ExportOptimizationSuggestion[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const monitoringRef = useRef<{
    intervalId?: NodeJS.Timeout;
    startTime: number;
    lastProgress: number;
    progressHistory: Array<{ time: number; progress: number }>;
  }>({ startTime: 0, lastProgress: 0, progressHistory: [] });

  /**
   * Analyze export complexity from intervals
   */
  const analyzeExportComplexity = useCallback((intervals: any[]) => {
    const trackCounts: Record<string, number> = {};
    let hasComplexFeatures = false;
    
    intervals.forEach(interval => {
      const trackKind = interval.trackKind || 'unknown';
      trackCounts[trackKind] = (trackCounts[trackKind] || 0) + 1;
      
      // Check for complex features
      if (interval.transforms || interval.effects || interval.opacity < 1.0) {
        hasComplexFeatures = true;
      }
    });
    
    // Calculate complexity score
    let complexity = intervals.length;
    if (trackCounts.video > 1) complexity *= 1.5;
    if (trackCounts.overlay > 0) complexity *= 1.3;
    if (trackCounts.title > 0) complexity *= 1.2;
    if (hasComplexFeatures) complexity *= 1.4;
    
    return {
      intervalCount: intervals.length,
      trackCounts,
      hasComplexFeatures,
      estimatedComplexity: complexity,
    };
  }, []);

  /**
   * Generate optimization suggestions based on export configuration
   */
  const generateOptimizationSuggestions = useCallback((
    intervals: any[],
    profileId: string,
    systemInfo?: any
  ): ExportOptimizationSuggestion[] => {
    const suggestions: ExportOptimizationSuggestion[] = [];
    const complexity = analyzeExportComplexity(intervals);
    
    // High complexity warnings
    if (complexity.estimatedComplexity > 100) {
      suggestions.push({
        type: 'complexity',
        severity: 'warning',
        title: 'High Export Complexity',
        description: 'This export has many tracks and effects, which may take longer to process.',
        actionable: true,
        suggestion: 'Consider reducing the number of overlays or effects for faster processing.'
      });
    }
    
    // Multiple video tracks
    if (complexity.trackCounts.video > 2) {
      suggestions.push({
        type: 'complexity',
        severity: 'info',
        title: 'Multiple Video Tracks',
        description: `Using ${complexity.trackCounts.video} video tracks requires additional processing power.`,
        actionable: false
      });
    }
    
    // High quality with complex composition
    if (profileId.includes('4k') && complexity.estimatedComplexity > 50) {
      suggestions.push({
        type: 'quality',
        severity: 'warning',
        title: '4K Export with Complex Composition',
        description: 'Combining 4K resolution with complex multi-track composition may take significant time.',
        actionable: true,
        suggestion: 'Consider using 1080p quality for faster processing, or simplify the composition.'
      });
    }
    
    // System resource recommendations
    if (systemInfo?.lowMemory) {
      suggestions.push({
        type: 'resources',
        severity: 'warning',
        title: 'Limited System Memory',
        description: 'Low available memory may slow down export processing.',
        actionable: true,
        suggestion: 'Close other applications to free up memory before starting the export.'
      });
    }
    
    // Format optimization
    if (complexity.trackCounts.audio > 2 && !profileId.includes('high')) {
      suggestions.push({
        type: 'format',
        severity: 'info',
        title: 'Multiple Audio Tracks',
        description: 'Multiple audio tracks benefit from higher quality audio encoding.',
        actionable: true,
        suggestion: 'Consider using a high-quality profile for better audio mixing results.'
      });
    }
    
    return suggestions;
  }, [analyzeExportComplexity]);

  /**
   * Start monitoring export performance
   */
  const startPerformanceMonitoring = useCallback((
    intervals: any[],
    profileId: string,
    estimatedDuration: number = 60
  ) => {
    const complexity = analyzeExportComplexity(intervals);
    const suggestions = generateOptimizationSuggestions(intervals, profileId);
    
    // Show optimization suggestions
    if (suggestions.length > 0) {
      setOptimizationSuggestions(suggestions);
      
      // Show important warnings as toasts
      const warnings = suggestions.filter(s => s.severity === 'warning');
      if (warnings.length > 0) {
        toast({
          title: "Export Optimization",
          description: `${warnings.length} optimization suggestions available. Check the export settings for details.`,
          variant: "default"
        });
      }
    }
    
    // Initialize performance tracking
    const startTime = Date.now();
    monitoringRef.current = {
      startTime,
      lastProgress: 0,
      progressHistory: []
    };
    
    setPerformanceMetrics({
      startTime,
      estimatedDuration,
      actualProgress: 0,
      exportSpeed: 0,
      remainingTime: estimatedDuration,
      complexity
    });
    
    setIsMonitoring(true);
    
    // Start progress monitoring interval
    monitoringRef.current.intervalId = setInterval(() => {
      updatePerformanceMetrics();
    }, 2000);
    
  }, [analyzeExportComplexity, generateOptimizationSuggestions, toast]);

  /**
   * Update performance metrics during export
   */
  const updatePerformanceMetrics = useCallback(() => {
    if (!performanceMetrics || !monitoringRef.current) return;
    
    const now = Date.now();
    const elapsed = (now - monitoringRef.current.startTime) / 1000; // seconds
    
    // This would be updated from actual export progress in a real implementation
    // For now, we'll simulate progress tracking
    setPerformanceMetrics(prev => {
      if (!prev) return null;
      
      // Track progress history for speed calculation
      monitoringRef.current.progressHistory.push({
        time: now,
        progress: prev.actualProgress
      });
      
      // Keep only recent history (last 30 seconds)
      const recentHistory = monitoringRef.current.progressHistory.filter(
        entry => (now - entry.time) < 30000
      );
      monitoringRef.current.progressHistory = recentHistory;
      
      // Calculate export speed
      let exportSpeed = 0;
      if (recentHistory.length > 1) {
        const oldest = recentHistory[0];
        const newest = recentHistory[recentHistory.length - 1];
        const timeSpan = (newest.time - oldest.time) / 1000;
        const progressSpan = newest.progress - oldest.progress;
        
        if (timeSpan > 0) {
          exportSpeed = progressSpan / timeSpan; // progress per second
        }
      }
      
      // Estimate remaining time
      let remainingTime = prev.estimatedDuration - elapsed;
      if (exportSpeed > 0 && prev.actualProgress > 0) {
        const remainingProgress = 100 - prev.actualProgress;
        remainingTime = remainingProgress / exportSpeed;
      }
      
      return {
        ...prev,
        exportSpeed,
        remainingTime: Math.max(0, remainingTime)
      };
    });
  }, [performanceMetrics]);

  /**
   * Update progress from external source (e.g., API polling)
   */
  const updateExportProgress = useCallback((progress: number) => {
    setPerformanceMetrics(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        actualProgress: progress
      };
    });
  }, []);

  /**
   * Stop performance monitoring
   */
  const stopPerformanceMonitoring = useCallback((success: boolean = true) => {
    if (monitoringRef.current.intervalId) {
      clearInterval(monitoringRef.current.intervalId);
    }
    
    setIsMonitoring(false);
    
    if (success && performanceMetrics) {
      const totalTime = (Date.now() - performanceMetrics.startTime) / 1000;
      const efficiency = (performanceMetrics.actualProgress / 100) / (totalTime / performanceMetrics.estimatedDuration);
      
      // Show performance summary
      toast({
        title: "Export Completed",
        description: `Completed in ${totalTime.toFixed(0)}s (${efficiency > 1 ? 'faster' : 'slower'} than estimated)`,
        variant: "default"
      });
    }
  }, [performanceMetrics, toast]);

  /**
   * Get user-friendly error message with suggestions
   */
  const getErrorAnalysis = useCallback((errorMessage: string) => {
    const error = errorMessage.toLowerCase();
    
    if (error.includes('file not found') || error.includes('does not exist')) {
      return {
        category: 'file_error',
        userMessage: 'Some source files could not be found',
        suggestions: [
          'Check that all media files are still available',
          'Re-upload any missing files to your project',
          'Remove any clips that reference missing files'
        ]
      };
    }
    
    if (error.includes('memory') || error.includes('allocation')) {
      return {
        category: 'memory_error',
        userMessage: 'Export failed due to insufficient memory',
        suggestions: [
          'Close other applications to free up memory',
          'Try using a lower quality export setting',
          'Reduce the complexity of your timeline'
        ]
      };
    }
    
    if (error.includes('timeout') || error.includes('timed out')) {
      return {
        category: 'timeout_error',
        userMessage: 'Export took longer than expected and timed out',
        suggestions: [
          'Try breaking your timeline into smaller segments',
          'Use a lower quality setting for complex compositions',
          'Reduce the number of effects and overlays'
        ]
      };
    }
    
    if (error.includes('codec') || error.includes('format')) {
      return {
        category: 'format_error',
        userMessage: 'There was an issue with the video or audio format',
        suggestions: [
          'Check that your source files are not corrupted',
          'Try using standard video formats (MP4, MOV)',
          'Re-encode problematic source files'
        ]
      };
    }
    
    return {
      category: 'unknown_error',
      userMessage: 'An unexpected error occurred during export',
      suggestions: [
        'Try the export again',
        'Use simpler export settings',
        'Check that all source files are accessible'
      ]
    };
  }, []);

  /**
   * Format remaining time for display
   */
  const formatRemainingTime = useCallback((seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }, []);

  return {
    // State
    performanceMetrics,
    optimizationSuggestions,
    isMonitoring,
    
    // Actions
    startPerformanceMonitoring,
    stopPerformanceMonitoring,
    updateExportProgress,
    
    // Utilities
    analyzeExportComplexity,
    generateOptimizationSuggestions,
    getErrorAnalysis,
    formatRemainingTime,
  };
}