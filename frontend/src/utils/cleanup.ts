// Global cleanup utilities to prevent memory leaks

import { useAnimationStore } from '@/store/animationStore';

// Debug logger with timestamp
const debugLog = (action: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`🐛 [${timestamp}] [GlobalCleanup] ${action}`, data || '');
};

export const performGlobalCleanup = () => {
  debugLog('Starting global cleanup');
  console.log('🧹 [Cleanup] Performing global cleanup...');
  
  try {
    // Log memory usage before cleanup
    if ((performance as any).memory) {
      debugLog('Memory before cleanup', {
        used: `${((performance as any).memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        total: `${((performance as any).memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`
      });
    }
    
    // Clear animation store timeouts
    debugLog('Clearing animation store timeouts');
    const { clearAllTimeouts, clearCurrentAnimation } = useAnimationStore.getState();
    clearAllTimeouts();
    clearCurrentAnimation();
    
    // Clear any remaining timeouts (brute force approach)
    debugLog('Clearing remaining timeouts (brute force)');
    const highestTimeoutId = setTimeout(() => {}, 0) as unknown as number;
    debugLog('Highest timeout ID detected', { highestTimeoutId });
    
    for (let i = 0; i <= highestTimeoutId; i++) {
      clearTimeout(i);
    }
    clearTimeout(highestTimeoutId); // Clear the detection timeout too
    
    // Clear any intervals
    debugLog('Clearing remaining intervals (brute force)');
    const highestIntervalId = setInterval(() => {}, 0) as unknown as number;
    debugLog('Highest interval ID detected', { highestIntervalId });
    
    for (let i = 0; i <= highestIntervalId; i++) {
      clearInterval(i);
    }
    clearInterval(highestIntervalId); // Clear the detection interval too
    
    // Log memory usage after cleanup
    if ((performance as any).memory) {
      debugLog('Memory after cleanup', {
        used: `${((performance as any).memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`,
        total: `${((performance as any).memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB`
      });
    }
    
    debugLog('Global cleanup completed successfully');
    console.log('🧹 [Cleanup] Global cleanup completed');
  } catch (error) {
    debugLog('Error during global cleanup', error);
    console.error('🧹 [Cleanup] Error during global cleanup:', error);
  }
};

// Set up global cleanup on page unload
if (typeof window !== 'undefined') {
  debugLog('Setting up global cleanup listeners');
  
  window.addEventListener('beforeunload', () => {
    debugLog('beforeunload event triggered');
    performGlobalCleanup();
  });
  
  window.addEventListener('unload', () => {
    debugLog('unload event triggered');
    performGlobalCleanup();
  });
  
  // Also cleanup on visibility change (when tab becomes hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      debugLog('Page hidden, performing cleanup');
      console.log('🧹 [Cleanup] Page hidden, performing cleanup...');
      performGlobalCleanup();
    } else {
      debugLog('Page visible again');
    }
  });
  
  debugLog('Global cleanup listeners installed');
}