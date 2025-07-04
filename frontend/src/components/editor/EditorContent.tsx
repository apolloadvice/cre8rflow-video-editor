import { useState, useRef, useEffect } from "react";
import { ResizablePanel, ResizablePanelGroup, ResizableHandle } from "@/components/ui/resizable";
import VideoPlayer from "@/components/editor/VideoPlayer";
import Timeline from "@/components/editor/Timeline";
import ChatPanel from "@/components/editor/ChatPanel";
import AssetPanel from "@/components/editor/AssetPanel";
import EffectsSidebar from "@/components/editor/EffectsSidebar";
import TimecodeDisplay from "@/components/editor/TimecodeDisplay";
import GESProjectSelector from "@/components/editor/GESProjectSelector";
import LayerManager from "@/components/editor/LayerManager";
import { useEditorStore, useLayoutSetter, useLayout, useCurrentGESProjectId, LayerType } from "@/store/editorStore";
import { useVideoHandler } from "@/hooks/useVideoHandler";
import { useAICommands } from "@/hooks/useAICommands";
import { saveTimeline } from "@/api/apiClient";
import { useToast } from "@/hooks/use-toast";
import { debounce } from "lodash";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Grid } from "lucide-react";

interface EditorContentProps {
  isAssetPanelVisible?: boolean;
  isEffectsPanelVisible?: boolean;
}

const EditorContent = ({ isAssetPanelVisible = true, isEffectsPanelVisible = false }: EditorContentProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  
  // Get layout state and setter
  const layout = useLayout();
  const setLayoutSize = useLayoutSetter();
  
  // GES Professional Timeline State
  const currentGESProjectId = useCurrentGESProjectId();
  const [gesMode, setGesMode] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState<LayerType>(LayerType.MAIN);
  const [showLayerManager, setShowLayerManager] = useState(false);
  
  // Auto-enable GES mode when a project is loaded
  useEffect(() => {
    if (currentGESProjectId && !gesMode) {
      setGesMode(true);
      setShowLayerManager(true);
    }
  }, [currentGESProjectId, gesMode]);
  
  // Get state from our store
  const {
    currentTime, 
    duration, 
    setCurrentTime,
    setDuration,
    updateClip,
    moveClip,
    activeVideoAsset,
    clips,
    setClips,
    selectedClipId,
    setSelectedClipId,
    setActiveVideoAsset,
    videoSrc,
    setVideoSrc,
    recalculateDuration,
  } = useEditorStore();
  
  // Use our custom hooks
  const { handleVideoDrop, handleVideoAssetDrop: origHandleVideoAssetDrop, handleMultipleVideoAssetDrop: origHandleMultipleVideoAssetDrop, handleVideoProcessed } = useVideoHandler();
  const { handleChatCommand } = useAICommands();
  const { toast } = useToast();

  // Debounced timeline save
  const debouncedSaveTimeline = useRef(
    debounce(async (assetPath: string, timeline: any) => {
      try {
        await saveTimeline(assetPath, timeline);
        toast({ title: "Timeline saved", description: "Your changes have been saved.", variant: "default" });
      } catch (err: any) {
        toast({ title: "Save failed", description: err.message || "Failed to save timeline.", variant: "destructive" });
      }
    }, 800)
  ).current;

  // Animation frame for syncing video time with store - DISABLED
  // This was causing dual cursor issues when using interval timeline
  // The interval timeline now controls the cursor position directly
  // useEffect(() => {
  //   let animationFrameId: number;
  //   
  //   const updateTime = () => {
  //     if (videoRef.current) {
  //       setCurrentTime(videoRef.current.currentTime);
  //     }
  //     animationFrameId = requestAnimationFrame(updateTime);
  //   };
  //   
  //   animationFrameId = requestAnimationFrame(updateTime);
  //   
  //   return () => {
  //     cancelAnimationFrame(animationFrameId);
  //   };
  // }, [setCurrentTime]);

  // Auto-recalculate timeline duration when clips change
  useEffect(() => {
    console.log('🎬 [EditorContent] Clips changed, recalculating duration');
    console.log('🎬 [EditorContent] Current clips:', clips);
    recalculateDuration();
  }, [clips, recalculateDuration]);

  // Helper to build timeline object for backend
  function buildTimelineObject(clips: any[], frameRate = 30.0) {
    // Group clips by track number
    const trackCount = 6;
    const trackTypes = ["video", "text", "audio", "effects", "format", "other"];
    const tracks = Array.from({ length: trackCount }).map((_, i) => ({
      name: `${trackTypes[i]?.charAt(0).toUpperCase() + trackTypes[i]?.slice(1) || "Track"} ${i + 1}`,
      track_type: trackTypes[i] || "video",
      clips: clips.filter(c => c.track === i)
    }));
    return {
      _type: "Timeline",
      version: "1.0",
      frame_rate: frameRate,
      tracks,
      transitions: []
    };
  }

  // Save timeline after clip update
  const handleClipUpdate = (clipId: string, updates: { start?: number; end?: number }) => {
    updateClip(clipId, updates);
    if (activeVideoAsset?.file_path) {
      const timelineObj = buildTimelineObject(clips.map(c => c.id === clipId ? { ...c, ...updates } : c));
      debouncedSaveTimeline(activeVideoAsset.file_path, timelineObj);
    }
  };

  // Handle clip movement within timeline (for reordering)
  const handleClipMove = (clipId: string, newTrack: number, newStartTime: number) => {
    console.log('🎬 [EditorContent] handleClipMove called:', clipId, newTrack, newStartTime);
    
    const targetClip = clips.find(c => c.id === clipId);
    if (!targetClip) return;
    
    const clipDuration = targetClip.end - targetClip.start;
    const newEndTime = newStartTime + clipDuration;
    
    moveClip(clipId, newTrack, newStartTime, newEndTime);
    
    if (activeVideoAsset?.file_path) {
      const updatedClips = clips.map(c => 
        c.id === clipId 
          ? { ...c, track: newTrack, start: newStartTime, end: newEndTime }
          : c
      );
      const timelineObj = buildTimelineObject(updatedClips);
      debouncedSaveTimeline(activeVideoAsset.file_path, timelineObj);
    }
  };

  // Patch handleVideoAssetDrop to save timeline after drop
  const handleVideoAssetDrop = (videoAsset: any, track: number, dropTime: number) => {
    origHandleVideoAssetDrop(videoAsset, track, dropTime);
    // Save after drop (new clip added)
    setTimeout(() => {
      if (activeVideoAsset?.file_path) {
        const timelineObj = buildTimelineObject(useEditorStore.getState().clips);
        debouncedSaveTimeline(activeVideoAsset.file_path, timelineObj);
      }
    }, 0);
  };

  // Patch handleMultipleVideoAssetDrop to save timeline after drop
  const handleMultipleVideoAssetDrop = (videoAssets: any[], track: number, dropTime: number) => {
    origHandleMultipleVideoAssetDrop(videoAssets, track, dropTime);
    // Save after drop (new clips added)
    setTimeout(() => {
      if (activeVideoAsset?.file_path) {
        const timelineObj = buildTimelineObject(useEditorStore.getState().clips);
        debouncedSaveTimeline(activeVideoAsset.file_path, timelineObj);
      }
    }, 0);
  };

  // Handlers for layout changes
  const handleSidebarResize = (sizes: number[]) => {
    setLayoutSize('sidebar', sizes[0]);
  };

  const handleMainPaneResize = (sizes: number[]) => {
    setLayoutSize('preview', sizes[0]);
    setLayoutSize('chat', sizes[1]);
  };

  const handleTimelineResize = (sizes: number[]) => {
    setLayoutSize('timeline', sizes[1]);
  };
  
  // GES Professional Timeline Handlers
  const handleGESModeToggle = (enabled: boolean) => {
    setGesMode(enabled);
    if (enabled) {
      setShowLayerManager(true);
    }
  };
  
  const handleLayerSelect = (layer: LayerType) => {
    setSelectedLayer(layer);
  };
  
  const handleGESProjectChange = (projectId: string | null) => {
    if (projectId) {
      setGesMode(true);
      setShowLayerManager(true);
    } else {
      setGesMode(false);
      setShowLayerManager(false);
    }
  };

  // Handler for video selection from AssetPanel
  const handleVideoSelect = async (video: any) => {
    setActiveVideoAsset(video);
    
    // If video has a src URL, use it directly
    if (video.src) {
      setVideoSrc(video.src);
    } else if (video.file_path) {
      // Create Supabase Storage signed URL for the video
      try {
        const { data: urlData, error } = await supabase.storage
          .from('assets')
          .createSignedUrl(video.file_path, 3600); // 1 hour expiry
        
        if (error) {
          console.error('Failed to create signed URL:', error);
          toast({
            title: "Video Load Error",
            description: "Failed to load video. Please try again.",
            variant: "destructive"
          });
        } else if (urlData?.signedUrl) {
          setVideoSrc(urlData.signedUrl);
        }
      } catch (e) {
        console.error('Error creating signed URL:', e);
        toast({
          title: "Video Load Error", 
          description: "Failed to load video. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  return (
    <div className="flex-1 overflow-hidden bg-cre8r-dark">
      {/* Use CSS flexbox instead of ResizablePanel for the outer layout to have better control */}
      <div className="flex h-full min-w-0">
        {/* Left sidebar with assets - conditionally render but preserve state */}
        <div 
          className={`transition-all duration-200 ${
            isAssetPanelVisible 
              ? 'w-1/4 min-w-[300px] opacity-100' 
              : 'w-0 opacity-0 overflow-hidden'
          }`}
        >
          <AssetPanel 
            onVideoSelect={handleVideoSelect}
          />
        </div>
        
        {/* Resizer handle - only show when asset panel is visible */}
        {isAssetPanelVisible && (
          <div className="w-1 bg-cre8r-gray-700 hover:bg-cre8r-violet transition-colors cursor-col-resize" />
        )}

        {/* Effects sidebar - conditionally render but preserve state */}
        <div 
          className={`transition-all duration-200 ${
            isEffectsPanelVisible 
              ? 'w-1/4 min-w-[300px] opacity-100' 
              : 'w-0 opacity-0 overflow-hidden'
          }`}
        >
          <EffectsSidebar />
        </div>
        
        {/* Resizer handle - only show when effects panel is visible */}
        {isEffectsPanelVisible && (
          <div className="w-1 bg-cre8r-gray-700 hover:bg-cre8r-violet transition-colors cursor-col-resize" />
        )}
        
        {/* Main content area with nested panel groups */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <ResizablePanelGroup 
            direction="vertical"
            onLayout={handleTimelineResize}
          >
            {/* Top section with preview and chat */}
            <ResizablePanel>
              <ResizablePanelGroup 
                direction="horizontal"
                onLayout={handleMainPaneResize}
              >
                {/* Video preview */}
                <ResizablePanel 
                  defaultSize={layout.preview} 
                  minSize={50}
                  className="flex-1 min-h-0"
                >
                  <VideoPlayer
                    ref={videoRef}
                    src={videoSrc}
                    currentTime={currentTime}
                    onTimeUpdate={setCurrentTime}
                    onDurationChange={() => {}} // Don't override timeline duration with video duration
                    className="h-full"
                    rightControl={<TimecodeDisplay />}
                    clips={clips}
                  />
                </ResizablePanel>
                
                {/* Divider between preview and chat */}
                <ResizableHandle withHandle className="bg-cre8r-gray-700 hover:bg-cre8r-violet transition-colors" />
                
                {/* Right panel: Chat only */}
                <ResizablePanel 
                  defaultSize={layout.chat} 
                  minSize={20}
                  className="w-1/5 min-w-[280px]"
                >
                  <ChatPanel 
                    onChatCommand={handleChatCommand} 
                    onVideoProcessed={handleVideoProcessed} 
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
            
            {/* Divider between top section and timeline */}
            <ResizableHandle withHandle className="bg-cre8r-gray-700 hover:bg-cre8r-violet transition-colors" />
            
            {/* Timeline section */}
            <ResizablePanel 
              defaultSize={layout.timeline} 
              minSize={15}
            >
              <div className="h-full flex flex-col">
                {/* Professional Timeline Header */}
                <div className="bg-cre8r-gray-900 border-b border-cre8r-gray-700 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h3 className="text-sm font-medium text-white">Timeline</h3>
                      {gesMode && (
                        <Badge className="bg-cre8r-violet/20 text-cre8r-violet border-cre8r-violet/30">
                          Professional Mode
                        </Badge>
                      )}
                      {currentGESProjectId && (
                        <Badge variant="outline" className="border-green-500/30 text-green-400">
                          GES Project Active
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {gesMode && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowLayerManager(!showLayerManager)}
                          className={`border-cre8r-gray-600 text-cre8r-gray-300 hover:bg-cre8r-gray-700 ${
                            showLayerManager ? 'bg-cre8r-gray-700' : ''
                          }`}
                        >
                          <Grid className="h-4 w-4 mr-1" />
                          Layers
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGESModeToggle(!gesMode)}
                        className="border-cre8r-gray-600 text-cre8r-gray-300 hover:bg-cre8r-gray-700"
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        {gesMode ? 'Classic Mode' : 'Pro Mode'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Timeline Content Area */}
                <div className="flex-1 flex overflow-hidden">
                  {/* GES Project Selector and Layer Manager Sidebar */}
                  {(gesMode || currentGESProjectId) && (
                    <div className="w-80 bg-cre8r-gray-800 border-r border-cre8r-gray-700 flex flex-col">
                      {/* GES Project Selector */}
                      <div className="p-3">
                        <GESProjectSelector 
                          onProjectChange={handleGESProjectChange}
                        />
                      </div>
                      
                      {/* Layer Manager */}
                      {showLayerManager && currentGESProjectId && (
                        <div className="flex-1 p-3 overflow-auto">
                          <LayerManager
                            onLayerSelect={handleLayerSelect}
                            selectedLayer={selectedLayer}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timeline Component */}
                  <div className="flex-1 overflow-hidden">
                    <Timeline
                      ref={timelineRef}
                      duration={duration}
                      currentTime={currentTime}
                      onTimeUpdate={setCurrentTime}
                      clips={clips}
                      onClipSelect={setSelectedClipId}
                      selectedClipId={selectedClipId}
                      onVideoDrop={handleVideoDrop}
                      onVideoAssetDrop={handleVideoAssetDrop}
                      onMultipleVideoAssetDrop={handleMultipleVideoAssetDrop}
                      onClipUpdate={handleClipUpdate}
                      onClipMove={handleClipMove}
                      gesMode={gesMode}
                      onGESModeToggle={handleGESModeToggle}
                      onLayerSelect={handleLayerSelect}
                      selectedLayer={selectedLayer}
                    />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
};

export default EditorContent;
