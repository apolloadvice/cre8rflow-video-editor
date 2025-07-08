import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Palette, 
  Move, 
  Filter, 
  Volume2, 
  Star, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  GripVertical,
  Sparkles,
  RotateCw,
  Layers,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import * as api from "@/api/apiClient";

// Use types from API client
type EffectProperty = api.EffectProperty;
type EffectDefinition = api.EffectDefinition;
type EffectInstance = api.EffectInstance;
type EffectPreset = api.EffectPreset;

interface EffectsPanelProps {
  selectedClipId?: string | null;
  onEffectChange?: (clipId: string, effects: EffectInstance[]) => void;
}



const categoryIcons = {
  color: Palette,
  transform: Move,
  filter: Filter,
  audio: Volume2,
  transition: Layers,
  generator: Sparkles
};

const categoryColors = {
  color: "bg-orange-500/20 text-orange-700 border-orange-200",
  transform: "bg-blue-500/20 text-blue-700 border-blue-200",
  filter: "bg-purple-500/20 text-purple-700 border-purple-200",
  audio: "bg-green-500/20 text-green-700 border-green-200",
  transition: "bg-pink-500/20 text-pink-700 border-pink-200",
  generator: "bg-yellow-500/20 text-yellow-700 border-yellow-200"
};

export const EffectsPanel: React.FC<EffectsPanelProps> = ({ 
  selectedClipId, 
  onEffectChange 
}) => {
  const [appliedEffects, setAppliedEffects] = useState<EffectInstance[]>([]);
  const [effectsLibrary, setEffectsLibrary] = useState<Record<string, EffectDefinition[]>>({});
  const [presets, setPresets] = useState<Record<string, EffectPreset>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("library");
  const { toast } = useToast();

  // Load effects library and presets on mount
  useEffect(() => {
    loadEffectsData();
  }, []);

  // Load effects for selected clip
  useEffect(() => {
    if (selectedClipId) {
      loadClipEffects(selectedClipId);
    } else {
      setAppliedEffects([]);
    }
  }, [selectedClipId]);

  const loadEffectsData = async () => {
    try {
      setIsLoading(true);
      const [libraryData, presetsData] = await Promise.all([
        api.getEffectsLibrary(),
        api.getEffectPresets()
      ]);
      
      setEffectsLibrary(libraryData.categories);
      setPresets(presetsData);
    } catch (error) {
      console.error('Error loading effects data:', error);
      toast({
        title: "Error",
        description: "Failed to load effects library",
        variant: "destructive"
      });
      // Fallback to mock data if API fails
      setEffectsLibrary(mockEffectsLibrary);
      setPresets(mockPresets);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClipEffects = async (clipId: string) => {
    try {
      setIsLoading(true);
      const effects = await api.getClipEffects(clipId);
      setAppliedEffects(effects);
    } catch (error) {
      console.error('Error loading clip effects:', error);
      toast({
        title: "Error",
        description: "Failed to load clip effects",
        variant: "destructive"
      });
      setAppliedEffects([]);
    } finally {
      setIsLoading(false);
    }
  };

  const addEffect = useCallback(async (effectType: string) => {
    if (!selectedClipId) {
      toast({ 
        title: "No clip selected", 
        description: "Please select a clip to add effects",
        variant: "destructive" 
      });
      return;
    }

    setIsLoading(true);
    try {
      const effectDef = Object.values(effectsLibrary)
        .flat()
        .find(def => def.type === effectType);
      
      if (!effectDef) {
        throw new Error(`Effect definition not found: ${effectType}`);
      }

      // Create default properties from effect definition
      const defaultProperties = Object.fromEntries(
        Object.entries(effectDef.properties).map(([key, prop]) => [key, prop.default])
      );

      await api.addEffectToClip(selectedClipId, {
        effect_type: effectType,
        properties: defaultProperties
      });
      
      // Reload effects to get the updated list
      await loadClipEffects(selectedClipId);
      
      toast({ 
        title: "Effect added", 
        description: `${effectDef.name} applied to clip` 
      });
    } catch (error) {
      console.error('Error adding effect:', error);
      toast({ 
        title: "Error", 
        description: "Failed to add effect",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedClipId, effectsLibrary, loadClipEffects, toast]);

  const removeEffect = useCallback(async (effectId: string) => {
    if (!selectedClipId) return;

    setIsLoading(true);
    try {
      await api.removeEffectFromClip(selectedClipId, effectId);
      
      // Reload effects to get the updated list
      await loadClipEffects(selectedClipId);
      
      toast({ 
        title: "Effect removed", 
        description: "Effect removed from clip" 
      });
    } catch (error) {
      console.error('Error removing effect:', error);
      toast({ 
        title: "Error", 
        description: "Failed to remove effect",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedClipId, loadClipEffects, toast]);

  const toggleEffect = useCallback(async (effectId: string) => {
    if (!selectedClipId) return;

    try {
      await api.toggleEffect(selectedClipId, effectId);
      
      // Reload effects to get the updated list
      await loadClipEffects(selectedClipId);
    } catch (error) {
      console.error('Error toggling effect:', error);
      toast({
        title: "Error",
        description: "Failed to toggle effect",
        variant: "destructive"
      });
    }
  }, [selectedClipId, loadClipEffects, toast]);

  const updateEffectProperty = useCallback(async (effectId: string, property: string, value: any) => {
    if (!selectedClipId) return;

    try {
      await api.updateEffectProperties(selectedClipId, effectId, {
        properties: { [property]: value }
      });
      
      // Update local state immediately for responsiveness
      const updatedEffects = appliedEffects.map(effect =>
        effect.id === effectId 
          ? { ...effect, properties: { ...effect.properties, [property]: value } }
          : effect
      );
      setAppliedEffects(updatedEffects);
      onEffectChange?.(selectedClipId, updatedEffects);
    } catch (error) {
      console.error('Error updating effect property:', error);
      toast({
        title: "Error",
        description: "Failed to update effect property",
        variant: "destructive"
      });
      // Reload effects to revert to server state
      await loadClipEffects(selectedClipId);
    }
  }, [selectedClipId, appliedEffects, onEffectChange, loadClipEffects, toast]);

  const applyPreset = useCallback(async (presetName: string) => {
    if (!selectedClipId) {
      toast({ 
        title: "No clip selected", 
        description: "Please select a clip to apply presets",
        variant: "destructive" 
      });
      return;
    }

    setIsLoading(true);
    try {
      const preset = presets[presetName];
      if (!preset) {
        throw new Error(`Preset not found: ${presetName}`);
      }

      await api.applyPresetToClip(selectedClipId, {
        preset_name: presetName
      });
      
      // Reload effects to get the updated list
      await loadClipEffects(selectedClipId);
      
      toast({ 
        title: "Preset applied", 
        description: `${preset.name} applied to clip` 
      });
    } catch (error) {
      console.error('Error applying preset:', error);
      toast({ 
        title: "Error", 
        description: "Failed to apply preset",
        variant: "destructive" 
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedClipId, presets, loadClipEffects, toast]);

  const renderEffectProperty = (effect: EffectInstance, propName: string, propDef: EffectProperty) => {
    const value = effect.properties[propName];
    
    if (propDef.type === "float" || propDef.type === "int") {
      return (
        <div key={propName} className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium capitalize">
              {propName.replace('_', ' ')}
            </label>
            <span className="text-sm text-muted-foreground">
              {typeof value === 'number' ? value.toFixed(2) : value}
            </span>
          </div>
          <Slider
            value={[value]}
            onValueChange={([newValue]) => updateEffectProperty(effect.id, propName, newValue)}
            min={propDef.min || 0}
            max={propDef.max || 1}
            step={propDef.type === "float" ? 0.01 : 1}
            className="w-full"
          />
        </div>
      );
    }
    
    if (propDef.type === "bool") {
      return (
        <div key={propName} className="flex items-center justify-between">
          <label className="text-sm font-medium capitalize">
            {propName.replace('_', ' ')}
          </label>
          <Switch
            checked={value}
            onCheckedChange={(checked) => updateEffectProperty(effect.id, propName, checked)}
          />
        </div>
      );
    }
    
    return null;
  };

  const renderEffectCard = (effect: EffectInstance) => {
    const categoryColor = categoryColors[effect.category as keyof typeof categoryColors] || categoryColors.color;
    
    return (
      <Card key={effect.id} className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
              <CardTitle className="text-sm">{effect.name}</CardTitle>
              <Badge className={cn("text-xs", categoryColor)}>
                {effect.category}
              </Badge>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleEffect(effect.id)}
                className="h-8 w-8 p-0"
              >
                {effect.enabled ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEffect(effect.id)}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        {effect.enabled && (
          <CardContent className="pt-0">
            <div className="space-y-4">
              {Object.entries(effect.properties).map(([propName, value]) => {
                const effectDef = Object.values(effectsLibrary)
                  .flat()
                  .find(def => def.type === effect.type);
                const propDef = effectDef?.properties[propName];
                
                if (!propDef) return null;
                
                return renderEffectProperty(effect, propName, propDef);
              })}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderEffectLibrary = () => (
    <div className="space-y-6">
      {Object.entries(effectsLibrary).map(([category, effects]) => {
        const Icon = categoryIcons[category as keyof typeof categoryIcons];
        const categoryColor = categoryColors[category as keyof typeof categoryColors];
        
        return (
          <div key={category}>
            <div className="flex items-center space-x-2 mb-3">
              {Icon && <Icon className="h-4 w-4" />}
              <h3 className="font-medium capitalize">{category} Effects</h3>
              <Badge className={cn("text-xs", categoryColor)}>
                {effects.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {effects.map((effect) => (
                <Card 
                  key={effect.type}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => addEffect(effect.type)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{effect.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {effect.description}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderPresets = () => (
    <div className="space-y-4">
      {Object.entries(presets).map(([presetKey, preset]) => (
        <Card 
          key={presetKey}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => applyPreset(presetKey)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <div className="font-medium">{preset.name}</div>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {preset.description}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {preset.effects.length} effects
                </div>
              </div>
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-background border-r">
      <div className="p-4 border-b">
        <div className="flex items-center space-x-2">
          <Settings className="h-5 w-5" />
          <h2 className="font-semibold">Effects</h2>
        </div>
        {selectedClipId && (
          <p className="text-sm text-muted-foreground mt-1">
            Clip: {selectedClipId.slice(0, 8)}...
          </p>
        )}
      </div>

      {!selectedClipId ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              Select a clip on the timeline to add effects
            </AlertDescription>
          </Alert>
        </div>
      ) : isLoading && appliedEffects.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="flex items-center space-x-2">
            <RotateCw className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading effects...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 mx-4 mt-4">
              <TabsTrigger value="applied">Applied</TabsTrigger>
              <TabsTrigger value="library">Library</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
            </TabsList>
            
            <div className="flex-1 mt-4">
              <TabsContent value="applied" className="h-full mt-0">
                <ScrollArea className="h-full px-4">
                  {appliedEffects.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                      <p className="text-sm text-muted-foreground">No effects applied</p>
                    </div>
                  ) : (
                    <div className="space-y-4 pb-4">
                      {appliedEffects.map(renderEffectCard)}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="library" className="h-full mt-0">
                <ScrollArea className="h-full px-4">
                  <div className="pb-4">
                    {renderEffectLibrary()}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="presets" className="h-full mt-0">
                <ScrollArea className="h-full px-4">
                  <div className="pb-4">
                    {renderPresets()}
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  );
};

// Mock data for fallback when API is not available
const mockEffectsLibrary = {
  color: [
    {
      type: "brightness-contrast",
      name: "Brightness & Contrast",
      description: "Adjust brightness and contrast levels",
      category: "color",
      properties: {
        brightness: { type: "float", default: 0.0, min: -1.0, max: 1.0 },
        contrast: { type: "float", default: 1.0, min: 0.0, max: 2.0 }
      }
    },
    {
      type: "hue-saturation",
      name: "Hue & Saturation",
      description: "Adjust hue and saturation",
      category: "color",
      properties: {
        hue: { type: "float", default: 0.0, min: -180.0, max: 180.0 },
        saturation: { type: "float", default: 1.0, min: 0.0, max: 2.0 }
      }
    }
  ],
  transform: [
    {
      type: "scale",
      name: "Scale",
      description: "Scale and position video",
      category: "transform",
      properties: {
        scale_x: { type: "float", default: 1.0, min: 0.1, max: 5.0 },
        scale_y: { type: "float", default: 1.0, min: 0.1, max: 5.0 },
        pos_x: { type: "float", default: 0.0, min: -1.0, max: 1.0 },
        pos_y: { type: "float", default: 0.0, min: -1.0, max: 1.0 }
      }
    },
    {
      type: "rotate",
      name: "Rotate",
      description: "Rotate video around center",
      category: "transform",
      properties: {
        angle: { type: "float", default: 0.0, min: -360.0, max: 360.0 }
      }
    }
  ],
  filter: [
    {
      type: "blur",
      name: "Blur",
      description: "Apply gaussian blur",
      category: "filter",
      properties: {
        sigma: { type: "float", default: 1.0, min: 0.0, max: 10.0 }
      }
    }
  ],
  audio: [
    {
      type: "volume",
      name: "Volume",
      description: "Adjust audio volume",
      category: "audio",
      properties: {
        volume: { type: "float", default: 1.0, min: 0.0, max: 3.0 }
      }
    }
  ]
};

const mockPresets: Record<string, EffectPreset> = {
  cinematic: {
    name: "Cinematic Look",
    description: "Professional cinematic color grading",
    effects: [
      { type: "brightness-contrast", properties: { brightness: 0.1, contrast: 1.2 } },
      { type: "hue-saturation", properties: { saturation: 1.3 } }
    ]
  },
  vintage: {
    name: "Vintage Film",
    description: "Retro film look with warmth",
    effects: [
      { type: "hue-saturation", properties: { hue: 15.0, saturation: 0.8 } },
      { type: "brightness-contrast", properties: { brightness: -0.1, contrast: 1.1 } }
    ]
  },
  black_white: {
    name: "Black & White",
    description: "Classic monochrome look",
    effects: [
      { type: "hue-saturation", properties: { saturation: 0.0 } },
      { type: "brightness-contrast", properties: { contrast: 1.2 } }
    ]
  }
};

export default EffectsPanel; 