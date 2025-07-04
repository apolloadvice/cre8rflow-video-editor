"""
Video Editor Caching Service

Provides comprehensive caching solutions for:
- API response caching
- Asset metadata caching  
- Thumbnail caching
- Video processing results
- Timeline state caching
"""

import json
import hashlib
import time
import asyncio
from typing import Any, Dict, List, Optional, Union, Callable
from datetime import datetime, timedelta
from pathlib import Path
import logging
from dataclasses import dataclass, asdict
from functools import wraps
import pickle
import os

# Try to import Redis, fallback to in-memory cache
try:
    import redis
    from redis.asyncio import Redis as AsyncRedis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("⚠️ Redis not available, using in-memory cache")

logger = logging.getLogger(__name__)

@dataclass
class CacheEntry:
    """Represents a cache entry with metadata"""
    key: str
    value: Any
    created_at: float
    expires_at: Optional[float] = None
    access_count: int = 0
    last_accessed: float = 0
    size_bytes: int = 0
    tags: List[str] = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        self.last_accessed = time.time()

class InMemoryCache:
    """Fallback in-memory cache when Redis is not available"""
    
    def __init__(self, max_size: int = 1000, default_ttl: int = 3600):
        self.cache: Dict[str, CacheEntry] = {}
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'size': 0
        }
    
    def _evict_expired(self):
        """Remove expired entries"""
        current_time = time.time()
        expired_keys = []
        
        for key, entry in self.cache.items():
            if entry.expires_at and current_time > entry.expires_at:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.cache[key]
            self.stats['evictions'] += 1
    
    def _evict_lru(self):
        """Evict least recently used entries when cache is full"""
        if len(self.cache) >= self.max_size:
            # Sort by last accessed time and remove oldest
            sorted_entries = sorted(self.cache.items(), key=lambda x: x[1].last_accessed)
            keys_to_remove = [key for key, _ in sorted_entries[:len(self.cache) - self.max_size + 1]]
            
            for key in keys_to_remove:
                del self.cache[key]
                self.stats['evictions'] += 1
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        self._evict_expired()
        
        if key in self.cache:
            entry = self.cache[key]
            entry.access_count += 1
            entry.last_accessed = time.time()
            self.stats['hits'] += 1
            return entry.value
        
        self.stats['misses'] += 1
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache"""
        self._evict_expired()
        self._evict_lru()
        
        ttl = ttl or self.default_ttl
        expires_at = time.time() + ttl if ttl > 0 else None
        
        # Estimate size
        try:
            size_bytes = len(pickle.dumps(value))
        except:
            size_bytes = len(str(value))
        
        entry = CacheEntry(
            key=key,
            value=value,
            created_at=time.time(),
            expires_at=expires_at,
            size_bytes=size_bytes
        )
        
        self.cache[key] = entry
        self.stats['size'] = len(self.cache)
        return True
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if key in self.cache:
            del self.cache[key]
            self.stats['size'] = len(self.cache)
            return True
        return False
    
    def clear(self) -> bool:
        """Clear all cache entries"""
        self.cache.clear()
        self.stats = {'hits': 0, 'misses': 0, 'evictions': 0, 'size': 0}
        return True
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        return {
            **self.stats,
            'hit_rate': self.stats['hits'] / (self.stats['hits'] + self.stats['misses']) if (self.stats['hits'] + self.stats['misses']) > 0 else 0,
            'memory_usage': sum(entry.size_bytes for entry in self.cache.values()),
            'entries': len(self.cache)
        }

class CacheService:
    """Main caching service with Redis support and in-memory fallback"""
    
    def __init__(self, redis_url: str = None, default_ttl: int = 3600):
        self.default_ttl = default_ttl
        self.redis_client = None
        self.async_redis_client = None
        self.fallback_cache = InMemoryCache(max_size=1000, default_ttl=default_ttl)
        self.use_redis = False
        
        if REDIS_AVAILABLE and redis_url:
            try:
                self.redis_client = redis.from_url(redis_url, decode_responses=True)
                self.async_redis_client = AsyncRedis.from_url(redis_url)
                # Test connection
                self.redis_client.ping()
                self.use_redis = True
                logger.info("✅ Redis connected successfully")
            except Exception as e:
                logger.warning(f"⚠️ Redis connection failed: {e}, using in-memory cache")
                self.use_redis = False
        else:
            logger.info("📦 Using in-memory cache (Redis not available)")
    
    def _generate_key(self, namespace: str, identifier: str, **kwargs) -> str:
        """Generate cache key with namespace and parameters"""
        base_key = f"{namespace}:{identifier}"
        if kwargs:
            params_str = json.dumps(kwargs, sort_keys=True)
            params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
            base_key += f":{params_hash}"
        return base_key
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            if self.use_redis:
                value = self.redis_client.get(key)
                if value is not None:
                    return json.loads(value)
            else:
                return self.fallback_cache.get(key)
        except Exception as e:
            logger.error(f"Cache get error: {e}")
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache"""
        try:
            ttl = ttl or self.default_ttl
            
            if self.use_redis:
                serialized = json.dumps(value, default=str)
                if ttl > 0:
                    return self.redis_client.setex(key, ttl, serialized)
                else:
                    return self.redis_client.set(key, serialized)
            else:
                return self.fallback_cache.set(key, value, ttl)
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        try:
            if self.use_redis:
                return bool(self.redis_client.delete(key))
            else:
                return self.fallback_cache.delete(key)
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False
    
    def clear_namespace(self, namespace: str) -> int:
        """Clear all keys in a namespace"""
        try:
            if self.use_redis:
                pattern = f"{namespace}:*"
                keys = self.redis_client.keys(pattern)
                if keys:
                    return self.redis_client.delete(*keys)
                return 0
            else:
                keys_to_delete = [key for key in self.fallback_cache.cache.keys() if key.startswith(f"{namespace}:")]
                for key in keys_to_delete:
                    self.fallback_cache.delete(key)
                return len(keys_to_delete)
        except Exception as e:
            logger.error(f"Cache clear namespace error: {e}")
            return 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        try:
            if self.use_redis:
                info = self.redis_client.info()
                return {
                    'backend': 'redis',
                    'connected': True,
                    'memory_usage': info.get('used_memory', 0),
                    'keys': info.get('keyspace', {}).get('db0', {}).get('keys', 0),
                    'hits': info.get('keyspace_hits', 0),
                    'misses': info.get('keyspace_misses', 0),
                    'hit_rate': info.get('keyspace_hits', 0) / (info.get('keyspace_hits', 0) + info.get('keyspace_misses', 1))
                }
            else:
                return {
                    'backend': 'memory',
                    'connected': True,
                    **self.fallback_cache.get_stats()
                }
        except Exception as e:
            logger.error(f"Cache stats error: {e}")
            return {'backend': 'error', 'connected': False}
    
    # Async methods for async operations
    async def async_get(self, key: str) -> Optional[Any]:
        """Async get value from cache"""
        try:
            if self.use_redis and self.async_redis_client:
                value = await self.async_redis_client.get(key)
                if value is not None:
                    return json.loads(value)
            else:
                return self.fallback_cache.get(key)
        except Exception as e:
            logger.error(f"Async cache get error: {e}")
        return None
    
    async def async_set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Async set value in cache"""
        try:
            ttl = ttl or self.default_ttl
            
            if self.use_redis and self.async_redis_client:
                serialized = json.dumps(value, default=str)
                if ttl > 0:
                    return await self.async_redis_client.setex(key, ttl, serialized)
                else:
                    return await self.async_redis_client.set(key, serialized)
            else:
                return self.fallback_cache.set(key, value, ttl)
        except Exception as e:
            logger.error(f"Async cache set error: {e}")
            return False

# Specialized cache managers
class AssetCacheManager:
    """Manages caching for video assets and metadata"""
    
    def __init__(self, cache_service: CacheService):
        self.cache = cache_service
        self.namespace = "assets"
    
    def get_asset_metadata(self, asset_id: str) -> Optional[Dict]:
        """Get cached asset metadata"""
        key = self.cache._generate_key(self.namespace, "metadata", asset_id=asset_id)
        return self.cache.get(key)
    
    def set_asset_metadata(self, asset_id: str, metadata: Dict, ttl: int = 7200) -> bool:
        """Cache asset metadata (2 hours default)"""
        key = self.cache._generate_key(self.namespace, "metadata", asset_id=asset_id)
        return self.cache.set(key, metadata, ttl)
    
    def get_thumbnail(self, asset_id: str, timestamp: float = 1.0) -> Optional[str]:
        """Get cached thumbnail base64 data"""
        key = self.cache._generate_key(self.namespace, "thumbnail", asset_id=asset_id, timestamp=timestamp)
        return self.cache.get(key)
    
    def set_thumbnail(self, asset_id: str, thumbnail_data: str, timestamp: float = 1.0, ttl: int = 86400) -> bool:
        """Cache thumbnail data (24 hours default)"""
        key = self.cache._generate_key(self.namespace, "thumbnail", asset_id=asset_id, timestamp=timestamp)
        return self.cache.set(key, thumbnail_data, ttl)
    
    def get_processing_result(self, asset_id: str, operation: str, params: Dict) -> Optional[Dict]:
        """Get cached processing result"""
        key = self.cache._generate_key(self.namespace, "processing", asset_id=asset_id, operation=operation, **params)
        return self.cache.get(key)
    
    def set_processing_result(self, asset_id: str, operation: str, params: Dict, result: Dict, ttl: int = 3600) -> bool:
        """Cache processing result (1 hour default)"""
        key = self.cache._generate_key(self.namespace, "processing", asset_id=asset_id, operation=operation, **params)
        return self.cache.set(key, result, ttl)

class TimelineCacheManager:
    """Manages caching for timeline states and operations"""
    
    def __init__(self, cache_service: CacheService):
        self.cache = cache_service
        self.namespace = "timeline"
    
    def get_timeline_state(self, project_id: str, user_id: str) -> Optional[Dict]:
        """Get cached timeline state"""
        key = self.cache._generate_key(self.namespace, "state", project_id=project_id, user_id=user_id)
        return self.cache.get(key)
    
    def set_timeline_state(self, project_id: str, user_id: str, state: Dict, ttl: int = 1800) -> bool:
        """Cache timeline state (30 minutes default)"""
        key = self.cache._generate_key(self.namespace, "state", project_id=project_id, user_id=user_id)
        return self.cache.set(key, state, ttl)
    
    def get_preview_data(self, timeline_hash: str) -> Optional[Dict]:
        """Get cached preview data"""
        key = self.cache._generate_key(self.namespace, "preview", timeline_hash=timeline_hash)
        return self.cache.get(key)
    
    def set_preview_data(self, timeline_hash: str, preview_data: Dict, ttl: int = 3600) -> bool:
        """Cache preview data (1 hour default)"""
        key = self.cache._generate_key(self.namespace, "preview", timeline_hash=timeline_hash)
        return self.cache.set(key, preview_data, ttl)

class APICacheManager:
    """Manages caching for API responses"""
    
    def __init__(self, cache_service: CacheService):
        self.cache = cache_service
        self.namespace = "api"
    
    def get_response(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Get cached API response"""
        key = self.cache._generate_key(self.namespace, endpoint, **(params or {}))
        return self.cache.get(key)
    
    def set_response(self, endpoint: str, response_data: Dict, params: Dict = None, ttl: int = 300) -> bool:
        """Cache API response (5 minutes default)"""
        key = self.cache._generate_key(self.namespace, endpoint, **(params or {}))
        return self.cache.set(key, response_data, ttl)

# Cache decorators
def cache_result(cache_service: CacheService, namespace: str, ttl: int = 3600):
    """Decorator to cache function results"""
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            key_data = {
                'func': func.__name__,
                'args': str(args),
                'kwargs': kwargs
            }
            key = cache_service._generate_key(namespace, func.__name__, **key_data)
            
            # Try to get from cache
            cached_result = cache_service.get(key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            cache_service.set(key, result, ttl)
            return result
        return wrapper
    return decorator

def cache_async_result(cache_service: CacheService, namespace: str, ttl: int = 3600):
    """Decorator to cache async function results"""
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            key_data = {
                'func': func.__name__,
                'args': str(args),
                'kwargs': kwargs
            }
            key = cache_service._generate_key(namespace, func.__name__, **key_data)
            
            # Try to get from cache
            cached_result = await cache_service.async_get(key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = await func(*args, **kwargs)
            await cache_service.async_set(key, result, ttl)
            return result
        return wrapper
    return decorator

# Global cache instance
_cache_service = None

def get_cache_service() -> CacheService:
    """Get global cache service instance"""
    global _cache_service
    if _cache_service is None:
        redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
        _cache_service = CacheService(redis_url=redis_url)
    return _cache_service

def get_asset_cache() -> AssetCacheManager:
    """Get asset cache manager"""
    return AssetCacheManager(get_cache_service())

def get_timeline_cache() -> TimelineCacheManager:
    """Get timeline cache manager"""
    return TimelineCacheManager(get_cache_service())

def get_api_cache() -> APICacheManager:
    """Get API cache manager"""
    return APICacheManager(get_cache_service())

# Performance monitoring utilities
class PerformanceMonitor:
    """Monitor and track performance metrics"""
    
    def __init__(self, cache_service: CacheService):
        self.cache = cache_service
        self.namespace = "performance"
    
    def record_metric(self, metric_name: str, value: float, tags: Dict = None):
        """Record a performance metric"""
        timestamp = time.time()
        key = self.cache._generate_key(self.namespace, metric_name, timestamp=int(timestamp))
        
        metric_data = {
            'name': metric_name,
            'value': value,
            'timestamp': timestamp,
            'tags': tags or {}
        }
        
        # Store with short TTL for recent metrics
        self.cache.set(key, metric_data, ttl=3600)
    
    def get_metrics(self, metric_name: str, since: Optional[datetime] = None) -> List[Dict]:
        """Get performance metrics (limited implementation for demo)"""
        # This would need more sophisticated implementation with Redis
        # For now, return empty list
        return []
    
    def get_performance_summary(self) -> Dict:
        """Get performance summary"""
        cache_stats = self.cache.get_stats()
        return {
            'cache_performance': cache_stats,
            'timestamp': time.time()
        }

# Context managers for performance tracking
class performance_timer:
    """Context manager to time operations and record metrics"""
    
    def __init__(self, operation_name: str, monitor: PerformanceMonitor = None):
        self.operation_name = operation_name
        self.monitor = monitor or PerformanceMonitor(get_cache_service())
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.start_time:
            duration = time.time() - self.start_time
            self.monitor.record_metric(f"{self.operation_name}_duration", duration)
            
            # Log slow operations
            if duration > 1.0:  # More than 1 second
                logger.warning(f"Slow operation: {self.operation_name} took {duration:.2f}s")