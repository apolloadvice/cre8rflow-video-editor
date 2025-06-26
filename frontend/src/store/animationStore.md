# Animation Store Documentation

The Animation Store manages visual feedback for batch operations, providing progress tracking, state management, and animation queuing for the video editor.

## Core Concepts

### Animation States
- `idle`: No operation in progress
- `processing`: Currently being processed 
- `completed`: Successfully finished
- `error`: Failed with an error

### Key Interfaces

```typescript
interface ClipAnimation {
  clipId: string;           // Unique identifier for the clip
  clipName: string;         // Display name
  operationType: string;    // 'cut', 'text', 'overlay', etc.
  state: AnimationState;    // Current state
  progress: number;         // 0-100 progress percentage
  metadata?: object;        // Operation-specific data
}

interface AnimationQueue {
  id: string;               // Unique queue identifier
  commandText: string;      // Original user command
  totalOperations: number;  // Total clips to process
  clipAnimations: ClipAnimation[];
  state: AnimationState;    // Overall queue state
}
```

## Usage Examples

### Starting a Batch Animation

```typescript
import { useAnimationStore } from '../store/animationStore';

const animationStore = useAnimationStore.getState();

// Create animations for each clip
const clipAnimations = clips.map(clip => ({
  clipId: clip.id,
  clipName: clip.name,
  operationType: 'cut',
  state: 'idle' as const,
  progress: 0,
  metadata: {
    trimStart: 0.1,
    trimEnd: 0.1,
  }
}));

// Start the animation queue
const queueId = animationStore.startAnimation(
  "cut each clip and add banger captions",
  clipAnimations
);
```

### Processing Clips Sequentially

```typescript
// Process next clip in queue
animationStore.processNextClip();

// Get current operation
const currentOp = animationStore.getCurrentOperation();
if (currentOp) {
  // Simulate progress for demo
  await animationStore.simulateProgress(currentOp.clipId, 2000);
}
```

### Manual Progress Updates

```typescript
// Update specific clip progress
animationStore.updateClipAnimation('clip-123', {
  state: 'processing',
  progress: 50,
  startTime: Date.now(),
});

// Complete a clip
animationStore.completeClipAnimation('clip-123');

// Handle errors
animationStore.failClipAnimation('clip-123', 'Processing failed');
```

## React Hooks

### State Hooks
```typescript
import { 
  useCurrentAnimation, 
  useIsAnimating, 
  useOverallProgress 
} from '../store/animationStore';

function ProgressIndicator() {
  const isAnimating = useIsAnimating();
  const progress = useOverallProgress();
  const currentAnimation = useCurrentAnimation();
  
  if (!isAnimating) return null;
  
  return (
    <div>
      <div>Processing: {currentAnimation?.commandText}</div>
      <div>Progress: {progress.toFixed(1)}%</div>
    </div>
  );
}
```

### Clip-Specific Hooks
```typescript
import { 
  useClipState, 
  useClipProgress, 
  useIsClipProcessing 
} from '../store/animationStore';

function ClipElement({ clipId }: { clipId: string }) {
  const clipState = useClipState(clipId);
  const progress = useClipProgress(clipId);
  const isProcessing = useIsClipProcessing(clipId);
  
  return (
    <div className={`clip clip-${clipState}`}>
      {isProcessing && (
        <div className="progress-bar">
          <div style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
```

## Integration with Command Processing

The animation store integrates with the command processing flow:

1. **Parse Command**: User enters command, backend parses it
2. **Create Animations**: Frontend creates `ClipAnimation` objects for each affected clip
3. **Start Queue**: Animation store manages the visual feedback
4. **Process Sequentially**: Each clip is processed one-by-one with visual updates
5. **Complete**: Animation completes, timeline is updated

### Example Integration

```typescript
async function handleBatchCommand(command: string) {
  const animationStore = useAnimationStore.getState();
  const editorStore = useEditorStore.getState();
  
  // 1. Get clips from timeline
  const clips = editorStore.clips;
  
  // 2. Create animation objects
  const clipAnimations = clips.map(clip => ({
    clipId: clip.id,
    clipName: clip.name,
    operationType: determineOperationType(command),
    state: 'idle' as const,
    progress: 0,
  }));
  
  // 3. Start visual animation
  const queueId = animationStore.startAnimation(command, clipAnimations);
  
  // 4. Process each clip with visual feedback
  for (const clipAnim of clipAnimations) {
    animationStore.processNextClip();
    
    // Simulate processing time
    await animationStore.simulateProgress(clipAnim.clipId, 1500);
    
    // In real implementation, this would call the backend
    // await processClipOnBackend(clipAnim);
  }
  
  // 5. Complete animation
  animationStore.completeAnimation();
  
  // 6. Update timeline with final results
  // This would come from the backend response
  // editorStore.setClips(updatedClips);
}
```

## Visual CSS Classes

The animation states can be styled using CSS classes:

```css
.clip-idle {
  opacity: 1;
  border: 2px solid transparent;
}

.clip-processing {
  opacity: 0.8;
  border: 2px solid #3b82f6;
  animation: pulse 2s infinite;
}

.clip-completed {
  opacity: 1;
  border: 2px solid #10b981;
}

.clip-error {
  opacity: 0.7;
  border: 2px solid #ef4444;
}

@keyframes pulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
```

## Performance Considerations

- The store keeps the last 50 animation histories to prevent memory leaks
- Progress updates are throttled to avoid excessive re-renders
- The `simulateProgress` function includes jitter for realistic feel
- Console logging can be disabled in production

## Future Enhancements

- **Pause/Resume**: Add ability to pause and resume animations
- **Cancellation**: Allow users to cancel running operations
- **Replay**: Replay animations from history
- **Persistence**: Save animation history across sessions
- **Real-time Sync**: Sync with actual backend processing progress 