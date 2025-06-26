
import { useState } from 'react';
import { assetTabs, AssetItem } from '@/config/assetsConfig';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const AssetsTabs = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('text');

  const handleDragStart = (e: React.DragEvent, asset: AssetItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'ASSET',
      asset
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b border-cre8r-gray-700">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2 hover:bg-cre8r-gray-700 transition-colors">
        <div className="flex items-center">
          {isOpen ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
          <span className="font-medium">Assets</span>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="px-2 py-2">
        <Tabs defaultValue="text" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            {assetTabs.map(tab => (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id}
                className="text-xs py-1"
              >
                {tab.name}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {assetTabs.map(tab => (
            <TabsContent key={tab.id} value={tab.id} className="mt-2 max-h-60 overflow-y-auto">
              <div className="space-y-1">
                {tab.items.map(item => (
                  <div 
                    key={item.id}
                    className="group flex items-center p-2 rounded hover:bg-cre8r-gray-700 cursor-grab transition-colors"
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                  >
                    {item.thumbnail ? (
                      <div className="h-10 w-10 mr-3 bg-cre8r-gray-700 rounded overflow-hidden flex-shrink-0">
                        <img 
                          src={item.thumbnail} 
                          alt={item.name} 
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className={cn(
                        "h-8 w-8 mr-3 rounded flex items-center justify-center flex-shrink-0",
                        item.type === 'text' ? "bg-blue-600" : 
                        item.type === 'audio' ? "bg-purple-600" : "bg-green-600"
                      )}>
                        <span className="text-xs font-bold text-white">
                          {item.type === 'text' ? 'T' : 
                           item.type === 'audio' ? 'A' : 'V'}
                        </span>
                      </div>
                    )}
                    <span className="text-sm truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default AssetsTabs;
