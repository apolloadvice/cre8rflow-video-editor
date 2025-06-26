import { useAnimationStore } from '../animationStore';
import type { ClipAnimation } from '../animationStore';

// Mock console methods to avoid noise in tests
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
};

// Save original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
};

describe('AnimationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAnimationStore.setState({
      currentQueue: null,
      animationHistory: [],
      isAnimating: false,
    });
    
    // Mock console
    console.log = mockConsole.log;
    console.error = mockConsole.error;
    
    // Clear mock calls
    mockConsole.log.mockClear();
    mockConsole.error.mockClear();
  });

  afterAll(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.error = originalConsole.error;
  });

  test('should start animation queue correctly', () => {
    const store = useAnimationStore.getState();
    
    const clipAnimations: ClipAnimation[] = [
      {
        clipId: 'clip1',
        clipName: 'Test Video 1',
        operationType: 'cut',
        state: 'idle',
        progress: 0,
      },
      {
        clipId: 'clip2',
        clipName: 'Test Video 2',
        operationType: 'text',
        state: 'idle',
        progress: 0,
      },
    ];

    const queueId = store.startAnimation('cut each clip and add text', clipAnimations);

    const state = useAnimationStore.getState();
    
    expect(queueId).toMatch(/^anim_\d+_[a-z0-9]+$/);
    expect(state.isAnimating).toBe(true);
    expect(state.currentQueue).not.toBeNull();
    expect(state.currentQueue?.commandText).toBe('cut each clip and add text');
    expect(state.currentQueue?.totalOperations).toBe(2);
    expect(state.currentQueue?.clipAnimations).toHaveLength(2);
    expect(state.currentQueue?.state).toBe('processing');
  });

  test('should update clip animation progress', () => {
    const store = useAnimationStore.getState();
    
    const clipAnimations: ClipAnimation[] = [
      {
        clipId: 'clip1',
        clipName: 'Test Video 1',
        operationType: 'cut',
        state: 'idle',
        progress: 0,
      },
    ];

    store.startAnimation('test command', clipAnimations);
    store.updateClipAnimation('clip1', { 
      state: 'processing', 
      progress: 50,
      startTime: Date.now(),
    });

    const state = useAnimationStore.getState();
    const clip = state.currentQueue?.clipAnimations.find(c => c.clipId === 'clip1');
    
    expect(clip?.state).toBe('processing');
    expect(clip?.progress).toBe(50);
    expect(clip?.startTime).toBeDefined();
  });

  test('should complete clip animation', () => {
    const store = useAnimationStore.getState();
    
    const clipAnimations: ClipAnimation[] = [
      {
        clipId: 'clip1',
        clipName: 'Test Video 1',
        operationType: 'cut',
        state: 'idle',
        progress: 0,
      },
    ];

    store.startAnimation('test command', clipAnimations);
    store.completeClipAnimation('clip1');

    const state = useAnimationStore.getState();
    const clip = state.currentQueue?.clipAnimations.find(c => c.clipId === 'clip1');
    
    expect(clip?.state).toBe('completed');
    expect(clip?.progress).toBe(100);
    expect(clip?.endTime).toBeDefined();
    expect(state.currentQueue?.currentOperationIndex).toBe(1);
  });

  test('should calculate overall progress correctly', () => {
    const store = useAnimationStore.getState();
    
    const clipAnimations: ClipAnimation[] = [
      {
        clipId: 'clip1',
        clipName: 'Test Video 1',
        operationType: 'cut',
        state: 'idle',
        progress: 0,
      },
      {
        clipId: 'clip2',
        clipName: 'Test Video 2',
        operationType: 'text',
        state: 'idle',
        progress: 0,
      },
    ];

    store.startAnimation('test command', clipAnimations);
    
    // Initial progress should be 0
    expect(store.getOverallProgress()).toBe(0);
    
    // Complete first clip
    store.completeClipAnimation('clip1');
    expect(store.getOverallProgress()).toBe(50);
    
    // Start processing second clip
    store.updateClipAnimation('clip2', { 
      state: 'processing', 
      progress: 50 
    });
    expect(store.getOverallProgress()).toBe(75); // 50% + 25% (half of remaining)
    
    // Complete second clip
    store.completeClipAnimation('clip2');
    expect(store.getOverallProgress()).toBe(100);
  });

  test('should handle animation completion', () => {
    const store = useAnimationStore.getState();
    
    const clipAnimations: ClipAnimation[] = [
      {
        clipId: 'clip1',
        clipName: 'Test Video 1',
        operationType: 'cut',
        state: 'idle',
        progress: 0,
      },
    ];

    store.startAnimation('test command', clipAnimations);
    const queueId = store.currentQueue?.id;
    
    store.completeAnimation();

    const state = useAnimationStore.getState();
    
    expect(state.currentQueue).toBeNull();
    expect(state.isAnimating).toBe(false);
    expect(state.animationHistory).toHaveLength(1);
    expect(state.animationHistory[0].id).toBe(queueId);
    expect(state.animationHistory[0].state).toBe('completed');
    expect(state.animationHistory[0].endTime).toBeDefined();
  });

  test('should handle animation failure', () => {
    const store = useAnimationStore.getState();
    
    const clipAnimations: ClipAnimation[] = [
      {
        clipId: 'clip1',
        clipName: 'Test Video 1',
        operationType: 'cut',
        state: 'idle',
        progress: 0,
      },
    ];

    store.startAnimation('test command', clipAnimations);
    store.failClipAnimation('clip1', 'Test error message');

    const state = useAnimationStore.getState();
    const clip = state.currentQueue?.clipAnimations.find(c => c.clipId === 'clip1');
    
    expect(clip?.state).toBe('error');
    expect(clip?.errorMessage).toBe('Test error message');
    expect(clip?.endTime).toBeDefined();
    expect(state.currentQueue?.state).toBe('error');
    expect(state.isAnimating).toBe(false);
  });

  test('should provide correct clip state helpers', () => {
    const store = useAnimationStore.getState();
    
    const clipAnimations: ClipAnimation[] = [
      {
        clipId: 'clip1',
        clipName: 'Test Video 1',
        operationType: 'cut',
        state: 'idle',
        progress: 0,
      },
    ];

    store.startAnimation('test command', clipAnimations);
    
    // Initially idle
    expect(store.getClipState('clip1')).toBe('idle');
    expect(store.isClipProcessing('clip1')).toBe(false);
    expect(store.isClipCompleted('clip1')).toBe(false);
    expect(store.isClipError('clip1')).toBe(false);
    
    // Start processing
    store.updateClipAnimation('clip1', { state: 'processing' });
    expect(store.getClipState('clip1')).toBe('processing');
    expect(store.isClipProcessing('clip1')).toBe(true);
    expect(store.isClipCompleted('clip1')).toBe(false);
    expect(store.isClipError('clip1')).toBe(false);
    
    // Complete
    store.completeClipAnimation('clip1');
    expect(store.getClipState('clip1')).toBe('completed');
    expect(store.isClipProcessing('clip1')).toBe(false);
    expect(store.isClipCompleted('clip1')).toBe(true);
    expect(store.isClipError('clip1')).toBe(false);
  });

  test('should return idle state for non-existent clips', () => {
    const store = useAnimationStore.getState();
    
    expect(store.getClipState('non-existent')).toBe('idle');
    expect(store.getClipProgress('non-existent')).toBe(0);
    expect(store.isClipProcessing('non-existent')).toBe(false);
  });
}); 