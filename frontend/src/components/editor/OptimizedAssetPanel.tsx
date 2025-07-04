/**
 * Optimized Asset Panel Component
 * 
 * Features:
 * - Virtual scrolling for large asset lists
 * - Thumbnail caching and lazy loading
 * - Intersection observer for performance
 * - Memory-efficient rendering
 * - Debounced search and filtering
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Search, Filter, Grid, List, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { 
  useVirtualScrolling,
  useIntersectionObserver,
  useThumbnailCache,
  useOptimizedDebounce,
  useMemoryMonitor,
  getOptimizedSettings
} from '@/utils/performanceUtils';
import { useAPICache } from '@/hooks/useAPICache';

interface Asset {
  id: string;
  name: string;
  src: string;
  duration: number;
  file_path: string;
  size?: number;
  created_at?: string;
  thumbnail?: string;
}

interface OptimizedAssetPanelProps {
  onAssetSelect?: (asset: Asset) => void;
  onAssetDrop?: (asset: Asset, track: number, time: number) => void;
  onMultipleAssetDrop?: (assets: Asset[], track: number, time: number) => void;
  selectedAssets?: string[];
  className?: string;
}

// Virtual item component for efficient rendering
const AssetItem = React.memo<{
  asset: Asset;
  isSelected: boolean;
  onSelect: (asset: Asset) => void;
  onDragStart: (e: React.DragEvent, asset: Asset) => void;
  viewMode: 'grid' | 'list';
  isVisible: boolean;
}>(({ asset, isSelected, onSelect, onDragStart, viewMode, isVisible }) => {
  const { getThumbnail } = useThumbnailCache();
  const [thumbnail, setThumbnail] = useState<string | null>(asset.thumbnail || null);
  const [loading, setLoading] = useState(false);
  const { entries, observe } = useIntersectionObserver({ threshold: 0.1 });

  const itemRef = useRef<HTMLDivElement>(null);

  // Setup intersection observer
  useEffect(() => {
    if (itemRef.current && isVisible) {
      observe(itemRef.current);
    }
  }, [observe, isVisible]);

  // Load thumbnail when visible
  useEffect(() => {
    const entry = entries.find(e => e.target === itemRef.current);
    if (entry?.isIntersecting && !thumbnail && !loading) {
      setLoading(true);
      getThumbnail(asset.id, asset.src)
        .then(setThumbnail)
        .catch(console.warn)
        .finally(() => setLoading(false));
    }
  }, [entries, thumbnail, loading, asset.id, asset.src, getThumbnail]);

  const formatDuration = useCallback((duration: number) => {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  const formatFileSize = useCallback((size?: number) => {
    if (!size) return '';
    const mb = size / (1024 * 1024);
    return mb < 1 ? `${(size / 1024).toFixed(0)}KB` : `${mb.toFixed(1)}MB`;
  }, []);

  if (viewMode === 'grid') {
    return (
      <div
        ref={itemRef}
        className={cn(
          "relative bg-white dark:bg-gray-800 rounded-lg border-2 border-transparent",
          "hover:border-cre8r-violet cursor-pointer transition-all duration-200",
          "shadow-sm hover:shadow-md",
          isSelected && "border-cre8r-violet bg-cre8r-violet/5"
        )}
        onClick={() => onSelect(asset)}
        draggable
        onDragStart={(e) => onDragStart(e, asset)}
      >
        {/* Thumbnail */}
        <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-t-lg overflow-hidden">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : thumbnail ? (
            <img
              src={thumbnail}
              alt={asset.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <Upload className="h-8 w-8" />
            </div>
          )}
          
          {/* Duration overlay */}
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
            {formatDuration(asset.duration)}
          </div>
        </div>

        {/* Asset info */}
        <div className="p-3">
          <h3 className="font-medium text-sm truncate" title={asset.name}>
            {asset.name}
          </h3>
          {asset.size && (
            <p className="text-xs text-gray-500 mt-1">
              {formatFileSize(asset.size)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={itemRef}
      className={cn(
        "flex items-center gap-3 p-3 border-2 border-transparent rounded-lg",
        "hover:border-cre8r-violet cursor-pointer transition-all duration-200",
        "hover:bg-gray-50 dark:hover:bg-gray-800",
        isSelected && "border-cre8r-violet bg-cre8r-violet/5"
      )}
      onClick={() => onSelect(asset)}
      draggable
      onDragStart={(e) => onDragStart(e, asset)}
    >
      {/* Thumbnail */}
      <div className="w-16 h-10 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        ) : thumbnail ? (
          <img
            src={thumbnail}
            alt={asset.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <Upload className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Asset info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm truncate" title={asset.name}>
          {asset.name}
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span>{formatDuration(asset.duration)}</span>
          {asset.size && <span>{formatFileSize(asset.size)}</span>}
        </div>
      </div>
    </div>
  );
});

AssetItem.displayName = 'AssetItem';

export const OptimizedAssetPanel: React.FC<OptimizedAssetPanelProps> = ({
  onAssetSelect,
  onAssetDrop,
  onMultipleAssetDrop,
  selectedAssets = [],
  className
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Performance monitoring
  useMemoryMonitor('OptimizedAssetPanel');
  const optimizedSettings = getOptimizedSettings();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set(selectedAssets));

  // API cache for assets
  const {
    data: assets = [],
    loading,
    error,
    refetch
  } = useAPICache<Asset[]>(
    '/assets',
    async () => {
      const response = await fetch('/api/assets');
      if (!response.ok) throw new Error('Failed to fetch assets');
      return response.json();
    },
    {
      ttl: 600000, // 10 minutes
      staleWhileRevalidate: true,
      tags: ['assets']
    }
  );

  // Debounced search to improve performance
  const debouncedSearch = useOptimizedDebounce(
    (query: string) => {
      setSearchQuery(query);
    },
    optimizedSettings.debounceDelay,
    []
  );

  // Filtered assets
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    
    const query = searchQuery.toLowerCase();
    return assets.filter(asset =>
      asset.name.toLowerCase().includes(query) ||
      asset.file_path.toLowerCase().includes(query)
    );
  }, [assets, searchQuery]);

  // Virtual scrolling setup
  const itemHeight = viewMode === 'grid' ? 200 : 60;
  const containerHeight = 600; // Fixed height for virtual scrolling
  
  const {
    visibleRange,
    totalHeight,
    offsetY,
    onScroll
  } = useVirtualScrolling(
    filteredAssets.length,
    itemHeight,
    containerHeight,
    optimizedSettings.virtualScrollOverscan
  );

  // Get visible items
  const visibleAssets = useMemo(() => {
    return filteredAssets.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [filteredAssets, visibleRange]);

  // Asset selection handlers
  const handleAssetSelect = useCallback((asset: Asset) => {
    setSelectedAssetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(asset.id)) {
        newSet.delete(asset.id);
      } else {
        newSet.add(asset.id);
      }
      return newSet;
    });
    
    onAssetSelect?.(asset);
  }, [onAssetSelect]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(asset));
    e.dataTransfer.setData('text/plain', asset.name);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  // File upload handler
  const handleFileUpload = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    const videoFiles = fileArray.filter(file => file.type.startsWith('video/'));
    
    if (videoFiles.length === 0) {
      toast({
        title: "No video files",
        description: "Please select video files to upload",
        variant: "destructive"
      });
      return;
    }

    // Upload files (implementation depends on your upload API)
    for (const file of videoFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        toast({
          title: "Upload successful",
          description: `${file.name} uploaded successfully`
        });
      } catch (error) {
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive"
        });
      }
    }
    
    // Refresh assets list
    refetch();
  }, [toast, refetch]);

  // Grid layout calculation for responsive grid
  const gridCols = useMemo(() => {
    if (viewMode === 'list') return 1;
    
    const containerWidth = containerRef.current?.getBoundingClientRect().width || 400;
    const itemWidth = 200;
    const gap = 16;
    const cols = Math.floor((containerWidth + gap) / (itemWidth + gap));
    return Math.max(1, cols);
  }, [viewMode]);

  if (loading) {
    return (
      <div className={cn("p-6 flex items-center justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-cre8r-violet" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-6 text-center", className)}>
        <p className="text-red-500 mb-4">Failed to load assets</p>
        <Button onClick={refetch} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Assets</h2>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search assets..."
            className="pl-10"
            onChange={(e) => debouncedSearch(e.target.value)}
          />
        </div>

        {/* Upload button */}
        <Button
          className="w-full mt-4"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Assets
        </Button>
        
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          multiple
          accept="video/*"
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
        />
      </div>

      {/* Asset list with virtual scrolling */}
      <div className="flex-1 overflow-hidden">
        {filteredAssets.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {searchQuery ? 'No assets match your search' : 'No assets uploaded yet'}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-full overflow-auto"
            onScroll={onScroll}
          >
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                style={{
                  transform: `translateY(${offsetY}px)`,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0
                }}
              >
                <div 
                  className={cn(
                    "p-4 gap-4",
                    viewMode === 'grid' 
                      ? `grid grid-cols-${gridCols}` 
                      : "flex flex-col"
                  )}
                >
                  {visibleAssets.map((asset, index) => (
                    <AssetItem
                      key={asset.id}
                      asset={asset}
                      isSelected={selectedAssetIds.has(asset.id)}
                      onSelect={handleAssetSelect}
                      onDragStart={handleDragStart}
                      viewMode={viewMode}
                      isVisible={true}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer with stats */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500">
        {filteredAssets.length} assets
        {selectedAssetIds.size > 0 && ` • ${selectedAssetIds.size} selected`}
      </div>
    </div>
  );
};

export default OptimizedAssetPanel;