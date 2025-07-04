import React, { useState } from 'react';
import { useTimelineSync } from '../hooks/useTimelineSync';
import { useEditorStore } from '../store/editorStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { useToast } from '../hooks/use-toast';

/**
 * Demo component showcasing the useTimelineSync hook functionality
 * This demonstrates how to save and load timeline data using the new v2.0 schema
 */
export const TimelineSyncDemo: React.FC = () => {
  const { toast } = useToast();
  const { clips, activeVideoAsset } = useEditorStore();
  const [assetPath, setAssetPath] = useState('test-project.mp4');
  const [isLoading, setIsLoading] = useState(false);
  const [syncStats, setSyncStats] = useState<any>(null);

  // Initialize the timeline sync hook with options
  const {
    saveTimeline,
    loadTimeline,
    loadTimelineRobust,
    syncTimeline,
    createTimelineData,
    parseTimelineData,
    currentClipsCount,
    hasActiveAsset,
    isAutoSaveEnabled
  } = useTimelineSync({
    validateAssets: true,
    allowPartialLoad: true,
    autoSave: false,
    autoSaveInterval: 30000
  });

  const handleSaveTimeline = async () => {
    setIsLoading(true);
    try {
      const result = await saveTimeline(assetPath);
      
      if (result.success) {
        toast({
          title: "Timeline Saved",
          description: result.message,
          variant: "default"
        });
      } else {
        toast({
          title: "Save Failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Save Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadTimeline = async () => {
    setIsLoading(true);
    try {
      const result = await loadTimeline(assetPath);
      
      if (result.success) {
        toast({
          title: "Timeline Loaded",
          description: `${result.clips?.length || 0} clips loaded`,
          variant: "default"
        });
      } else {
        toast({
          title: "Load Failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Load Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadTimelineRobust = async () => {
    setIsLoading(true);
    try {
      const result = await loadTimelineRobust(assetPath);
      
      if (result.success) {
        setSyncStats(result.stats);
        toast({
          title: "Timeline Loaded (Robust)",
          description: `${result.clips?.length || 0} clips loaded with validation`,
          variant: "default"
        });
      } else {
        toast({
          title: "Robust Load Failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Robust Load Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncTimeline = async () => {
    setIsLoading(true);
    try {
      const result = await syncTimeline(assetPath);
      
      if (result.success) {
        toast({
          title: "Timeline Synchronized",
          description: result.message,
          variant: "default"
        });
      } else {
        toast({
          title: "Sync Failed",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Sync Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewSchema = () => {
    const timelineData = createTimelineData(clips, assetPath);
    console.log('📊 [TimelineSyncDemo] Generated Timeline Schema:', timelineData);
    
    toast({
      title: "Schema Generated",
      description: "Check console for timeline schema preview",
      variant: "default"
    });
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Timeline Sync Demo</CardTitle>
          <CardDescription>
            Demonstrates the useTimelineSync hook with enhanced GES-compatible schema v2.0
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Asset Path Input */}
          <div className="space-y-2">
            <label htmlFor="asset-path" className="text-sm font-medium">
              Asset Path
            </label>
            <Input
              id="asset-path"
              value={assetPath}
              onChange={(e) => setAssetPath(e.target.value)}
              placeholder="Enter asset path..."
              className="w-full"
            />
          </div>

          {/* Status Information */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{currentClipsCount}</div>
                <p className="text-xs text-muted-foreground">Current Clips</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {hasActiveAsset ? '✓' : '✗'}
                </div>
                <p className="text-xs text-muted-foreground">Active Asset</p>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button 
              onClick={handleSaveTimeline}
              disabled={isLoading || !assetPath}
              variant="default"
            >
              {isLoading ? 'Saving...' : 'Save Timeline'}
            </Button>
            
            <Button 
              onClick={handleLoadTimeline}
              disabled={isLoading || !assetPath}
              variant="outline"
            >
              {isLoading ? 'Loading...' : 'Load Timeline'}
            </Button>
            
            <Button 
              onClick={handleLoadTimelineRobust}
              disabled={isLoading || !assetPath}
              variant="secondary"
            >
              {isLoading ? 'Loading...' : 'Load (Robust)'}
            </Button>
            
            <Button 
              onClick={handleSyncTimeline}
              disabled={isLoading || !assetPath}
              variant="default"
            >
              {isLoading ? 'Syncing...' : 'Sync Timeline'}
            </Button>
          </div>

          {/* Utility Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={handlePreviewSchema}
              variant="ghost"
              size="sm"
            >
              Preview Schema
            </Button>
          </div>

          {/* Sync Statistics */}
          {syncStats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loading Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm bg-muted p-3 rounded overflow-auto">
                  {JSON.stringify(syncStats, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Current Timeline Preview */}
          {clips.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Current Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {clips.map((clip, index) => (
                    <div key={clip.id} className="flex justify-between items-center p-2 bg-muted rounded">
                      <div>
                        <span className="font-medium">{clip.name}</span>
                        <span className="text-sm text-muted-foreground ml-2">
                          Track {clip.track}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {clip.start}s - {clip.end}s ({clip.duration}s)
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feature Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hook Features</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                <li>✅ GES-compatible v2.0 schema</li>
                <li>✅ Robust loading with validation</li>
                <li>✅ Auto-save functionality (configurable)</li>
                <li>✅ Asset validation and error recovery</li>
                <li>✅ Performance metrics and loading stats</li>
                <li>✅ Seamless frontend-backend sync</li>
                <li>✅ History management integration</li>
                <li>Auto-save: {isAutoSaveEnabled ? 'Enabled' : 'Disabled'}</li>
              </ul>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}; 