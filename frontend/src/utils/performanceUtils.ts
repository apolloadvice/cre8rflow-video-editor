/**
 * Performance Optimization Utilities
 * 
 * Provides comprehensive performance optimization tools for the video editor:
 * - Memory management and cleanup
 * - Caching and memoization
 * - Debouncing and throttling
 * - Virtual scrolling helpers
 * - Asset preloading
 */

import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { debounce, throttle } from 'lodash';

// ============================================================================
// MEMORY MANAGEMENT
// ============================================================================

/**
 * Memory monitor to track and optimize memory usage
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor;
  private memoryHistory: Array<{ timestamp: number; usage: number }> = [];
  private readonly maxHistoryLength = 100;

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Get current memory usage information
   */
  getCurrentMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * Record memory usage sample
   */
  recordMemoryUsage(): void {
    const usage = this.getCurrentMemoryUsage();
    const timestamp = Date.now();
    
    this.memoryHistory.push({ timestamp, usage });
    
    // Keep only recent history
    if (this.memoryHistory.length > this.maxHistoryLength) {
      this.memoryHistory.shift();
    }
  }

  /**
   * Get memory usage trend
   */
  getMemoryTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.memoryHistory.length < 10) return 'stable';
    
    const recent = this.memoryHistory.slice(-10);
    const older = this.memoryHistory.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, item) => sum + item.usage, 0) / recent.length;
    const olderAvg = older.reduce((sum, item) => sum + item.usage, 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    const threshold = olderAvg * 0.1; // 10% change threshold
    
    if (diff > threshold) return 'increasing';
    if (diff < -threshold) return 'decreasing';
    return 'stable';
  }

  /**
   * Check if memory usage is high
   */
  isMemoryUsageHigh(): boolean {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return memory.usedJSHeapSize / memory.jsHeapSizeLimit > 0.8;
    }
    return false;
  }
}

/**
 * Hook to monitor component memory usage
 */
export const useMemoryMonitor = (componentName: string) => {
  const monitor = MemoryMonitor.getInstance();
  
  useEffect(() => {
    const interval = setInterval(() => {
      monitor.recordMemoryUsage();
      
      if (monitor.isMemoryUsageHigh()) {
        console.warn(`High memory usage detected in ${componentName}`);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [componentName, monitor]);

  return {
    getCurrentUsage: () => monitor.getCurrentMemoryUsage(),
    getTrend: () => monitor.getMemoryTrend(),
    isHighUsage: () => monitor.isMemoryUsageHigh()
  };
};

// ============================================================================
// CACHING AND MEMOIZATION
// ============================================================================

/**
 * LRU Cache implementation for client-side caching
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Thumbnail cache for video assets
 */
export class ThumbnailCache {
  private static instance: ThumbnailCache;
  private cache = new LRUCache<string, string>(200); // Cache 200 thumbnails
  private loadingPromises = new Map<string, Promise<string>>();

  static getInstance(): ThumbnailCache {
    if (!ThumbnailCache.instance) {
      ThumbnailCache.instance = new ThumbnailCache();
    }
    return ThumbnailCache.instance;
  }

  /**
   * Generate cache key for thumbnail
   */
  private generateKey(assetId: string, timestamp: number = 1.0, width: number = 120, height: number = 68): string {
    return `${assetId}-${timestamp}-${width}x${height}`;
  }

  /**
   * Get cached thumbnail or generate if not cached
   */
  async getThumbnail(
    assetId: string,
    videoSrc: string,
    timestamp: number = 1.0,
    width: number = 120,
    height: number = 68
  ): Promise<string> {
    const key = this.generateKey(assetId, timestamp, width, height);
    
    // Return cached version if available
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Check if already loading
    if (this.loadingPromises.has(key)) {
      return this.loadingPromises.get(key)!;
    }

    // Generate thumbnail
    const promise = this.generateThumbnail(videoSrc, timestamp, width, height);
    this.loadingPromises.set(key, promise);

    try {
      const thumbnail = await promise;
      this.cache.set(key, thumbnail);
      return thumbnail;
    } finally {
      this.loadingPromises.delete(key);
    }
  }

  /**
   * Generate thumbnail from video
   */
  private async generateThumbnail(
    videoSrc: string,
    timestamp: number,
    width: number,
    height: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = width;
      canvas.height = height;

      const cleanup = () => {
        video.remove();
        canvas.remove();
      };

      video.onloadedmetadata = () => {
        // Seek to timestamp
        video.currentTime = Math.min(timestamp, video.duration - 0.1);
      };

      video.onseeked = () => {
        try {
          // Draw video frame to canvas
          ctx.drawImage(video, 0, 0, width, height);
          
          // Convert to base64
          const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          cleanup();
          resolve(thumbnail);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Failed to load video for thumbnail'));
      };

      video.src = videoSrc;
    });
  }

  /**
   * Preload thumbnails for assets
   */
  async preloadThumbnails(assets: Array<{ id: string; src: string }>) {
    const promises = assets.map(asset => 
      this.getThumbnail(asset.id, asset.src).catch(err => {
        console.warn(`Failed to preload thumbnail for ${asset.id}:`, err);
        return null;
      })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }
}

/**
 * Hook for thumbnail caching
 */
export const useThumbnailCache = () => {
  const cache = ThumbnailCache.getInstance();
  
  return {
    getThumbnail: cache.getThumbnail.bind(cache),
    preloadThumbnails: cache.preloadThumbnails.bind(cache),
    clear: cache.clear.bind(cache)
  };
};

// ============================================================================
// PERFORMANCE HOOKS
// ============================================================================

/**
 * Optimized debounced callback hook
 */
export const useOptimizedDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): T => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(() => {
    return debounce((...args: Parameters<T>) => {
      return callbackRef.current(...args);
    }, delay) as T;
  }, [delay, ...deps]);
};

/**
 * Optimized throttled callback hook
 */
export const useOptimizedThrottle = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): T => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useMemo(() => {
    return throttle((...args: Parameters<T>) => {
      return callbackRef.current(...args);
    }, delay) as T;
  }, [delay, ...deps]);
};

/**
 * Virtual scrolling hook for large lists
 */
export const useVirtualScrolling = (
  itemCount: number,
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) => {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      itemCount - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, itemCount, overscan]);

  const totalHeight = itemCount * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  return {
    visibleRange,
    totalHeight,
    offsetY,
    onScroll: (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    }
  };
};

/**
 * Intersection observer hook for lazy loading
 */
export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
) => {
  const [entries, setEntries] = useState<IntersectionObserverEntry[]>([]);
  const observer = useRef<IntersectionObserver>();

  const observe = useCallback((element: Element) => {
    if (!observer.current) {
      observer.current = new IntersectionObserver(setEntries, options);
    }
    observer.current.observe(element);
  }, [options]);

  const unobserve = useCallback((element: Element) => {
    if (observer.current) {
      observer.current.unobserve(element);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, []);

  return { entries, observe, unobserve };
};

/**
 * Asset preloading hook
 */
export const useAssetPreloader = () => {
  const [preloadedAssets, setPreloadedAssets] = useState<Set<string>>(new Set());
  const preloadPromises = useRef<Map<string, Promise<any>>>(new Map());

  const preloadVideo = useCallback(async (src: string): Promise<HTMLVideoElement> => {
    if (preloadedAssets.has(src)) {
      return Promise.resolve(document.createElement('video'));
    }

    if (preloadPromises.current.has(src)) {
      return preloadPromises.current.get(src)!;
    }

    const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';

      video.onloadedmetadata = () => {
        setPreloadedAssets(prev => new Set([...prev, src]));
        resolve(video);
      };

      video.onerror = () => {
        reject(new Error(`Failed to preload video: ${src}`));
      };

      video.src = src;
    });

    preloadPromises.current.set(src, promise);
    return promise;
  }, [preloadedAssets]);

  const preloadImage = useCallback(async (src: string): Promise<HTMLImageElement> => {
    if (preloadedAssets.has(src)) {
      return Promise.resolve(new Image());
    }

    if (preloadPromises.current.has(src)) {
      return preloadPromises.current.get(src)!;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        setPreloadedAssets(prev => new Set([...prev, src]));
        resolve(img);
      };

      img.onerror = () => {
        reject(new Error(`Failed to preload image: ${src}`));
      };

      img.src = src;
    });

    preloadPromises.current.set(src, promise);
    return promise;
  }, [preloadedAssets]);

  return {
    preloadVideo,
    preloadImage,
    preloadedAssets,
    isPreloaded: (src: string) => preloadedAssets.has(src)
  };
};

// ============================================================================
// PERFORMANCE MEASUREMENT
// ============================================================================

/**
 * Performance measurement utilities
 */
export class PerformanceMeasurement {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Start measuring an operation
   */
  start(operationName: string): () => number {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordMeasurement(operationName, duration);
      return duration;
    };
  }

  /**
   * Measure a function execution
   */
  measure<T>(operationName: string, fn: () => T): T {
    const end = this.start(operationName);
    try {
      const result = fn();
      return result;
    } finally {
      end();
    }
  }

  /**
   * Measure an async function execution
   */
  async measureAsync<T>(operationName: string, fn: () => Promise<T>): Promise<T> {
    const end = this.start(operationName);
    try {
      const result = await fn();
      return result;
    } finally {
      end();
    }
  }

  /**
   * Record a measurement
   */
  private recordMeasurement(operationName: string, duration: number): void {
    if (!this.measurements.has(operationName)) {
      this.measurements.set(operationName, []);
    }
    
    const measurements = this.measurements.get(operationName)!;
    measurements.push(duration);
    
    // Keep only recent measurements
    if (measurements.length > 100) {
      measurements.shift();
    }
  }

  /**
   * Get performance statistics
   */
  getStats(operationName: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    last: number;
  } | null {
    const measurements = this.measurements.get(operationName);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    return {
      count: measurements.length,
      average: measurements.reduce((sum, val) => sum + val, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      last: measurements[measurements.length - 1]
    };
  }

  /**
   * Get all performance data
   */
  getAllStats(): Record<string, ReturnType<typeof this.getStats>> {
    const stats: Record<string, ReturnType<typeof this.getStats>> = {};
    
    for (const operationName of this.measurements.keys()) {
      stats[operationName] = this.getStats(operationName);
    }
    
    return stats;
  }

  /**
   * Clear measurements
   */
  clear(): void {
    this.measurements.clear();
  }
}

/**
 * Global performance measurement instance
 */
export const performanceMeasurement = new PerformanceMeasurement();

/**
 * Hook for performance measurement
 */
export const usePerformanceMeasurement = () => {
  return {
    measure: performanceMeasurement.measure.bind(performanceMeasurement),
    measureAsync: performanceMeasurement.measureAsync.bind(performanceMeasurement),
    start: performanceMeasurement.start.bind(performanceMeasurement),
    getStats: performanceMeasurement.getStats.bind(performanceMeasurement),
    getAllStats: performanceMeasurement.getAllStats.bind(performanceMeasurement)
  };
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if the current device has limited resources
 */
export const isLowEndDevice = (): boolean => {
  // Check available memory
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    if (memory.jsHeapSizeLimit < 1000000000) { // Less than 1GB
      return true;
    }
  }

  // Check hardware concurrency
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    return true;
  }

  // Check connection
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') {
      return true;
    }
  }

  return false;
};

/**
 * Optimize performance based on device capabilities
 */
export const getOptimizedSettings = () => {
  const isLowEnd = isLowEndDevice();
  
  return {
    thumbnailQuality: isLowEnd ? 0.6 : 0.8,
    preloadDistance: isLowEnd ? 2 : 5,
    maxCacheSize: isLowEnd ? 50 : 200,
    debounceDelay: isLowEnd ? 500 : 300,
    virtualScrollOverscan: isLowEnd ? 2 : 5,
    enableAnimations: !isLowEnd,
    enablePreloading: !isLowEnd
  };
};

/**
 * Memory cleanup utility
 */
export const cleanup = {
  /**
   * Force garbage collection if available
   */
  forceGC: () => {
    if ('gc' in window && typeof window.gc === 'function') {
      window.gc();
    }
  },

  /**
   * Clear all caches
   */
  clearCaches: () => {
    ThumbnailCache.getInstance().clear();
    performanceMeasurement.clear();
  },

  /**
   * Cleanup unused objects
   */
  cleanupResources: () => {
    // Clear blob URLs
    const blobUrls = document.querySelectorAll('[src^="blob:"]');
    blobUrls.forEach(element => {
      const src = element.getAttribute('src');
      if (src && src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    });
  }
};