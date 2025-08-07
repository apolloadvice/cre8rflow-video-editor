import { useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';

/**
 * Export Interval - Precise instruction for FFmpeg to extract specific segments
 * 
 * Example: After "cut out 00:10-00:20" on Video A (30s), Video B (20s), Video C (15s)
 * Timeline shows: A(0-10s) → A(20-30s) → B(0-20s) → C(0-15s)
 * 
 * Export intervals generated:
 * [
 *   { sourceFile: "videoA.mp4", sourceStart: 0,  sourceDuration: 10, timelineStart: 0,  timelineEnd: 10 },
 *   { sourceFile: "videoA.mp4", sourceStart: 20, sourceDuration: 10, timelineStart: 10, timelineEnd: 20 },
 *   { sourceFile: "videoB.mp4", sourceStart: 0,  sourceDuration: 20, timelineStart: 20, timelineEnd: 40 },
 *   { sourceFile: "videoC.mp4", sourceStart: 0,  sourceDuration: 15, timelineStart: 40, timelineEnd: 55 }
 * ]
 */
export interface ExportInterval {
  sourceFile: string;        // Original video file (videoA.mp4, videoB.mp4) or Supabase path
  sourceStart: number;       // Seek position in source file (seconds) - maps to clip.in_point
  sourceDuration: number;    // Duration to extract from source (seconds) - maps to clip.duration
  timelineStart: number;     // Position in final export timeline (seconds) - sequential positioning
  timelineEnd: number;       // End position in final export timeline (seconds)
  clipId: string;           // Reference to timeline clip for tracking
  clipName: string;         // For debugging (Video A part 1, Video A part 2, etc.)
}

/**
 * Export Interval Tree Hook
 * 
 * Converts timeline clips into precise export instructions that preserve all edits:
 * - Handles cuts within clips (multiple segments from same source file)
 * - Preserves in_point values for accurate source positioning  
 * - Creates sequential timeline for seamless export
 * - Maintains frame-accurate timing for professional results
 * 
 * Usage:
 * ```typescript
 * const exportTree = useExportIntervalTree();
 * const intervals = exportTree.buildExportIntervals();
 * // Send intervals to backend for frame-accurate FFmpeg processing
 * ```
 */
// Supabase configuration for URL conversion
const SUPABASE_URL = "https://fgvyotgowmcwcphsctlc.supabase.co";
const ASSETS_BUCKET = "assets";

/**
 * Convert local file path to proper Supabase storage URL
 * 
 * Handles various file path formats:
 * - "filename.mov" -> Supabase public URL
 * - "user123/filename.mov" -> Supabase public URL (preserves full path structure)
 * - "http://..." -> Returns as-is (already a URL)
 * 
 * Note: Files are stored with user prefix in Supabase, so we preserve the full path
 * and properly encode each path component to handle spaces and special characters.
 * 
 * @param filePath - Original file path from clip
 * @returns Proper Supabase storage URL
 */
const convertToSupabaseUrl = (filePath: string): string => {
  // If already a full URL, return as-is
  if (filePath.startsWith('http')) {
    return filePath;
  }
  
  // Keep the full path including user prefix - files are stored with this structure
  // Split path into components and encode each part to handle spaces and special characters
  const pathParts = filePath.split('/');
  const encodedParts = pathParts.map(part => encodeURIComponent(part));
  const encodedPath = encodedParts.join('/');
  
  // Construct Supabase public storage URL with full path
  const supabaseUrl = `${SUPABASE_URL}/storage/v1/object/public/${ASSETS_BUCKET}/${encodedPath}`;
  
  console.log(`🔗 [ExportTree] Path conversion: ${filePath} → ${supabaseUrl}`);
  
  return supabaseUrl;
};

export const useExportIntervalTree = () => {
  const { clips } = useEditorStore();

  /**
   * Build export intervals from current timeline state
   * 
   * Process:
   * 1. Filter video clips only (export ignores audio/text for now)
   * 2. Sort by timeline start position 
   * 3. Create sequential export timeline (no gaps)
   * 4. Generate precise FFmpeg instructions for each segment
   * 
   * @returns Array of export intervals with frame-accurate timing
   */
  const buildExportIntervals = useCallback((): ExportInterval[] => {
    console.log('🎬 [ExportTree] Building export intervals from clips:', clips.length);

    // Filter and validate video clips
    const videoClips = clips
      .filter(clip => {
        const isValid = clip.type === 'video' && 
                       clip.file_path && 
                       clip.file_path.trim() !== '' &&
                       typeof clip.start === 'number' &&
                       typeof clip.end === 'number' &&
                       clip.end > clip.start;
        
        if (!isValid) {
          console.warn('🎬 [ExportTree] Skipping invalid clip:', {
            id: clip.id,
            name: clip.name,
            type: clip.type,
            hasFilePath: !!clip.file_path,
            timing: `${clip.start}-${clip.end}`
          });
        }
        
        return isValid;
      })
      .sort((a, b) => a.start - b.start); // Sort by timeline position

    if (videoClips.length === 0) {
      console.log('🎬 [ExportTree] No valid video clips found for export');
      return [];
    }

    console.log('🎬 [ExportTree] Processing video clips:', videoClips.map(c => ({
      name: c.name,
      timelinePosition: `${c.start}s-${c.end}s`,
      sourceInPoint: c.in_point || 0,
      duration: c.end - c.start
    })));

    const intervals: ExportInterval[] = [];
    let currentExportTime = 0; // Sequential time in final export (no timeline gaps)

    for (const clip of videoClips) {
      const sourceDuration = clip.end - clip.start;
      const sourceStart = clip.in_point || 0;
      
      const interval: ExportInterval = {
        sourceFile: convertToSupabaseUrl(clip.file_path),
        sourceStart: sourceStart,
        sourceDuration: sourceDuration,
        timelineStart: currentExportTime,
        timelineEnd: currentExportTime + sourceDuration,
        clipId: clip.id,
        clipName: clip.name
      };

      intervals.push(interval);

      console.log(`🎬 [ExportTree] Interval ${intervals.length}: ${clip.name}`);
      console.log(`    Source: ${clip.file_path.split('/').pop()}`);
      console.log(`    Extract: ${sourceDuration}s from ${sourceStart}s`);
      console.log(`    Export timeline: ${currentExportTime}s → ${currentExportTime + sourceDuration}s`);

      currentExportTime += sourceDuration; // No gaps in export timeline
    }

    const totalExportDuration = currentExportTime;
    console.log('🎬 [ExportTree] ✅ Export intervals complete:', {
      totalSegments: intervals.length,
      totalDuration: `${totalExportDuration}s`,
      segments: intervals.map(i => `${i.clipName}(${i.sourceDuration}s)`)
    });

    return intervals;
  }, [clips]);

  /**
   * Get summary information about current export
   * 
   * @returns Export summary for UI display
   */
  const getExportSummary = useCallback(() => {
    const intervals = buildExportIntervals();
    
    if (intervals.length === 0) {
      return {
        totalSegments: 0,
        totalDuration: 0,
        isEmpty: true,
        message: 'No video content to export'
      };
    }

    const totalDuration = intervals.reduce((sum, interval) => sum + interval.sourceDuration, 0);
    const uniqueSourceFiles = new Set(intervals.map(i => i.sourceFile)).size;

    return {
      totalSegments: intervals.length,
      totalDuration,
      uniqueSourceFiles,
      isEmpty: false,
      message: `${intervals.length} segments from ${uniqueSourceFiles} source files (${totalDuration.toFixed(1)}s total)`
    };
  }, [buildExportIntervals]);

  /**
   * Debug function to validate export intervals
   * 
   * Checks for common issues:
   * - Missing source files
   * - Invalid timing values
   * - Overlapping export timeline
   * - Duration mismatches
   */
  const validateExportIntervals = useCallback((intervals: ExportInterval[] = []): {
    isValid: boolean;
    issues: string[];
  } => {
    const issues: string[] = [];
    const targetIntervals = intervals.length > 0 ? intervals : buildExportIntervals();

    if (targetIntervals.length === 0) {
      return { isValid: false, issues: ['No export intervals to validate'] };
    }

    // Check each interval
    targetIntervals.forEach((interval, index) => {
      // Source file validation
      if (!interval.sourceFile || interval.sourceFile.trim() === '') {
        issues.push(`Interval ${index + 1}: Missing source file`);
      }

      // Timing validation
      if (interval.sourceStart < 0) {
        issues.push(`Interval ${index + 1}: Invalid sourceStart (${interval.sourceStart})`);
      }
      
      if (interval.sourceDuration <= 0) {
        issues.push(`Interval ${index + 1}: Invalid sourceDuration (${interval.sourceDuration})`);
      }

      // Timeline continuity
      if (index > 0) {
        const previousInterval = targetIntervals[index - 1];
        if (interval.timelineStart !== previousInterval.timelineEnd) {
          issues.push(`Interval ${index + 1}: Timeline gap or overlap detected (${previousInterval.timelineEnd} → ${interval.timelineStart})`);
        }
      }
    });

    // Timeline start validation
    if (targetIntervals[0].timelineStart !== 0) {
      issues.push('Export timeline should start at 0s');
    }

    const isValid = issues.length === 0;
    
    if (isValid) {
      console.log('🎬 [ExportTree] ✅ Export intervals validation passed');
    } else {
      console.warn('🎬 [ExportTree] ⚠️ Export intervals validation issues:', issues);
    }

    return { isValid, issues };
  }, [buildExportIntervals]);

  return {
    buildExportIntervals,
    getExportSummary,
    validateExportIntervals
  };
};

/**
 * Utility function to convert export intervals to FFmpeg-friendly format
 * 
 * @param intervals Export intervals from useExportIntervalTree
 * @returns Simplified format for backend processing
 */
export const serializeExportIntervals = (intervals: ExportInterval[]): Record<string, any>[] => {
  return intervals.map(interval => ({
    sourceFile: interval.sourceFile,
    sourceStart: interval.sourceStart,
    sourceDuration: interval.sourceDuration,
    timelineStart: interval.timelineStart,
    timelineEnd: interval.timelineEnd,
    clipId: interval.clipId,
    clipName: interval.clipName
  }));
};

/**
 * Development helper to log export intervals in readable format
 * 
 * @param intervals Export intervals to display
 */
export const debugExportIntervals = (intervals: ExportInterval[]) => {
  if (process.env.NODE_ENV === 'production') return;

  console.group('🎬 [ExportTree] Debug Export Intervals');
  
  if (intervals.length === 0) {
    console.log('No intervals to display');
    console.groupEnd();
    return;
  }

  const totalDuration = intervals.reduce((sum, i) => sum + i.sourceDuration, 0);
  console.log(`Total: ${intervals.length} segments, ${totalDuration.toFixed(1)}s duration`);
  console.log('');

  intervals.forEach((interval, index) => {
    console.log(`${index + 1}. ${interval.clipName}`);
    console.log(`   Source: ${interval.sourceFile.split('/').pop()}`);
    console.log(`   Extract: ${interval.sourceDuration}s from ${interval.sourceStart}s`);
    console.log(`   Timeline: ${interval.timelineStart}s → ${interval.timelineEnd}s`);
    if (index < intervals.length - 1) console.log('');
  });
  
  console.groupEnd();
};