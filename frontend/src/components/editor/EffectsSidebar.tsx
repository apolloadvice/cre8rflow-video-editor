import React from 'react';
import { EffectsPanel } from './EffectsPanel';
import { useEditorStore } from '@/store/editorStore';

interface EffectsSidebarProps {
  className?: string;
}

const EffectsSidebar: React.FC<EffectsSidebarProps> = ({ className = "" }) => {
  const { selectedClipId } = useEditorStore();

  return (
    <div className={`bg-cre8r-gray-800 border-r border-cre8r-gray-700 flex flex-col h-full ${className}`}>
      <div className="p-4 border-b border-cre8r-gray-700">
        <h2 className="text-lg font-semibold text-white">Effects</h2>
        <p className="text-sm text-cre8r-gray-400 mt-1">
          {selectedClipId ? 'Apply effects to selected clip' : 'Select a clip to add effects'}
        </p>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <EffectsPanel 
          selectedClipId={selectedClipId}
          onEffectChange={(clipId, effects) => {
            console.log(`Effects updated for clip ${clipId}:`, effects);
            // TODO: Update clip effects in store if needed
          }}
        />
      </div>
    </div>
  );
};

export default EffectsSidebar; 