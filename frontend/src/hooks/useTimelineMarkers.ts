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
  const { toast } = useToast();
  const { currentTime, setCurrentTime } = useEditorStore();
  
  const [state, setState] = useState<MarkersState>({
    markers: [],
    isLoading: false,
    error: null,
    currentMarkerIndex: null
  });

  const keyListenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // API base URL
  const apiBaseUrl = 'http://localhost:8000/api';

  // Load markers from backend
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
      
      // Toast notification removed to prevent infinite loops
      // Error is stored in state for UI to handle
    }
  }, [projectId]); // Removed apiBaseUrl and toast from dependencies

  // Add marker at current position or specified position
  const addMarker = useCallback(async (markerData?: Partial<AddMarkerRequest>) => {
    if (!projectId) return false;
    
    const position = markerData?.position ?? currentTime;
    const name = markerData?.name || `Marker ${state.markers.length + 1}`;
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
        // Add marker to local state
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
  }, [projectId, currentTime, state.markers.length]); // Removed apiBaseUrl and toast

  // Remove marker by ID
  const removeMarker = useCallback(async (markerId: string) => {
    if (!projectId) return false;
    
    try {
      // Get marker name for logging (use current state)
      const marker = state.markers.find(m => m.id === markerId);
      console.log(`🎯 [Markers] Removing marker: ${marker?.name || markerId}`);
      
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
        
        console.log(`🎯 [Markers] ✅ Removed marker: ${marker?.name || markerId}`);
        return true;
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('🎯 [Markers] ❌ Failed to remove marker:', error);
      return false;
    }
  }, [projectId]); // Only depend on projectId to prevent infinite loops

  // Navigate to specific marker
  const goToMarker = useCallback((markerId: string) => {
    const marker = state.markers.find(m => m.id === markerId);
    if (marker) {
      console.log(`🎯 [Markers] Navigating to marker: ${marker.name} at ${marker.position}s`);
      setCurrentTime(marker.position);
      
      const markerIndex = state.markers.findIndex(m => m.id === markerId);
      setState(prev => ({ ...prev, currentMarkerIndex: markerIndex }));
    }
  }, [setCurrentTime]); // Removed state.markers and toast to prevent infinite loops

  // Navigate to next marker - simplified to prevent infinite loops
  const goToNextMarker = useCallback(() => {
    // Use current state directly instead of depending on it
    const currentMarkers = state.markers;
    const currentIndex = state.currentMarkerIndex;
    
    if (currentMarkers.length === 0) return;
    
    let nextIndex: number;
    if (currentIndex === null) {
      nextIndex = currentMarkers.findIndex(m => m.position > currentTime);
      if (nextIndex === -1) nextIndex = 0;
    } else {
      nextIndex = (currentIndex + 1) % currentMarkers.length;
    }
    
    const nextMarker = currentMarkers[nextIndex];
    if (nextMarker) {
      console.log(`🎯 [Markers] Next marker: ${nextMarker.name}`);
      goToMarker(nextMarker.id);
    }
  }, [currentTime, goToMarker]); // Reduced dependencies

  // Navigate to previous marker - simplified to prevent infinite loops
  const goToPreviousMarker = useCallback(() => {
    // Use current state directly instead of depending on it
    const currentMarkers = state.markers;
    const currentIndex = state.currentMarkerIndex;
    
    if (currentMarkers.length === 0) return;
    
    let prevIndex: number;
    if (currentIndex === null) {
      const markersBeforeCurrent = currentMarkers.filter(m => m.position < currentTime);
      if (markersBeforeCurrent.length > 0) {
        prevIndex = currentMarkers.indexOf(markersBeforeCurrent[markersBeforeCurrent.length - 1]);
      } else {
        prevIndex = currentMarkers.length - 1;
      }
    } else {
      prevIndex = currentIndex === 0 ? currentMarkers.length - 1 : currentIndex - 1;
    }
    
    const prevMarker = currentMarkers[prevIndex];
    if (prevMarker) {
      console.log(`🎯 [Markers] Previous marker: ${prevMarker.name}`);
      goToMarker(prevMarker.id);
    }
  }, [currentTime, goToMarker]); // Reduced dependencies

  // Get marker at specific position (for click detection) - simplified
  const getMarkerAtPosition = useCallback((position: number, tolerance: number = 0.5) => {
    // Use current state directly to avoid dependency
    return state.markers.find(marker => 
      Math.abs(marker.position - position) <= tolerance
    );
  }, []); // No dependencies to prevent re-creation

  // Setup keyboard shortcuts - simplified to prevent infinite loops
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
            // Use current state to avoid dependency
            const currentIndex = state.currentMarkerIndex;
            const currentMarkers = state.markers;
            if (currentIndex !== null && currentMarkers[currentIndex]) {
              removeMarker(currentMarkers[currentIndex].id);
              console.log('🎯 [Markers] ⌨️ Keyboard shortcut: Delete current marker (Shift+Del)');
            }
          }
          break;
      }
    };
    
    keyListenerRef.current = handleKeyDown;
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [addMarker, goToNextMarker, goToPreviousMarker, removeMarker]); // Removed state dependencies

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