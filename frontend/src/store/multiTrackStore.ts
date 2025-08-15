/**
 * Multi-Track Timeline Store for cre8rflow
 * 
 * This store manages the multi-track timeline system while maintaining
 * compatibility with the existing GES backend and API structures.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Timeline, Track, TimelineElement, TrackKind, Project, Marker, CreateTimelineElement, CreateTrack } from '@/types/timeline';
import { TimelineManager, quantizeToFrame, createDefaultTimeline, migrateLegacyTimeline } from '@/lib/timeline';
import { generateUUID } from '@/lib/utils';

// Re-export types from timeline for compatibility
export type { Timeline, Track, TimelineElement, TrackKind, Project, Marker };

// Import existing GES types for backward compatibility
import type { GESProject, GESAsset, GESClip, LayerType } from './editorStore';

// Migration and compatibility types
export interface LegacyClip {
  id: string;
  name: string;
  start: number;
  end: number;
  duration: number;
  in_point: number;
  track: number;
  type: string;
  file_path?: string;
  thumbnail?: string;
}

// Command operation types for editing
export type CommandType = 'split' | 'delete' | 'move' | 'trim' | 'cut_out' | 'ripple';

export interface Command {
  id: string;
  type: CommandType;
  parameters: Record<string, any>;
  timestamp: number;
  applied: boolean;
}

// Selection and interaction state
export interface SelectionState {
  selectedElements: Array<{ trackId: string; elementId: string }>;
  selectedTracks: string[];
  selectionBox: {
    active: boolean;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;
}

// Multi-track timeline state
export interface MultiTrackState {
  // Core timeline
  project: Project;
  timelineManager: TimelineManager | null;
  
  // Playback state
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  
  // UI state
  zoom: number;
  scrollX: number;
  scrollY: number;
  snapEnabled: boolean;
  
  // Selection state
  selection: SelectionState;
  
  // History for undo/redo
  history: {
    past: Timeline[];
    future: Timeline[];
    maxSize: number;
  };
  
  // Feature flags
  featureFlags: {
    multiTrackEnabled: boolean;
    rippleEditingEnabled: boolean;
    magneticTimeline: boolean;
  };
  
  // Compatibility with existing GES system
  gesState: {
    projects: Record<string, GESProject>;
    currentProjectId: string | null;
    available: boolean;
  };
  
  // Loading and error states
  isLoading: boolean;
  error: string | null;
  
  // Command history for advanced editing
  commandHistory: Command[];
}

export interface MultiTrackStore extends MultiTrackState {
  // Timeline management
  createNewProject: (name: string, settings?: Partial<Project>) => void;
  loadProject: (project: Project) => void;
  updateProject: (updates: Partial<Project>) => void;
  
  // Track operations
  addTrack: (kind: TrackKind, name?: string, index?: number) => string;
  removeTrack: (trackId: string) => void;
  moveTrack: (trackId: string, newIndex: number) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  duplicateTrack: (trackId: string) => string;
  
  // Element operations
  addElement: (trackId: string, element: CreateTimelineElement) => string;
  removeElement: (trackId: string, elementId: string) => void;
  updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => void;
  moveElement: (elementId: string, fromTrackId: string, toTrackId: string, newStart?: number) => void;
  duplicateElement: (trackId: string, elementId: string) => string;
  
  // Advanced element operations
  splitElement: (trackId: string, elementId: string, time: number) => { leftId: string; rightId: string } | null;
  trimElement: (trackId: string, elementId: string, trimStart: number, trimEnd: number) => void;
  stretchElement: (trackId: string, elementId: string, newDuration: number) => void;
  
  // Timeline navigation and playback
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  seekToFrame: (frame: number) => void;
  
  // UI controls
  setZoom: (zoom: number) => void;
  setScroll: (x: number, y: number) => void;
  fitToContent: () => void;
  zoomToSelection: () => void;
  toggleSnapping: () => void;
  
  // Selection management
  selectElement: (trackId: string, elementId: string, multi?: boolean) => void;
  selectTrack: (trackId: string, multi?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  selectInRange: (startTime: number, endTime: number, trackIds?: string[]) => void;
  
  // Markers
  addMarker: (time: number, name: string, color?: string) => string;
  removeMarker: (markerId: string) => void;
  updateMarker: (markerId: string, updates: Partial<Marker>) => void;
  goToMarker: (markerId: string) => void;
  
  // Command operations (for "cut out" and other natural language commands)
  executeCommand: (command: Command) => boolean;
  splitElementsAt: (time: number, trackIds?: string[]) => void;
  deleteRange: (startTime: number, endTime: number, mode: 'ripple' | 'lift', trackIds?: string[]) => void;
  rippleEdit: (fromTime: number, delta: number, trackIds?: string[]) => void;
  cutOut: (startTime: number, endTime: number, ripple?: boolean) => void;
  
  // History management
  undo: () => void;
  redo: () => void;
  pushToHistory: () => void;
  clearHistory: () => void;
  
  // Utility getters
  getActiveElements: (time?: number) => { visual: TimelineElement[]; audio: TimelineElement[] };
  getTotalDuration: () => number;
  getElementsInRange: (startTime: number, endTime: number, trackId?: string) => TimelineElement[];
  getTrackByIndex: (index: number) => Track | null;
  getElementById: (elementId: string) => { track: Track; element: TimelineElement } | null;
  
  // Feature flag controls
  enableMultiTrack: (enabled: boolean) => void;
  enableRippleEditing: (enabled: boolean) => void;
  enableMagneticTimeline: (enabled: boolean) => void;
  
  // Legacy compatibility
  migrateLegacyClips: (clips: LegacyClip[]) => void;
  exportLegacyClips: () => LegacyClip[];
  
  // GES integration (maintain existing functionality)
  syncWithGES: (projectId: string) => Promise<void>;
  
  // Error handling
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}

// Default project settings
const DEFAULT_PROJECT_SETTINGS: Omit<Project, 'id' | 'timeline'> = {
  name: 'Untitled Project',
  fps: 30,
  sampleRate: 48000,
  resolution: { width: 1920, height: 1080 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: '1.0.0',
};

// Create the multi-track store
export const useMultiTrackStore = create<MultiTrackStore>()(
  persist(
    (set, get) => ({
      // Initial state
      project: {
        ...DEFAULT_PROJECT_SETTINGS,
        id: generateUUID(),
        timeline: createDefaultTimeline(generateUUID()),
      },
      timelineManager: null,
      
      // Playback
      currentTime: 0,
      isPlaying: false,
      playbackRate: 1.0,
      
      // UI
      zoom: 1.0,
      scrollX: 0,
      scrollY: 0,
      snapEnabled: true,
      
      // Selection
      selection: {
        selectedElements: [],
        selectedTracks: [],
        selectionBox: null,
      },
      
      // History
      history: {
        past: [],
        future: [],
        maxSize: 50,
      },
      
      // Feature flags
      featureFlags: {
        multiTrackEnabled: process.env.NODE_ENV === 'development',
        rippleEditingEnabled: false,
        magneticTimeline: true,
      },
      
      // GES compatibility
      gesState: {
        projects: {},
        currentProjectId: null,
        available: false,
      },
      
      // Loading states
      isLoading: false,
      error: null,
      commandHistory: [],
      
      // Timeline management
      createNewProject: (name: string, settings?: Partial<Project>) => {
        const project: Project = {
          ...DEFAULT_PROJECT_SETTINGS,
          ...settings,
          id: generateUUID(),
          name,
          timeline: createDefaultTimeline(generateUUID()),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        const timelineManager = new TimelineManager(project.timeline);
        
        set({
          project,
          timelineManager,
          currentTime: 0,
          selection: {
            selectedElements: [],
            selectedTracks: [],
            selectionBox: null,
          },
          history: {
            past: [],
            future: [],
            maxSize: 50,
          },
        });
      },
      
      loadProject: (project: Project) => {
        const timelineManager = new TimelineManager(project.timeline);
        set({
          project: {
            ...project,
            updatedAt: new Date().toISOString(),
          },
          timelineManager,
          currentTime: 0,
          selection: {
            selectedElements: [],
            selectedTracks: [],
            selectionBox: null,
          },
        });
      },
      
      updateProject: (updates: Partial<Project>) => {
        const { project } = get();
        const updatedProject = {
          ...project,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        
        set({ project: updatedProject });
      },
      
      // Track operations
      addTrack: (kind: TrackKind, name?: string, index?: number) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return '';
        
        // Calculate the insertion index
        const insertIndex = index !== undefined 
          ? index 
          : Math.max(0, ...project.timeline.tracks.map(t => t.index)) + 1;
        
        const track: Track = {
          id: generateUUID(),
          kind,
          index: insertIndex,
          name: name || `${kind.charAt(0).toUpperCase() + kind.slice(1)} Track ${insertIndex + 1}`,
          elements: [],
        };
        
        // Adjust indexes of existing tracks if necessary
        const updatedTracks = project.timeline.tracks.map(t => 
          t.index >= insertIndex ? { ...t, index: t.index + 1 } : t
        );
        
        const newTimeline = {
          ...project.timeline,
          tracks: [...updatedTracks, track],
        };
        
        // Update timeline manager
        timelineManager.timeline = newTimeline;
        timelineManager.rebuildIndexes();
        
        set({
          project: {
            ...project,
            timeline: newTimeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
        return track.id;
      },
      
      removeTrack: (trackId: string) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return;
        
        const trackToRemove = project.timeline.tracks.find(t => t.id === trackId);
        if (!trackToRemove) return;
        
        // Remove track and adjust indexes
        const updatedTracks = project.timeline.tracks
          .filter(t => t.id !== trackId)
          .map(t => t.index > trackToRemove.index ? { ...t, index: t.index - 1 } : t);
        
        const newTimeline = {
          ...project.timeline,
          tracks: updatedTracks,
        };
        
        timelineManager.timeline = newTimeline;
        timelineManager.rebuildIndexes();
        
        set({
          project: {
            ...project,
            timeline: newTimeline,
            updatedAt: new Date().toISOString(),
          },
          selection: {
            ...get().selection,
            selectedTracks: get().selection.selectedTracks.filter(id => id !== trackId),
            selectedElements: get().selection.selectedElements.filter(sel => sel.trackId !== trackId),
          },
        });
        
        get().pushToHistory();
      },
      
      moveTrack: (trackId: string, newIndex: number) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return;
        
        const track = project.timeline.tracks.find(t => t.id === trackId);
        if (!track) return;
        
        const updatedTracks = project.timeline.tracks.map(t => {
          if (t.id === trackId) {
            return { ...t, index: newIndex };
          }
          
          // Adjust other track indexes
          if (track.index < newIndex && t.index > track.index && t.index <= newIndex) {
            return { ...t, index: t.index - 1 };
          }
          if (track.index > newIndex && t.index >= newIndex && t.index < track.index) {
            return { ...t, index: t.index + 1 };
          }
          
          return t;
        });
        
        const newTimeline = {
          ...project.timeline,
          tracks: updatedTracks,
        };
        
        timelineManager.timeline = newTimeline;
        timelineManager.rebuildIndexes();
        
        set({
          project: {
            ...project,
            timeline: newTimeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
      },
      
      updateTrack: (trackId: string, updates: Partial<Track>) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return;
        
        const updatedTracks = project.timeline.tracks.map(t =>
          t.id === trackId ? { ...t, ...updates } : t
        );
        
        const newTimeline = {
          ...project.timeline,
          tracks: updatedTracks,
        };
        
        timelineManager.timeline = newTimeline;
        timelineManager.rebuildIndexes();
        
        set({
          project: {
            ...project,
            timeline: newTimeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
      },
      
      duplicateTrack: (trackId: string) => {
        const { project } = get();
        const track = project.timeline.tracks.find(t => t.id === trackId);
        if (!track) return '';
        
        const newTrackId = get().addTrack(track.kind, `${track.name} Copy`);
        
        // Duplicate all elements
        track.elements.forEach(element => {
          get().addElement(newTrackId, {
            ...element,
            name: `${element.name} Copy`,
          });
        });
        
        return newTrackId;
      },
      
      // Element operations
      addElement: (trackId: string, elementData: CreateTimelineElement) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return '';
        
        const element: TimelineElement = {
          ...elementData,
          id: generateUUID(),
          start: quantizeToFrame(elementData.start, project.fps),
          trimStart: elementData.trimStart ?? 0,
          trimEnd: elementData.trimEnd ?? 0,
          speed: elementData.speed ?? 1.0,
          volume: elementData.volume ?? 1.0,
          opacity: elementData.opacity ?? 1.0,
        };
        
        timelineManager.addElementToTrack(trackId, element);
        
        set({
          project: {
            ...project,
            timeline: timelineManager.timeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
        return element.id;
      },
      
      removeElement: (trackId: string, elementId: string) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return;
        
        timelineManager.removeElementFromTrack(trackId, elementId);
        
        set({
          project: {
            ...project,
            timeline: timelineManager.timeline,
            updatedAt: new Date().toISOString(),
          },
          selection: {
            ...get().selection,
            selectedElements: get().selection.selectedElements.filter(
              sel => !(sel.trackId === trackId && sel.elementId === elementId)
            ),
          },
        });
        
        get().pushToHistory();
      },
      
      updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return;
        
        // Quantize timing updates to frame boundaries
        const quantizedUpdates = { ...updates };
        if (updates.start !== undefined) {
          quantizedUpdates.start = quantizeToFrame(updates.start, project.fps);
        }
        
        timelineManager.updateElement(trackId, elementId, quantizedUpdates);
        
        set({
          project: {
            ...project,
            timeline: timelineManager.timeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
      },
      
      moveElement: (elementId: string, fromTrackId: string, toTrackId: string, newStart?: number) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return;
        
        const fromTrack = project.timeline.tracks.find(t => t.id === fromTrackId);
        const element = fromTrack?.elements.find(e => e.id === elementId);
        
        if (!element) return;
        
        // Remove from source track
        timelineManager.removeElementFromTrack(fromTrackId, elementId);
        
        // Add to target track with optional new start time
        const updatedElement = newStart !== undefined 
          ? { ...element, start: quantizeToFrame(newStart, project.fps) }
          : element;
          
        timelineManager.addElementToTrack(toTrackId, updatedElement);
        
        set({
          project: {
            ...project,
            timeline: timelineManager.timeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
      },
      
      duplicateElement: (trackId: string, elementId: string) => {
        const { project } = get();
        const track = project.timeline.tracks.find(t => t.id === trackId);
        const element = track?.elements.find(e => e.id === elementId);
        
        if (!element) return '';
        
        // Place duplicate after the original element
        const newStart = element.start + element.duration + 0.1; // Small gap
        
        return get().addElement(trackId, {
          ...element,
          name: `${element.name} Copy`,
          start: newStart,
        });
      },
      
      // Advanced element operations
      splitElement: (trackId: string, elementId: string, time: number) => {
        const { project, timelineManager } = get();
        if (!timelineManager) return null;
        
        const track = project.timeline.tracks.find(t => t.id === trackId);
        const element = track?.elements.find(e => e.id === elementId);
        
        if (!element) return null;
        
        const quantizedTime = quantizeToFrame(time, project.fps);
        
        // Check if split time is within element bounds
        if (quantizedTime <= element.start || quantizedTime >= element.start + element.duration) {
          return null;
        }
        
        // Calculate split point relative to element start
        const relativeTime = quantizedTime - element.start;
        
        // Create left part (keep original element, trim end)
        const leftDuration = relativeTime;
        const leftElement = {
          ...element,
          duration: leftDuration,
          trimEnd: (element.trimEnd ?? 0) + (element.duration - leftDuration),
          name: `${element.name} (Left)`,
        };
        
        // Create right part (new element, trim start)
        const rightDuration = element.duration - relativeTime;
        const rightId = generateUUID();
        const rightElement: TimelineElement = {
          ...element,
          id: rightId,
          start: quantizedTime,
          duration: rightDuration,
          trimStart: (element.trimStart ?? 0) + relativeTime,
          name: `${element.name} (Right)`,
        };
        
        // Update left element
        get().updateElement(trackId, elementId, leftElement);
        
        // Add right element
        get().addElement(trackId, rightElement);
        
        return { leftId: elementId, rightId };
      },
      
      trimElement: (trackId: string, elementId: string, trimStart: number, trimEnd: number) => {
        get().updateElement(trackId, elementId, { trimStart, trimEnd });
      },
      
      stretchElement: (trackId: string, elementId: string, newDuration: number) => {
        const { project } = get();
        const quantizedDuration = quantizeToFrame(newDuration, project.fps);
        get().updateElement(trackId, elementId, { duration: quantizedDuration });
      },
      
      // Timeline navigation and playback
      setCurrentTime: (time: number) => {
        const { project } = get();
        const quantizedTime = quantizeToFrame(time, project.fps);
        set({ currentTime: Math.max(0, quantizedTime) });
      },
      
      setIsPlaying: (playing: boolean) => {
        set({ isPlaying: playing });
      },
      
      setPlaybackRate: (rate: number) => {
        set({ playbackRate: Math.max(0.1, Math.min(4.0, rate)) });
      },
      
      seekToFrame: (frame: number) => {
        const { project } = get();
        const time = frame / project.fps;
        get().setCurrentTime(time);
      },
      
      // UI controls
      setZoom: (zoom: number) => {
        set({ zoom: Math.max(0.1, Math.min(10.0, zoom)) });
      },
      
      setScroll: (x: number, y: number) => {
        set({ scrollX: Math.max(0, x), scrollY: Math.max(0, y) });
      },
      
      fitToContent: () => {
        const { timelineManager } = get();
        if (!timelineManager) return;
        
        const totalDuration = timelineManager.getTotalDuration();
        if (totalDuration > 0) {
          // Calculate zoom to fit content (assuming 1000px container width)
          const newZoom = Math.min(5.0, 1000 / (totalDuration * 100)); // 100px per second at 1x zoom
          set({ zoom: newZoom, scrollX: 0 });
        }
      },
      
      zoomToSelection: () => {
        const { selection, project } = get();
        if (selection.selectedElements.length === 0) return;
        
        // Calculate bounds of selected elements
        let minStart = Infinity;
        let maxEnd = -Infinity;
        
        selection.selectedElements.forEach(({ trackId, elementId }) => {
          const track = project.timeline.tracks.find(t => t.id === trackId);
          const element = track?.elements.find(e => e.id === elementId);
          
          if (element) {
            minStart = Math.min(minStart, element.start);
            maxEnd = Math.max(maxEnd, element.start + element.duration);
          }
        });
        
        if (minStart < Infinity && maxEnd > -Infinity) {
          const duration = maxEnd - minStart;
          const newZoom = Math.min(5.0, 1000 / (duration * 100));
          const newScrollX = Math.max(0, minStart * 100 * newZoom - 100);
          
          set({ zoom: newZoom, scrollX: newScrollX });
        }
      },
      
      toggleSnapping: () => {
        set({ snapEnabled: !get().snapEnabled });
      },
      
      // Selection management
      selectElement: (trackId: string, elementId: string, multi = false) => {
        const { selection } = get();
        
        if (multi) {
          const existing = selection.selectedElements.find(
            sel => sel.trackId === trackId && sel.elementId === elementId
          );
          
          if (existing) {
            // Remove from selection
            set({
              selection: {
                ...selection,
                selectedElements: selection.selectedElements.filter(
                  sel => !(sel.trackId === trackId && sel.elementId === elementId)
                ),
              },
            });
          } else {
            // Add to selection
            set({
              selection: {
                ...selection,
                selectedElements: [...selection.selectedElements, { trackId, elementId }],
              },
            });
          }
        } else {
          // Single selection
          set({
            selection: {
              ...selection,
              selectedElements: [{ trackId, elementId }],
            },
          });
        }
      },
      
      selectTrack: (trackId: string, multi = false) => {
        const { selection } = get();
        
        if (multi) {
          const isSelected = selection.selectedTracks.includes(trackId);
          set({
            selection: {
              ...selection,
              selectedTracks: isSelected
                ? selection.selectedTracks.filter(id => id !== trackId)
                : [...selection.selectedTracks, trackId],
            },
          });
        } else {
          set({
            selection: {
              ...selection,
              selectedTracks: [trackId],
            },
          });
        }
      },
      
      clearSelection: () => {
        set({
          selection: {
            selectedElements: [],
            selectedTracks: [],
            selectionBox: null,
          },
        });
      },
      
      selectAll: () => {
        const { project } = get();
        const selectedElements: Array<{ trackId: string; elementId: string }> = [];
        
        project.timeline.tracks.forEach(track => {
          track.elements.forEach(element => {
            selectedElements.push({ trackId: track.id, elementId: element.id });
          });
        });
        
        set({
          selection: {
            ...get().selection,
            selectedElements,
          },
        });
      },
      
      selectInRange: (startTime: number, endTime: number, trackIds?: string[]) => {
        const { project } = get();
        const selectedElements: Array<{ trackId: string; elementId: string }> = [];
        
        const targetTracks = trackIds 
          ? project.timeline.tracks.filter(t => trackIds.includes(t.id))
          : project.timeline.tracks;
        
        targetTracks.forEach(track => {
          track.elements.forEach(element => {
            const elementEnd = element.start + element.duration;
            
            // Check for overlap with selection range
            if (element.start < endTime && elementEnd > startTime) {
              selectedElements.push({ trackId: track.id, elementId: element.id });
            }
          });
        });
        
        set({
          selection: {
            ...get().selection,
            selectedElements,
          },
        });
      },
      
      // Markers
      addMarker: (time: number, name: string, color?: string) => {
        const { project } = get();
        const quantizedTime = quantizeToFrame(time, project.fps);
        
        const marker: Marker = {
          id: generateUUID(),
          time: quantizedTime,
          name,
          color: color || '#3b82f6',
        };
        
        const newTimeline = {
          ...project.timeline,
          markers: [...project.timeline.markers, marker].sort((a, b) => a.time - b.time),
        };
        
        set({
          project: {
            ...project,
            timeline: newTimeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
        return marker.id;
      },
      
      removeMarker: (markerId: string) => {
        const { project } = get();
        
        const newTimeline = {
          ...project.timeline,
          markers: project.timeline.markers.filter(m => m.id !== markerId),
        };
        
        set({
          project: {
            ...project,
            timeline: newTimeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
      },
      
      updateMarker: (markerId: string, updates: Partial<Marker>) => {
        const { project } = get();
        
        const updatedMarkers = project.timeline.markers.map(m =>
          m.id === markerId ? { ...m, ...updates } : m
        );
        
        const newTimeline = {
          ...project.timeline,
          markers: updatedMarkers.sort((a, b) => a.time - b.time),
        };
        
        set({
          project: {
            ...project,
            timeline: newTimeline,
            updatedAt: new Date().toISOString(),
          },
        });
        
        get().pushToHistory();
      },
      
      goToMarker: (markerId: string) => {
        const { project } = get();
        const marker = project.timeline.markers.find(m => m.id === markerId);
        
        if (marker) {
          get().setCurrentTime(marker.time);
        }
      },
      
      // Command operations (for natural language commands)
      executeCommand: (command: Command) => {
        const { commandHistory } = get();
        
        try {
          switch (command.type) {
            case 'cut_out':
              const { startTime, endTime, ripple } = command.parameters;
              get().cutOut(startTime, endTime, ripple);
              break;
            
            case 'split':
              const { time, trackIds } = command.parameters;
              get().splitElementsAt(time, trackIds);
              break;
            
            case 'delete':
              const { start, end, mode, tracks } = command.parameters;
              get().deleteRange(start, end, mode, tracks);
              break;
            
            case 'ripple':
              const { fromTime, delta, affectedTracks } = command.parameters;
              get().rippleEdit(fromTime, delta, affectedTracks);
              break;
            
            default:
              throw new Error(`Unknown command type: ${command.type}`);
          }
          
          // Mark command as applied and add to history
          const appliedCommand = { ...command, applied: true };
          set({
            commandHistory: [...commandHistory, appliedCommand],
          });
          
          return true;
        } catch (error) {
          console.error('Failed to execute command:', error);
          get().setError(`Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return false;
        }
      },
      
      splitElementsAt: (time: number, trackIds?: string[]) => {
        const { project } = get();
        const quantizedTime = quantizeToFrame(time, project.fps);
        
        const targetTracks = trackIds 
          ? project.timeline.tracks.filter(t => trackIds.includes(t.id))
          : project.timeline.tracks;
        
        targetTracks.forEach(track => {
          if (track.locked) return;
          
          track.elements.forEach(element => {
            if (quantizedTime > element.start && quantizedTime < element.start + element.duration) {
              get().splitElement(track.id, element.id, quantizedTime);
            }
          });
        });
      },
      
      deleteRange: (startTime: number, endTime: number, mode: 'ripple' | 'lift', trackIds?: string[]) => {
        const { project, featureFlags } = get();
        const quantizedStart = quantizeToFrame(startTime, project.fps);
        const quantizedEnd = quantizeToFrame(endTime, project.fps);
        const duration = quantizedEnd - quantizedStart;
        
        if (duration <= 0) return;
        
        const targetTracks = trackIds 
          ? project.timeline.tracks.filter(t => trackIds.includes(t.id))
          : project.timeline.tracks;
        
        targetTracks.forEach(track => {
          if (track.locked) return;
          
          // Find elements to remove or trim
          const elementsToRemove: string[] = [];
          const elementsToUpdate: Array<{ id: string; updates: Partial<TimelineElement> }> = [];
          
          track.elements.forEach(element => {
            const elementEnd = element.start + element.duration;
            
            // Element completely within range - remove it
            if (element.start >= quantizedStart && elementEnd <= quantizedEnd) {
              elementsToRemove.push(element.id);
            }
            // Element starts before range but ends within range - trim end
            else if (element.start < quantizedStart && elementEnd > quantizedStart && elementEnd <= quantizedEnd) {
              const newDuration = quantizedStart - element.start;
              elementsToUpdate.push({
                id: element.id,
                updates: { duration: newDuration }
              });
            }
            // Element starts within range but ends after range - trim start
            else if (element.start >= quantizedStart && element.start < quantizedEnd && elementEnd > quantizedEnd) {
              const trimAmount = quantizedEnd - element.start;
              elementsToUpdate.push({
                id: element.id,
                updates: {
                  start: quantizedEnd,
                  duration: element.duration - trimAmount,
                  trimStart: (element.trimStart ?? 0) + trimAmount
                }
              });
            }
            // Element spans entire range - split it
            else if (element.start < quantizedStart && elementEnd > quantizedEnd) {
              // Create a gap in the element
              const leftDuration = quantizedStart - element.start;
              const rightStart = quantizedEnd;
              const rightDuration = elementEnd - quantizedEnd;
              const rightTrimStart = (element.trimStart ?? 0) + (quantizedEnd - element.start);
              
              // Update left part
              elementsToUpdate.push({
                id: element.id,
                updates: { duration: leftDuration }
              });
              
              // Create right part
              const rightElement: CreateTimelineElement = {
                ...element,
                start: rightStart,
                duration: rightDuration,
                trimStart: rightTrimStart,
                name: `${element.name} (Split)`,
              };
              
              // Add right part
              setTimeout(() => get().addElement(track.id, rightElement), 0);
            }
          });
          
          // Apply removals and updates
          elementsToRemove.forEach(id => get().removeElement(track.id, id));
          elementsToUpdate.forEach(({ id, updates }) => get().updateElement(track.id, id, updates));
          
          // Apply ripple effect if enabled
          if (mode === 'ripple' || featureFlags.rippleEditingEnabled) {
            track.elements.forEach(element => {
              if (element.start >= quantizedEnd) {
                get().updateElement(track.id, element.id, {
                  start: Math.max(0, element.start - duration)
                });
              }
            });
          }
        });
      },
      
      rippleEdit: (fromTime: number, delta: number, trackIds?: string[]) => {
        const { project } = get();
        const quantizedFromTime = quantizeToFrame(fromTime, project.fps);
        const quantizedDelta = quantizeToFrame(delta, project.fps);
        
        const targetTracks = trackIds 
          ? project.timeline.tracks.filter(t => trackIds.includes(t.id))
          : project.timeline.tracks;
        
        targetTracks.forEach(track => {
          if (track.locked) return;
          
          track.elements.forEach(element => {
            if (element.start >= quantizedFromTime) {
              const newStart = Math.max(0, element.start + quantizedDelta);
              get().updateElement(track.id, element.id, { start: newStart });
            }
          });
        });
      },
      
      cutOut: (startTime: number, endTime: number, ripple = true) => {
        const mode = ripple ? 'ripple' : 'lift';
        get().deleteRange(startTime, endTime, mode);
        
        // Execute as a command for history/undo purposes
        const command: Command = {
          id: generateUUID(),
          type: 'cut_out',
          parameters: { startTime, endTime, ripple },
          timestamp: Date.now(),
          applied: true,
        };
        
        set({
          commandHistory: [...get().commandHistory, command],
        });
      },
      
      // History management
      undo: () => {
        const { history, project, timelineManager } = get();
        if (history.past.length === 0) return;
        
        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);
        
        if (timelineManager) {
          timelineManager.timeline = previous;
          timelineManager.rebuildIndexes();
        }
        
        set({
          project: { ...project, timeline: previous },
          history: {
            ...history,
            past: newPast,
            future: [project.timeline, ...history.future],
          },
        });
      },
      
      redo: () => {
        const { history, project, timelineManager } = get();
        if (history.future.length === 0) return;
        
        const next = history.future[0];
        const newFuture = history.future.slice(1);
        
        if (timelineManager) {
          timelineManager.timeline = next;
          timelineManager.rebuildIndexes();
        }
        
        set({
          project: { ...project, timeline: next },
          history: {
            ...history,
            past: [...history.past, project.timeline],
            future: newFuture,
          },
        });
      },
      
      pushToHistory: () => {
        const { history, project } = get();
        
        // Don't add to history if the timeline hasn't changed
        const lastTimeline = history.past[history.past.length - 1];
        if (lastTimeline && JSON.stringify(lastTimeline) === JSON.stringify(project.timeline)) {
          return;
        }
        
        const newPast = [...history.past, project.timeline];
        
        // Limit history size
        if (newPast.length > history.maxSize) {
          newPast.shift(); // Remove oldest entry
        }
        
        set({
          history: {
            ...history,
            past: newPast,
            future: [], // Clear future when new action is performed
          },
        });
      },
      
      clearHistory: () => {
        set({
          history: {
            past: [],
            future: [],
            maxSize: 50,
          },
        });
      },
      
      // Utility getters
      getActiveElements: (time?: number) => {
        const { timelineManager, currentTime } = get();
        if (!timelineManager) return { visual: [], audio: [] };
        
        return timelineManager.getActiveElementsAt(time ?? currentTime);
      },
      
      getTotalDuration: () => {
        const { timelineManager } = get();
        return timelineManager?.getTotalDuration() ?? 0;
      },
      
      getElementsInRange: (startTime: number, endTime: number, trackId?: string) => {
        const { project } = get();
        const elements: TimelineElement[] = [];
        
        const tracks = trackId 
          ? project.timeline.tracks.filter(t => t.id === trackId)
          : project.timeline.tracks;
        
        tracks.forEach(track => {
          track.elements.forEach(element => {
            const elementEnd = element.start + element.duration;
            if (element.start < endTime && elementEnd > startTime) {
              elements.push(element);
            }
          });
        });
        
        return elements;
      },
      
      getTrackByIndex: (index: number) => {
        const { project } = get();
        return project.timeline.tracks.find(t => t.index === index) ?? null;
      },
      
      getElementById: (elementId: string) => {
        const { project } = get();
        
        for (const track of project.timeline.tracks) {
          const element = track.elements.find(e => e.id === elementId);
          if (element) {
            return { track, element };
          }
        }
        
        return null;
      },
      
      // Feature flag controls
      enableMultiTrack: (enabled: boolean) => {
        set({
          featureFlags: {
            ...get().featureFlags,
            multiTrackEnabled: enabled,
          },
        });
      },
      
      enableRippleEditing: (enabled: boolean) => {
        set({
          featureFlags: {
            ...get().featureFlags,
            rippleEditingEnabled: enabled,
          },
        });
      },
      
      enableMagneticTimeline: (enabled: boolean) => {
        set({
          featureFlags: {
            ...get().featureFlags,
            magneticTimeline: enabled,
          },
        });
      },
      
      // Legacy compatibility
      migrateLegacyClips: (clips: LegacyClip[]) => {
        const timeline = migrateLegacyTimeline(clips);
        const timelineManager = new TimelineManager(timeline);
        
        set({
          project: {
            ...get().project,
            timeline,
            updatedAt: new Date().toISOString(),
          },
          timelineManager,
        });
      },
      
      exportLegacyClips: () => {
        const { project } = get();
        const clips: LegacyClip[] = [];
        
        project.timeline.tracks.forEach(track => {
          track.elements.forEach(element => {
            clips.push({
              id: element.id,
              name: element.name || 'Untitled',
              start: element.start,
              end: element.start + element.duration,
              duration: element.duration,
              in_point: element.trimStart ?? 0,
              track: track.index,
              type: track.kind === 'video' ? 'video' : track.kind,
              file_path: element.mediaId, // Map mediaId to file_path for compatibility
            });
          });
        });
        
        return clips;
      },
      
      // GES integration placeholder
      syncWithGES: async (projectId: string) => {
        // TODO: Implement GES synchronization
        console.log('GES sync not yet implemented for multi-track');
      },
      
      // Error handling
      setError: (error: string | null) => {
        set({ error });
      },
      
      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },
    }),
    {
      name: 'multitrack-store',
      version: 1,
      // Only persist essential state, not the timeline manager
      partialize: (state) => ({
        project: state.project,
        currentTime: state.currentTime,
        zoom: state.zoom,
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        snapEnabled: state.snapEnabled,
        featureFlags: state.featureFlags,
      }),
      // Recreate timeline manager on hydration
      onRehydrateStorage: () => (state) => {
        if (state?.project?.timeline) {
          state.timelineManager = new TimelineManager(state.project.timeline);
        }
      },
    }
  )
);

// Export utility functions for external use
export { quantizeToFrame, createDefaultTimeline, TimelineManager };