import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Eye, 
  EyeOff, 
  Volume2, 
  VolumeX, 
  Lock, 
  Unlock, 
  Plus, 
  Minus,
  Video,
  Image,
  Type,
  Zap,
  Music,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  LayerType, 
  getLayerName, 
  getLayerColor,
  useCurrentGESProjectId,
  useGESClipsByLayer,
  useGESProjectActions
} from '@/store/editorStore';

interface LayerManagerProps {
  className?: string;
  onLayerSelect?: (layer: LayerType) => void;
  selectedLayer?: LayerType;
  onLayerToggle?: (layer: LayerType, visible: boolean) => void;
}

interface LayerState {
  visible: boolean;
  locked: boolean;
  muted: boolean;
  expanded: boolean;
}

const getLayerIcon = (layer: LayerType) => {
  switch (layer) {
    case LayerType.MAIN:
      return Video;
    case LayerType.OVERLAY:
      return Image;
    case LayerType.TEXT:
      return Type;
    case LayerType.EFFECTS:
      return Zap;
    case LayerType.AUDIO:
      return Music;
    default:
      return Video;
  }
};

export const LayerManager: React.FC<LayerManagerProps> = ({
  className,
  onLayerSelect,
  selectedLayer,
  onLayerToggle
}) => {
  const currentProjectId = useCurrentGESProjectId();
  const clipsByLayer = useGESClipsByLayer(currentProjectId);
  const { addClipToLayer, addTitleClip } = useGESProjectActions();

  // Layer state management
  const [layerStates, setLayerStates] = useState<Record<LayerType, LayerState>>({
    [LayerType.MAIN]: { visible: true, locked: false, muted: false, expanded: true },
    [LayerType.OVERLAY]: { visible: true, locked: false, muted: false, expanded: true },
    [LayerType.TEXT]: { visible: true, locked: false, muted: false, expanded: true },
    [LayerType.EFFECTS]: { visible: true, locked: false, muted: false, expanded: true },
    [LayerType.AUDIO]: { visible: true, locked: false, muted: false, expanded: false }
  });

  const toggleLayerState = useCallback((layer: LayerType, property: keyof LayerState) => {
    setLayerStates(prev => ({
      ...prev,
      [layer]: {
        ...prev[layer],
        [property]: !prev[layer][property]
      }
    }));

    if (property === 'visible') {
      onLayerToggle?.(layer, !layerStates[layer].visible);
    }
  }, [layerStates, onLayerToggle]);

  const handleLayerSelect = useCallback((layer: LayerType) => {
    onLayerSelect?.(layer);
  }, [onLayerSelect]);

  const layers = Object.values(LayerType).filter(value => typeof value === 'number') as LayerType[];

  return (
    <div className={cn("bg-cre8r-gray-800 border border-cre8r-gray-700 rounded-lg", className)}>
      <div className="p-3 border-b border-cre8r-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Layers</h3>
          <Badge variant="secondary" className="bg-cre8r-violet/20 text-cre8r-violet border-cre8r-violet/30">
            {layers.length} Layers
          </Badge>
        </div>
      </div>

      <div className="space-y-1 p-2">
        {layers.map((layer) => {
          const LayerIcon = getLayerIcon(layer);
          const layerState = layerStates[layer];
          const clips = clipsByLayer[layer] || [];
          const layerColor = getLayerColor(layer);
          const isSelected = selectedLayer === layer;

          return (
            <div 
              key={layer}
              className={cn(
                "rounded-lg border transition-all cursor-pointer",
                isSelected 
                  ? "border-cre8r-violet/50 bg-cre8r-violet/10" 
                  : "border-cre8r-gray-600 hover:border-cre8r-gray-500"
              )}
              onClick={() => handleLayerSelect(layer)}
            >
              {/* Layer Header */}
              <div className="flex items-center gap-2 p-2">
                {/* Expand/Collapse */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-cre8r-gray-400 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLayerState(layer, 'expanded');
                  }}
                >
                  {layerState.expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>

                {/* Layer Icon */}
                <div 
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ backgroundColor: layerColor + '20', color: layerColor }}
                >
                  <LayerIcon className="h-3 w-3" />
                </div>

                {/* Layer Name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {getLayerName(layer)}
                    </span>
                    {clips.length > 0 && (
                      <Badge 
                        variant="outline" 
                        className="text-xs border-cre8r-gray-600 text-cre8r-gray-400 h-4"
                      >
                        {clips.length}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Layer Controls */}
                <div className="flex items-center gap-1">
                  {/* Visibility Toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-cre8r-gray-400 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerState(layer, 'visible');
                        }}
                      >
                        {layerState.visible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {layerState.visible ? 'Hide layer' : 'Show layer'}
                    </TooltipContent>
                  </Tooltip>

                  {/* Audio Toggle (for audio layers) */}
                  {layer === LayerType.AUDIO && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-cre8r-gray-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLayerState(layer, 'muted');
                          }}
                        >
                          {layerState.muted ? (
                            <VolumeX className="h-3 w-3" />
                          ) : (
                            <Volume2 className="h-3 w-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {layerState.muted ? 'Unmute layer' : 'Mute layer'}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Lock Toggle */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-cre8r-gray-400 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLayerState(layer, 'locked');
                        }}
                      >
                        {layerState.locked ? (
                          <Lock className="h-3 w-3" />
                        ) : (
                          <Unlock className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {layerState.locked ? 'Unlock layer' : 'Lock layer'}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Expanded Layer Content */}
              {layerState.expanded && (
                <div className="px-2 pb-2 border-t border-cre8r-gray-700/50">
                  <div className="mt-2">
                    {clips.length === 0 ? (
                      <div className="text-center py-3">
                        <p className="text-xs text-cre8r-gray-500 mb-2">No clips on this layer</p>
                        <div className="flex gap-1 justify-center">
                          {layer === LayerType.TEXT ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-cre8r-gray-600 text-cre8r-gray-400 hover:bg-cre8r-gray-700 h-6 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Add text clip functionality
                                console.log('Add text clip to layer:', layer);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Text
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-cre8r-gray-600 text-cre8r-gray-400 hover:bg-cre8r-gray-700 h-6 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Add clip functionality
                                console.log('Add clip to layer:', layer);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Clip
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {clips.slice(0, 3).map((clip) => (
                          <div 
                            key={clip.id}
                            className="flex items-center gap-2 p-2 bg-cre8r-gray-900/50 rounded text-xs"
                          >
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: layerColor }}
                            />
                            <span className="text-cre8r-gray-300 truncate flex-1">
                              {clip.clip_type === 'TITLE_CLIP' && clip.metadata?.text 
                                ? clip.metadata.text 
                                : `Clip ${clip.id.slice(-4)}`}
                            </span>
                            <span className="text-cre8r-gray-500">
                              {clip.duration.toFixed(1)}s
                            </span>
                          </div>
                        ))}
                        {clips.length > 3 && (
                          <div className="text-center py-1">
                            <span className="text-xs text-cre8r-gray-500">
                              +{clips.length - 3} more clips
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Layer Statistics */}
      <div className="p-3 border-t border-cre8r-gray-700">
        <div className="flex items-center justify-between text-xs text-cre8r-gray-400">
          <span>
            Total Clips: {Object.values(clipsByLayer).reduce((acc, clips) => acc + clips.length, 0)}
          </span>
          <span>
            Visible: {Object.entries(layerStates).filter(([_, state]) => state.visible).length}/{layers.length}
          </span>
        </div>
      </div>
    </div>
  );
};

export default LayerManager;