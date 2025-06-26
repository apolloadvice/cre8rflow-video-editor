import { create } from 'zustand';

export type AnimationState = 'idle' | 'processing' | 'completed' | 'error';

export interface ClipAnimation {
  clipId: string;
  clipName: string;
  operationType: 'cut' | 'text' | 'overlay' | 'fade' | 'trim';
  state: AnimationState;
  progress: number; // 0-100
  startTime?: number;
  endTime?: number;
  errorMessage?: string;
  metadata?: {
    // Additional data specific to operation type
    trimStart?: number;
    trimEnd?: number;
    text?: string;
    style?: string;
    position?: string;
  };
}

export interface AnimationQueue {
  id: string;
  commandText: string;
  totalOperations: number;
  currentOperationIndex: number;
  clipAnimations: ClipAnimation[];
  state: AnimationState;
  startTime: number;
  endTime?: number;
}

interface AnimationStore {
  // State
  currentQueue: AnimationQueue | null;
  animationHistory: AnimationQueue[];
  isAnimating: boolean;
  
  // Queue Management
  startAnimation: (commandText: string, clipAnimations: ClipAnimation[]) => string;
  updateClipAnimation: (clipId: string, updates: Partial<ClipAnimation>) => void;
  completeClipAnimation: (clipId: string) => void;
  failClipAnimation: (clipId: string, errorMessage: string) => void;
  completeAnimation: () => void;
  failAnimation: (errorMessage: string) => void;
  clearCurrentAnimation: () => void;
  
  // Progress Tracking
  getOverallProgress: () => number;
  getClipProgress: (clipId: string) => number;
  getCurrentOperation: () => ClipAnimation | null;
  
  // Visual State Helpers
  isClipProcessing: (clipId: string) => boolean;
  isClipCompleted: (clipId: string) => boolean;
  isClipError: (clipId: string) => boolean;
  getClipState: (clipId: string) => AnimationState;
  
  // Batch Operation Helpers
  processNextClip: () => void;
  simulateProgress: (clipId: string, duration?: number) => Promise<void>;
  
  // Specialized Animation Starters
  startBatchCaptionAnimation: (commandText: string, textPlacements: any[], timestamp?: number) => string;
  startTrackingTextAnimation: (commandText: string, trackingText: string, placement: any, timestamp?: number) => string;
  
  // History
  getAnimationHistory: () => AnimationQueue[];
  clearHistory: () => void;
}

export const useAnimationStore = create<AnimationStore>((set, get) => ({
  // Initial state
  currentQueue: null,
  animationHistory: [],
  isAnimating: false,
  
  // Queue Management
  startAnimation: (commandText: string, clipAnimations: ClipAnimation[]) => {
    const queueId = `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newQueue: AnimationQueue = {
      id: queueId,
      commandText,
      totalOperations: clipAnimations.length,
      currentOperationIndex: 0,
      clipAnimations: clipAnimations.map(clip => ({
        ...clip,
        state: 'idle',
        progress: 0,
        startTime: undefined,
        endTime: undefined,
      })),
      state: 'processing',
      startTime: Date.now(),
    };
    
    set({
      currentQueue: newQueue,
      isAnimating: true,
    });
    
    console.log('🎬 [Animation] Started animation queue:', queueId, 'with', clipAnimations.length, 'operations');
    
    return queueId;
  },
  
  updateClipAnimation: (clipId: string, updates: Partial<ClipAnimation>) => {
    set((state) => {
      if (!state.currentQueue) return state;
      
      return {
        currentQueue: {
          ...state.currentQueue,
          clipAnimations: state.currentQueue.clipAnimations.map(clip =>
            clip.clipId === clipId ? { ...clip, ...updates } : clip
          ),
        },
      };
    });
  },
  
  completeClipAnimation: (clipId: string) => {
    set((state) => {
      if (!state.currentQueue) return state;
      
      const updatedQueue = {
        ...state.currentQueue,
        clipAnimations: state.currentQueue.clipAnimations.map(clip =>
          clip.clipId === clipId 
            ? { ...clip, state: 'completed' as AnimationState, progress: 100, endTime: Date.now() }
            : clip
        ),
        currentOperationIndex: state.currentQueue.currentOperationIndex + 1,
      };
      
      console.log('🎬 [Animation] Completed clip animation:', clipId);
      
      return { currentQueue: updatedQueue };
    });
  },
  
  failClipAnimation: (clipId: string, errorMessage: string) => {
    set((state) => {
      if (!state.currentQueue) return state;
      
      const updatedQueue = {
        ...state.currentQueue,
        clipAnimations: state.currentQueue.clipAnimations.map(clip =>
          clip.clipId === clipId 
            ? { 
                ...clip, 
                state: 'error' as AnimationState, 
                endTime: Date.now(),
                errorMessage 
              }
            : clip
        ),
        state: 'error' as AnimationState,
      };
      
      console.error('🎬 [Animation] Failed clip animation:', clipId, errorMessage);
      
      return { 
        currentQueue: updatedQueue,
        isAnimating: false,
      };
    });
  },
  
  completeAnimation: () => {
    set((state) => {
      if (!state.currentQueue) return state;
      
      const completedQueue = {
        ...state.currentQueue,
        state: 'completed' as AnimationState,
        endTime: Date.now(),
      };
      
      console.log('🎬 [Animation] Completed animation queue:', completedQueue.id);
      
      return {
        currentQueue: null,
        isAnimating: false,
        animationHistory: [completedQueue, ...state.animationHistory].slice(0, 50), // Keep last 50
      };
    });
  },
  
  failAnimation: (errorMessage: string) => {
    set((state) => {
      if (!state.currentQueue) return state;
      
      const failedQueue = {
        ...state.currentQueue,
        state: 'error' as AnimationState,
        endTime: Date.now(),
      };
      
      console.error('🎬 [Animation] Failed animation queue:', failedQueue.id, errorMessage);
      
      return {
        currentQueue: null,
        isAnimating: false,
        animationHistory: [failedQueue, ...state.animationHistory].slice(0, 50),
      };
    });
  },
  
  clearCurrentAnimation: () => {
    set({
      currentQueue: null,
      isAnimating: false,
    });
    
    console.log('🎬 [Animation] Cleared current animation');
  },
  
  // Progress Tracking
  getOverallProgress: () => {
    const state = get();
    if (!state.currentQueue || state.currentQueue.totalOperations === 0) return 0;
    
    const completedCount = state.currentQueue.clipAnimations.filter(
      clip => clip.state === 'completed'
    ).length;
    
    const inProgressClip = state.currentQueue.clipAnimations.find(
      clip => clip.state === 'processing'
    );
    
    const progressAddition = inProgressClip ? (inProgressClip.progress / 100) : 0;
    
    return Math.min(100, ((completedCount + progressAddition) / state.currentQueue.totalOperations) * 100);
  },
  
  getClipProgress: (clipId: string) => {
    const state = get();
    if (!state.currentQueue) return 0;
    
    const clip = state.currentQueue.clipAnimations.find(c => c.clipId === clipId);
    return clip ? clip.progress : 0;
  },
  
  getCurrentOperation: () => {
    const state = get();
    if (!state.currentQueue) return null;
    
    return state.currentQueue.clipAnimations.find(clip => clip.state === 'processing') || null;
  },
  
  // Visual State Helpers
  isClipProcessing: (clipId: string) => {
    return get().getClipState(clipId) === 'processing';
  },
  
  isClipCompleted: (clipId: string) => {
    return get().getClipState(clipId) === 'completed';
  },
  
  isClipError: (clipId: string) => {
    return get().getClipState(clipId) === 'error';
  },
  
  getClipState: (clipId: string) => {
    const state = get();
    if (!state.currentQueue) return 'idle';
    
    const clip = state.currentQueue.clipAnimations.find(c => c.clipId === clipId);
    return clip ? clip.state : 'idle';
  },
  
  // Batch Operation Helpers
  processNextClip: () => {
    const state = get();
    if (!state.currentQueue) return;
    
    // Find the next idle clip to process
    const nextClip = state.currentQueue.clipAnimations.find(
      clip => clip.state === 'idle'
    );
    
    if (nextClip) {
      get().updateClipAnimation(nextClip.clipId, {
        state: 'processing',
        startTime: Date.now(),
      });
      
      console.log('🎬 [Animation] Started processing clip:', nextClip.clipId);
    } else {
      // All clips processed
      const allCompleted = state.currentQueue.clipAnimations.every(
        clip => clip.state === 'completed'
      );
      
      if (allCompleted) {
        get().completeAnimation();
      }
    }
  },
  
  simulateProgress: async (clipId: string, duration = 2000) => {
    const steps = 20;
    const stepDelay = duration / steps;
    
    for (let i = 1; i <= steps; i++) {
      // Check if animation is still active before continuing
      const state = get();
      if (!state.currentQueue || !state.isAnimating) {
        console.log('🎬 [Animation] Progress simulation cancelled - animation no longer active');
        return;
      }
      
      // Check if this specific clip is still being processed
      const clip = state.currentQueue.clipAnimations.find(c => c.clipId === clipId);
      if (!clip || (clip.state !== 'processing' && clip.state !== 'idle')) {
        console.log('🎬 [Animation] Progress simulation cancelled - clip no longer processing:', clipId);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, stepDelay));
      
      const progress = (i / steps) * 100;
      get().updateClipAnimation(clipId, { progress });
      
      // Add some randomness to make it feel more realistic
      if (i < steps) {
        const jitter = Math.random() * 200; // 0-200ms jitter
        await new Promise(resolve => setTimeout(resolve, jitter));
      }
    }
    
    // Only complete if animation is still active
    const finalState = get();
    if (finalState.currentQueue && finalState.isAnimating) {
      get().completeClipAnimation(clipId);
    }
  },
  
  // Specialized Animation Starters
  startBatchCaptionAnimation: (commandText: string, textPlacements: any[], timestamp?: number) => {
    const ts = timestamp || Date.now();
    const clipAnimations: ClipAnimation[] = textPlacements.map((placement, index) => ({
      clipId: `caption-${ts}-${index}`,
      clipName: placement.name || `Caption ${index + 1}`,
      operationType: 'text' as const,
      state: 'idle' as AnimationState,
      progress: 0,
      metadata: {
        text: placement.name,
        position: 'bottom-center',
        style: 'viral'
      }
    }));
    
    console.log('🎬 [Animation] Starting batch caption animation with', clipAnimations.length, 'captions');
    return get().startAnimation(commandText, clipAnimations);
  },
  
  startTrackingTextAnimation: (commandText: string, trackingText: string, placement: any, timestamp?: number) => {
    const ts = timestamp || Date.now();
    const clipAnimations: ClipAnimation[] = [{
      clipId: `tracking-${ts}-${Math.random().toString(36).substr(2, 9)}`,
      clipName: `Tracking: "${trackingText}"`,
      operationType: 'text' as const,
      state: 'idle' as AnimationState,
      progress: 0,
      metadata: {
        text: trackingText,
        position: placement.position || 'center',
        style: 'tracking'
      }
    }];
    
    console.log('🎬 [Animation] Starting tracking text animation for:', trackingText);
    return get().startAnimation(commandText, clipAnimations);
  },

  // History
  getAnimationHistory: () => {
    return get().animationHistory;
  },
  
  clearHistory: () => {
    set({ animationHistory: [] });
    console.log('🎬 [Animation] Cleared animation history');
  },
}));

// Selector hooks for easy component usage
export const useCurrentAnimation = () => useAnimationStore((state) => state.currentQueue);
export const useIsAnimating = () => useAnimationStore((state) => state.isAnimating);
export const useOverallProgress = () => useAnimationStore((state) => state.getOverallProgress());
export const useCurrentOperation = () => useAnimationStore((state) => state.getCurrentOperation());
export const useAnimationHistory = () => useAnimationStore((state) => state.animationHistory);

// Clip-specific hooks
export const useClipState = (clipId: string) => useAnimationStore((state) => state.getClipState(clipId));
export const useClipProgress = (clipId: string) => useAnimationStore((state) => state.getClipProgress(clipId));
export const useIsClipProcessing = (clipId: string) => useAnimationStore((state) => state.isClipProcessing(clipId));
export const useIsClipCompleted = (clipId: string) => useAnimationStore((state) => state.isClipCompleted(clipId));
export const useIsClipError = (clipId: string) => useAnimationStore((state) => state.isClipError(clipId)); 