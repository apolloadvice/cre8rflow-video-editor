import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

// Base URL for the backend API
const API_BASE_URL = 'http://localhost:8000/api';

// --- Type Definitions ---

// Timeline operation request/response types (expand as needed)
export interface CutClipRequest {
  clip_name: string;
  timestamp: string;
  track_type?: string;
  clip_id?: string;
}

export interface TimelineResponse {
  success: boolean;
  message: string;
  timeline: any;
}

export interface PreviewExportRequest {
  timeline: any;
}

export interface TrimClipRequest {
  clip_name: string;
  timestamp: string;
  track_type?: string;
  clip_id?: string;
}

export interface JoinClipsRequest {
  first_clip_name: string;
  second_clip_name: string;
  track_type?: string;
  clip_id?: string;
  second_clip_id?: string;
}

export interface RemoveClipRequest {
  clip_name: string;
  track_type?: string;
  clip_id?: string;
}

export interface AddTextRequest {
  clip_name: string;
  text: string;
  position?: string;
  start: string;
  end: string;
  track_type?: string;
}

export interface OverlayAssetRequest {
  asset: string;
  position: string;
  start: string;
  end: string;
  track_type?: string;
}

export interface FadeClipRequest {
  clip_name: string;
  direction: string;
  start: string;
  end: string;
  track_type?: string;
}

export interface GroupCutRequest {
  target_type: string;
  timestamp: string;
  track_type?: string;
}

export interface CommandRequest {
  command: string;
  timeline: any;
}

export interface CommandResponse {
  result: string; // e.g., "success"
  message: string; // e.g., "Cut applied"
  logs?: string[]; // backend 'train of thought'
  timeline: any;   // updated timeline
}

// --- GES Project Management Types ---

export interface GESProjectCreateRequest {
  project_id: string;
  name: string;
  width?: number;
  height?: number;
  framerate?: string;
}

export interface GESProjectResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface GESAssetAddRequest {
  asset_path: string;
  asset_id?: string;
}

export interface GESClipAddRequest {
  asset_id: string;
  layer_type: string;
  start_time: number;
  duration: number;
  in_point?: number;
}

export interface GESTitleClipAddRequest {
  layer_type: string;
  start_time: number;
  duration: number;
  text: string;
  font_desc?: string;
}

export interface GESClipMoveRequest {
  clip_id: string;
  new_start_time: number;
}

export interface GESClipTrimRequest {
  clip_id: string;
  new_duration: number;
  new_in_point?: number;
}

export interface GESSeekRequest {
  position: number;
}

export interface GESExportRequest {
  output_path: string;
  profile?: string;
}

export interface GESTimelineMarkerRequest {
  position: number;
  name: string;
  color?: string;
  note?: string;
}

export interface GESFrameSeekRequest {
  frame_number: number;
}

export interface GESTimelineZoomRequest {
  zoom_level: number;
  center_position?: number;
}

// --- Generic API Request Handler ---
async function apiRequest<T = any>(
  url: string,
  method: AxiosRequestConfig['method'] = 'get',
  data?: any,
  config?: AxiosRequestConfig
): Promise<T> {
  try {
    const response: AxiosResponse<T> = await axios({
      url: API_BASE_URL + url,
      method,
      data,
      ...config,
    });
    return response.data;
  } catch (error: any) {
    // Optionally, add more robust error handling/logging here
    if (error.response) {
      throw new Error(error.response.data?.detail || error.response.statusText);
    }
    throw error;
  }
}

// --- Timeline Operations ---
export const cutClip = (payload: CutClipRequest) =>
  apiRequest<TimelineResponse>('/timeline/cut', 'post', payload);

export const trimClip = (payload: TrimClipRequest) =>
  apiRequest<TimelineResponse>('/timeline/trim', 'post', payload);

export const joinClips = (payload: JoinClipsRequest) =>
  apiRequest<TimelineResponse>('/timeline/join', 'post', payload);

export const removeClip = (payload: RemoveClipRequest) =>
  apiRequest<TimelineResponse>('/timeline/remove_clip', 'post', payload);

export const addText = (payload: AddTextRequest) =>
  apiRequest<TimelineResponse>('/timeline/add_text', 'post', payload);

export const overlayAsset = (payload: OverlayAssetRequest) =>
  apiRequest<TimelineResponse>('/timeline/overlay', 'post', payload);

export const fadeClip = (payload: FadeClipRequest) =>
  apiRequest<TimelineResponse>('/timeline/fade', 'post', payload);

export const groupCut = (payload: GroupCutRequest) =>
  apiRequest<TimelineResponse>('/timeline/group_cut', 'post', payload);

// Add more timeline operations here (trim, join, remove, etc.)

// --- Preview/Export Operations ---
export const generatePreview = (payload: PreviewExportRequest) =>
  axios.post(API_BASE_URL + '/preview', payload, { responseType: 'blob' });

export const exportVideo = (payload: PreviewExportRequest, quality: 'high' | 'medium' | 'low' = 'high') =>
  axios.post(API_BASE_URL + `/export?quality=${quality}`, payload, { responseType: 'blob' });

// ================== PROFESSIONAL EXPORT API ==================

export interface ExportProfile {
  id: string;
  name: string;
  description: string;
  category: string;
  container: string;
  resolution: string;
  framerate: string;
  estimated_quality: string;
  platform_optimized: boolean;
  file_size_estimate?: string;
}

export interface ProfessionalExportRequest {
  timeline: any;
  profile_id: string;
  output_filename?: string;
  custom_settings?: Record<string, any>;
}

export interface ExportJob {
  job_id: string;
  status: string;
  profile_id: string;
  output_path: string;
  progress: number;
  estimated_size_mb?: number;
  file_size_mb?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  download_url?: string;
}

export interface ExportStatusResponse {
  success: boolean;
  job_id: string;
  status: string;
  progress: number;
  message: string;
  data?: Record<string, any>;
}

// Get all export profiles
export const getExportProfiles = (category?: string) =>
  axios.get<ExportProfile[]>(API_BASE_URL + `/export/profiles${category ? `?category=${category}` : ''}`);

// Get specific export profile
export const getExportProfile = (profileId: string) =>
  axios.get<ExportProfile>(API_BASE_URL + `/export/profiles/${profileId}`);

// Start professional export
export const startProfessionalExport = (request: ProfessionalExportRequest) =>
  axios.post<ExportStatusResponse>(API_BASE_URL + `/export/professional`, request);

// Quick export (legacy)
export const startQuickExport = (timeline: any, format: string = 'youtube_1080p_h264') =>
  axios.post<ExportStatusResponse>(API_BASE_URL + `/export/quick`, {
    timeline,
    format,
    quality: 'high'
  });

// Get all export jobs
export const getExportJobs = () =>
  axios.get<ExportJob[]>(API_BASE_URL + `/export/jobs`);

// Get specific export job
export const getExportJob = (jobId: string) =>
  axios.get<ExportJob>(API_BASE_URL + `/export/jobs/${jobId}`);

// Cancel export job
export const cancelExportJob = (jobId: string) =>
  axios.delete(API_BASE_URL + `/export/jobs/${jobId}`);

// Download export file
export const downloadExport = (jobId: string) =>
  axios.get(API_BASE_URL + `/export/download/${jobId}`, { responseType: 'blob' });

// Cleanup old exports
export const cleanupOldExports = (maxAgeHours: number = 24) =>
  axios.post(API_BASE_URL + `/export/cleanup?max_age_hours=${maxAgeHours}`);

// Expand with additional endpoints as needed

export async function sendCommand(asset_path: string, command: string) {
  // Defensive check
  if (typeof asset_path !== "string") {
    console.error("sendCommand: asset_path is not a string!", asset_path, typeof asset_path);
    throw new Error("asset_path must be a string");
  }
  const payload = { asset_path, command };
  console.log("DEBUG sendCommand payload", payload);
  console.log("DEBUG sendCommand URL:", API_BASE_URL + '/command');
  const res = await axios.post(API_BASE_URL + '/command', payload);
  return res;
}

export const uploadVideo = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await axios.post(API_BASE_URL + "/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data.file_path;
};

// Legacy timeline save function - DEPRECATED
// Use useTimelineSync hook for new implementations
export async function saveTimeline(asset_path: string, timeline: any) {
  console.warn('⚠️ [API] saveTimeline is deprecated, use useTimelineSync hook instead');
  const res = await axios.post('/api/timeline/save', { asset_path, timeline });
  return res.data;
} 

// Enhanced timeline sync functions using v2.0 schema
export interface TimelineLoadRequest {
  asset_path: string;
}

export interface TimelineSaveRequest {
  asset_path: string;
  timeline_json: any;
}

export interface TimelineLoadResponse {
  status: string;
  timeline_json?: any;
  message: string;
  schema_version: string;
}

export interface TimelineLoadRobustRequest {
  asset_path: string;
  validate_assets?: boolean;
  allow_partial_load?: boolean;
}

export interface TimelineLoadRobustResponse {
  status: string;
  timeline_json?: any;
  loading_stats?: any;
  message: string;
  schema_version: string;
}

/**
 * Load timeline using enhanced v2.0 schema
 */
export const loadTimelineEnhanced = (payload: TimelineLoadRequest) =>
  apiRequest<TimelineLoadResponse>('/timeline/load', 'post', payload);

/**
 * Save timeline using enhanced v2.0 schema
 */
export const saveTimelineEnhanced = (payload: TimelineSaveRequest) =>
  apiRequest('/timeline/save', 'post', payload);

/**
 * Load timeline using robust loader with comprehensive validation
 */
export const loadTimelineRobust = (payload: TimelineLoadRobustRequest) =>
  apiRequest<TimelineLoadRobustResponse>('/timeline/load-robust', 'post', payload);

/**
 * Validate timeline data without loading
 */
export const validateTimeline = (asset_path: string) =>
  apiRequest('/timeline/validate', 'post', { asset_path });

/**
 * Get timeline schema for an asset
 */
export const getTimelineSchema = (asset_path: string) =>
  apiRequest('/timeline/schema', 'post', { asset_path }); 

/**
 * Calls the backend AI parser to convert a natural language command into a structured JSON intent.
 * @param command - The user's raw command string
 * @param asset_path - The path to the asset associated with the command
 * @returns { parsed: any, error?: string }
 */
export async function parseCommand(command: string, asset_path: string): Promise<{ parsed: any; error?: string }> {
  try {
    const res = await axios.post(API_BASE_URL + '/parseCommand', { command, asset_path });
    return res.data;
  } catch (err: any) {
    if (err.response && err.response.data && err.response.data.error) {
      return { parsed: null, error: err.response.data.error };
    }
    return { parsed: null, error: err.message || 'Unknown error' };
  }
} 

export async function updateAssetDuration(asset_path: string, duration: number) {
  const payload = { asset_path, duration };
  return axios.post('/api/asset/updateDuration', payload);
} 

// --- GES Project Management API Functions ---

// Project Management
export const checkGESAvailability = () =>
  apiRequest<GESProjectResponse>('/projects/availability');

export const createGESProject = (payload: GESProjectCreateRequest) =>
  apiRequest<GESProjectResponse>('/projects', 'post', payload);

export const listGESProjects = () =>
  apiRequest<GESProjectResponse>('/projects');

export const getGESProject = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}`);

export const deleteGESProject = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}`, 'delete');

export const setCurrentGESProject = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/set-current`, 'post');

// Asset Management
export const addGESAsset = (projectId: string, payload: GESAssetAddRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/assets`, 'post', payload);

export const listGESAssets = (projectId: string, assetType?: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/assets${assetType ? `?asset_type=${assetType}` : ''}`);

export const getGESAsset = (projectId: string, assetId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/assets/${assetId}`);

export const removeGESAsset = (projectId: string, assetId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/assets/${assetId}`, 'delete');

export const refreshGESAssetMetadata = (projectId: string, assetId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/assets/${assetId}/refresh`, 'post');

// Timeline Management
export const addGESClip = (projectId: string, payload: GESClipAddRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/clips`, 'post', payload);

export const addGESTitleClip = (projectId: string, payload: GESTitleClipAddRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/title-clips`, 'post', payload);

export const moveGESClip = (projectId: string, payload: GESClipMoveRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/clips/move`, 'post', payload);

export const trimGESClip = (projectId: string, payload: GESClipTrimRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/clips/trim`, 'post', payload);

export const removeGESClip = (projectId: string, clipId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/clips/${clipId}`, 'delete');

export const listGESClips = (projectId: string, layerType?: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/clips${layerType ? `?layer_type=${layerType}` : ''}`);

export const getGESClip = (projectId: string, clipId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/clips/${clipId}`);

// Preview and Pipeline Management
export const startGESPreview = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/preview/start`, 'post');

export const pauseGESPreview = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/preview/pause`, 'post');

export const stopGESPreview = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/preview/stop`, 'post');

export const seekGESPreview = (projectId: string, payload: GESSeekRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/preview/seek`, 'post', payload);

export const getGESPipelineStatus = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/pipeline/status`);

export const exportGESProject = (projectId: string, payload: GESExportRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/export`, 'post', payload);

export const getGESExportStatus = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/export/status`);

export const cancelGESExport = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/export/cancel`, 'post');

export const cleanupGESPipelines = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/cleanup`, 'post');

// Advanced Timeline Control
export const addGESTimelineMarker = (projectId: string, payload: GESTimelineMarkerRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/timeline/markers`, 'post', payload);

export const listGESTimelineMarkers = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/timeline/markers`);

export const removeGESTimelineMarker = (projectId: string, markerId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/timeline/markers/${markerId}`, 'delete');

export const seekGESToFrame = (projectId: string, payload: GESFrameSeekRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/timeline/seek-frame`, 'post', payload);

export const setGESTimelineZoom = (projectId: string, payload: GESTimelineZoomRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/timeline/zoom`, 'post', payload);

export const getGESTimelineZoom = (projectId: string) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/timeline/zoom`);

export const snapGESToClips = (projectId: string, targetPosition: number) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/timeline/snap-to-clips?target_position=${targetPosition}`, 'post');

// --- GES Direct Timeline Snap API ---

export interface GESSnapRequest {
  target_position: number;
  clips: Array<{
    id: string;
    name: string;
    start: number;
    end: number;
    duration: number;
    file_path: string;
    type: string;
    track?: number;
    in_point?: number;
  }>;
  track_filter?: number;
  snap_threshold?: number;
  include_timeline_markers?: boolean;
}

export interface GESSnapResponse {
  success: boolean;
  message: string;
  data?: {
    original_position: number;
    snapped_position: number;
    snap_distance: number;
    snapped: boolean;
    snap_type: string;
    insertion_index: number;
    all_snap_points: number[];
    snap_threshold: number;
  };
}

export const snapGESTimelinePosition = (request: GESSnapRequest) =>
  apiRequest<GESSnapResponse>('/ges/snap-to-clips', 'post', request);

// ===== ENHANCED PROJECT ACTION INTERFACES =====

export interface ProjectSaveRequest {
  file_path: string;
  include_assets?: boolean;
  compress?: boolean;
}

export interface ProjectLoadRequest {
  file_path: string;
  project_id?: string;
  merge_mode?: boolean;
}

export interface ProjectTemplateRequest {
  template_name: 'youtube_1080p' | 'instagram_story' | 'podcast' | 'documentary' | 'music_video' | 'custom';
  project_name: string;
  custom_options?: Record<string, any>;
}

export interface ProjectValidationRequest {
  check_assets?: boolean;
  check_timing?: boolean;
  fix_issues?: boolean;
}

export interface BatchProjectOperation {
  project_ids: string[];
  operation: 'export' | 'backup' | 'validate' | 'cleanup' | 'archive';
  parameters?: Record<string, any>;
}

export interface ProjectTemplate {
  name: string;
  width: number;
  height: number;
  framerate: string;
  description: string;
  preset_layers: string[];
  export_profile: string;
}

export interface ProjectTemplatesResponse {
  templates: Record<string, ProjectTemplate>;
  template_count: number;
}

export interface ProjectValidationResult {
  project_valid: boolean;
  issues_found: string[];
  issues_fixed: string[];
  asset_check?: {
    total_assets: number;
    missing_assets: number;
    missing_details: Array<{
      asset_id: string;
      path: string;
      issue: string;
    }>;
  };
  timing_check?: {
    total_clips: number;
    timing_issues: number;
    issue_details: string[];
  };
}

export interface BatchOperationResult {
  operation: string;
  total_projects: number;
  successful: string[];
  failed: Array<{
    project_id: string;
    error: string;
  }>;
  results: Record<string, any>;
}

// Bulk Clip Operations
export interface BulkClipOperation {
  clip_ids: string[];
  operation: 'move' | 'delete' | 'copy' | 'mute' | 'unmute';
  parameters: Record<string, any>;
}

export interface BulkClipOperationResult {
  operation: string;
  total_clips: number;
  successful_operations: Array<{
    clip_id: string;
    operation: string;
    status: string;
  }>;
  failed_clips: string[];
  success_rate: string;
}

// ===== ENHANCED PROJECT ACTIONS =====

// Project Templates
export const listProjectTemplates = () =>
  apiRequest<{ data: ProjectTemplatesResponse }>('/projects/templates', 'get');

export const createProjectFromTemplate = (request: ProjectTemplateRequest) =>
  apiRequest<GESProjectResponse>('/projects/from-template', 'post', request);

// Project Persistence
export const saveProjectToFile = (projectId: string, request: ProjectSaveRequest) =>
  apiRequest<GESProjectResponse>(`/projects/${projectId}/save`, 'post', request);

export const loadProjectFromFile = (request: ProjectLoadRequest) =>
  apiRequest<GESProjectResponse>('/projects/load', 'post', request);

// Project Validation
export const validateProject = (projectId: string, request: ProjectValidationRequest) =>
  apiRequest<{ data: ProjectValidationResult }>(`/projects/${projectId}/validate`, 'post', request);

// Batch Operations
export const batchProjectOperations = (request: BatchProjectOperation) =>
  apiRequest<{ data: BatchOperationResult }>('/projects/batch-operations', 'post', request);

// Bulk Clip Operations
export const bulkClipOperations = (projectId: string, request: BulkClipOperation) =>
  apiRequest<{ data: BulkClipOperationResult }>(`/projects/${projectId}/timeline/bulk-operations`, 'post', request);

// ==================== EFFECTS API ====================

// Effects Types
export interface EffectProperty {
  type: string;
  default: any;
  min?: any;
  max?: any;
  description?: string;
}

export interface EffectDefinition {
  type: string;
  name: string;
  description: string;
  category: string;
  properties: Record<string, EffectProperty>;
}

export interface EffectInstance {
  id: string;
  type: string;
  name: string;
  category: string;
  properties: Record<string, any>;
  enabled: boolean;
  order: number;
}

export interface EffectPreset {
  name: string;
  description: string;
  effects: Array<{
    type: string;
    properties: Record<string, any>;
  }>;
}

export interface EffectsLibrary {
  categories: Record<string, EffectDefinition[]>;
  total_effects: number;
}

export interface EffectsResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface AddEffectRequest {
  effect_type: string;
  properties?: Record<string, any>;
}

export interface UpdateEffectRequest {
  properties: Record<string, any>;
}

export interface ReorderEffectsRequest {
  effect_ids: string[];
}

export interface ApplyPresetRequest {
  preset_name: string;
}

// Effects API Functions

/**
 * Get the library of available effects
 */
export const getEffectsLibrary = async (): Promise<EffectsLibrary> => {
  const response = await fetch(`${API_BASE_URL}/effects/library`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get effects library: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data as EffectsLibrary;
};

/**
 * Get available effect presets
 */
export const getEffectPresets = async (): Promise<Record<string, EffectPreset>> => {
  const response = await fetch(`${API_BASE_URL}/effects/presets`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get effect presets: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data.presets as Record<string, EffectPreset>;
};

/**
 * Get effects applied to a specific clip
 */
export const getClipEffects = async (clipId: string): Promise<EffectInstance[]> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get clip effects: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data.effects as EffectInstance[];
};

/**
 * Add an effect to a clip
 */
export const addEffectToClip = async (
  clipId: string, 
  request: AddEffectRequest,
  projectId: string = 'default'
): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}/add?project_id=${projectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to add effect: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data.effect_id as string;
};

/**
 * Remove an effect from a clip
 */
export const removeEffectFromClip = async (clipId: string, effectId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}/effects/${effectId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to remove effect: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }
};

/**
 * Update effect properties
 */
export const updateEffectProperties = async (
  clipId: string, 
  effectId: string, 
  request: UpdateEffectRequest
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}/effects/${effectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to update effect: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }
};

/**
 * Toggle effect enabled/disabled
 */
export const toggleEffect = async (clipId: string, effectId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}/effects/${effectId}/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to toggle effect: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }
};

/**
 * Reorder effects for a clip
 */
export const reorderClipEffects = async (
  clipId: string, 
  request: ReorderEffectsRequest
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to reorder effects: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }
};

/**
 * Clear all effects from a clip
 */
export const clearClipEffects = async (clipId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}/clear`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to clear effects: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }
};

/**
 * Apply a preset to a clip
 */
export const applyPresetToClip = async (
  clipId: string, 
  request: ApplyPresetRequest,
  projectId: string = 'default'
): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/${clipId}/apply-preset?project_id=${projectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to apply preset: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data.applied_effects as string[];
};

/**
 * Add effect to multiple clips (bulk operation)
 */
export const addEffectToMultipleClips = async (
  clipIds: string[], 
  request: AddEffectRequest,
  projectId: string = 'default'
): Promise<Record<string, string | null>> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/bulk/add?project_id=${projectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clip_ids: clipIds, ...request }),
  });

  if (!response.ok) {
    throw new Error(`Failed to add effect to multiple clips: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data.results as Record<string, string | null>;
};

/**
 * Apply preset to multiple clips (bulk operation)
 */
export const applyPresetToMultipleClips = async (
  clipIds: string[], 
  request: ApplyPresetRequest,
  projectId: string = 'default'
): Promise<Record<string, string[]>> => {
  const response = await fetch(`${API_BASE_URL}/effects/clips/bulk/apply-preset?project_id=${projectId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clip_ids: clipIds, ...request }),
  });

  if (!response.ok) {
    throw new Error(`Failed to apply preset to multiple clips: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data.results as Record<string, string[]>;
};

/**
 * Get effects system status
 */
export const getEffectsSystemStatus = async (): Promise<{
  ges_available: boolean;
  total_effects: number;
  total_categories: number;
  total_presets: number;
  categories: string[];
  system_ready: boolean;
}> => {
  const response = await fetch(`${API_BASE_URL}/effects/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get effects system status: ${response.statusText}`);
  }

  const result: EffectsResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.data;
};