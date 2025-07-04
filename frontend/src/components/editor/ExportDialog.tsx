import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Download, 
  Play, 
  Clock, 
  FileVideo, 
  Settings, 
  CheckCircle, 
  AlertCircle,
  X,
  Youtube,
  Instagram,
  Smartphone,
  Monitor,
  Tv,
  Camera
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  ExportProfile, 
  ExportJob, 
  getExportProfiles, 
  getExportJobs, 
  startProfessionalExport, 
  cancelExportJob,
  downloadExport 
} from '@/api/apiClient';

interface ExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  timeline: any;
  duration?: number;
}

const categoryIcons = {
  social_media: Youtube,
  web: Monitor,
  mobile: Smartphone,
  broadcast: Tv,
  cinema: Camera,
  archive: FileVideo,
  custom: Settings
};

const categoryColors = {
  social_media: 'bg-red-500',
  web: 'bg-blue-500', 
  mobile: 'bg-green-500',
  broadcast: 'bg-purple-500',
  cinema: 'bg-yellow-500',
  archive: 'bg-gray-500',
  custom: 'bg-orange-500'
};

const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onOpenChange,
  timeline,
  duration = 60
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('profiles');
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ExportProfile | null>(null);
  const [customFilename, setCustomFilename] = useState('');
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Load export profiles
  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const response = await getExportProfiles();
        const profilesData = response.data;
        setProfiles(profilesData);
        // Auto-select YouTube 1080p as default
        const defaultProfile = profilesData.find((p: ExportProfile) => p.id === 'youtube_1080p_h264');
        if (defaultProfile) {
          setSelectedProfile(defaultProfile);
        }
      } catch (error) {
        console.error('Failed to load export profiles:', error);
        toast({
          title: "Error",
          description: "Failed to load export profiles",
          variant: "destructive"
        });
      }
    };

    if (isOpen) {
      loadProfiles();
      loadExportJobs();
    }
  }, [isOpen, toast]);

  // Load export jobs
  const loadExportJobs = async () => {
    try {
      const response = await getExportJobs();
      setExportJobs(response.data);
    } catch (error) {
      console.error('Failed to load export jobs:', error);
    }
  };

  // Filter profiles by category
  const filteredProfiles = profiles.filter(profile => 
    selectedCategory === 'all' || profile.category === selectedCategory
  );

  // Get unique categories
  const categories = ['all', ...new Set(profiles.map(p => p.category))];

  // Start export
  const handleExport = async () => {
    if (!selectedProfile || !timeline) {
      toast({
        title: "Error",
        description: "Please select a profile and ensure timeline is available",
        variant: "destructive"
      });
      return;
    }

    setIsExporting(true);
    try {
      const exportRequest = {
        timeline: timeline,
        profile_id: selectedProfile.id,
        output_filename: customFilename || undefined
      };

      const response = await startProfessionalExport(exportRequest);

      if (response.data.success) {
        toast({
          title: "Export Started",
          description: `Export started with ${selectedProfile.name}`,
        });
        
        // Switch to jobs tab to show progress
        setActiveTab('jobs');
        loadExportJobs();
        
        // Poll for job updates
        const pollInterval = setInterval(async () => {
          await loadExportJobs();
          const jobsResponse = await getExportJobs();
          const currentJob = jobsResponse.data.find((j: ExportJob) => j.job_id === response.data.job_id);
          
          if (currentJob && (currentJob.status === 'completed' || currentJob.status === 'failed')) {
            clearInterval(pollInterval);
            if (currentJob.status === 'completed') {
              toast({
                title: "Export Completed",
                description: "Your video export is ready for download",
              });
            }
          }
        }, 2000);

      } else {
        throw new Error(response.data.message || 'Export failed');
      }
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.response?.data?.detail || "Failed to start export",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Download export
  const handleDownload = async (job: ExportJob) => {
    try {
      const response = await downloadExport(job.job_id);
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${job.job_id}.${selectedProfile?.container || 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download export file",
        variant: "destructive"
      });
    }
  };

  // Cancel export
  const handleCancelExport = async (job: ExportJob) => {
    try {
      await cancelExportJob(job.job_id);
      toast({
        title: "Export Cancelled",
        description: "Export job has been cancelled",
      });
      loadExportJobs();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel export",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'processing': return 'text-blue-500';
      case 'cancelled': return 'text-gray-500';
      default: return 'text-yellow-500';
    }
  };

  const formatFileSize = (sizeInMB: number) => {
    if (sizeInMB < 1024) {
      return `${sizeInMB.toFixed(1)} MB`;
    }
    return `${(sizeInMB / 1024).toFixed(1)} GB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-cre8r-gray-900 border-cre8r-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileVideo className="w-5 h-5" />
            Professional Export
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-3 bg-cre8r-gray-800">
            <TabsTrigger value="profiles" className="text-white">Export Profiles</TabsTrigger>
            <TabsTrigger value="settings" className="text-white">Settings</TabsTrigger>
            <TabsTrigger value="jobs" className="text-white">Export Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles" className="flex-1 mt-4">
            <div className="space-y-4">
              {/* Category Filter */}
              <div className="flex gap-2 flex-wrap">
                {categories.map(category => {
                  const Icon = categoryIcons[category as keyof typeof categoryIcons] || Settings;
                  return (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                      className="capitalize"
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {category.replace('_', ' ')}
                    </Button>
                  );
                })}
              </div>

              {/* Profiles Grid */}
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-4">
                  {filteredProfiles.map(profile => {
                    const Icon = categoryIcons[profile.category as keyof typeof categoryIcons] || Settings;
                    const isSelected = selectedProfile?.id === profile.id;
                    
                    return (
                      <div
                        key={profile.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-cre8r-violet bg-cre8r-violet/10' 
                            : 'border-cre8r-gray-700 bg-cre8r-gray-800 hover:border-cre8r-gray-600'
                        }`}
                        onClick={() => setSelectedProfile(profile)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded ${categoryColors[profile.category as keyof typeof categoryColors]} text-white`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="font-medium text-white">{profile.name}</h3>
                              <p className="text-sm text-cre8r-gray-400 mt-1">
                                {profile.description}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle className="w-5 h-5 text-cre8r-violet" />
                          )}
                        </div>

                        <div className="mt-3 flex gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {profile.resolution}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {profile.framerate} fps
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {profile.container.toUpperCase()}
                          </Badge>
                          {profile.platform_optimized && (
                            <Badge className="text-xs bg-green-500">
                              Platform Optimized
                            </Badge>
                          )}
                        </div>

                        {profile.file_size_estimate && (
                          <p className="text-xs text-cre8r-gray-400 mt-2">
                            {profile.file_size_estimate}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            {selectedProfile && (
              <div className="space-y-6">
                <Alert className="bg-cre8r-gray-800 border-cre8r-gray-700">
                  <Settings className="h-4 w-4" />
                  <AlertDescription className="text-white">
                    Selected Profile: <strong>{selectedProfile.name}</strong>
                    <br />
                    {selectedProfile.description}
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="filename" className="text-white">Custom Filename (optional)</Label>
                    <Input
                      id="filename"
                      value={customFilename}
                      onChange={(e) => setCustomFilename(e.target.value)}
                      placeholder={`export_${selectedProfile.id}`}
                      className="mt-1 bg-cre8r-gray-800 border-cre8r-gray-700 text-white"
                    />
                    <p className="text-sm text-cre8r-gray-400 mt-1">
                      File extension (.{selectedProfile.container}) will be added automatically
                    </p>
                  </div>

                  <Separator className="bg-cre8r-gray-700" />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-white">Resolution</Label>
                      <p className="text-cre8r-gray-400">{selectedProfile.resolution}</p>
                    </div>
                    <div>
                      <Label className="text-white">Frame Rate</Label>
                      <p className="text-cre8r-gray-400">{selectedProfile.framerate} fps</p>
                    </div>
                    <div>
                      <Label className="text-white">Container</Label>
                      <p className="text-cre8r-gray-400">{selectedProfile.container.toUpperCase()}</p>
                    </div>
                    <div>
                      <Label className="text-white">Quality</Label>
                      <p className="text-cre8r-gray-400 capitalize">{selectedProfile.estimated_quality}</p>
                    </div>
                  </div>

                  <Separator className="bg-cre8r-gray-700" />

                  <div>
                    <Label className="text-white">Estimated Export Time</Label>
                    <p className="text-cre8r-gray-400">
                      <Clock className="w-4 h-4 inline mr-1" />
                      {Math.ceil(duration / 10)} - {Math.ceil(duration / 5)} minutes
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 pr-4">
                {exportJobs.length === 0 ? (
                  <div className="text-center py-8 text-cre8r-gray-400">
                    <FileVideo className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No export jobs yet</p>
                  </div>
                ) : (
                  exportJobs.map(job => (
                    <div
                      key={job.job_id}
                      className="p-4 border border-cre8r-gray-700 rounded-lg bg-cre8r-gray-800"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-medium text-white">
                            {profiles.find(p => p.id === job.profile_id)?.name || job.profile_id}
                          </h3>
                          <p className="text-sm text-cre8r-gray-400">
                            Created: {new Date(job.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium capitalize ${getStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                          {job.status === 'processing' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancelExport(job)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                          {job.status === 'completed' && (
                            <Button
                              size="sm"
                              onClick={() => handleDownload(job)}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          )}
                        </div>
                      </div>

                      {job.status === 'processing' && (
                        <div className="space-y-2">
                          <Progress value={job.progress} className="w-full" />
                          <p className="text-xs text-cre8r-gray-400">
                            {job.progress.toFixed(0)}% complete
                          </p>
                        </div>
                      )}

                      {job.error_message && (
                        <Alert className="mt-2 bg-red-900/20 border-red-900">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-red-400">
                            {job.error_message}
                          </AlertDescription>
                        </Alert>
                      )}

                      {job.file_size_mb && (
                        <p className="text-xs text-cre8r-gray-400 mt-2">
                          File size: {formatFileSize(job.file_size_mb)}
                          {job.estimated_size_mb && ` (estimated: ${formatFileSize(job.estimated_size_mb)})`}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-cre8r-gray-800 border-cre8r-gray-700 text-white hover:bg-cre8r-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={!selectedProfile || isExporting}
            className="bg-cre8r-violet hover:bg-cre8r-violet/90"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                Starting Export...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start Export
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;