import { renderHook, act } from '@testing-library/react';
import { useTimelineShortcuts } from './useTimelineShortcuts';
import { useEditorStore } from '@/store/editorStore';

// Mock the external dependencies
jest.mock('@/store/editorStore');
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn()
  })
}));

// Mock DOM methods
Object.defineProperty(window, 'addEventListener', {
  value: jest.fn(),
  writable: true
});

Object.defineProperty(window, 'removeEventListener', {
  value: jest.fn(),
  writable: true
});

const mockUseEditorStore = useEditorStore as jest.MockedFunction<typeof useEditorStore>;

describe('useTimelineShortcuts', () => {
  const mockDeleteClip = jest.fn();
  const mockSetCurrentTime = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the store state
    mockUseEditorStore.mockReturnValue({
      currentTime: 5.0,
      clips: [
        { id: 'clip1', start: 0, end: 10, track: 0 },
        { id: 'clip2', start: 15, end: 25, track: 0 },
        { id: 'clip3', start: 30, end: 40, track: 1 }
      ],
      selectedClipId: 'clip1',
      setCurrentTime: mockSetCurrentTime,
      deleteClip: mockDeleteClip
    } as any);
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    expect(result.current.marks.markIn).toBeNull();
    expect(result.current.marks.markOut).toBeNull();
    expect(result.current.isRippleMode).toBe(false);
    expect(result.current.selectedClips).toEqual([]);
    expect(result.current.hasMarks).toBe(false);
    expect(result.current.hasMarkRange).toBe(false);
    expect(result.current.multiSelectionCount).toBe(0);
  });

  it('should set mark in at current time', () => {
    const onMarkIn = jest.fn();
    const { result } = renderHook(() => useTimelineShortcuts({ onMarkIn }));
    
    act(() => {
      result.current.markIn();
    });
    
    expect(result.current.marks.markIn).toBe(5.0);
    expect(onMarkIn).toHaveBeenCalledWith(5.0);
    expect(result.current.hasMarks).toBe(true);
  });

  it('should set mark out at current time', () => {
    const onMarkOut = jest.fn();
    const { result } = renderHook(() => useTimelineShortcuts({ onMarkOut }));
    
    act(() => {
      result.current.markOut();
    });
    
    expect(result.current.marks.markOut).toBe(5.0);
    expect(onMarkOut).toHaveBeenCalledWith(5.0);
    expect(result.current.hasMarks).toBe(true);
  });

  it('should clear marks', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    act(() => {
      result.current.markIn();
      result.current.markOut();
    });
    
    expect(result.current.hasMarks).toBe(true);
    
    act(() => {
      result.current.clearMarks();
    });
    
    expect(result.current.marks.markIn).toBeNull();
    expect(result.current.marks.markOut).toBeNull();
    expect(result.current.hasMarks).toBe(false);
  });

  it('should toggle ripple mode', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    expect(result.current.isRippleMode).toBe(false);
    
    act(() => {
      result.current.toggleRippleMode();
    });
    
    expect(result.current.isRippleMode).toBe(true);
    
    act(() => {
      result.current.toggleRippleMode();
    });
    
    expect(result.current.isRippleMode).toBe(false);
  });

  it('should select all clips', () => {
    const onSelectAllClips = jest.fn();
    const { result } = renderHook(() => useTimelineShortcuts({ onSelectAllClips }));
    
    act(() => {
      result.current.selectAllClips();
    });
    
    expect(result.current.selectedClips).toEqual(['clip1', 'clip2', 'clip3']);
    expect(result.current.multiSelectionCount).toBe(3);
    expect(onSelectAllClips).toHaveBeenCalled();
  });

  it('should toggle clip selection', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    act(() => {
      result.current.toggleClipSelection('clip1');
    });
    
    expect(result.current.selectedClips).toEqual(['clip1']);
    expect(result.current.multiSelectionCount).toBe(1);
    
    act(() => {
      result.current.toggleClipSelection('clip1');
    });
    
    expect(result.current.selectedClips).toEqual([]);
    expect(result.current.multiSelectionCount).toBe(0);
  });

  it('should group selected clips', () => {
    const onGroupClips = jest.fn();
    const { result } = renderHook(() => useTimelineShortcuts({ onGroupClips }));
    
    // First select multiple clips
    act(() => {
      result.current.toggleClipSelection('clip1');
      result.current.toggleClipSelection('clip2', true);
    });
    
    expect(result.current.multiSelectionCount).toBe(2);
    
    act(() => {
      result.current.groupSelectedClips();
    });
    
    expect(onGroupClips).toHaveBeenCalledWith(['clip1', 'clip2']);
  });

  it('should handle ripple delete in normal mode', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    act(() => {
      result.current.rippleDelete();
    });
    
    expect(mockDeleteClip).toHaveBeenCalledWith('clip1');
  });

  it('should handle ripple delete in ripple mode', () => {
    const onRippleDelete = jest.fn();
    const { result } = renderHook(() => useTimelineShortcuts({ onRippleDelete }));
    
    // Enable ripple mode
    act(() => {
      result.current.toggleRippleMode();
    });
    
    act(() => {
      result.current.rippleDelete();
    });
    
    expect(onRippleDelete).toHaveBeenCalledWith('clip1');
  });

  it('should jump to mark in', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    // Set mark in first
    act(() => {
      result.current.markIn();
    });
    
    // Change current time
    mockUseEditorStore.mockReturnValue({
      ...mockUseEditorStore(),
      currentTime: 10.0
    } as any);
    
    act(() => {
      result.current.jumpToMarkIn();
    });
    
    expect(mockSetCurrentTime).toHaveBeenCalledWith(5.0);
  });

  it('should jump to mark out', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    // Set mark out first
    act(() => {
      result.current.markOut();
    });
    
    // Change current time
    mockUseEditorStore.mockReturnValue({
      ...mockUseEditorStore(),
      currentTime: 10.0
    } as any);
    
    act(() => {
      result.current.jumpToMarkOut();
    });
    
    expect(mockSetCurrentTime).toHaveBeenCalledWith(5.0);
  });

  it('should detect mark range correctly', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    expect(result.current.hasMarkRange).toBe(false);
    
    act(() => {
      result.current.markIn();
    });
    
    expect(result.current.hasMarkRange).toBe(false);
    
    // Set different current time and mark out
    mockUseEditorStore.mockReturnValue({
      ...mockUseEditorStore(),
      currentTime: 10.0
    } as any);
    
    act(() => {
      result.current.markOut();
    });
    
    expect(result.current.hasMarkRange).toBe(true);
  });

  it('should select clips in marked range', () => {
    const { result } = renderHook(() => useTimelineShortcuts());
    
    // Set marks that encompass some clips
    act(() => {
      result.current.markIn(); // at 5.0
    });
    
    // Update current time and set mark out
    mockUseEditorStore.mockReturnValue({
      ...mockUseEditorStore(),
      currentTime: 20.0
    } as any);
    
    act(() => {
      result.current.markOut(); // at 20.0
    });
    
    act(() => {
      result.current.selectMarkedRange();
    });
    
    // Should select clips that overlap with the 5.0-20.0 range
    expect(result.current.selectedClips.length).toBeGreaterThan(0);
  });
}); 