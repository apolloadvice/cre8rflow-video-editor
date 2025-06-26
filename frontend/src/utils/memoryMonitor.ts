// Memory monitoring utility to help debug memory leaks and crashes

// Debug logger with timestamp
const debugLog = (action: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`🐛 [${timestamp}] [MemoryMonitor] ${action}`, data || '');
};

interface MemorySnapshot {
  timestamp: number;
  used: number;
  total: number;
  limit: number;
}

class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private interval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  start(intervalMs: number = 5000) {
    if (this.isMonitoring) {
      console.log('📊 [MemoryMonitor] Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log('📊 [MemoryMonitor] Starting memory monitoring');
    
    // Take initial snapshot
    this.takeSnapshot();
    
    this.interval = setInterval(() => {
      this.takeSnapshot();
    }, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isMonitoring = false;
    console.log('📊 [MemoryMonitor] Stopped memory monitoring');
  }

  takeSnapshot(): MemorySnapshot | null {
    if (!(performance as any).memory) {
      console.warn('📊 [MemoryMonitor] performance.memory not available');
      return null;
    }

    const memory = (performance as any).memory;
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
    };

    this.snapshots.push(snapshot);
    
    // Keep only last 100 snapshots to prevent memory buildup
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }

    const usedMB = (snapshot.used / 1024 / 1024).toFixed(1);
    const totalMB = (snapshot.total / 1024 / 1024).toFixed(1);
    const limitMB = (snapshot.limit / 1024 / 1024).toFixed(1);
    
    console.log(`📊 [MemoryMonitor] Memory: ${usedMB}MB used / ${totalMB}MB total / ${limitMB}MB limit`);
    
    return snapshot;
  }

  getMemoryTrend(): { isIncreasing: boolean; rate: number } | null {
    if (this.snapshots.length < 5) {
      return null;
    }

    const recent = this.snapshots.slice(-5);
    let totalChange = 0;
    
    for (let i = 1; i < recent.length; i++) {
      totalChange += recent[i].used - recent[i - 1].used;
    }
    
    const avgChangePerSnapshot = totalChange / (recent.length - 1);
    const isIncreasing = avgChangePerSnapshot > 0;
    
    // Rate in MB per minute (assuming 5-second intervals)
    const ratePerMinute = (avgChangePerSnapshot * 12) / (1024 * 1024);
    
    return {
      isIncreasing,
      rate: ratePerMinute,
    };
  }

  analyzeLeaks(): void {
    console.log('📊 [MemoryMonitor] === MEMORY ANALYSIS ===');
    
    if (this.snapshots.length < 2) {
      console.log('📊 [MemoryMonitor] Not enough data for analysis');
      return;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const duration = (last.timestamp - first.timestamp) / 1000; // seconds
    
    const memoryChange = last.used - first.used;
    const memoryChangeMB = memoryChange / (1024 * 1024);
    
    console.log(`📊 [MemoryMonitor] Duration: ${duration.toFixed(1)}s`);
    console.log(`📊 [MemoryMonitor] Memory change: ${memoryChangeMB > 0 ? '+' : ''}${memoryChangeMB.toFixed(1)}MB`);
    
    const trend = this.getMemoryTrend();
    if (trend) {
      console.log(`📊 [MemoryMonitor] Current trend: ${trend.isIncreasing ? 'INCREASING' : 'DECREASING'} at ${trend.rate.toFixed(2)}MB/min`);
      
      if (trend.isIncreasing && trend.rate > 5) {
        console.warn('🚨 [MemoryMonitor] WARNING: High memory increase rate detected!');
      }
    }
    
    // Show recent snapshots
    const recent = this.snapshots.slice(-5);
    console.log('📊 [MemoryMonitor] Recent snapshots:');
    recent.forEach((snapshot, index) => {
      const usedMB = (snapshot.used / 1024 / 1024).toFixed(1);
      const time = new Date(snapshot.timestamp).toLocaleTimeString();
      console.log(`📊 [MemoryMonitor]   ${index + 1}. ${time}: ${usedMB}MB`);
    });
  }

  getCurrentMemory(): { used: number; total: number; limit: number } | null {
    if (!(performance as any).memory) {
      return null;
    }

    const memory = (performance as any).memory;
    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
    };
  }
}

// Create global instance
const memoryMonitor = new MemoryMonitor();

// Make it available on window for console debugging
if (typeof window !== 'undefined') {
  (window as any).memoryMonitor = memoryMonitor;
  console.log('📊 [MemoryMonitor] Available globally as window.memoryMonitor');
  console.log('📊 [MemoryMonitor] Usage: window.memoryMonitor.start(5000) to start monitoring');
}

export { memoryMonitor, MemoryMonitor };
export type { MemorySnapshot };