"""
Performance and Caching API

Provides endpoints for:
- Cache management
- Performance monitoring
- System health checks
- Resource optimization
"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, List, Optional, Any
import asyncio
import psutil
import time
from datetime import datetime

from .cache_service import (
    get_cache_service, 
    get_asset_cache, 
    get_timeline_cache, 
    get_api_cache,
    PerformanceMonitor,
    performance_timer
)

router = APIRouter(prefix="/performance", tags=["performance"])

# ============================================================================
# CACHE MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/cache/stats")
async def get_cache_stats():
    """Get comprehensive cache statistics"""
    cache_service = get_cache_service()
    asset_cache = get_asset_cache()
    timeline_cache = get_timeline_cache()
    api_cache = get_api_cache()
    
    return {
        "cache_stats": cache_service.get_stats(),
        "timestamp": time.time(),
        "cache_backends": {
            "main": cache_service.get_stats(),
            "redis_available": cache_service.use_redis
        }
    }

@router.post("/cache/clear")
async def clear_cache(namespace: Optional[str] = None):
    """Clear cache by namespace or all cache"""
    cache_service = get_cache_service()
    
    if namespace:
        cleared_count = cache_service.clear_namespace(namespace)
        return {"message": f"Cleared {cleared_count} entries from namespace '{namespace}'"}
    else:
        # Clear all cache
        success = cache_service.fallback_cache.clear() if not cache_service.use_redis else True
        if cache_service.use_redis:
            cache_service.redis_client.flushdb()
        
        return {"message": "All cache cleared successfully"}

@router.delete("/cache/{namespace}/{key}")
async def delete_cache_key(namespace: str, key: str):
    """Delete specific cache key"""
    cache_service = get_cache_service()
    cache_key = cache_service._generate_key(namespace, key)
    
    success = cache_service.delete(cache_key)
    
    if success:
        return {"message": f"Cache key '{cache_key}' deleted successfully"}
    else:
        raise HTTPException(status_code=404, detail="Cache key not found")

@router.post("/cache/warm")
async def warm_cache(background_tasks: BackgroundTasks):
    """Warm up cache with commonly accessed data"""
    
    async def warm_cache_task():
        """Background task to warm cache"""
        with performance_timer("cache_warming"):
            asset_cache = get_asset_cache()
            timeline_cache = get_timeline_cache()
            
            # This would typically pre-load commonly accessed data
            # For demo purposes, we'll just log the warming process
            print("🔥 Cache warming started")
            await asyncio.sleep(1)  # Simulate some work
            print("🔥 Cache warming completed")
    
    background_tasks.add_task(warm_cache_task)
    return {"message": "Cache warming started in background"}

# ============================================================================
# ASSET CACHE ENDPOINTS
# ============================================================================

@router.get("/cache/assets/{asset_id}/metadata")
async def get_cached_asset_metadata(asset_id: str):
    """Get cached asset metadata"""
    asset_cache = get_asset_cache()
    metadata = asset_cache.get_asset_metadata(asset_id)
    
    if metadata:
        return {"metadata": metadata, "cached": True}
    else:
        raise HTTPException(status_code=404, detail="Asset metadata not found in cache")

@router.post("/cache/assets/{asset_id}/metadata")
async def cache_asset_metadata(asset_id: str, metadata: Dict[str, Any]):
    """Cache asset metadata"""
    asset_cache = get_asset_cache()
    success = asset_cache.set_asset_metadata(asset_id, metadata)
    
    if success:
        return {"message": "Asset metadata cached successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to cache asset metadata")

@router.get("/cache/assets/{asset_id}/thumbnail")
async def get_cached_thumbnail(asset_id: str, timestamp: float = 1.0):
    """Get cached thumbnail"""
    asset_cache = get_asset_cache()
    thumbnail = asset_cache.get_thumbnail(asset_id, timestamp)
    
    if thumbnail:
        return {"thumbnail": thumbnail, "cached": True}
    else:
        raise HTTPException(status_code=404, detail="Thumbnail not found in cache")

@router.post("/cache/assets/{asset_id}/thumbnail")
async def cache_thumbnail(asset_id: str, thumbnail_data: str, timestamp: float = 1.0):
    """Cache thumbnail data"""
    asset_cache = get_asset_cache()
    success = asset_cache.set_thumbnail(asset_id, thumbnail_data, timestamp)
    
    if success:
        return {"message": "Thumbnail cached successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to cache thumbnail")

# ============================================================================
# TIMELINE CACHE ENDPOINTS
# ============================================================================

@router.get("/cache/timeline/{project_id}")
async def get_cached_timeline_state(project_id: str, user_id: str = "default"):
    """Get cached timeline state"""
    timeline_cache = get_timeline_cache()
    state = timeline_cache.get_timeline_state(project_id, user_id)
    
    if state:
        return {"state": state, "cached": True}
    else:
        raise HTTPException(status_code=404, detail="Timeline state not found in cache")

@router.post("/cache/timeline/{project_id}")
async def cache_timeline_state(project_id: str, state: Dict[str, Any], user_id: str = "default"):
    """Cache timeline state"""
    timeline_cache = get_timeline_cache()
    success = timeline_cache.set_timeline_state(project_id, user_id, state)
    
    if success:
        return {"message": "Timeline state cached successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to cache timeline state")

# ============================================================================
# PERFORMANCE MONITORING ENDPOINTS
# ============================================================================

@router.get("/monitor/system")
async def get_system_performance():
    """Get system performance metrics"""
    try:
        # CPU and memory usage
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Network stats if available
        try:
            network = psutil.net_io_counters()
            network_stats = {
                "bytes_sent": network.bytes_sent,
                "bytes_recv": network.bytes_recv,
                "packets_sent": network.packets_sent,
                "packets_recv": network.packets_recv
            }
        except:
            network_stats = None
        
        return {
            "timestamp": time.time(),
            "cpu": {
                "percent": cpu_percent,
                "count": psutil.cpu_count(),
                "count_logical": psutil.cpu_count(logical=True)
            },
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "percent": memory.percent,
                "used": memory.used,
                "free": memory.free
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": (disk.used / disk.total) * 100
            },
            "network": network_stats,
            "load_average": psutil.getloadavg() if hasattr(psutil, 'getloadavg') else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system performance: {str(e)}")

@router.get("/monitor/performance")
async def get_performance_metrics():
    """Get application performance metrics"""
    monitor = PerformanceMonitor(get_cache_service())
    summary = monitor.get_performance_summary()
    
    return {
        "performance_summary": summary,
        "timestamp": time.time()
    }

@router.post("/monitor/record")
async def record_performance_metric(metric_name: str, value: float, tags: Dict[str, str] = None):
    """Record a performance metric"""
    monitor = PerformanceMonitor(get_cache_service())
    monitor.record_metric(metric_name, value, tags)
    
    return {"message": f"Metric '{metric_name}' recorded successfully"}

# ============================================================================
# HEALTH CHECK ENDPOINTS
# ============================================================================

@router.get("/health")
async def health_check():
    """Comprehensive health check"""
    cache_service = get_cache_service()
    
    # Check cache service
    cache_healthy = True
    cache_stats = None
    try:
        cache_stats = cache_service.get_stats()
    except Exception as e:
        cache_healthy = False
        cache_stats = {"error": str(e)}
    
    # Check system resources
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    # Health status
    health_status = "healthy"
    issues = []
    
    # Check for issues
    if memory.percent > 85:
        issues.append("High memory usage")
        health_status = "warning"
    
    if disk.percent > 90:
        issues.append("Low disk space")
        health_status = "warning"
    
    if not cache_healthy:
        issues.append("Cache service unhealthy")
        health_status = "error"
    
    return {
        "status": health_status,
        "timestamp": time.time(),
        "issues": issues,
        "cache": {
            "healthy": cache_healthy,
            "stats": cache_stats
        },
        "resources": {
            "memory_percent": memory.percent,
            "disk_percent": disk.percent
        }
    }

# ============================================================================
# OPTIMIZATION ENDPOINTS
# ============================================================================

@router.post("/optimize/memory")
async def optimize_memory(background_tasks: BackgroundTasks):
    """Optimize memory usage"""
    
    async def memory_optimization_task():
        """Background task for memory optimization"""
        with performance_timer("memory_optimization"):
            cache_service = get_cache_service()
            
            # Clear expired cache entries
            if hasattr(cache_service.fallback_cache, '_evict_expired'):
                cache_service.fallback_cache._evict_expired()
            
            # Force garbage collection if available
            import gc
            gc.collect()
            
            print("🧹 Memory optimization completed")
    
    background_tasks.add_task(memory_optimization_task)
    return {"message": "Memory optimization started in background"}

@router.post("/optimize/cache")
async def optimize_cache(background_tasks: BackgroundTasks):
    """Optimize cache performance"""
    
    async def cache_optimization_task():
        """Background task for cache optimization"""
        with performance_timer("cache_optimization"):
            cache_service = get_cache_service()
            
            # Get current stats
            stats = cache_service.get_stats()
            
            # If hit rate is low, consider clearing some cache
            if stats.get('hit_rate', 1.0) < 0.3:
                # Clear half of the cache to improve hit rate
                if not cache_service.use_redis:
                    cache = cache_service.fallback_cache.cache
                    keys_to_remove = list(cache.keys())[:len(cache)//2]
                    for key in keys_to_remove:
                        cache_service.fallback_cache.delete(key)
            
            print("⚡ Cache optimization completed")
    
    background_tasks.add_task(cache_optimization_task)
    return {"message": "Cache optimization started in background"}

@router.get("/optimize/recommendations")
async def get_optimization_recommendations():
    """Get optimization recommendations based on current performance"""
    cache_service = get_cache_service()
    cache_stats = cache_service.get_stats()
    
    # System metrics
    memory = psutil.virtual_memory()
    cpu_percent = psutil.cpu_percent(interval=1)
    
    recommendations = []
    
    # Cache recommendations
    if cache_stats.get('hit_rate', 1.0) < 0.5:
        recommendations.append({
            "type": "cache",
            "priority": "high",
            "title": "Low Cache Hit Rate",
            "description": "Consider adjusting cache TTL or clearing stale entries",
            "action": "optimize_cache"
        })
    
    # Memory recommendations
    if memory.percent > 80:
        recommendations.append({
            "type": "memory",
            "priority": "high",
            "title": "High Memory Usage",
            "description": "Consider clearing cache or optimizing memory usage",
            "action": "optimize_memory"
        })
    
    # CPU recommendations
    if cpu_percent > 80:
        recommendations.append({
            "type": "cpu",
            "priority": "medium",
            "title": "High CPU Usage",
            "description": "Consider reducing background processing or optimizing algorithms",
            "action": "reduce_processing"
        })
    
    # Redis recommendations
    if not cache_service.use_redis:
        recommendations.append({
            "type": "infrastructure",
            "priority": "medium",
            "title": "Using In-Memory Cache",
            "description": "Consider setting up Redis for better performance and persistence",
            "action": "setup_redis"
        })
    
    return {
        "recommendations": recommendations,
        "timestamp": time.time(),
        "system_metrics": {
            "memory_percent": memory.percent,
            "cpu_percent": cpu_percent,
            "cache_hit_rate": cache_stats.get('hit_rate', 0)
        }
    }

# ============================================================================
# CACHE WARMING UTILITIES
# ============================================================================

async def warm_common_assets():
    """Warm cache with commonly accessed assets"""
    # This would typically load frequently accessed assets
    # Implementation depends on your specific asset structure
    pass

async def warm_timeline_data():
    """Warm cache with timeline data"""
    # This would typically load active project timelines
    # Implementation depends on your specific timeline structure
    pass