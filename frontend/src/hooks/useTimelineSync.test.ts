import { renderHook, act } from '@testing-library/react';
import { useTimelineSync } from './useTimelineSync';
import { useEditorStore } from '../store/editorStore';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the editor store
jest.mock('../store/editorStore');
const mockedUseEditorStore = useEditorStore as jest.MockedFunction<typeof useEditorStore>;

// Mock console methods to avoid noise in tests
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(),
  warn: jest.spyOn(console, 'warn').mockImplementation(),
  error: jest.spyOn(console, 'error').mockImplementation(),
};

describe('useTimelineSync', () => {
  const mockSetClips = jest.fn();
  const mockSetDuration = jest.fn();
  const mockPushToHistory = jest.fn();

  const mockEditorState = {
    clips: [
      {
        id: 'clip1',
        name: 'Test Clip 1',
        start: 0,
        end: 5,
        duration: 5,
        in_point: 0,
        track: 0,
        type: 'video',
        file_path: 'test-video.mp4',
        _type: 'VideoClip',
        effects: []
      },
      {
        id: 'clip2',
        name: 'Test Clip 2',
        start: 5,
        end: 10,
        duration: 5,
        in_point: 2,
        track: 1,
        type: 'audio',
        file_path: 'test-audio.mp3',
        _type: 'VideoClip',
        effects: []
      }
    ],
    setClips: mockSetClips,
    activeVideoAsset: { file_path: 'test-project.mp4' },
    setDuration: mockSetDuration,
    pushToHistory: mockPushToHistory
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseEditorStore.mockReturnValue(mockEditorState as any);
  });

  afterAll(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('createTimelineData', () => {
    it('should convert frontend clips to GES-compatible timeline data', () => {
      const { result } = renderHook(() => useTimelineSync());
      
      const timelineData = result.current.createTimelineData(mockEditorState.clips, 'test-project.mp4');
      
      expect(timelineData).toMatchObject({
        version: '2.0',
        timeline: {
          frame_rate: 30.0,
          width: 1920,
          height: 1080,
          duration: 10 // Max end time from clips
        },
        clips: [
          {
            id: 'clip1',
            name: 'Test Clip 1',
            file_path: 'test-video.mp4',
            timeline_start: 0,
            timeline_end: 5,
            duration: 5,
            in_point: 0,
            track: 0,
            type: 'video',
            effects: []
          },
          {
            id: 'clip2',
            name: 'Test Clip 2',
            file_path: 'test-audio.mp3',
            timeline_start: 5,
            timeline_end: 10,
            duration: 5,
            in_point: 2,
            track: 1,
            type: 'audio',
            effects: []
          }
        ],
        transitions: [],
        metadata: expect.objectContaining({
          schema_version: '2.0'
        })
      });
    });

    it('should handle empty clips array', () => {
      const { result } = renderHook(() => useTimelineSync());
      
      const timelineData = result.current.createTimelineData([], 'test-project.mp4');
      
      expect(timelineData.timeline.duration).toBe(0);
      expect(timelineData.clips).toEqual([]);
    });
  });

  describe('parseTimelineData', () => {
    it('should convert timeline data back to frontend clips', () => {
      const { result } = renderHook(() => useTimelineSync());
      
      const timelineData = {
        version: '2.0',
        timeline: { 
          frame_rate: 30.0, 
          width: 1920,
          height: 1080,
          sample_rate: 48000,
          channels: 2,
          duration: 10 
        },
        clips: [
          {
            id: 'clip1',
            name: 'Test Clip',
            file_path: 'test.mp4',
            timeline_start: 0,
            timeline_end: 5,
            duration: 5,
            in_point: 0,
            track: 0,
            type: 'video',
            effects: []
          }
        ],
        transitions: [],
        metadata: { 
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          schema_version: '2.0' 
        }
      };
      
      const clips = result.current.parseTimelineData(timelineData);
      
      expect(clips).toEqual([
        {
          id: 'clip1',
          name: 'Test Clip',
          start: 0,
          end: 5,
          duration: 5,
          in_point: 0,
          track: 0,
          type: 'video',
          file_path: 'test.mp4',
          _type: 'VideoClip',
          effects: []
        }
      ]);
    });

    it('should handle missing clips gracefully', () => {
      const { result } = renderHook(() => useTimelineSync());
      
      const timelineData = {
        version: '2.0',
        timeline: { 
          frame_rate: 30.0, 
          width: 1920,
          height: 1080,
          sample_rate: 48000,
          channels: 2,
          duration: 0 
        },
        transitions: [],
        metadata: { 
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          schema_version: '2.0' 
        }
        // clips is missing
      };
      
      const clips = result.current.parseTimelineData(timelineData as any);
      
      expect(clips).toEqual([]);
      expect(consoleSpy.warn).toHaveBeenCalledWith('🔄 [TimelineSync] No clips found in timeline data');
    });
  });

  describe('saveTimeline', () => {
    it('should save timeline successfully', async () => {
      const mockResponse = {
        data: {
          status: 'ok',
          message: 'Timeline saved successfully'
        }
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useTimelineSync());
      
      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveTimeline();
      });
      
      expect(saveResult).toEqual({
        success: true,
        message: 'Timeline saved successfully'
      });
      
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/api/timeline/save',
        expect.objectContaining({
          asset_path: 'test-project.mp4',
          timeline_json: expect.objectContaining({
            version: '2.0',
            clips: expect.any(Array)
          })
        })
      );
    });

    it('should handle save errors gracefully', async () => {
      const mockError = {
        response: {
          data: {
            detail: 'Database connection failed'
          }
        }
      };
      mockedAxios.post.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useTimelineSync());
      
      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveTimeline();
      });
      
      expect(saveResult).toEqual({
        success: false,
        message: 'Database connection failed'
      });
    });

    it('should fail when no asset path is available', async () => {
      mockedUseEditorStore.mockReturnValue({
        ...mockEditorState,
        activeVideoAsset: null
      } as any);

      const { result } = renderHook(() => useTimelineSync());
      
      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveTimeline();
      });
      
      expect(saveResult).toEqual({
        success: false,
        message: 'No asset path specified for timeline save'
      });
    });
  });

  describe('loadTimeline', () => {
    it('should load timeline successfully', async () => {
      const mockResponse = {
        data: {
          status: 'ok',
          timeline_json: {
            version: '2.0',
            timeline: { 
              frame_rate: 30.0, 
              width: 1920,
              height: 1080,
              sample_rate: 48000,
              channels: 2,
              duration: 5 
            },
            clips: [
              {
                id: 'loaded-clip',
                name: 'Loaded Clip',
                file_path: 'loaded.mp4',
                timeline_start: 0,
                timeline_end: 5,
                duration: 5,
                in_point: 0,
                track: 0,
                type: 'video',
                effects: []
              }
            ],
            transitions: [],
            metadata: { 
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              schema_version: '2.0' 
            }
          },
          message: 'Timeline loaded successfully'
        }
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useTimelineSync());
      
      let loadResult;
      await act(async () => {
        loadResult = await result.current.loadTimeline('test-project.mp4');
      });
      
      expect(loadResult).toEqual({
        success: true,
        message: 'Timeline loaded successfully',
        clips: expect.arrayContaining([
          expect.objectContaining({
            id: 'loaded-clip',
            name: 'Loaded Clip',
            start: 0,
            end: 5
          })
        ])
      });
      
      expect(mockPushToHistory).toHaveBeenCalled();
      expect(mockSetClips).toHaveBeenCalledWith(expect.any(Array));
      expect(mockSetDuration).toHaveBeenCalledWith(5);
    });

    it('should handle load errors gracefully', async () => {
      const mockError = {
        response: {
          data: {
            detail: 'Timeline not found'
          }
        }
      };
      mockedAxios.post.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => useTimelineSync());
      
      let loadResult;
      await act(async () => {
        loadResult = await result.current.loadTimeline('missing-project.mp4');
      });
      
      expect(loadResult).toEqual({
        success: false,
        message: 'Timeline not found'
      });
    });
  });

  describe('loadTimelineRobust', () => {
    it('should load timeline with robust loader and return stats', async () => {
      const mockResponse = {
        data: {
          status: 'ok',
          timeline_json: {
            version: '2.0',
            timeline: { 
              frame_rate: 30.0, 
              width: 1920,
              height: 1080,
              sample_rate: 48000,
              channels: 2,
              duration: 5 
            },
            clips: [],
            transitions: [],
            metadata: { 
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              schema_version: '2.0' 
            }
          },
          loading_stats: {
            total_clips: 5,
            loaded_clips: 4,
            failed_clips: 1,
            performance_metrics: { load_time_ms: 150 }
          },
          message: 'Timeline loaded with warnings'
        }
      };
      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => useTimelineSync({
        validateAssets: true,
        allowPartialLoad: true
      }));
      
      let loadResult;
      await act(async () => {
        loadResult = await result.current.loadTimelineRobust('test-project.mp4');
      });
      
      expect(loadResult).toEqual({
        success: true,
        message: 'Timeline loaded with warnings',
        clips: [],
        stats: expect.objectContaining({
          total_clips: 5,
          loaded_clips: 4,
          failed_clips: 1
        })
      });
      
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/api/timeline/load-robust',
        {
          asset_path: 'test-project.mp4',
          validate_assets: true,
          allow_partial_load: true
        }
      );
    });
  });

  describe('syncTimeline', () => {
    it('should sync timeline by saving then loading', async () => {
      const mockSaveResponse = {
        data: { status: 'ok', message: 'Saved' }
      };
      const mockLoadResponse = {
        data: {
          status: 'ok',
          timeline_json: {
            version: '2.0',
            timeline: { 
              frame_rate: 30.0, 
              width: 1920,
              height: 1080,
              sample_rate: 48000,
              channels: 2,
              duration: 10 
            },
            clips: [],
            transitions: [],
            metadata: { 
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              schema_version: '2.0' 
            }
          },
          message: 'Loaded'
        }
      };
      
      mockedAxios.post
        .mockResolvedValueOnce(mockSaveResponse)
        .mockResolvedValueOnce(mockLoadResponse);

      const { result } = renderHook(() => useTimelineSync());
      
      let syncResult;
      await act(async () => {
        syncResult = await result.current.syncTimeline();
      });
      
      expect(syncResult).toEqual({
        success: true,
        message: 'Timeline synchronized successfully'
      });
      
      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Save + Load
    });
  });

  describe('auto-save functionality', () => {
    it('should enable auto-save when configured', () => {
      const { result } = renderHook(() => useTimelineSync({
        autoSave: true,
        autoSaveInterval: 1000
      }));
      
      expect(result.current.isAutoSaveEnabled).toBe(true);
    });

    it('should disable auto-save by default', () => {
      const { result } = renderHook(() => useTimelineSync());
      
      expect(result.current.isAutoSaveEnabled).toBe(false);
    });
  });

  describe('status properties', () => {
    it('should provide current status information', () => {
      const { result } = renderHook(() => useTimelineSync());
      
      expect(result.current.currentClipsCount).toBe(2);
      expect(result.current.hasActiveAsset).toBe(true);
    });
  });
}); 