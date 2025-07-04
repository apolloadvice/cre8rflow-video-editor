import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Folder, Settings, Trash2, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  useGESProjects, 
  useCurrentGESProjectId, 
  useGESProjectActions, 
  useGESAvailability,
  useGESLoading,
  useGESError 
} from '@/store/editorStore';

interface GESProjectSelectorProps {
  className?: string;
  onProjectChange?: (projectId: string | null) => void;
}

export const GESProjectSelector: React.FC<GESProjectSelectorProps> = ({
  className,
  onProjectChange
}) => {
  const gesProjects = useGESProjects();
  const currentProjectId = useCurrentGESProjectId();
  const gesAvailable = useGESAvailability();
  const isLoading = useGESLoading();
  const error = useGESError();
  
  const {
    createProject,
    loadProject,
    deleteProject,
    setCurrentProject,
    checkAvailability
  } = useGESProjectActions();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSettings, setNewProjectSettings] = useState({
    width: 1920,
    height: 1080,
    framerate: '30/1'
  });

  // Get current project
  const currentProject = currentProjectId ? gesProjects[currentProjectId] : null;
  const projectList = Object.values(gesProjects);

  // Handle project creation
  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;

    try {
      const projectId = await createProject(newProjectName, newProjectSettings);
      if (projectId) {
        setCurrentProject(projectId);
        onProjectChange?.(projectId);
        setShowCreateDialog(false);
        setNewProjectName('');
      }
    } catch (error) {
      console.error('Failed to create GES project:', error);
    }
  }, [newProjectName, newProjectSettings, createProject, setCurrentProject, onProjectChange]);

  // Handle project selection
  const handleProjectSelect = useCallback(async (projectId: string) => {
    if (projectId === currentProjectId) return;

    try {
      const success = await loadProject(projectId);
      if (success) {
        setCurrentProject(projectId);
        onProjectChange?.(projectId);
      }
    } catch (error) {
      console.error('Failed to load GES project:', error);
    }
  }, [currentProjectId, loadProject, setCurrentProject, onProjectChange]);

  // Handle project deletion
  const handleDeleteProject = useCallback(async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      try {
        const success = await deleteProject(projectId);
        if (success && currentProjectId === projectId) {
          setCurrentProject('');
          onProjectChange?.(null);
        }
      } catch (error) {
        console.error('Failed to delete GES project:', error);
      }
    }
  }, [deleteProject, currentProjectId, setCurrentProject, onProjectChange]);

  // Initialize GES if not available
  const handleInitializeGES = useCallback(async () => {
    try {
      await checkAvailability();
    } catch (error) {
      console.error('Failed to initialize GES:', error);
    }
  }, [checkAvailability]);

  if (!gesAvailable) {
    return (
      <div className={cn("bg-cre8r-gray-800 border border-cre8r-gray-700 rounded-lg p-4", className)}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">Professional Timeline</h3>
          <Badge variant="secondary" className="bg-orange-900/30 text-orange-300 border-orange-500/30">
            Initializing
          </Badge>
        </div>
        <p className="text-xs text-cre8r-gray-400 mb-3">
          GStreamer Editing Services provides professional-grade timeline features
        </p>
        <Button
          onClick={handleInitializeGES}
          disabled={isLoading}
          className="w-full bg-cre8r-violet hover:bg-cre8r-violet/80"
          size="sm"
        >
          {isLoading ? 'Initializing...' : 'Initialize Professional Timeline'}
        </Button>
        {error && (
          <p className="text-xs text-red-400 mt-2">{error}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={cn("bg-cre8r-gray-800 border border-cre8r-gray-700 rounded-lg p-4", className)}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">Professional Projects</h3>
          <div className="flex items-center gap-2">
            <Badge 
              variant="secondary" 
              className="bg-green-900/30 text-green-300 border-green-500/30"
            >
              GES Active
            </Badge>
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              className="bg-cre8r-violet hover:bg-cre8r-violet/80 h-6 w-6 p-0"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {projectList.length === 0 ? (
          <div className="text-center py-4">
            <Folder className="h-8 w-8 text-cre8r-gray-500 mx-auto mb-2" />
            <p className="text-xs text-cre8r-gray-400 mb-3">
              No professional projects yet
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              variant="outline"
              size="sm"
              className="border-cre8r-gray-600 text-cre8r-gray-300 hover:bg-cre8r-gray-700"
            >
              Create First Project
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Current project display */}
            {currentProject && (
              <div className="bg-cre8r-gray-900 border border-cre8r-violet/30 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">{currentProject.name}</span>
                  <div className="flex items-center gap-1">
                    <Badge 
                      variant="secondary"
                      className={cn(
                        "text-xs",
                        currentProject.status === 'playing' && "bg-green-900/30 text-green-300 border-green-500/30",
                        currentProject.status === 'paused' && "bg-yellow-900/30 text-yellow-300 border-yellow-500/30",
                        currentProject.status === 'idle' && "bg-gray-900/30 text-gray-300 border-gray-500/30"
                      )}
                    >
                      {currentProject.status === 'playing' && <Play className="h-3 w-3 mr-1" />}
                      {currentProject.status === 'paused' && <Pause className="h-3 w-3 mr-1" />}
                      {currentProject.status.charAt(0).toUpperCase() + currentProject.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-cre8r-gray-400">
                  <div>
                    <span className="text-cre8r-gray-500">Resolution:</span>
                    <br />
                    {currentProject.metadata.width}x{currentProject.metadata.height}
                  </div>
                  <div>
                    <span className="text-cre8r-gray-500">Clips:</span>
                    <br />
                    {Object.keys(currentProject.clips).length}
                  </div>
                  <div>
                    <span className="text-cre8r-gray-500">Duration:</span>
                    <br />
                    {Math.round(currentProject.metadata.duration)}s
                  </div>
                </div>
              </div>
            )}

            {/* Project selection */}
            <Select value={currentProjectId || ''} onValueChange={handleProjectSelect}>
              <SelectTrigger className="bg-cre8r-gray-900 border-cre8r-gray-600 text-white">
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent className="bg-cre8r-gray-900 border-cre8r-gray-600">
                {projectList.map((project) => (
                  <SelectItem 
                    key={project.id} 
                    value={project.id}
                    className="text-white hover:bg-cre8r-gray-700"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{project.name}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-xs text-cre8r-gray-400">
                          {Object.keys(project.clips).length} clips
                        </span>
                        <Button
                          onClick={(e) => handleDeleteProject(project.id, e)}
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 text-cre8r-gray-400 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading && (
          <div className="mt-3 text-center">
            <div className="text-xs text-cre8r-gray-400">Loading...</div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-cre8r-gray-900 border-cre8r-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Create Professional Project</DialogTitle>
            <DialogDescription className="text-cre8r-gray-400">
              Create a new project with GStreamer Editing Services for professional video editing features.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Project Name
              </label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My Professional Project"
                className="bg-cre8r-gray-800 border-cre8r-gray-600 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-white mb-2 block">
                  Width
                </label>
                <Select 
                  value={newProjectSettings.width.toString()} 
                  onValueChange={(value) => setNewProjectSettings(prev => ({ ...prev, width: parseInt(value) }))}
                >
                  <SelectTrigger className="bg-cre8r-gray-800 border-cre8r-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-cre8r-gray-900 border-cre8r-gray-600">
                    <SelectItem value="1920" className="text-white">1920 (1080p)</SelectItem>
                    <SelectItem value="3840" className="text-white">3840 (4K)</SelectItem>
                    <SelectItem value="1280" className="text-white">1280 (720p)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-white mb-2 block">
                  Height
                </label>
                <Select 
                  value={newProjectSettings.height.toString()} 
                  onValueChange={(value) => setNewProjectSettings(prev => ({ ...prev, height: parseInt(value) }))}
                >
                  <SelectTrigger className="bg-cre8r-gray-800 border-cre8r-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-cre8r-gray-900 border-cre8r-gray-600">
                    <SelectItem value="1080" className="text-white">1080 (1080p)</SelectItem>
                    <SelectItem value="2160" className="text-white">2160 (4K)</SelectItem>
                    <SelectItem value="720" className="text-white">720 (720p)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Frame Rate
              </label>
              <Select 
                value={newProjectSettings.framerate} 
                onValueChange={(value) => setNewProjectSettings(prev => ({ ...prev, framerate: value }))}
              >
                <SelectTrigger className="bg-cre8r-gray-800 border-cre8r-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-cre8r-gray-900 border-cre8r-gray-600">
                  <SelectItem value="24/1" className="text-white">24 fps (Cinema)</SelectItem>
                  <SelectItem value="30/1" className="text-white">30 fps (Standard)</SelectItem>
                  <SelectItem value="60/1" className="text-white">60 fps (High)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="border-cre8r-gray-600 text-cre8r-gray-300 hover:bg-cre8r-gray-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectName.trim() || isLoading}
              className="bg-cre8r-violet hover:bg-cre8r-violet/80"
            >
              {isLoading ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GESProjectSelector;