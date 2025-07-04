import { useCallback, useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { useToast } from '@/hooks/use-toast';
import { setGESTimelineZoom, getGESTimelineZoom } from '@/api/apiClient';

// Timeline persistence configuration
interface TimelinePersistenceConfig {
  autoSaveEnabled?: boolean;
  saveDebounceMs?: number;
  loadOnMount?: boolean;
  autoZoomPersistence?: boolean;
}

// Complete timeline state that gets persisted
interface TimelinePersistedState {
  zoom: number;
  thumbnailsVisible: boolean;
  isAutoZoom: boolean;
  centerPosition?: number;
  lastUpdated: number;
  settings: {
    snapToClips: boolean;
    showMarkers: boolean;
    timelineView: 'compact' | 'normal' | 'expanded';
  };
}

// API response types
interface TimelineZoomResponse {
  success: boolean;
  data: {
    zoom_settings: {
      zoom_level: number;
      center_position?: number;
      updated_at?: number;
    };
    timeline_duration: number;
  };
}

interface PersistenceMetrics {
  lastSaveTime: number | null;
  saveCount: number;
  loadCount: number;
  failureCount: number;
  pendingSaves: number;
}

export const useTimelinePersistence = (
  projectId: string | null,
  config: TimelinePersistenceConfig = {}
) => {
  const { toast } = useToast();
  
  // Configuration with defaults
  const {
    autoSaveEnabled = true,
    saveDebounceMs = 2000, // 2 second debounce
    loadOnMount = true,
    autoZoomPersistence = true
  } = config;

  // Local state for timeline settings
  const [persistedState, setPersistedState] = useState<TimelinePersistedState>({
    zoom: 1.0,
    thumbnailsVisible: true,
    isAutoZoom: true,
    centerPosition: undefined,
    lastUpdated: Date.now(),
    settings: {
      snapToClips: true,
      showMarkers: true,
      timelineView: 'normal'
    }
  });

  // Persistence state and metrics
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<PersistenceMetrics>({
    lastSaveTime: null,
    saveCount: 0,
    loadCount: 0,
    failureCount: 0,
    pendingSaves: 0
  });

  // Refs for managing async operations
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const lastSavedStateRef = useRef<TimelinePersistedState | null>(null);

  // Load persisted state from backend
  const loadPersistedState = useCallback(async () => {
    if (!projectId || !loadOnMount) return;

    console.log('💾 [TimelinePersistence] Loading state for project:', projectId);
    setIsLoading(true);
    setLastError(null);

    try {
      const response = await getGESTimelineZoom(projectId);
      
      if (response.success && response.data?.zoom_settings) {
        const zoomSettings = response.data.zoom_settings;
        
        const loadedState: TimelinePersistedState = {
          zoom: zoomSettings.zoom_level || 1.0,
          centerPosition: zoomSettings.center_position,
          thumbnailsVisible: true, // Default since not persisted in zoom API
          isAutoZoom: !zoomSettings.center_position, // Auto-zoom if no center position
          lastUpdated: zoomSettings.updated_at ? zoomSettings.updated_at * 1000 : Date.now(),
          settings: {
            snapToClips: true,
            showMarkers: true,
            timelineView: 'normal'
          }
        };

        setPersistedState(loadedState);
        lastSavedStateRef.current = loadedState;
        
        setMetrics(prev => ({
          ...prev,
          loadCount: prev.loadCount + 1
        }));

        console.log('💾 [TimelinePersistence] ✅ Loaded state:', {
          zoom: loadedState.zoom,
          centerPosition: loadedState.centerPosition,
          autoZoom: loadedState.isAutoZoom
        });

      } else {
        console.log('💾 [TimelinePersistence] No persisted state found, using defaults');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load timeline state';
      console.error('💾 [TimelinePersistence] ❌ Load failed:', errorMessage);
      
      setLastError(errorMessage);
      setMetrics(prev => ({
        ...prev,
        failureCount: prev.failureCount + 1
      }));

      // Don't show toast on first load failure - use defaults silently
      if (metrics.loadCount > 0) {
        toast({
          title: "Failed to load timeline state",
          description: "Using default settings",
          variant: "destructive"
        });
      }

    } finally {
      setIsLoading(false);
    }
  }, [projectId, loadOnMount, metrics.loadCount, toast]);

  // Save state to backend
  const savePersistedState = useCallback(async (state: TimelinePersistedState) => {
    if (!projectId || !autoSaveEnabled) return;

    // Check if state actually changed
    if (lastSavedStateRef.current && 
        JSON.stringify(lastSavedStateRef.current) === JSON.stringify(state)) {
      console.log('💾 [TimelinePersistence] Skipping save - no changes detected');
      return;
    }

    console.log('💾 [TimelinePersistence] Saving state for project:', projectId);
    setIsSaving(true);
    setLastError(null);

    setMetrics(prev => ({
      ...prev,
      pendingSaves: prev.pendingSaves + 1
    }));

    try {
      const zoomRequest = {
        zoom_level: state.zoom,
        center_position: state.centerPosition
      };

      const response = await setGESTimelineZoom(projectId, zoomRequest);
      
      if (response.success) {
        lastSavedStateRef.current = { ...state };
        
        setMetrics(prev => ({
          ...prev,
          saveCount: prev.saveCount + 1,
          lastSaveTime: Date.now(),
          pendingSaves: Math.max(0, prev.pendingSaves - 1)
        }));

        console.log('💾 [TimelinePersistence] ✅ Saved state:', {
          zoom: state.zoom,
          centerPosition: state.centerPosition
        });

      } else {
        throw new Error('Save request failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save timeline state';
      console.error('💾 [TimelinePersistence] ❌ Save failed:', errorMessage);
      
      setLastError(errorMessage);
      setMetrics(prev => ({
        ...prev,
        failureCount: prev.failureCount + 1,
        pendingSaves: Math.max(0, prev.pendingSaves - 1)
      }));

      toast({
        title: "Failed to save timeline settings",
        description: "Your changes may be lost",
        variant: "destructive"
      });

    } finally {
      setIsSaving(false);
    }
  }, [projectId, autoSaveEnabled, toast]);

  // Debounced save function
  const debouncedSave = useCallback(
    debounce((state: TimelinePersistedState) => {
      if (mountedRef.current) {
        savePersistedState(state);
      }
    }, saveDebounceMs),
    [savePersistedState, saveDebounceMs]
  );

  // Update specific parts of the state
  const updateZoom = useCallback((zoom: number, centerPosition?: number) => {
    setPersistedState(prev => {
      const newState = {
        ...prev,
        zoom: Math.max(0.1, Math.min(10.0, zoom)), // Clamp zoom to API limits
        centerPosition,
        lastUpdated: Date.now()
      };
      
      console.log('💾 [TimelinePersistence] Zoom updated:', { zoom, centerPosition });
      
      if (autoSaveEnabled) {
        debouncedSave(newState);
      }
      
      return newState;
    });
  }, [autoSaveEnabled, debouncedSave]);

  const updateAutoZoom = useCallback((isAutoZoom: boolean) => {
    setPersistedState(prev => {
      const newState = {
        ...prev,
        isAutoZoom,
        centerPosition: isAutoZoom ? undefined : prev.centerPosition, // Clear center when auto-zoom enabled
        lastUpdated: Date.now()
      };
      
      console.log('💾 [TimelinePersistence] Auto-zoom updated:', isAutoZoom);
      
      if (autoSaveEnabled && autoZoomPersistence) {
        debouncedSave(newState);
      }
      
      return newState;
    });
  }, [autoSaveEnabled, autoZoomPersistence, debouncedSave]);

  const updateThumbnailsVisible = useCallback((thumbnailsVisible: boolean) => {
    setPersistedState(prev => {
      const newState = {
        ...prev,
        thumbnailsVisible,
        lastUpdated: Date.now()
      };
      
      console.log('💾 [TimelinePersistence] Thumbnails visibility updated:', thumbnailsVisible);
      
      // Don't auto-save thumbnail visibility - it's more of a UI preference
      return newState;
    });
  }, []);

  const updateSettings = useCallback((settings: Partial<TimelinePersistedState['settings']>) => {
    setPersistedState(prev => {
      const newState = {
        ...prev,
        settings: { ...prev.settings, ...settings },
        lastUpdated: Date.now()
      };
      
      console.log('💾 [TimelinePersistence] Settings updated:', settings);
      
      if (autoSaveEnabled) {
        debouncedSave(newState);
      }
      
      return newState;
    });
  }, [autoSaveEnabled, debouncedSave]);

  // Manual save function for immediate persistence
  const saveNow = useCallback(async () => {
    console.log('💾 [TimelinePersistence] Manual save triggered');
    
    // Cancel any pending debounced saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    await savePersistedState(persistedState);
  }, [savePersistedState, persistedState]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    console.log('💾 [TimelinePersistence] Resetting to defaults');
    
    const defaultState: TimelinePersistedState = {
      zoom: 1.0,
      thumbnailsVisible: true,
      isAutoZoom: true,
      centerPosition: undefined,
      lastUpdated: Date.now(),
      settings: {
        snapToClips: true,
        showMarkers: true,
        timelineView: 'normal'
      }
    };

    setPersistedState(defaultState);
    
    if (autoSaveEnabled) {
      debouncedSave(defaultState);
    }
  }, [autoSaveEnabled, debouncedSave]);

  // Load state on mount or project change
  useEffect(() => {
    if (projectId) {
      loadPersistedState();
    }
  }, [projectId, loadPersistedState]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      
      // Cancel any pending saves
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Cancel debounced save
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Public API
  return {
    // Current state
    state: persistedState,
    
    // State properties for convenience
    zoom: persistedState.zoom,
    thumbnailsVisible: persistedState.thumbnailsVisible,
    isAutoZoom: persistedState.isAutoZoom,
    centerPosition: persistedState.centerPosition,
    settings: persistedState.settings,
    
    // Update functions
    updateZoom,
    updateAutoZoom,
    updateThumbnailsVisible,
    updateSettings,
    
    // Control functions
    saveNow,
    resetToDefaults,
    loadPersistedState,
    
    // Status
    isLoading,
    isSaving,
    lastError,
    metrics,
    
    // Computed status
    hasUnsavedChanges: lastSavedStateRef.current ? 
      JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(persistedState) : 
      false,
    
    isReady: !isLoading && !!projectId,
    
    // Debug info
    debugInfo: {
      projectId,
      config,
      lastSavedState: lastSavedStateRef.current,
      mountedRef: mountedRef.current,
      saveDebounceMs
    }
  };
};

export default useTimelinePersistence; 