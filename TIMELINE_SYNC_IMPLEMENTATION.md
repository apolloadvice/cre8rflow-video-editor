# Timeline Sync Hook Implementation (Task 2.3.1)

## Overview

Successfully implemented **Task 2.3.1: Create timeline sync hook** from the GES Timeline Implementation Plan (Phase 2). This creates a comprehensive frontend hook for synchronizing timeline data between the frontend store and backend using the GES-compatible v2.0 schema.

## Implementation Details

### Core Hook: `useTimelineSync`

**Location**: `frontend/src/hooks/useTimelineSync.ts`

The hook provides seamless timeline synchronization with the following features:

#### Key Functions

1. **`saveTimeline(assetPath?)`**
   - Saves current timeline state to backend
   - Uses GES-compatible v2.0 schema format
   - Handles error recovery and user feedback

2. **`loadTimeline(assetPath)`**
   - Loads timeline from backend 
   - Converts backend data to frontend clip format
   - Updates editor store state automatically

3. **`loadTimelineRobust(assetPath)`**
   - Uses robust loader with comprehensive validation
   - Provides detailed loading statistics
   - Supports partial loading and asset validation

4. **`syncTimeline(assetPath?)`**
   - Performs bidirectional sync (save then load)
   - Ensures frontend-backend consistency

5. **`createTimelineData(clips, assetPath?)`**
   - Converts frontend clips to GES v2.0 schema
   - Calculates timeline duration and metadata

6. **`parseTimelineData(timelineData)`**
   - Converts backend timeline data to frontend clips
   - Handles missing or malformed data gracefully

#### Configuration Options

```typescript
interface TimelineSyncOptions {
  validateAssets?: boolean;      // Validate asset availability
  allowPartialLoad?: boolean;    // Allow partial timeline loading
  autoSave?: boolean;           // Enable auto-save functionality  
  autoSaveInterval?: number;    // Auto-save interval (ms)
}
```

#### Auto-Save Feature

- Configurable auto-save with customizable intervals
- Automatic cleanup on component unmount
- Scheduled saves when clips change
- Background saving with user notifications

#### Integration with Editor Store

- Seamless integration with Zustand editor store
- Automatic history management (pushToHistory)
- State updates for clips and duration
- Preserves existing store patterns

### Enhanced API Client

**Location**: `frontend/src/api/apiClient.ts`

Added new API functions for v2.0 timeline operations:

- `loadTimelineEnhanced()` - Load with v2.0 schema
- `saveTimelineEnhanced()` - Save with v2.0 schema  
- `loadTimelineRobust()` - Robust loading with validation
- `validateTimeline()` - Validate timeline without loading
- `getTimelineSchema()` - Get timeline schema info

Legacy functions are marked as deprecated with migration guidance.

### Demo Component

**Location**: `frontend/src/components/TimelineSyncDemo.tsx`

Interactive demo showcasing all hook functionality:

- Save/Load timeline operations
- Robust loading with statistics
- Timeline synchronization
- Schema preview and validation
- Real-time status information
- Error handling and user feedback

## Schema Compatibility

### GES v2.0 Schema Format

```typescript
interface TimelineData {
  version: string;                    // "2.0"
  timeline: {
    frame_rate: number;               // 30.0
    width: number;                    // 1920
    height: number;                   // 1080  
    sample_rate: number;              // 48000
    channels: number;                 // 2
    duration: number;                 // Calculated from clips
  };
  clips: TimelineClip[];              // GES-compatible clips
  transitions: any[];                 // Future transitions support
  metadata: {
    created_at: string;               // ISO timestamp
    updated_at: string;               // ISO timestamp
    schema_version: string;           // "2.0"
  };
}
```

### Clip Format Conversion

Frontend Clip → Timeline Clip:
- `start` → `timeline_start`
- `end` → `timeline_end`
- `in_point` → `in_point` (preserved)
- `track` → `track` (preserved)
- All other fields mapped appropriately

## Error Handling

### Comprehensive Error Management

1. **Network Errors**
   - Axios error handling with user-friendly messages
   - Timeout and connection failure recovery

2. **Data Validation Errors**
   - Missing or malformed timeline data
   - Invalid clip configurations
   - Asset availability validation

3. **User Feedback**
   - Toast notifications for all operations
   - Loading states and progress indicators
   - Detailed error messages

### Fallback Strategies

- Empty timeline creation for missing data
- Partial loading when some clips fail
- Graceful degradation for network issues
- Console logging for debugging

## Testing

### Comprehensive Test Suite

**Location**: `frontend/src/hooks/useTimelineSync.test.ts`

Test coverage includes:

- ✅ Timeline data creation and parsing
- ✅ Save/load operations with mocked API
- ✅ Error handling and edge cases
- ✅ Robust loading with statistics
- ✅ Timeline synchronization flow
- ✅ Auto-save configuration
- ✅ Status information accuracy

### Mock Implementations

- Axios API calls mocked for isolated testing
- Editor store mocked for state management testing
- Console methods mocked to avoid test noise

## Usage Examples

### Basic Usage

```typescript
import { useTimelineSync } from '../hooks/useTimelineSync';

const MyComponent = () => {
  const { saveTimeline, loadTimeline } = useTimelineSync();
  
  const handleSave = async () => {
    const result = await saveTimeline('my-project.mp4');
    if (result.success) {
      console.log('Timeline saved successfully!');
    }
  };
  
  const handleLoad = async () => {
    const result = await loadTimeline('my-project.mp4');
    if (result.success) {
      console.log(`Loaded ${result.clips?.length} clips`);
    }
  };
  
  return (
    <div>
      <button onClick={handleSave}>Save Timeline</button>
      <button onClick={handleLoad}>Load Timeline</button>
    </div>
  );
};
```

### Advanced Usage with Auto-Save

```typescript
const { saveTimeline, syncTimeline, cleanup } = useTimelineSync({
  autoSave: true,
  autoSaveInterval: 30000,
  validateAssets: true,
  allowPartialLoad: true
});

// Auto-save will trigger automatically when clips change
// Manual cleanup when component unmounts
useEffect(() => cleanup, [cleanup]);
```

### Robust Loading with Statistics

```typescript
const { loadTimelineRobust } = useTimelineSync({
  validateAssets: true,
  allowPartialLoad: true
});

const handleRobustLoad = async () => {
  const result = await loadTimelineRobust('project.mp4');
  if (result.success && result.stats) {
    console.log('Loading stats:', result.stats);
    // Handle partial loading scenarios
  }
};
```

## Integration Points

### Backend Endpoints

The hook integrates with these backend endpoints:

- `POST /api/timeline/save` - Save timeline with v2.0 schema
- `POST /api/timeline/load` - Load timeline with v2.0 schema  
- `POST /api/timeline/load-robust` - Robust loading with validation
- `POST /api/timeline/validate` - Validate timeline data
- `POST /api/timeline/schema` - Get timeline schema information

### Frontend Store Integration

- **Zustand Editor Store**: Direct integration for state management
- **History Management**: Automatic history preservation before loading
- **Toast System**: User feedback for all operations
- **Loading States**: UI state management for async operations

## Performance Considerations

### Optimizations

1. **Memoized Callbacks**: All functions use `useCallback` for performance
2. **Efficient Data Conversion**: Minimal data transformation overhead
3. **Auto-Save Debouncing**: Prevents excessive save operations
4. **Background Operations**: Non-blocking save/load operations

### Memory Management

- Automatic cleanup of auto-save timers
- Efficient data structures for timeline representation
- Minimal memory footprint for large timelines

## Next Steps

### Ready for Phase 3

This implementation completes **Task 2.3.1** and provides the foundation for:

- **Task 3.1.1**: Standardize timing conversions
- **Task 3.2.1**: Preserve file references in trim operations  
- **Task 3.3.1**: Handle signed URLs for media access

### Future Enhancements

1. **Offline Support**: Cache timeline data for offline editing
2. **Conflict Resolution**: Handle concurrent edits from multiple users
3. **Compression**: Optimize timeline data for large projects
4. **Real-time Sync**: WebSocket-based real-time synchronization

## Summary

✅ **Task 2.3.1 Complete**: Timeline sync hook successfully implemented with comprehensive features:

- GES-compatible v2.0 schema support
- Robust loading with validation and error recovery
- Auto-save functionality with configurable intervals
- Seamless frontend-backend synchronization
- Comprehensive error handling and user feedback
- Complete test coverage
- Demo component for testing and demonstration

The implementation follows all project patterns and integrates seamlessly with the existing codebase while providing a solid foundation for future timeline management features. 