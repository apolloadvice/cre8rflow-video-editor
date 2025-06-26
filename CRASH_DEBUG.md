# Crash Debugging Instructions

## When testing your workflow again:

### 1. Open Browser DevTools (F12) BEFORE starting
- Go to Console tab
- Keep it open during the entire workflow

### 2. Add this debug code to your browser console BEFORE running the command:
```javascript
// Override console.log to capture backend responses
const originalLog = console.log;
console.log = function(...args) {
  if (args[0] && args[0].includes && args[0].includes('🎬 [AI Commands] Backend result:')) {
    console.error('CRASH_DEBUG - Backend Response:', args[1]);
    console.error('CRASH_DEBUG - Response Timeline:', args[1]?.timeline);
    console.error('CRASH_DEBUG - Response Timeline Tracks:', args[1]?.timeline?.tracks);
  }
  return originalLog.apply(console, args);
};
```

### 3. Run your command: 
"cut each clip so that there's 0.1 seconds of dead space before I start talking and after I'm done talking"

### 4. Look for these specific logs in console:
- `CRASH_DEBUG - Backend Response:` - This shows the full backend response
- `CRASH_DEBUG - Response Timeline:` - This shows the timeline data structure
- `CRASH_DEBUG - Response Timeline Tracks:` - This shows the tracks array

### 5. Copy and paste these CRASH_DEBUG logs

## Expected Issue:
The crash is likely happening because:
1. Backend is returning invalid timeline data
2. Timeline tracks contain malformed clip data
3. Empty arrays are causing Math.max() to return -Infinity
4. setClips is receiving invalid data structure

## Most Important:
**Please copy the exact CRASH_DEBUG logs from your console** - this will show us exactly what the backend is sending that's causing the crash.

## If the crash still happens:
Even with all our error handling, if it still crashes, the console will now show:
- Which validation step failed
- What the malformed data looks like
- Whether it's a state update issue or data structure issue

## Memory leak check:
After workflow, run this to see if memory keeps growing:
```javascript
setInterval(() => {
  console.log(`Memory: ${(performance.memory?.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`);
}, 3000);
```