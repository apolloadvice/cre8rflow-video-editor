
export interface AssetItem {
  id: string;
  name: string;
  type: string;
  thumbnail?: string;
  duration?: number;
  source?: string;
}

export interface AssetTab {
  id: string;
  name: string;
  items: AssetItem[];
}

export const assetTabs: AssetTab[] = [
  {
    id: 'text',
    name: 'Text',
    items: [
      { id: 'text-1', name: 'Headline', type: 'text' },
      { id: 'text-2', name: 'Caption', type: 'text' },
      { id: 'text-3', name: 'CTA', type: 'text' }
    ]
  },
  {
    id: 'sounds',
    name: 'Sounds',
    items: [
      { id: 'sound-1', name: 'Pop', type: 'audio' },
      { id: 'sound-2', name: 'Whoosh', type: 'audio' },
      { id: 'sound-3', name: 'Swoosh', type: 'audio' }
    ]
  },
  {
    id: 'media',
    name: 'Media',
    items: [
      { 
        id: 'media-1', 
        name: 'Laptop Scene', 
        type: 'video',
        thumbnail: 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=800&q=80'
      },
      { 
        id: 'media-2', 
        name: 'Workspace', 
        type: 'video',
        thumbnail: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80'
      },
      { 
        id: 'media-3', 
        name: 'Programming', 
        type: 'video',
        thumbnail: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=800&q=80'
      }
    ]
  }
];

// Can easily add new tabs here
export const addAssetTab = (tab: AssetTab) => {
  assetTabs.push(tab);
};

// Can easily add new items to existing tabs
export const addAssetItem = (tabId: string, item: AssetItem) => {
  const tab = assetTabs.find(t => t.id === tabId);
  if (tab) {
    tab.items.push(item);
  }
};
