/**
 * API Response Caching Hook
 * 
 * Provides intelligent caching for API responses with:
 * - Automatic cache invalidation
 * - Background refresh
 * - Optimistic updates
 * - Memory management
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LRUCache } from '@/utils/performanceUtils';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string;
  maxAge?: number;
  staleWhileRevalidate?: boolean;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  staleWhileRevalidate?: boolean; // Return stale data while fetching fresh
  maxAge?: number; // Max age before considering stale
  tags?: string[]; // Cache tags for invalidation
}

interface APIResponse<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  isStale: boolean;
  lastUpdated: number | null;
  refetch: () => Promise<void>;
  invalidate: () => void;
  setOptimisticData: (data: T) => void;
}

class APICache {
  private static instance: APICache;
  private cache = new LRUCache<string, CacheEntry<any>>(500);
  private tagMap = new Map<string, Set<string>>(); // tag -> cache keys
  private inflightRequests = new Map<string, Promise<any>>();

  static getInstance(): APICache {
    if (!APICache.instance) {
      APICache.instance = new APICache();
    }
    return APICache.instance;
  }

  /**
   * Generate cache key from URL and params
   */
  private generateKey(url: string, params?: Record<string, any>): string {
    const paramString = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${url}:${btoa(paramString)}`;
  }

  /**
   * Check if cache entry is valid
   */
  private isValid(entry: CacheEntry<any>, ttl: number): boolean {
    const age = Date.now() - entry.timestamp;
    return age < ttl;
  }

  /**
   * Check if cache entry is stale
   */
  private isStale(entry: CacheEntry<any>, maxAge: number): boolean {
    const age = Date.now() - entry.timestamp;
    return age > maxAge;
  }

  /**
   * Get cached data
   */
  get<T>(url: string, params?: Record<string, any>, ttl: number = 300000): CacheEntry<T> | null {
    const key = this.generateKey(url, params);
    const entry = this.cache.get(key);
    
    if (entry && this.isValid(entry, ttl)) {
      return entry;
    }
    
    return null;
  }

  /**
   * Set cached data
   */
  set<T>(
    url: string, 
    data: T, 
    params?: Record<string, any>, 
    options: CacheOptions = {}
  ): void {
    const key = this.generateKey(url, params);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      maxAge: options.maxAge,
      staleWhileRevalidate: options.staleWhileRevalidate
    };

    this.cache.set(key, entry);

    // Update tag mappings
    if (options.tags) {
      options.tags.forEach(tag => {
        if (!this.tagMap.has(tag)) {
          this.tagMap.set(tag, new Set());
        }
        this.tagMap.get(tag)!.add(key);
      });
    }
  }

  /**
   * Invalidate cache by key
   */
  invalidate(url: string, params?: Record<string, any>): void {
    const key = this.generateKey(url, params);
    this.cache.delete(key);
  }

  /**
   * Invalidate cache by tags
   */
  invalidateByTags(tags: string[]): void {
    tags.forEach(tag => {
      const keys = this.tagMap.get(tag);
      if (keys) {
        keys.forEach(key => this.cache.delete(key));
        this.tagMap.delete(tag);
      }
    });
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.tagMap.clear();
    this.inflightRequests.clear();
  }

  /**
   * Get or set inflight request
   */
  getInflightRequest<T>(key: string): Promise<T> | null {
    return this.inflightRequests.get(key) || null;
  }

  setInflightRequest<T>(key: string, promise: Promise<T>): void {
    this.inflightRequests.set(key, promise);
    
    // Clean up when promise resolves
    promise.finally(() => {
      this.inflightRequests.delete(key);
    });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size(),
      inflightRequests: this.inflightRequests.size,
      tags: this.tagMap.size
    };
  }
}

/**
 * Hook for API response caching
 */
export const useAPICache = <T>(
  url: string | null,
  fetcher: (url: string) => Promise<T>,
  options: CacheOptions & {
    params?: Record<string, any>;
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
): APIResponse<T> => {
  const {
    ttl = 300000, // 5 minutes default
    maxAge = 60000, // 1 minute default stale time
    staleWhileRevalidate = true,
    params,
    enabled = true,
    tags,
    onSuccess,
    onError
  } = options;

  const cache = APICache.getInstance();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  /**
   * Fetch data with caching logic
   */
  const fetchData = useCallback(async (
    forceRefresh: boolean = false,
    skipCache: boolean = false
  ): Promise<void> => {
    if (!url || !enabled) return;

    const cacheKey = cache.generateKey(url, params);
    
    // Check if request is already in flight
    const inflightRequest = cache.getInflightRequest<T>(cacheKey);
    if (inflightRequest && !forceRefresh) {
      try {
        const result = await inflightRequest;
        if (mountedRef.current) {
          setData(result);
          setError(null);
          setIsStale(false);
          setLastUpdated(Date.now());
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err as Error);
        }
      }
      return;
    }

    // Check cache first
    if (!forceRefresh && !skipCache) {
      const cached = cache.get<T>(url, params, ttl);
      if (cached) {
        const isDataStale = cache.isStale(cached, maxAge);
        
        if (mountedRef.current) {
          setData(cached.data);
          setError(null);
          setIsStale(isDataStale);
          setLastUpdated(cached.timestamp);
        }

        // If stale but staleWhileRevalidate is enabled, fetch in background
        if (isDataStale && staleWhileRevalidate) {
          // Continue to fetch fresh data
        } else {
          // Data is fresh, return early
          if (mountedRef.current) {
            setLoading(false);
          }
          return;
        }
      }
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      if (mountedRef.current) {
        setLoading(true);
        setError(null);
      }

      // Create fetch promise
      const fetchPromise = fetcher(url);
      
      // Register inflight request
      cache.setInflightRequest(cacheKey, fetchPromise);

      const result = await fetchPromise;

      if (mountedRef.current) {
        setData(result);
        setError(null);
        setIsStale(false);
        setLastUpdated(Date.now());
        setLoading(false);
      }

      // Cache the result
      cache.set(url, result, params, { ttl, maxAge, staleWhileRevalidate, tags });

      // Success callback
      if (onSuccess) {
        onSuccess(result);
      }

    } catch (err) {
      if (mountedRef.current && !abortControllerRef.current?.signal.aborted) {
        setError(err as Error);
        setLoading(false);
      }

      // Error callback
      if (onError && !abortControllerRef.current?.signal.aborted) {
        onError(err as Error);
      }
    }
  }, [url, params, enabled, ttl, maxAge, staleWhileRevalidate, tags, fetcher, onSuccess, onError]);

  /**
   * Refetch data
   */
  const refetch = useCallback(async (): Promise<void> => {
    await fetchData(true);
  }, [fetchData]);

  /**
   * Invalidate cache
   */
  const invalidate = useCallback((): void => {
    if (url) {
      cache.invalidate(url, params);
    }
  }, [url, params]);

  /**
   * Set optimistic data
   */
  const setOptimisticData = useCallback((newData: T): void => {
    setData(newData);
    setIsStale(false);
    setLastUpdated(Date.now());
    
    // Update cache with optimistic data
    if (url) {
      cache.set(url, newData, params, { ttl, maxAge, staleWhileRevalidate, tags });
    }
  }, [url, params, ttl, maxAge, staleWhileRevalidate, tags]);

  // Initial fetch
  useEffect(() => {
    if (url && enabled) {
      fetchData();
    }
  }, [url, enabled, fetchData]);

  // Periodic refresh for stale data
  useEffect(() => {
    if (!enabled || !staleWhileRevalidate) return;

    const interval = setInterval(() => {
      if (isStale) {
        fetchData(false, true); // Skip cache but don't force refresh
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [enabled, staleWhileRevalidate, isStale, fetchData]);

  return {
    data,
    loading,
    error,
    isStale,
    lastUpdated,
    refetch,
    invalidate,
    setOptimisticData
  };
};

/**
 * Hook for mutating cached data
 */
export const useAPIMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    invalidateTags?: string[];
    invalidateUrls?: Array<{ url: string; params?: Record<string, any> }>;
    optimisticUpdate?: (variables: TVariables) => void;
  } = {}
) => {
  const { onSuccess, onError, invalidateTags, invalidateUrls, optimisticUpdate } = options;
  const cache = APICache.getInstance();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (variables: TVariables): Promise<TData | void> => {
    try {
      setLoading(true);
      setError(null);

      // Apply optimistic update
      if (optimisticUpdate) {
        optimisticUpdate(variables);
      }

      const result = await mutationFn(variables);

      // Success callback
      if (onSuccess) {
        onSuccess(result, variables);
      }

      // Invalidate cache
      if (invalidateTags) {
        cache.invalidateByTags(invalidateTags);
      }

      if (invalidateUrls) {
        invalidateUrls.forEach(({ url, params }) => {
          cache.invalidate(url, params);
        });
      }

      setLoading(false);
      return result;

    } catch (err) {
      setError(err as Error);
      setLoading(false);

      if (onError) {
        onError(err as Error, variables);
      }

      throw err;
    }
  }, [mutationFn, onSuccess, onError, invalidateTags, invalidateUrls, optimisticUpdate]);

  return {
    mutate,
    loading,
    error
  };
};

/**
 * Hook for cache management
 */
export const useCacheManager = () => {
  const cache = APICache.getInstance();

  return {
    invalidateByTags: cache.invalidateByTags.bind(cache),
    invalidate: cache.invalidate.bind(cache),
    clear: cache.clear.bind(cache),
    getStats: cache.getStats.bind(cache)
  };
};

/**
 * Prefetch data
 */
export const prefetchData = async <T>(
  url: string,
  fetcher: (url: string) => Promise<T>,
  options: CacheOptions & { params?: Record<string, any> } = {}
): Promise<void> => {
  const cache = APICache.getInstance();
  const { params, ttl = 300000, maxAge = 60000, staleWhileRevalidate = true, tags } = options;

  // Check if already cached and fresh
  const cached = cache.get<T>(url, params, ttl);
  if (cached && !cache.isStale(cached, maxAge)) {
    return;
  }

  try {
    const data = await fetcher(url);
    cache.set(url, data, params, { ttl, maxAge, staleWhileRevalidate, tags });
  } catch (error) {
    console.warn(`Failed to prefetch data for ${url}:`, error);
  }
};