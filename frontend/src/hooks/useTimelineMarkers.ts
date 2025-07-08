import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useToast } from '@/hooks/use-toast';

export interface TimelineMarker {
  id: string;
  position: number;
  name: string;
  color: string;
  note?: string;
  created_at: number;
}

interface AddMarkerRequest {
  position: number;
  name: string;
  color?: string;
  note?: string;
}

interface MarkersState {
  markers: TimelineMarker[];
  isLoading: boolean;
  error: string | null;
  currentMarkerIndex: number | null;
}

interface MarkersResponse {
  success: boolean;
  message: string;
  data: {
    markers: TimelineMarker[];
    marker_count: number;
  };
}

interface MarkerResponse {
  success: boolean;
  message: string;
  data: {
    marker_id: string;
    marker: TimelineMarker;
  };
}

export const useTimelineMarkers = (projectId?: string) => {
  // Remove toast to prevent infinite loops - errors stored in state instead
  const currentTimeRef = useRef(0);
  const setCurrentTimeRef = useRef<((time: number) => void) | null>(null);
  
  // Get currentTime and setCurrentTime only once to prevent infinite re-renders
  const { currentTime, setCurrentTime } = useEditorStore();
  currentTimeRef.current = currentTime;
  setCurrentTimeRef.current = setCurrentTime;
  
  const [state, setState] = useState<MarkersState>({
    markers: [],
    isLoading: false,
    error: null,
    currentMarkerIndex: null
  });

  const keyListenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // API base URL - constant, no need to include in dependencies
  const apiBaseUrl = 'http://localhost:8000/api';

  // Load markers from backend - stable dependencies
  const loadMarkers = useCallback(async () => {
    if (!projectId) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      console.log('🎯 [Markers] Loading markers for project:', projectId);
      
      const response = await fetch(`${apiBaseUrl}/projects/${projectId}/timeline/markers`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result: MarkersResponse = await response.json();
      
      if (result.success) {
        setState(prev => ({
          ...prev,
          markers: result.data.markers.sort((a, b) => a.position - b.position),
          isLoading: false
        }));
        
        console.log(`🎯 [Markers] ✅ Loaded ${result.data.marker_count} markers`);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('🎯 [Markers] ❌ Failed to load markers:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load markers'
      }));
    }
  }, [projectId]); // Only depend on projectId

  // Add marker - stable dependencies
  const addMarker = useCallback(async (markerData?: Partial<AddMarkerRequest>) => {
    if (!projectId) return false;
    
    const position = markerData?.position ?? currentTimeRef.current;
    // Use functional state update to avoid depending on state.markers.length
    const name = markerData?.name || `Marker`;
    const color = markerData?.color || '#ff0000';
    const note = markerData?.note || '';
    
    try {
      console.log(`🎯 [Markers] Adding marker "${name}" at ${position}s`);
      
      const response = await fetch(`${apiBaseUrl}/projects/${projectId}/timeline/markers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          position,
          name,
          color,
          note
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result: MarkerResponse = await response.json();
      
      if (result.success) {
        // Add marker to local state using functional update
        setState(prev => ({
          ...prev,
          markers: [...prev.markers, result.data.marker].sort((a, b) => a.position - b.position)
        }));
        
        console.log(`🎯 [Markers] ✅ Added marker: ${result.data.marker.name}`);
        return true;
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('🎯 [Markers] ❌ Failed to add marker:', error);
      return false;
    }
  }, [projectId]); // Only depend on projectId

  // Remove marker by ID - stable dependencies
  const removeMarker = useCallback(async (markerId: string) => {
    if (!projectId) return false;
    
    try {
      console.log(`🎯 [Markers] Removing marker: ${markerId}`);
      
      const response = await fetch(`${apiBaseUrl}/projects/${projectId}/timeline/markers/${markerId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Remove marker from local state
        setState(prev => ({
          ...prev,
          markers: prev.markers.filter(m => m.id !== markerId),
          currentMarkerIndex: null // Reset current marker
        }));
        
        console.log(`🎯 [Markers] ✅ Removed marker: ${markerId}`);
        return true;
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('🎯 [Markers] ❌ Failed to remove marker:', error);
      return false;
    }
  }, [projectId]); // Only depend on projectId

  // Navigate to specific marker - stable dependencies
  const goToMarker = useCallback((markerId: string) => {
    // Access current state inside the function to avoid dependencies
    setState(currentState => {
      const marker = currentState.markers.find(m => m.id === markerId);
      if (marker) {
        console.log(`🎯 [Markers] Navigating to marker: ${marker.name} at ${marker.position}s`);
        if (setCurrentTimeRef.current) {
          setCurrentTimeRef.current(marker.position);
        }
        
        const markerIndex = currentState.markers.findIndex(m => m.id === markerId);
        return { ...currentState, currentMarkerIndex: markerIndex };
      }
      return currentState;
    });
  }, []); // No dependencies needed

  // Navigate to next marker - stable dependencies
  const goToNextMarker = useCallback(() => {
    setState(currentState => {
      const { markers, currentMarkerIndex } = currentState;
      
      if (markers.length === 0) return currentState;
      
      let nextIndex: number;
      if (currentMarkerIndex === null) {
        nextIndex = markers.findIndex(m => m.position > currentTimeRef.current);
        if (nextIndex === -1) nextIndex = 0;
      } else {
        nextIndex = (currentMarkerIndex + 1) % markers.length;
      }
      
      const nextMarker = markers[nextIndex];
      if (nextMarker) {
        console.log(`🎯 [Markers] Next marker: ${nextMarker.name}`);
        if (setCurrentTimeRef.current) {
          setCurrentTimeRef.current(nextMarker.position);
        }
        return { ...currentState, currentMarkerIndex: nextIndex };
      }
      return currentState;
    });
  }, []); // No dependencies needed

  // Navigate to previous marker - stable dependencies
  const goToPreviousMarker = useCallback(() => {
    setState(currentState => {
      const { markers, currentMarkerIndex } = currentState;
      
      if (markers.length === 0) return currentState;
      
      let prevIndex: number;
      if (currentMarkerIndex === null) {
        const markersBeforeCurrent = markers.filter(m => m.position < currentTimeRef.current);
        if (markersBeforeCurrent.length > 0) {
          prevIndex = markers.indexOf(markersBeforeCurrent[markersBeforeCurrent.length - 1]);
        } else {
          prevIndex = markers.length - 1;
        }
      } else {
        prevIndex = currentMarkerIndex === 0 ? markers.length - 1 : currentMarkerIndex - 1;
      }
      
      const prevMarker = markers[prevIndex];
      if (prevMarker) {
        console.log(`🎯 [Markers] Previous marker: ${prevMarker.name}`);
        if (setCurrentTimeRef.current) {
          setCurrentTimeRef.current(prevMarker.position);
        }
        return { ...currentState, currentMarkerIndex: prevIndex };
      }
      return currentState;
    });
  }, []); // No dependencies needed

  // Get marker at specific position (for click detection) - stable
  const getMarkerAtPosition = useCallback((position: number, tolerance: number = 0.5) => {
    // Access state inside the function to avoid dependencies
    const currentMarkers = state.markers;
    return currentMarkers.find(marker => 
      Math.abs(marker.position - position) <= tolerance
    );
  }, []); // No dependencies to prevent re-creation

  // Setup keyboard shortcuts - stable dependencies
  const setupKeyboardShortcuts = useCallback(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key.toLowerCase()) {
        case 'm':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            addMarker();
            console.log('🎯 [Markers] ⌨️ Keyboard shortcut: Add marker (M)');
          }
          break;
          
        case 'arrowleft':
          if (e.shiftKey) {
            e.preventDefault();
            goToPreviousMarker();
            console.log('🎯 [Markers] ⌨️ Keyboard shortcut: Previous marker (Shift+←)');
          }
          break;
          
        case 'arrowright':
          if (e.shiftKey) {
            e.preventDefault();
            goToNextMarker();
            console.log('🎯 [Markers] ⌨️ Keyboard shortcut: Next marker (Shift+→)');
          }
          break;
          
        case 'delete':
        case 'backspace':
          if (e.shiftKey) {
            e.preventDefault();
            // Access current state to avoid dependencies
            setState(currentState => {
              const { currentMarkerIndex, markers } = currentState;
              if (currentMarkerIndex !== null && markers[currentMarkerIndex]) {
                removeMarker(markers[currentMarkerIndex].id);
                console.log('🎯 [Markers] ⌨️ Keyboard shortcut: Delete current marker (Shift+Del)');
              }
              return currentState;
            });
          }
          break;
      }
    };
    
    keyListenerRef.current = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [addMarker, goToNextMarker, goToPreviousMarker, removeMarker]); // Keep necessary callback dependencies

  // Load markers when project changes
  useEffect(() => {
    if (projectId) {
      loadMarkers();
    }
  }, [projectId, loadMarkers]);

  // Setup keyboard shortcuts
  useEffect(() => {
    const cleanup = setupKeyboardShortcuts();
    
    return () => {
      cleanup();
      if (keyListenerRef.current) {
        document.removeEventListener('keydown', keyListenerRef.current);
      }
    };
  }, [setupKeyboardShortcuts]);

  return {
    // State
    markers: state.markers,
    isLoading: state.isLoading,
    error: state.error,
    currentMarkerIndex: state.currentMarkerIndex,
    
    // Actions
    loadMarkers,
    addMarker,
    removeMarker,
    goToMarker,
    goToNextMarker,
    goToPreviousMarker,
    getMarkerAtPosition,
    
    // Utilities
    hasMarkers: state.markers.length > 0,
    markerCount: state.markers.length
  };
}; 