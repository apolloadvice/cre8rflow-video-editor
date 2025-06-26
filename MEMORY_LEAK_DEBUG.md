# Memory Leak Debugging Guide

## Root Cause Identified
The crash was caused by **infinite loops in timeline duration recalculation**:

1. `setClips()` automatically called `recalculateDuration()`
2. Timeline component's `useEffect` watched clips changes → called `recalculateDuration()` again  
3. EditorContent's `useEffect` also watched clips → called `recalculateDuration()` again
4. Multiple redundant calls caused race conditions and memory issues

## Fixes Applied

### 1. Eliminated Redundant Calls
- ✅ Removed automatic `recalculateDuration()` from `setClips()` 
- ✅ Removed redundant `useEffect` in Timeline component
- ✅ Centralized duration recalculation to EditorContent only

### 2. Added Safety Mechanisms
- ✅ Added safety checks for invalid clip data in `recalculateDuration()`
- ✅ Added debounced duration recalculation (200ms delay) 
- ✅ Only update duration if value actually changed (prevents unnecessary re-renders)
- ✅ Added try-catch error handling in `recalculateDuration()`

### 3. Enhanced Error Boundaries
- ✅ Improved ErrorBoundary with timeline-specific crash detection
- ✅ Added automatic timeline state reset on timeline errors
- ✅ Wrapped Timeline component with ErrorBoundary

### 4. Memory Leak Prevention
- ✅ Added cleanup for debounced functions on component unmount
- ✅ Enhanced timer cleanup in animation system
- ✅ Added safety checks to prevent updates on unmounted components

## Testing Instructions

After implementing these fixes:

1. **Normal Workflow Test**:
   - Upload video → Add to timeline → Run command → Check if timeline updates correctly

2. **Memory Stress Test**:
   - Run multiple commands rapidly
   - Let website sit idle for 5+ minutes after commands
   - Check if crash still occurs

3. **Browser DevTools Check**:
   - Open Memory tab before workflow
   - Monitor memory usage during and after commands
   - Look for memory leaks or excessive garbage collection

## Console Logging

The system now includes extensive logging:
- `🎬 [Store]` - Store state changes
- `🎬 [EditorContent]` - Duration recalculation
- `🎬 [Timeline]` - Timeline component lifecycle
- `🧹 [Component]` - Cleanup operations
- `🚨 [ErrorBoundary]` - Error handling

## If Crash Still Occurs

If the crash still happens, check browser console for:
1. **Infinite loop patterns** - Repeated log messages
2. **Memory errors** - "Out of memory" or similar
3. **React errors** - Component lifecycle issues
4. **Null reference errors** - Accessing properties of null/undefined objects

The enhanced error boundary should now catch and recover from most timeline-related crashes.