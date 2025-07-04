import { create } from 'zustand';
import { useEffect, useCallback } from 'react';
import { persist } from 'zustand/middleware';
import * as GESApi from '../api/apiClient';
import { 
  checkGESAvailability, createGESProject, listGESProjects, getGESProject, deleteGESProject, setCurrentGESProject,
  addGESAsset, listGESAssets, getGESAsset, removeGESAsset, refreshGESAssetMetadata,
  addGESClip, addGESTitleClip, moveGESClip, trimGESClip, removeGESClip, listGESClips, getGESClip,
  startGESPreview, pauseGESPreview, stopGESPreview, seekGESPreview, getGESPipelineStatus, 
  exportGESProject, getGESExportStatus, cancelGESExport, cleanupGESPipelines,
  addGESTimelineMarker, listGESTimelineMarkers, removeGESTimelineMarker, 
  seekGESToFrame, setGESTimelineZoom, getGESTimelineZoom, snapGESToClips,
  // Enhanced Project Actions
  listProjectTemplates, createProjectFromTemplate, saveProjectToFile, loadProjectFromFile,
  validateProject, batchProjectOperations, bulkClipOperations,
  type ProjectSaveRequest, type ProjectLoadRequest, type ProjectTemplateRequest,
  type ProjectValidationRequest, type BatchProjectOperation, type ProjectTemplate,
  type ProjectTemplatesResponse, type ProjectValidationResult, type BatchOperationResult,
  type BulkClipOperation, type BulkClipOperationResult
} from '../api/apiClient';

// --- GES Project Management Types ---

export enum LayerType {
  MAIN = 0,     // Primary video content
  OVERLAY = 1,  // Video overlays, picture-in-picture
  TEXT = 2,     // Text overlays, titles, captions
  EFFECTS = 3,  // Effects and transitions
  AUDIO = 4     // Audio-only content
}

export interface GESAsset {
  id: string;
  path: string;
  duration: number;
  type: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'UNKNOWN';
  metadata: {
    streams: Array<{
      type: 'video' | 'audio';
      width?: number;
      height?: number;
      framerate?: string;
      bitrate?: number;
      channels?: number;
      sample_rate?: number;
      language?: string;
    }>;
    container?: string;
    tags?: Record<string, string>;
  };
  added_at?: number;
}

export interface GESClip {
  id: string;
  asset_id: string;
  layer: LayerType;
  start_time: number;
  duration: number;
  in_point: number;
  clip_type: 'URI_CLIP' | 'TITLE_CLIP' | 'TEST_CLIP' | 'TRANSITION';
  metadata?: {
    text?: string;
    font_desc?: string;
    [key: string]: any;
  };
}

export interface GESTimelineMarker {
  id: string;
  position: number;
  name: string;
  color: string;
  note?: string;
}

export interface GESProject {
  id: string;
  name: string;
  metadata: {
    width: number;
    height: number;
    framerate: string;
    duration: number;
    created_at: number;
  };
  assets: Record<string, GESAsset>;
  clips: Record<string, GESClip>;
  markers: Record<string, GESTimelineMarker>;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'exporting' | 'error';
  pipeline_status?: {
    state: string;
    position: number;
    duration: number;
    export_progress?: number;
  };
}

export interface GESProjectState {
  // Project management
  projects: Record<string, GESProject>;
  currentProjectId: string | null;
  gesAvailable: boolean;
  
  // UI state
  timelineZoom: {
    zoom_level: number;
    center_position?: number;
  };
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Enhanced Project Action State
  availableTemplates: Record<string, ProjectTemplate>;
  lastValidationResult: ProjectValidationResult | null;
  batchOperationInProgress: boolean;
  lastBatchResult: BatchOperationResult | null;
}

export enum TrackType {
  VIDEO = "video",     // Track 0: Main video
  OVERLAY = "overlay", // Track 1: Video overlays
  AUDIO = "audio",     // Track 2: Audio
  TEXT = "text",       // Track 3: Text overlays
  EFFECTS = "effects", // Track 4: Effects
  OTHER = "other"      // Track 5+: Custom
}

export const getTrackTypeByIndex = (index: number): TrackType => {
  const types = [TrackType.VIDEO, TrackType.OVERLAY, TrackType.AUDIO, 
                 TrackType.TEXT, TrackType.EFFECTS, TrackType.OTHER];
  return types[index] || TrackType.OTHER;
};

export interface Clip {
  id: string;
  name: string;
  start: number;        // Timeline position start (seconds)
  end: number;          // Timeline position end (seconds)
  duration: number;     // Calculated: end - start
  in_point: number;     // Source media in-point (seconds), default 0
  track: number;        // Track/layer index
  type: string;         // video, audio, text
  file_path?: string;   // Backend file reference
  thumbnail?: string;   // UI thumbnail
  // GES-compatible fields
  _type?: string;       // For backend compatibility ("VideoClip")
  effects?: any[];      // Future effects support
}

export interface Asset {
  id: string;
  name: string;
  file_path: string;
  duration: number;
  // Add other metadata as needed (e.g., thumbnail, type)
}

// Helper functions for Clip management
export const createClip = (clipData: Partial<Clip> & { id: string; name: string; start: number; end: number }): Clip => {
  return {
    id: clipData.id,
    name: clipData.name,
    start: clipData.start,
    end: clipData.end,
    duration: clipData.end - clipData.start,
    in_point: clipData.in_point || 0,
    track: clipData.track || 0,
    type: clipData.type || TrackType.VIDEO,
    file_path: clipData.file_path,
    thumbnail: clipData.thumbnail,
    _type: clipData._type || "VideoClip",
    effects: clipData.effects || []
  };
};

export const updateClipDuration = (clip: Clip): Clip => {
  return {
    ...clip,
    duration: clip.end - clip.start
  };
};

export const validateClip = (clip: Clip): boolean => {
  return (
    clip.id && 
    clip.name && 
    clip.start >= 0 && 
    clip.end > clip.start && 
    clip.track >= 0 &&
    clip.in_point >= 0
  );
};

interface EditorState {
  clips: Clip[];
  currentTime: number;
  duration: number;
  selectedClipId: string | null;
  selectedClipIds: string[]; // Multi-selection support
  activeVideoAsset: any | null;
  videoSrc: string | undefined;
  assets: Asset[]; // New: asset store
  
  // GES Project State
  gesProjects: Record<string, GESProject>;
  currentGESProjectId: string | null;
  gesAvailable: boolean;
  timelineZoom: {
    zoom_level: number;
    center_position?: number;
  };
  
  // Enhanced Project Action State
  availableTemplates: Record<string, ProjectTemplate>;
  lastValidationResult: ProjectValidationResult | null;
  batchOperationInProgress: boolean;
  lastBatchResult: BatchOperationResult | null;
  
  // Layout settings
  layout: {
    sidebar: number;
    preview: number;
    chat: number;
    timeline: number;
  };
  
  // History management
  history: {
    past: Omit<EditorState, 'history'>[];
    future: Omit<EditorState, 'history'>[];
  };
  
  projectName: string;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
}

interface EditorStore extends EditorState {
  // Actions
  setClips: (clips: Clip[]) => void;
  addClip: (clip: Clip) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  moveClip: (id: string, newTrack: number, newStart: number, newEnd: number) => void;
  deleteClip: (id: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setSelectedClipId: (id: string | null) => void;
  setActiveVideoAsset: (asset: any | null) => void;
  
  // Multi-selection support
  setSelectedClipIds: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  
  // Bulk operations
  bulkMoveClips: (clipIds: string[], newTrack: number, newStartTime: number) => Promise<BulkClipOperationResult | null>;
  bulkDeleteClips: (clipIds: string[]) => Promise<BulkClipOperationResult | null>;
  bulkCopyClips: (clipIds: string[], timeOffset: number) => Promise<BulkClipOperationResult | null>;
  setVideoSrc: (src: string | undefined) => void;
  
  // Enhanced clip management
  trimClip: (id: string, newStart: number, newEnd: number) => void;
  setClipInPoint: (id: string, inPoint: number) => void;
  addEffectToClip: (id: string, effect: any) => void;
  removeEffectFromClip: (id: string, effectIndex: number) => void;
  getClipsByTrack: (track: number) => Clip[];
  getClipsByType: (type: string) => Clip[];
  
  // Layout actions
  setLayoutSize: (panel: keyof EditorState['layout'], size: number) => void;
  
  // History actions
  undo: () => void;
  redo: () => void;
  pushToHistory: () => void;
  
  // Computed
  recalculateDuration: () => void;
  
  addAsset: (asset: Asset) => void;
  removeAsset: (id: string) => void;
  getAssetById: (id: string) => Asset | undefined;
  
  setProjectName: (name: string) => void;
  
  // GES Project Management Actions
  checkGESAvailability: () => Promise<boolean>;
  createGESProject: (name: string, options?: { width?: number; height?: number; framerate?: string }) => Promise<string | null>;
  loadGESProject: (projectId: string) => Promise<boolean>;
  deleteGESProject: (projectId: string) => Promise<boolean>;
  setCurrentGESProject: (projectId: string) => void;
  
  // GES Asset Management
  addGESAsset: (projectId: string, filePath: string, assetId?: string) => Promise<string | null>;
  removeGESAsset: (projectId: string, assetId: string) => Promise<boolean>;
  refreshGESAssetMetadata: (projectId: string, assetId: string) => Promise<boolean>;
  
  // GES Timeline Management
  addGESClipToLayer: (projectId: string, assetId: string, layer: LayerType, startTime: number, duration: number, inPoint?: number) => Promise<string | null>;
  addGESTitleClip: (projectId: string, layer: LayerType, startTime: number, duration: number, text: string, fontDesc?: string) => Promise<string | null>;
  moveGESClip: (projectId: string, clipId: string, newStartTime: number) => Promise<boolean>;
  trimGESClip: (projectId: string, clipId: string, newDuration: number, newInPoint?: number) => Promise<boolean>;
  removeGESClip: (projectId: string, clipId: string) => Promise<boolean>;
  
  // GES Preview and Export
  startGESPreview: (projectId: string) => Promise<boolean>;
  pauseGESPreview: (projectId: string) => Promise<boolean>;
  stopGESPreview: (projectId: string) => Promise<boolean>;
  seekGESPreview: (projectId: string, position: number) => Promise<boolean>;
  exportGESProject: (projectId: string, outputPath: string, profile?: string) => Promise<boolean>;
  
  // GES Advanced Timeline Control
  addGESTimelineMarker: (projectId: string, position: number, name: string, color?: string, note?: string) => Promise<string | null>;
  removeGESTimelineMarker: (projectId: string, markerId: string) => Promise<boolean>;
  seekGESToFrame: (projectId: string, frameNumber: number) => Promise<boolean>;
  setGESTimelineZoom: (projectId: string, zoomLevel: number, centerPosition?: number) => Promise<boolean>;
  snapGESToClips: (projectId: string, targetPosition: number) => Promise<number | null>;
  
  // GES State Getters
  getCurrentGESProject: () => GESProject | null;
  getGESProjectClips: (projectId: string, layer?: LayerType) => GESClip[];
  getGESProjectAssets: (projectId: string, type?: string) => GESAsset[];
  
  // Loading and error states
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Enhanced Project Actions
  loadProjectTemplates: () => Promise<void>;
  createProjectFromTemplate: (templateName: string, projectName: string, customOptions?: Record<string, any>) => Promise<string | null>;
  saveCurrentProjectToFile: (filePath: string, includeAssets?: boolean, compress?: boolean) => Promise<void>;
  loadProjectFromFile: (filePath: string, projectId?: string, mergeMode?: boolean) => Promise<string | null>;
  validateCurrentProject: (checkAssets?: boolean, checkTiming?: boolean, fixIssues?: boolean) => Promise<ProjectValidationResult | null>;
  runBatchOperation: (projectIds: string[], operation: string, parameters?: Record<string, any>) => Promise<BatchOperationResult | null>;
  
  // Enhanced State Getters
  getAvailableTemplates: () => Record<string, ProjectTemplate>;
  getLastValidationResult: () => ProjectValidationResult | null;
  isBatchOperationInProgress: () => boolean;
  getLastBatchResult: () => BatchOperationResult | null;
}

// Define StateWithoutHistory type that can be used for history entries
type StateWithoutHistory = Omit<EditorState, 'history'>;

// Clone state without circular references
const cloneState = (state: EditorState): StateWithoutHistory => {
  const { history, ...rest } = state;
  return {
    ...rest,
    clips: JSON.parse(JSON.stringify(state.clips)),
  };
};

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      clips: [],
      currentTime: 0,
      duration: 0,
      selectedClipId: null,
      selectedClipIds: [],
      activeVideoAsset: null,
      videoSrc: undefined,
      assets: [],
      
      // Default layout sizes
      layout: {
        sidebar: 20, // 20% width
        preview: 65, // 65% of the right pane
        chat: 35,    // 35% of the right pane
        timeline: 25 // 25% height of the bottom section
      },
      
      // Initialize empty history
      history: {
        past: [],
        future: [],
      },
      
      projectName: "Untitled Project",
      
      // GES Project State
      gesProjects: {},
      currentGESProjectId: null,
      gesAvailable: false,
      timelineZoom: {
        zoom_level: 1.0,
        center_position: undefined,
      },
      
      // Loading states
      isLoading: false,
      error: null,
      
      // Enhanced Project Action State
      availableTemplates: {},
      lastValidationResult: null,
      batchOperationInProgress: false,
      lastBatchResult: null,
      
      // Actions
      setClips: (clips) => {
        console.log("🎬 [Store] setClips called with:", clips);
        console.log("🎬 [Store] setClips count:", clips.length);
        console.log("🎬 [Store] Previous clips:", get().clips);
        
        // Log stack trace to see where this is being called from
        console.trace("🎬 [Store] setClips call stack");
        
        set({ clips });
        
        console.log("🎬 [Store] About to call recalculateDuration...");
        try {
          const state = get();
          console.log("🎬 [Store] Got state, calling recalculateDuration");
          state.recalculateDuration();
          console.log("🎬 [Store] recalculateDuration call completed");
        } catch (error) {
          console.error("🎬 [Store] Error calling recalculateDuration:", error);
        }
        
        console.log("🎬 [Store] About to call pushToHistory...");
        get().pushToHistory();
        console.log("🎬 [Store] setClips completed");
      },
      
      addClip: (clip) => {
        // Ensure clip has all required fields with proper defaults
        const normalizedClip = createClip(clip);
        
        if (!validateClip(normalizedClip)) {
          console.error('Invalid clip data:', normalizedClip);
          return;
        }
        
        set((state) => ({ clips: [...state.clips, normalizedClip] }));
        get().recalculateDuration();
        get().pushToHistory();
      },
      
      updateClip: (id, updates) => {
        set((state) => ({
          clips: state.clips.map((clip) => {
            if (clip.id === id) {
              const updatedClip = { ...clip, ...updates };
              // Recalculate duration if start or end changed
              if (updates.start !== undefined || updates.end !== undefined) {
                updatedClip.duration = updatedClip.end - updatedClip.start;
              }
              return updatedClip;
            }
            return clip;
          }),
        }));
        get().recalculateDuration();
        get().pushToHistory();
      },
      
      moveClip: (id, newTrack, newStart, newEnd) => {
        console.log('[Store] moveClip called with:', id, newTrack, newStart, newEnd);
        set((state) => ({
          clips: state.clips.map((clip) => {
            if (clip.id === id) {
              return {
                ...clip,
                track: newTrack,
                start: newStart,
                end: newEnd,
                duration: newEnd - newStart
              };
            }
            return clip;
          }),
        }));
        get().recalculateDuration();
        get().pushToHistory();
      },
      
      deleteClip: (id) => {
        console.log('[Store] deleteClip called with:', id);
        set((state) => {
          const newClips = state.clips.filter((clip) => clip.id !== id);
          console.log('[Store] new clips after deletion:', newClips);
          return { clips: newClips };
        });
        get().recalculateDuration();
        get().pushToHistory();
      },
      
      setCurrentTime: (time) => {
        set({ currentTime: time });
      },
      
      setDuration: (duration) => {
        set({ duration });
      },
      
      setSelectedClipId: (id) => {
        console.log('[Store] setSelectedClipId called with:', id);
        set({ selectedClipId: id });
        // Also update multi-selection - single selection clears multi-selection
        if (id) {
          set({ selectedClipIds: [id] });
        } else {
          set({ selectedClipIds: [] });
        }
      },
      
      // Multi-selection support
      setSelectedClipIds: (ids) => {
        console.log('[Store] setSelectedClipIds called with:', ids);
        set({ selectedClipIds: ids });
        // Update single selection to first item or null
        set({ selectedClipId: ids.length > 0 ? ids[0] : null });
      },
      
      addToSelection: (id) => {
        const state = get();
        if (!state.selectedClipIds.includes(id)) {
          const newSelection = [...state.selectedClipIds, id];
          set({ selectedClipIds: newSelection });
          set({ selectedClipId: newSelection[0] }); // Keep first as primary
        }
      },
      
      removeFromSelection: (id) => {
        const state = get();
        const newSelection = state.selectedClipIds.filter(clipId => clipId !== id);
        set({ selectedClipIds: newSelection });
        set({ selectedClipId: newSelection.length > 0 ? newSelection[0] : null });
      },
      
      toggleSelection: (id) => {
        const state = get();
        if (state.selectedClipIds.includes(id)) {
          get().removeFromSelection(id);
        } else {
          get().addToSelection(id);
        }
      },
      
      clearSelection: () => {
        set({ selectedClipIds: [], selectedClipId: null });
      },
      
      selectAll: () => {
        const state = get();
        const allClipIds = state.clips.map(clip => clip.id);
        set({ selectedClipIds: allClipIds });
        set({ selectedClipId: allClipIds.length > 0 ? allClipIds[0] : null });
      },
      
      setActiveVideoAsset: (asset) => {
        set({ activeVideoAsset: asset });
      },
      
      setVideoSrc: (src) => {
        set({ videoSrc: src });
      },
      
      // Enhanced clip management
      trimClip: (id, newStart, newEnd) => {
        get().updateClip(id, { start: newStart, end: newEnd, duration: newEnd - newStart });
      },
      
      setClipInPoint: (id, inPoint) => {
        get().updateClip(id, { in_point: inPoint });
      },
      
      addEffectToClip: (id, effect) => {
        set((state) => ({
          clips: state.clips.map((clip) => {
            if (clip.id === id) {
              return {
                ...clip,
                effects: [...(clip.effects || []), effect]
              };
            }
            return clip;
          }),
        }));
        get().pushToHistory();
      },
      
      removeEffectFromClip: (id, effectIndex) => {
        set((state) => ({
          clips: state.clips.map((clip) => {
            if (clip.id === id && clip.effects) {
              return {
                ...clip,
                effects: clip.effects.filter((_, index) => index !== effectIndex)
              };
            }
            return clip;
          }),
        }));
        get().pushToHistory();
      },
      
      getClipsByTrack: (track) => {
        return get().clips.filter(clip => clip.track === track);
      },
      
      getClipsByType: (type) => {
        return get().clips.filter(clip => clip.type === type);
      },
      
      // Layout actions
      setLayoutSize: (panel, size) => {
        set((state) => ({
          layout: {
            ...state.layout,
            [panel]: size
          }
        }));
      },
      
      // History actions
      pushToHistory: () => {
        const currentStateWithoutHistory = cloneState(get());
        
        set((state) => ({
          history: {
            past: [...state.history.past, currentStateWithoutHistory],
            future: [],
          }
        }));
      },
      
      undo: () => {
        const { history } = get();
        const { past, future } = history;
        
        if (past.length === 0) return;
        
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        
        // Save current state to future (without history)
        const currentStateWithoutHistory = cloneState(get());
        
        set({
          ...(previous as Partial<EditorState>),
          history: {
            past: newPast,
            future: [currentStateWithoutHistory, ...future],
          },
        });
      },
      
      redo: () => {
        const { history } = get();
        const { past, future } = history;
        
        if (future.length === 0) return;
        
        const next = future[0];
        const newFuture = future.slice(1);
        
        // Save current state to past (without history)
        const currentStateWithoutHistory = cloneState(get());
        
        set({
          ...(next as Partial<EditorState>),
          history: {
            past: [...past, currentStateWithoutHistory],
            future: newFuture,
          },
        });
      },
      
      // Computed functions
      recalculateDuration: () => {
        const { clips } = get();
        console.log('🎬 [Store] recalculateDuration called with clips:', clips);
        
        if (clips.length === 0) {
          console.log('🎬 [Store] No clips, setting duration to 0');
          set({ duration: 0 });
          return;
        }
        
        // Log all clip positions for debugging
        clips.forEach((clip, index) => {
          console.log(`🎬 [Store] Clip ${index + 1}: ${clip.name} - Track: ${clip.track}, Start: ${clip.start}s, End: ${clip.end}s, Duration: ${clip.end - clip.start}s`);
        });
        
        // Calculate the maximum end time across all clips
        const maxEnd = Math.max(...clips.map(clip => clip.end));
        
        // Calculate what the duration would be if clips were sequential
        const totalSequentialDuration = clips.reduce((total, clip) => total + (clip.end - clip.start), 0);
        
        // Set a minimum duration for better UX (at least 30 seconds if there are clips)
        const newDuration = Math.max(maxEnd, 30);
        
        console.log('🎬 [Store] Duration calculation:', {
          maxEnd,
          totalSequentialDuration,
          newDuration,
          clipCount: clips.length,
          clipEndTimes: clips.map(c => ({ id: c.id, name: c.name, end: c.end })),
          allClipPositions: clips.map(c => ({ 
            name: c.name, 
            track: c.track, 
            start: c.start, 
            end: c.end, 
            duration: c.end - c.start 
          }))
        });
        
        console.log('🎬 [Store] Expected vs Actual:', {
          expected: 'Sequential clips should have total duration = sum of individual durations',
          expectedTotal: totalSequentialDuration,
          actualMaxEnd: maxEnd,
          issue: maxEnd < totalSequentialDuration ? 'Clips are overlapping!' : 'Clips positioned correctly'
        });
        
        set({ duration: newDuration });
      },
      
      addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),
      removeAsset: (id) => set((state) => ({ assets: state.assets.filter(a => a.id !== id) })),
      getAssetById: (id) => get().assets.find(a => a.id === id),
      
      setProjectName: (name) => set({ projectName: name }),
      
      // GES Project Management Actions
      checkGESAvailability: async () => {
        try {
          const response = await GESApi.checkGESAvailability();
          const available = response.success;
          set({ gesAvailable: available });
          return available;
        } catch (error) {
          console.error('Error checking GES availability:', error);
          set({ gesAvailable: false, error: 'Failed to check GES availability' });
          return false;
        }
      },
      createGESProject: async (name, options = {}) => {
        try {
          set({ isLoading: true, error: null });
          
          const projectId = `project_${Date.now()}`;
          const response = await GESApi.createGESProject({
            project_id: projectId,
            name,
            width: options.width || 1920,
            height: options.height || 1080,
            framerate: options.framerate || '30/1'
          });
          
          if (response.success && response.data) {
            const newProject: GESProject = {
              id: projectId,
              name,
              metadata: {
                width: options.width || 1920,
                height: options.height || 1080,
                framerate: options.framerate || '30/1',
                duration: 0,
                created_at: Date.now()
              },
              assets: {},
              clips: {},
              markers: {},
              status: 'idle'
            };
            
            set(state => ({
              gesProjects: { ...state.gesProjects, [projectId]: newProject },
              currentGESProjectId: projectId,
              isLoading: false
            }));
            
            return projectId;
          }
          
          set({ isLoading: false, error: 'Failed to create project' });
          return null;
        } catch (error) {
          console.error('Error creating GES project:', error);
          set({ isLoading: false, error: 'Failed to create project' });
          return null;
        }
      },
      loadGESProject: async (projectId) => {
        try {
          set({ isLoading: true, error: null });
          
          const response = await GESApi.getGESProject(projectId);
          if (response.success && response.data) {
            // Parse the response data into our GESProject format
            const projectData = response.data.project_details || response.data;
            
            const project: GESProject = {
              id: projectId,
              name: projectData.name || 'Loaded Project',
              metadata: {
                width: projectData.metadata?.width || 1920,
                height: projectData.metadata?.height || 1080,
                framerate: projectData.metadata?.framerate || '30/1',
                duration: projectData.metadata?.duration || 0,
                created_at: projectData.metadata?.created_at || Date.now()
              },
              assets: projectData.assets || {},
              clips: projectData.clips || {},
              markers: projectData.markers || {},
              status: 'idle'
            };
            
            set(state => ({
              gesProjects: { ...state.gesProjects, [projectId]: project },
              currentGESProjectId: projectId,
              isLoading: false
            }));
            
            return true;
          }
          
          set({ isLoading: false, error: 'Failed to load project' });
          return false;
        } catch (error) {
          console.error('Error loading GES project:', error);
          set({ isLoading: false, error: 'Failed to load project' });
          return false;
        }
      },
      deleteGESProject: async (projectId) => {
        try {
          const response = await GESApi.deleteGESProject(projectId);
          if (response.success) {
            set(state => {
              const newProjects = { ...state.gesProjects };
              delete newProjects[projectId];
              
              return {
                gesProjects: newProjects,
                currentGESProjectId: state.currentGESProjectId === projectId ? null : state.currentGESProjectId
              };
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error deleting GES project:', error);
          set({ error: 'Failed to delete project' });
          return false;
        }
      },
      setCurrentGESProject: (projectId) => {
        set({ currentGESProjectId: projectId });
      },
      
      // GES Asset Management
      addGESAsset: async (projectId, filePath, assetId) => {
        try {
          const response = await GESApi.addGESAsset(projectId, { asset_path: filePath, asset_id: assetId });
          if (response.success && response.data) {
            const asset: GESAsset = {
              id: response.data.asset_id,
              path: filePath,
              duration: response.data.asset_info?.duration || 0,
              type: response.data.asset_info?.type || 'UNKNOWN',
              metadata: response.data.asset_info?.metadata || { streams: [] }
            };
            
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  assets: { ...state.gesProjects[projectId]?.assets, [asset.id]: asset }
                }
              }
            }));
            
            return asset.id;
          }
          return null;
        } catch (error) {
          console.error('Error adding GES asset:', error);
          set({ error: 'Failed to add asset' });
          return null;
        }
      },
      removeGESAsset: async (projectId, assetId) => {
        try {
          const response = await GESApi.removeGESAsset(projectId, assetId);
          if (response.success) {
            set(state => {
              const project = state.gesProjects[projectId];
              if (project) {
                const newAssets = { ...project.assets };
                delete newAssets[assetId];
                
                return {
                  gesProjects: {
                    ...state.gesProjects,
                    [projectId]: { ...project, assets: newAssets }
                  }
                };
              }
              return state;
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error removing GES asset:', error);
          set({ error: 'Failed to remove asset' });
          return false;
        }
      },
      refreshGESAssetMetadata: async (projectId, assetId) => {
        try {
          const response = await GESApi.refreshGESAssetMetadata(projectId, assetId);
          return response.success;
        } catch (error) {
          console.error('Error refreshing GES asset metadata:', error);
          return false;
        }
      },
      
      // GES Timeline Management
      addGESClipToLayer: async (projectId, assetId, layer, startTime, duration, inPoint = 0) => {
        try {
          const layerTypeMap = ['MAIN', 'OVERLAY', 'TEXT', 'EFFECTS', 'AUDIO'];
          const response = await GESApi.addGESClip(projectId, {
            asset_id: assetId,
            layer_type: layerTypeMap[layer],
            start_time: startTime,
            duration,
            in_point: inPoint
          });
          
          if (response.success && response.data) {
            const clip: GESClip = {
              id: response.data.clip_id,
              asset_id: assetId,
              layer,
              start_time: startTime,
              duration,
              in_point: inPoint,
              clip_type: 'URI_CLIP'
            };
            
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  clips: { ...state.gesProjects[projectId]?.clips, [clip.id]: clip }
                }
              }
            }));
            
            return clip.id;
          }
          return null;
        } catch (error) {
          console.error('Error adding GES clip:', error);
          set({ error: 'Failed to add clip' });
          return null;
        }
      },
      addGESTitleClip: async (projectId, layer, startTime, duration, text, fontDesc = 'Sans Bold 36') => {
        try {
          const layerTypeMap = ['MAIN', 'OVERLAY', 'TEXT', 'EFFECTS', 'AUDIO'];
          const response = await GESApi.addGESTitleClip(projectId, {
            layer_type: layerTypeMap[layer],
            start_time: startTime,
            duration,
            text,
            font_desc: fontDesc
          });
          
          if (response.success && response.data) {
            const clip: GESClip = {
              id: response.data.clip_id,
              asset_id: '', // Title clips don't have assets
              layer,
              start_time: startTime,
              duration,
              in_point: 0,
              clip_type: 'TITLE_CLIP',
              metadata: { text, font_desc: fontDesc }
            };
            
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  clips: { ...state.gesProjects[projectId]?.clips, [clip.id]: clip }
                }
              }
            }));
            
            return clip.id;
          }
          return null;
        } catch (error) {
          console.error('Error adding GES title clip:', error);
          set({ error: 'Failed to add title clip' });
          return null;
        }
      },
      moveGESClip: async (projectId, clipId, newStartTime) => {
        try {
          const response = await GESApi.moveGESClip(projectId, { clip_id: clipId, new_start_time: newStartTime });
          if (response.success) {
            set(state => {
              const project = state.gesProjects[projectId];
              if (project && project.clips[clipId]) {
                return {
                  gesProjects: {
                    ...state.gesProjects,
                    [projectId]: {
                      ...project,
                      clips: {
                        ...project.clips,
                        [clipId]: { ...project.clips[clipId], start_time: newStartTime }
                      }
                    }
                  }
                };
              }
              return state;
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error moving GES clip:', error);
          set({ error: 'Failed to move clip' });
          return false;
        }
      },
      trimGESClip: async (projectId, clipId, newDuration, newInPoint) => {
        try {
          const response = await GESApi.trimGESClip(projectId, { 
            clip_id: clipId, 
            new_duration: newDuration,
            new_in_point: newInPoint
          });
          if (response.success) {
            set(state => {
              const project = state.gesProjects[projectId];
              if (project && project.clips[clipId]) {
                const updates: Partial<GESClip> = { duration: newDuration };
                if (newInPoint !== undefined) updates.in_point = newInPoint;
                
                return {
                  gesProjects: {
                    ...state.gesProjects,
                    [projectId]: {
                      ...project,
                      clips: {
                        ...project.clips,
                        [clipId]: { ...project.clips[clipId], ...updates }
                      }
                    }
                  }
                };
              }
              return state;
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error trimming GES clip:', error);
          set({ error: 'Failed to trim clip' });
          return false;
        }
      },
      removeGESClip: async (projectId, clipId) => {
        try {
          const response = await GESApi.removeGESClip(projectId, clipId);
          if (response.success) {
            set(state => {
              const project = state.gesProjects[projectId];
              if (project) {
                const newClips = { ...project.clips };
                delete newClips[clipId];
                
                return {
                  gesProjects: {
                    ...state.gesProjects,
                    [projectId]: { ...project, clips: newClips }
                  }
                };
              }
              return state;
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error removing GES clip:', error);
          set({ error: 'Failed to remove clip' });
          return false;
        }
      },
      
      // GES Preview and Export
      startGESPreview: async (projectId) => {
        try {
          const response = await GESApi.startGESPreview(projectId);
          if (response.success) {
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  status: 'playing'
                }
              }
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error starting GES preview:', error);
          set({ error: 'Failed to start preview' });
          return false;
        }
      },
      
      pauseGESPreview: async (projectId) => {
        try {
          const response = await GESApi.pauseGESPreview(projectId);
          if (response.success) {
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  status: 'paused'
                }
              }
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error pausing GES preview:', error);
          return false;
        }
      },
      
      stopGESPreview: async (projectId) => {
        try {
          const response = await GESApi.stopGESPreview(projectId);
          if (response.success) {
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  status: 'idle'
                }
              }
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error stopping GES preview:', error);
          return false;
        }
      },
      
      seekGESPreview: async (projectId, position) => {
        try {
          const response = await GESApi.seekGESPreview(projectId, { position });
          return response.success;
        } catch (error) {
          console.error('Error seeking GES preview:', error);
          return false;
        }
      },
      
      exportGESProject: async (projectId, outputPath, profile = 'mp4') => {
        try {
          const response = await GESApi.exportGESProject(projectId, { output_path: outputPath, profile });
          if (response.success) {
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  status: 'exporting'
                }
              }
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error exporting GES project:', error);
          set({ error: 'Failed to export project' });
          return false;
        }
      },
      
      // GES Advanced Timeline Control
      addGESTimelineMarker: async (projectId, position, name, color = '#ff0000', note) => {
        try {
          const response = await GESApi.addGESTimelineMarker(projectId, { position, name, color, note });
          if (response.success && response.data) {
            const marker: GESTimelineMarker = {
              id: response.data.marker_id,
              position,
              name,
              color,
              note
            };
            
            set(state => ({
              gesProjects: {
                ...state.gesProjects,
                [projectId]: {
                  ...state.gesProjects[projectId],
                  markers: { ...state.gesProjects[projectId]?.markers, [marker.id]: marker }
                }
              }
            }));
            
            return marker.id;
          }
          return null;
        } catch (error) {
          console.error('Error adding GES timeline marker:', error);
          return null;
        }
      },
      
      removeGESTimelineMarker: async (projectId, markerId) => {
        try {
          const response = await GESApi.removeGESTimelineMarker(projectId, markerId);
          if (response.success) {
            set(state => {
              const project = state.gesProjects[projectId];
              if (project) {
                const newMarkers = { ...project.markers };
                delete newMarkers[markerId];
                
                return {
                  gesProjects: {
                    ...state.gesProjects,
                    [projectId]: { ...project, markers: newMarkers }
                  }
                };
              }
              return state;
            });
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error removing GES timeline marker:', error);
          return false;
        }
      },
      
      seekGESToFrame: async (projectId, frameNumber) => {
        try {
          const response = await GESApi.seekGESToFrame(projectId, { frame_number: frameNumber });
          return response.success;
        } catch (error) {
          console.error('Error seeking GES to frame:', error);
          return false;
        }
      },
      
      setGESTimelineZoom: async (projectId, zoomLevel, centerPosition) => {
        try {
          const response = await GESApi.setGESTimelineZoom(projectId, { zoom_level: zoomLevel, center_position: centerPosition });
          if (response.success) {
            set(state => ({
              timelineZoom: { zoom_level: zoomLevel, center_position: centerPosition }
            }));
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error setting GES timeline zoom:', error);
          return false;
        }
      },
      
      snapGESToClips: async (projectId, targetPosition) => {
        try {
          const response = await GESApi.snapGESToClips(projectId, targetPosition);
          if (response.success && response.data) {
            return response.data.snapped_position;
          }
          return null;
        } catch (error) {
          console.error('Error snapping GES to clips:', error);
          return null;
        }
      },
      
      // GES State Getters
      getCurrentGESProject: () => {
        const state = get();
        return state.currentGESProjectId ? state.gesProjects[state.currentGESProjectId] || null : null;
      },
      
      getGESProjectClips: (projectId, layer) => {
        const state = get();
        const project = state.gesProjects[projectId];
        if (!project) return [];
        
        const clips = Object.values(project.clips);
        return layer !== undefined ? clips.filter(clip => clip.layer === layer) : clips;
      },
      
      getGESProjectAssets: (projectId, type) => {
        const state = get();
        const project = state.gesProjects[projectId];
        if (!project) return [];
        
        const assets = Object.values(project.assets);
        return type ? assets.filter(asset => asset.type === type) : assets;
      },
      
      // Loading and error states
      setLoading: (loading) => {
        set({ isLoading: loading });
      },
      setError: (error) => {
        set({ error });
      },
      
             // Enhanced Project Actions
       loadProjectTemplates: async () => {
         try {
           const response = await listProjectTemplates();
           set((state) => ({ 
             ...state, 
             availableTemplates: response.data.templates 
           }));
         } catch (error) {
           console.error('Error loading project templates:', error);
         }
       },
       createProjectFromTemplate: async (templateName, projectName, customOptions = {}) => {
         try {
           const response = await createProjectFromTemplate({
             template_name: templateName as any,
             project_name: projectName,
             custom_options: customOptions
           });
           if (response.success && response.data) {
             return response.data.project_id;
           }
           return null;
         } catch (error) {
           console.error('Error creating project from template:', error);
           return null;
         }
       },
       saveCurrentProjectToFile: async (filePath, includeAssets = true, compress = false) => {
         const currentProjectId = get().currentGESProjectId;
         if (!currentProjectId) return;
         
         try {
           const response = await saveProjectToFile(currentProjectId, {
             file_path: filePath,
             include_assets: includeAssets,
             compress
           });
           if (response.success) {
             console.log('Project saved successfully');
           }
         } catch (error) {
           console.error('Error saving project to file:', error);
         }
       },
       loadProjectFromFile: async (filePath, projectId, mergeMode = false) => {
         try {
           const response = await loadProjectFromFile({
             file_path: filePath,
             project_id: projectId,
             merge_mode: mergeMode
           });
           if (response.success && response.data) {
             return response.data.project_id;
           }
           return null;
         } catch (error) {
           console.error('Error loading project from file:', error);
           return null;
         }
       },
       validateCurrentProject: async (checkAssets = true, checkTiming = true, fixIssues = false) => {
         const currentProjectId = get().currentGESProjectId;
         if (!currentProjectId) return null;
         
         try {
           const response = await validateProject(currentProjectId, {
             check_assets: checkAssets,
             check_timing: checkTiming,
             fix_issues: fixIssues
           });
           const result = response.data;
           set((state) => ({ 
             ...state, 
             lastValidationResult: result 
           }));
           return result;
         } catch (error) {
           console.error('Error validating project:', error);
           return null;
         }
       },
       runBatchOperation: async (projectIds, operation, parameters = {}) => {
         set((state) => ({ 
           ...state, 
           batchOperationInProgress: true 
         }));
         
         try {
           const response = await batchProjectOperations({
             project_ids: projectIds,
             operation: operation as any,
             parameters
           });
           const result = response.data;
           set((state) => ({ 
             ...state, 
             lastBatchResult: result,
             batchOperationInProgress: false 
           }));
           return result;
         } catch (error) {
           console.error('Error running batch operation:', error);
           set((state) => ({ 
             ...state, 
             batchOperationInProgress: false 
           }));
           return null;
         }
       },
      
      // Bulk clip operations
      bulkMoveClips: async (clipIds, newTrack, newStartTime) => {
        const currentProjectId = get().currentGESProjectId;
        if (!currentProjectId) {
          console.error('[Store] No current project for bulk move operation');
          return null;
        }
        
        try {
          set({ batchOperationInProgress: true });
          
          const response = await bulkClipOperations(currentProjectId, {
            clip_ids: clipIds,
            operation: 'move',
            parameters: {
              new_start_time: newStartTime,
              new_track: newTrack
            }
          });
          
          if (response && response.data) {
            console.log('✅ [Store] Bulk move completed:', response.data);
            // Update local clip positions if successful
            clipIds.forEach(clipId => {
              get().moveClip(clipId, newTrack, newStartTime, newStartTime + 5); // Assume 5s duration
            });
            return response.data;
          }
          
          return null;
        } catch (error) {
          console.error('[Store] Bulk move error:', error);
          return null;
        } finally {
          set({ batchOperationInProgress: false });
        }
      },
      
      bulkDeleteClips: async (clipIds) => {
        const currentProjectId = get().currentGESProjectId;
        if (!currentProjectId) {
          console.error('[Store] No current project for bulk delete operation');
          return null;
        }
        
        try {
          set({ batchOperationInProgress: true });
          
          const response = await bulkClipOperations(currentProjectId, {
            clip_ids: clipIds,
            operation: 'delete',
            parameters: {}
          });
          
          if (response && response.data) {
            console.log('✅ [Store] Bulk delete completed:', response.data);
            // Remove clips from local state if successful
            clipIds.forEach(clipId => {
              get().deleteClip(clipId);
            });
            // Clear selection
            get().clearSelection();
            return response.data;
          }
          
          return null;
        } catch (error) {
          console.error('[Store] Bulk delete error:', error);
          return null;
        } finally {
          set({ batchOperationInProgress: false });
        }
      },
      
      bulkCopyClips: async (clipIds, timeOffset) => {
        const currentProjectId = get().currentGESProjectId;
        if (!currentProjectId) {
          console.error('[Store] No current project for bulk copy operation');
          return null;
        }
        
        try {
          set({ batchOperationInProgress: true });
          
          const response = await bulkClipOperations(currentProjectId, {
            clip_ids: clipIds,
            operation: 'copy',
            parameters: {
              time_offset: timeOffset
            }
          });
          
          if (response && response.data) {
            console.log('✅ [Store] Bulk copy completed:', response.data);
            // Note: The backend creates new clips, so we don't need to update local state here
            // The Timeline component should refresh to show the new clips
            return response.data;
          }
          
          return null;
        } catch (error) {
          console.error('[Store] Bulk copy error:', error);
          return null;
        } finally {
          set({ batchOperationInProgress: false });
        }
      },
      
      // Enhanced State Getters
      getAvailableTemplates: () => {
        return get().availableTemplates;
      },
      getLastValidationResult: () => {
        return get().lastValidationResult;
      },
      isBatchOperationInProgress: () => {
        return get().batchOperationInProgress;
      },
      getLastBatchResult: () => {
        return get().lastBatchResult;
      },
    }),
    {
      name: 'cre8r-editor-storage',
      partialize: (state) => ({
        layout: state.layout,
      }),
    }
  )
);

// Selector hooks
export const useCurrentTime = () => useEditorStore((state) => state.currentTime);
export const useDuration = () => useEditorStore((state) => state.duration);
export const useClips = () => useEditorStore((state) => state.clips);
export const useSelectedClip = () => useEditorStore((state) => state.selectedClipId);
export const useSelectedClips = () => useEditorStore((state) => state.selectedClipIds);
// Simplified multi-selection hook to avoid re-render issues
export const useMultiSelection = () => {
  const selectedClipIds = useEditorStore((state) => state.selectedClipIds);
  const setSelectedClipIds = useEditorStore((state) => state.setSelectedClipIds);
  const addToSelection = useEditorStore((state) => state.addToSelection);
  const removeFromSelection = useEditorStore((state) => state.removeFromSelection);
  const toggleSelection = useEditorStore((state) => state.toggleSelection);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const selectAll = useEditorStore((state) => state.selectAll);
  const bulkMoveClips = useEditorStore((state) => state.bulkMoveClips);
  const bulkDeleteClips = useEditorStore((state) => state.bulkDeleteClips);
  const bulkCopyClips = useEditorStore((state) => state.bulkCopyClips);
  
  // Return stable functions - these don't change between renders in Zustand
  return {
    selectedClipIds,
    setSelectedClipIds,
    addToSelection,
    removeFromSelection,
    toggleSelection,
    clearSelection,
    selectAll,
    bulkMoveClips,
    bulkDeleteClips,
    bulkCopyClips
  };
};
export const useLayout = () => useEditorStore((state) => state.layout);
export const useLayoutSetter = () => useEditorStore((state) => state.setLayoutSize);

// Enhanced selector hooks for GES-compatible features
export const useClipsByTrack = (track: number) => useEditorStore((state) => state.getClipsByTrack(track));
export const useClipsByType = (type: string) => useEditorStore((state) => state.getClipsByType(type));
export const useTrackTypes = () => useEditorStore((state) => {
  const tracks = new Set(state.clips.map(clip => clip.track));
  return Array.from(tracks).sort().map(track => ({
    index: track,
    type: getTrackTypeByIndex(track),
    clips: state.clips.filter(clip => clip.track === track)
  }));
});
export const useClipEffects = (clipId: string) => useEditorStore((state) => {
  const clip = state.clips.find(c => c.id === clipId);
  return clip?.effects || [];
});

// Create a hook for keyboard shortcuts
export const useKeyboardShortcuts = () => {
  const { undo, redo, deleteClip, selectedClipId, setSelectedClipId } = useEditorStore();
  
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Prevent shortcuts if typing in an input, textarea, or contenteditable
    const active = document.activeElement;
    if (
      active &&
      (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        (active as HTMLElement).isContentEditable
      )
    ) {
      return;
    }
    
    // Undo: Ctrl/Cmd + Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      console.log('[KeyboardShortcuts] Undo triggered');
      e.preventDefault();
      undo();
      return;
    }
    
    // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      console.log('[KeyboardShortcuts] Redo triggered');
      e.preventDefault();
      redo();
      return;
    }
    
    // Delete selected clip: Backspace or Delete key
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedClipId) {
      console.log('[KeyboardShortcuts] Delete triggered for:', selectedClipId);
      e.preventDefault();
      deleteClip(selectedClipId);
      setSelectedClipId(null);
      return;
    }
  }, [undo, redo, deleteClip, selectedClipId, setSelectedClipId]);
  
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};

// Custom hooks for GES project management
export const useGESAvailability = () => useEditorStore((state) => state.gesAvailable);
export const useGESProjects = () => useEditorStore((state) => state.gesProjects);
export const useCurrentGESProject = () => useEditorStore((state) => state.getCurrentGESProject());
export const useCurrentGESProjectId = () => useEditorStore((state) => state.currentGESProjectId);

export const useGESProjectAssets = (projectId?: string) => useEditorStore((state) => {
  if (!projectId) return [];
  return state.getGESProjectAssets(projectId);
});

export const useGESProjectClips = (projectId?: string, layer?: LayerType) => useEditorStore((state) => {
  if (!projectId) return [];
  return state.getGESProjectClips(projectId, layer);
});

export const useGESTimelineZoom = () => useEditorStore((state) => state.timelineZoom);
export const useGESLoading = () => useEditorStore((state) => state.isLoading);
export const useGESError = () => useEditorStore((state) => state.error);

// Custom hook for GES project actions
export const useGESProjectActions = () => useEditorStore((state) => ({
  // Project management
  checkAvailability: state.checkGESAvailability,
  createProject: state.createGESProject,
  loadProject: state.loadGESProject,
  deleteProject: state.deleteGESProject,
  setCurrentProject: state.setCurrentGESProject,
  
  // Asset management
  addAsset: state.addGESAsset,
  removeAsset: state.removeGESAsset,
  refreshAssetMetadata: state.refreshGESAssetMetadata,
  
  // Timeline management
  addClipToLayer: state.addGESClipToLayer,
  addTitleClip: state.addGESTitleClip,
  moveClip: state.moveGESClip,
  trimClip: state.trimGESClip,
  removeClip: state.removeGESClip,
  
  // Preview and export
  startPreview: state.startGESPreview,
  pausePreview: state.pauseGESPreview,
  stopPreview: state.stopGESPreview,
  seekPreview: state.seekGESPreview,
  exportProject: state.exportGESProject,
  
  // Advanced timeline control
  addTimelineMarker: state.addGESTimelineMarker,
  removeTimelineMarker: state.removeGESTimelineMarker,
  seekToFrame: state.seekGESToFrame,
  setTimelineZoom: state.setGESTimelineZoom,
  snapToClips: state.snapGESToClips,
  
  // State management
  setLoading: state.setLoading,
  setError: state.setError
}));

// Custom hook for layer-specific clips
export const useGESClipsByLayer = (projectId?: string) => useEditorStore((state) => {
  if (!projectId) return {};
  
  const project = state.gesProjects[projectId];
  if (!project) return {};
  
  const clipsByLayer: Record<LayerType, GESClip[]> = {
    [LayerType.MAIN]: [],
    [LayerType.OVERLAY]: [],
    [LayerType.TEXT]: [],
    [LayerType.EFFECTS]: [],
    [LayerType.AUDIO]: []
  };
  
  Object.values(project.clips).forEach(clip => {
    clipsByLayer[clip.layer].push(clip);
  });
  
  return clipsByLayer;
});

// Custom hook for project timeline markers
export const useGESTimelineMarkers = (projectId?: string) => useEditorStore((state) => {
  if (!projectId) return [];
  
  const project = state.gesProjects[projectId];
  if (!project) return [];
  
  return Object.values(project.markers).sort((a, b) => a.position - b.position);
});

// Utility hook for layer management
export const useLayerTypes = () => {
  return Object.values(LayerType).filter(value => typeof value === 'number') as LayerType[];
};

export const getLayerName = (layer: LayerType): string => {
  const names = {
    [LayerType.MAIN]: 'Main Video',
    [LayerType.OVERLAY]: 'Overlay',
    [LayerType.TEXT]: 'Text & Titles',
    [LayerType.EFFECTS]: 'Effects',
    [LayerType.AUDIO]: 'Audio'
  };
  return names[layer] || `Layer ${layer}`;
};

export const getLayerColor = (layer: LayerType): string => {
  const colors = {
    [LayerType.MAIN]: '#3B82F6',      // Blue
    [LayerType.OVERLAY]: '#10B981',   // Green
    [LayerType.TEXT]: '#F59E0B',      // Yellow
    [LayerType.EFFECTS]: '#8B5CF6',   // Purple
    [LayerType.AUDIO]: '#EF4444'      // Red
  };
  return colors[layer] || '#6B7280';
};
