# Memory Leak/Crash Debugging Checklist

## When the crash happens:
1. **Browser Console Errors**
   - Open browser DevTools (F12)
   - Go to Console tab
   - Let the workflow complete and website sit idle
   - Screenshot/copy any red error messages that appear

2. **Memory Usage Monitoring**
   - In DevTools, go to Performance tab
   - Click "Record" before starting workflow
   - Let workflow complete and site sit idle for 2-3 minutes
   - Stop recording and look for memory patterns

3. **Network Activity**
   - In DevTools, go to Network tab
   - After workflow completes, check if any requests are still being made
   - Look for any failing requests or endless polling

4. **React Error Boundaries**
   - Check if any error messages appear in the UI
   - Look for white screen of death or component errors

## Specific things to check:

### Console Errors
- Look for "Cannot read property" errors
- "setState called on unmounted component" warnings
- Timer/interval related errors
- WebSocket connection errors

### Memory Patterns
- Gradual memory increase over time
- Memory not being released after workflow
- Large spikes in heap usage

### Network Issues
- Repeated API calls after workflow ends
- Failed requests being retried infinitely
- WebSocket connection problems

## Quick Debug Commands
Run these in browser console after workflow completes:

```javascript
// Check for active timers (may not show all)
console.log('Active timeouts:', window.setTimeout.length);

// Check React components for memory leaks
console.log('React DevTools can show component tree');

// Check for event listeners
console.log('Check Elements tab for event listeners on body/window');
```