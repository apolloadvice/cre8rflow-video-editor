/**
 * Multi-Track Export Hook
 * 
 * Integrates the multi-track timeline system with the export API,
 * converting multi-track timelines to FFmpeg-compatible intervals
 * for professional video export without requiring GES.
 */

import { useCallback } from 'react';
import { useMultiTrackStore } from '@/store/multiTrackStore';
import { 
  convertTimelineToMultiTrackIntervals, 
  validateMultiTrackIntervals,
  generateMultiTrackExportConfig,
  debugMultiTrackIntervals,
  MultiTrackExportInterval 
} from '@/lib/multiTrackExportAdapter';
import { startProfessionalExport, ExportProfile } from '@/api/apiClient';
import { useToast } from '@/hooks/use-toast';

export interface MultiTrackExportOptions {
  profileId: string;
  outputFilename?: string;
  customSettings?: Record<string, any>;
  enableDebugLogging?: boolean;
}

export interface MultiTrackExportResult {
  success: boolean;
  jobId?: string;
  message: string;
  error?: string;
}

/**
 * Hook for exporting multi-track timelines
 */
export function useMultiTrackExport() {
  const multiTrackStore = useMultiTrackStore();
  const { toast } = useToast();

  /**
   * Convert current multi-track timeline to export intervals
   */
  const buildExportIntervals = useCallback((): MultiTrackExportInterval[] => {
    const timeline = multiTrackStore.project.timeline;
    
    if (!timeline || timeline.tracks.length === 0) {
      throw new Error('No timeline data available for export');
    }

    // Convert timeline to multi-track intervals
    return convertTimelineToMultiTrackIntervals(timeline);
  }, [multiTrackStore.project.timeline]);

  /**
   * Validate timeline for export
   */
  const validateTimelineForExport = useCallback((): { 
    isValid: boolean; 
    errors: string[]; 
    warnings: string[]; 
  } => {
    try {
      const intervals = buildExportIntervals();
      return validateMultiTrackIntervals(intervals);
    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: [],
      };
    }
  }, [buildExportIntervals]);

  /**
   * Get export configuration for current timeline
   */
  const getExportConfiguration = useCallback(() => {
    const timeline = multiTrackStore.project.timeline;
    
    if (!timeline) {
      throw new Error('No timeline data available');
    }

    return generateMultiTrackExportConfig(timeline);
  }, [multiTrackStore.project.timeline]);

  /**
   * Export multi-track timeline using professional export API
   */
  const exportMultiTrackTimeline = useCallback(async (
    options: MultiTrackExportOptions
  ): Promise<MultiTrackExportResult> => {
    try {
      // Step 1: Validate timeline
      const validation = validateTimelineForExport();
      if (!validation.isValid) {
        const errorMessage = `Timeline validation failed: ${validation.errors.join(', ')}`;
        toast({
          title: "Export Validation Failed",
          description: errorMessage,
          variant: "destructive",
        });
        
        return {
          success: false,
          message: errorMessage,
          error: errorMessage,
        };
      }

      // Show warnings if any
      if (validation.warnings.length > 0) {
        toast({
          title: "Export Warnings",
          description: validation.warnings.join(', '),
          variant: "default",
        });
      }

      // Step 2: Build export intervals
      const multitrackIntervals = buildExportIntervals();
      
      if (multitrackIntervals.length === 0) {
        const errorMessage = 'No content found in timeline to export';
        toast({
          title: "Export Error", 
          description: errorMessage,
          variant: "destructive",
        });
        
        return {
          success: false,
          message: errorMessage,
          error: errorMessage,
        };
      }

      // Step 3: Debug logging if enabled
      if (options.enableDebugLogging) {
        debugMultiTrackIntervals(multitrackIntervals);
        console.log('🎬 Export Configuration:', getExportConfiguration());
      }

      // Step 4: Submit export request
      const exportRequest = {
        timeline: {}, // Legacy compatibility - not used for multi-track
        profile_id: options.profileId,
        output_filename: options.outputFilename,
        custom_settings: options.customSettings,
        multitrack_intervals: multitrackIntervals, // NEW: Multi-track intervals
      };

      console.log('🎬 [MultiTrackExport] Submitting export request:', {
        profileId: options.profileId,
        intervalCount: multitrackIntervals.length,
        trackBreakdown: multitrackIntervals.reduce((acc, interval) => {
          acc[interval.trackKind] = (acc[interval.trackKind] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      });

      const response = await startProfessionalExport(exportRequest);

      if (response.success) {
        toast({
          title: "Export Started",
          description: `Multi-track export job created: ${response.job_id}`,
        });

        return {
          success: true,
          jobId: response.job_id,
          message: response.message || 'Multi-track export started successfully',
        };
      } else {
        throw new Error(response.message || 'Export request failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
      
      console.error('🎬 [MultiTrackExport] Export failed:', error);
      
      toast({
        title: "Export Failed",
        description: errorMessage,
        variant: "destructive",
      });

      return {
        success: false,
        message: errorMessage,
        error: errorMessage,
      };
    }
  }, [buildExportIntervals, validateTimelineForExport, getExportConfiguration, toast]);

  /**
   * Get timeline statistics for export preview
   */
  const getTimelineStats = useCallback(() => {
    const timeline = multiTrackStore.project.timeline;
    
    if (!timeline) {
      return null;
    }

    const stats = {
      totalTracks: timeline.tracks.length,
      activeTracks: timeline.tracks.filter(track => !track.hidden && track.elements.length > 0).length,
      totalElements: timeline.tracks.reduce((sum, track) => sum + track.elements.length, 0),
      duration: Math.max(...timeline.tracks.flatMap(track => 
        track.elements.map(element => element.start + element.duration)
      ), 0),
      trackBreakdown: {} as Record<string, number>,
    };

    // Count elements by track kind
    timeline.tracks.forEach(track => {
      if (!track.hidden && track.elements.length > 0) {
        stats.trackBreakdown[track.kind] = (stats.trackBreakdown[track.kind] || 0) + track.elements.length;
      }
    });

    return stats;
  }, [multiTrackStore.project.timeline]);

  /**
   * Check if timeline is ready for export
   */
  const isTimelineReadyForExport = useCallback((): boolean => {
    const timeline = multiTrackStore.project.timeline;
    
    if (!timeline || timeline.tracks.length === 0) {
      return false;
    }

    // Check if there are any active tracks with content
    const hasContent = timeline.tracks.some(track => 
      !track.hidden && track.elements.length > 0
    );

    return hasContent;
  }, [multiTrackStore.project.timeline]);

  return {
    // Export functions
    exportMultiTrackTimeline,
    buildExportIntervals,
    validateTimelineForExport,
    
    // Utility functions
    getExportConfiguration,
    getTimelineStats,
    isTimelineReadyForExport,
    
    // State
    timeline: multiTrackStore.project.timeline,
  };
}

/**
 * Hook for export profiles with multi-track considerations
 */
export function useMultiTrackExportProfiles() {
  const { getExportConfiguration } = useMultiTrackExport();

  /**
   * Get recommended export profiles based on timeline composition
   */
  const getRecommendedProfiles = useCallback((allProfiles: ExportProfile[]) => {
    try {
      const config = getExportConfiguration();
      
      // Recommend profiles based on timeline content
      const recommendations = allProfiles.map(profile => {
        let score = 0;
        let reasons: string[] = [];

        // Higher quality for complex compositions
        if (config.tracks.videoTracks > 1 || config.tracks.overlayTracks > 0) {
          if (profile.id.includes('1080p') || profile.id.includes('4k')) {
            score += 2;
            reasons.push('High resolution for multi-video composition');
          }
        }

        // Audio-focused profiles for audio-heavy content
        if (config.tracks.audioTracks > 1) {
          score += 1;
          reasons.push('Multiple audio tracks detected');
        }

        // Platform-specific recommendations
        if (config.tracks.titleTracks > 0) {
          if (profile.id.includes('youtube') || profile.id.includes('tiktok')) {
            score += 1;
            reasons.push('Text overlays optimized for social platforms');
          }
        }

        return {
          ...profile,
          recommendationScore: score,
          recommendationReasons: reasons,
        };
      });

      return recommendations.sort((a, b) => b.recommendationScore - a.recommendationScore);
      
    } catch (error) {
      console.warn('Failed to get timeline configuration for recommendations:', error);
      return allProfiles.map(profile => ({
        ...profile,
        recommendationScore: 0,
        recommendationReasons: [],
      }));
    }
  }, [getExportConfiguration]);

  return {
    getRecommendedProfiles,
  };
}