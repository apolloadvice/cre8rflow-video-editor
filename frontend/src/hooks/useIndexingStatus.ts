import { useState, useEffect } from 'react';

interface IndexingStatus {
  indexing_status: string;
  indexing_progress: number;
  indexing_error?: string;
  twelvelabs_video_id?: string;
  indexing_started_at?: string;
  indexing_completed_at?: string;
}

/**
 * Hook to monitor TwelveLabs indexing status for a specific asset
 * Polls the backend API for real-time status updates
 */
export const useIndexingStatus = (assetId?: string, pollInterval: number = 5000) => {
  const [status, setStatus] = useState<IndexingStatus>({
    indexing_status: 'not_started',
    indexing_progress: 0
  });
  
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!assetId) return;

    const pollStatus = async () => {
      try {
        console.log(`🔍 [IndexingStatus] Polling status for asset ${assetId}`);
        
        const response = await fetch(`/api/assets/${assetId}/indexing-status`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        setStatus({
          indexing_status: data.indexing_status || 'not_started',
          indexing_progress: data.indexing_progress || 0,
          indexing_error: data.indexing_error,
          twelvelabs_video_id: data.twelvelabs_video_id,
          indexing_started_at: data.indexing_started_at,
          indexing_completed_at: data.indexing_completed_at
        });

        console.log(`📊 [IndexingStatus] Asset ${assetId} status: ${data.indexing_status} (${data.indexing_progress}%)`);

      } catch (error) {
        console.error(`❌ [IndexingStatus] Error polling status for asset ${assetId}:`, error);
        // Don't update status on error to avoid clearing existing status
      }
    };

    // Initial poll
    pollStatus();
    setIsPolling(true);

    // Set up continuous polling interval
    const interval = setInterval(pollStatus, pollInterval);
    console.log(`⏱️ [IndexingStatus] Started polling for asset ${assetId} every ${pollInterval}ms`);

    return () => {
      if (interval) {
        clearInterval(interval);
        console.log(`⏹️ [IndexingStatus] Stopped polling for asset ${assetId}`);
      }
      setIsPolling(false);
    };
  }, [assetId, pollInterval, status.indexing_status]);

  return {
    ...status,
    isPolling,
    isIndexing: status.indexing_status === 'starting' || status.indexing_status === 'processing',
    isCompleted: status.indexing_status === 'completed',
    isFailed: status.indexing_status === 'failed'
  };
};

/**
 * Hook to monitor indexing progress for multiple assets
 * Useful for showing overall indexing activity
 */
export const useAllIndexingProgress = (pollInterval: number = 3000) => {
  const [activeIndexing, setActiveIndexing] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const pollAllProgress = async () => {
      try {
        setIsLoading(true);
        console.log('🔍 [AllIndexingProgress] Polling all active indexing tasks');
        
        const response = await fetch('/api/assets/indexing-progress');
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        setActiveIndexing(data.active_indexing || []);
        
        console.log(`📊 [AllIndexingProgress] Found ${data.active_indexing?.length || 0} active indexing tasks`);

      } catch (error) {
        console.error('❌ [AllIndexingProgress] Error polling all indexing progress:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial poll
    pollAllProgress();

    // Set up polling interval
    const interval = setInterval(pollAllProgress, pollInterval);
    console.log(`⏱️ [AllIndexingProgress] Started polling every ${pollInterval}ms`);

    return () => {
      clearInterval(interval);
      console.log('⏹️ [AllIndexingProgress] Stopped polling');
    };
  }, [pollInterval]);

  return {
    activeIndexing,
    isLoading,
    totalActiveJobs: activeIndexing.length,
    hasActiveJobs: activeIndexing.length > 0
  };
};