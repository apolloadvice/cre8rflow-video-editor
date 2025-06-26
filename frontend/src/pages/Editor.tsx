import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";
import EditorToolbar from "@/components/editor/EditorToolbar";
import EditorContent from "@/components/editor/EditorContent";
import EditorSidebar from "@/components/editor/EditorSidebar";
import { useEditorStore, useKeyboardShortcuts } from "@/store/editorStore";
import { useThumbnails } from "@/hooks/useThumbnails";

const Editor = () => {
  // Setup keyboard shortcuts
  useKeyboardShortcuts();
  
  // Get active video from store
  const { activeVideoAsset } = useEditorStore();
  
  // Integrate thumbnails hook
  const { thumbnailData } = useThumbnails(activeVideoAsset?.id);

  // State for asset panel visibility
  const [isAssetPanelVisible, setIsAssetPanelVisible] = useState(true);

  // Toggle asset panel visibility
  const toggleAssetPanel = () => {
    console.log('🔄 [Editor] Asset panel toggle requested. Current state:', isAssetPanelVisible);
    setIsAssetPanelVisible(prev => {
      const newState = !prev;
      console.log('🔄 [Editor] Asset panel visibility changed to:', newState);
      return newState;
    });
  };

  // Debug: Log when asset panel visibility changes
  useEffect(() => {
    console.log('📋 [Editor] Asset panel visibility state changed:', isAssetPanelVisible);
  }, [isAssetPanelVisible]);

  return (
    <div className="flex flex-col h-screen bg-cre8r-dark text-white">
      <NavBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Icon sidebar - always visible with fixed dimensions */}
        <div className="flex-shrink-0 flex-grow-0" style={{ width: '80px' }}>
          <EditorSidebar 
            onVideoIconClick={toggleAssetPanel}
            isAssetPanelVisible={isAssetPanelVisible}
          />
        </div>
        
        {/* Main content area - takes remaining space */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <EditorToolbar activeVideoName={activeVideoAsset?.name} />
          <EditorContent isAssetPanelVisible={isAssetPanelVisible} />
        </div>
      </div>
    </div>
  );
};

export default Editor;
