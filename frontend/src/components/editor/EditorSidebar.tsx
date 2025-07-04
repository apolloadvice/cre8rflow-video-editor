import React, { useState } from 'react';
import { 
  Video, 
  Type, 
  Music, 
  Image, 
  MessageSquare, 
  Layers,
  Wand2
} from 'lucide-react';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
}

interface EditorSidebarProps {
  onVideoIconClick?: () => void;
  isAssetPanelVisible?: boolean;
  onEffectsIconClick?: () => void;
  isEffectsPanelVisible?: boolean;
}

const sidebarItems: SidebarItem[] = [
  { id: 'video', label: 'Video', icon: Video },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'sounds', label: 'Sounds', icon: Music },
  { id: 'media', label: 'Media', icon: Image },
  { id: 'captions', label: 'Captions', icon: MessageSquare },
  { id: 'layers', label: 'Layers', icon: Layers },
];

const EditorSidebar = ({ onVideoIconClick, isAssetPanelVisible = true, onEffectsIconClick, isEffectsPanelVisible = false }: EditorSidebarProps) => {
  const [selectedItem, setSelectedItem] = useState('video');

  return (
    <div className="w-20 h-full bg-cre8r-gray-800 border-r border-cre8r-gray-700 flex flex-col items-center py-4 space-y-4 relative overflow-hidden">
      {/* Background layer with gradient - properly contained */}
      <div className="absolute inset-0 bg-gradient-to-b from-cre8r-gray-800 via-cre8r-violet/10 to-cre8r-violet-dark/20 pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col items-center space-y-4">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const isSelected = selectedItem === item.id;
          const isVideoIcon = item.id === 'video';
          const isEffectsIcon = item.id === 'effects';
          
          // Handle click based on item type
          const handleClick = () => {
            if (isVideoIcon && onVideoIconClick) {
              onVideoIconClick();
              // Don't change selected state when toggling asset panel
            } else if (isEffectsIcon && onEffectsIconClick) {
              onEffectsIconClick();
              // Don't change selected state when toggling effects panel
            } else {
              setSelectedItem(item.id);
            }
          };
          
          // For video and effects icons, only show as "selected/active" if respective panel is actually visible
          const shouldShowAsActive = isSelected && 
            (!isVideoIcon || isAssetPanelVisible) && 
            (!isEffectsIcon || isEffectsPanelVisible);
          
          if (shouldShowAsActive) {
            return (
              <div
                key={item.id}
                className="flex flex-col items-center space-y-1 cursor-pointer"
                onClick={handleClick}
              >
                <div
                  className="w-12 h-12 rounded-full bg-sidebar-active flex items-center justify-center cursor-pointer hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl"
                  style={{
                    boxShadow: '0 0 15px rgba(127, 127, 213, 0.8), 0 0 30px rgba(127, 127, 213, 0.4)'
                  }}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs text-white font-medium">
                  {item.label}
                </span>
              </div>
            );
          }
          
          return (
            <div
              key={item.id}
              className="flex flex-col items-center space-y-1 cursor-pointer hover:bg-nav-item rounded-lg p-2 transition-all group"
              onClick={handleClick}
            >
              <div className="w-10 h-10 bg-quick-action-btn rounded-lg flex items-center justify-center group-hover:bg-nav-item-active transition-all backdrop-blur-sm border border-cre8r-violet/20">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs text-cre8r-gray-300 group-hover:text-white transition-colors">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EditorSidebar; 