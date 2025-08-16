import React, { useState, useEffect, useRef } from 'react';
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
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  ExportProfile, 
  ExportJob, 
  getExportProfiles, 
  getExportJobs, 
  getExportJobsSilent, 
  startProfessionalExport, 
  cancelExportJob,
  downloadExport 
} from '@/api/apiClient';
import { useExportIntervalTree, serializeExportIntervals, debugExportIntervals } from '@/hooks/useExportIntervalTree';
import { useExportJobProgress, useVideoProgressAnimation } from '@/hooks/useSmoothedProgress';
import { useMultiTrackExport } from '@/hooks/useMultiTrackExport';

interface ExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  timeline: any;
  duration?: number;
}

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
  const [isStartingExport, setIsStartingExport] = useState(false);
  const [startingJobId, setStartingJobId] = useState<string | null>(null);
  const [startingJobPlaceholder, setStartingJobPlaceholder] = useState<ExportJob | null>(null);
  const [jobStartSignals, setJobStartSignals] = useState<Record<string, number>>({});
  // UI-only progress animation decoupled from backend/polling
  const [uiStartSignal, setUiStartSignal] = useState<number | null>(null);
  const uiProgress = useVideoProgressAnimation('processing', duration, uiStartSignal || undefined);
  
  // Export integrations
  const exportTree = useExportIntervalTree();  // Legacy timeline export
  const multiTrackExport = useMultiTrackExport();  // NEW: Multi-track export

  // Individual job progress component with smooth animation
  const JobProgressDisplay: React.FC<{ job: ExportJob; startSignal?: number }> = ({ job, startSignal }) => {
    const smoothProgress = useExportJobProgress({ status: job.status }, duration, startSignal);
    
    // Get stage message based on smooth progress
    const getStageMessage = (progress: number): string => {
      if (job.status === 'completed') return 'Export completed';
      if (job.status === 'failed') return 'Export failed';
      if (job.status === 'queued') return 'Queued for processing';
      if (job.status === 'cancelled') return 'Export cancelled';
      
      let message = '';
      if (progress < 25) message = 'Starting export...';
      else if (progress < 35) message = 'Downloading source files...';
      else if (progress < 45) message = 'Preparing video segments...';
      else if (progress < 50) message = 'Analyzing video streams...';
      else if (progress < 65) message = 'Building processing filters...';
      else if (progress < 85) message = 'Processing video...';
      else if (progress < 95) message = 'Finalizing export...';
      else message = 'Finalizing export...';
      
      return message;
    };

    return (
      <>
        <Progress value={smoothProgress} className="w-full" />
        <div className="flex justify-between items-center">
          <p className="text-xs text-cre8r-gray-400">
            {smoothProgress.toFixed(0)}% complete
          </p>
          <p className="text-xs text-cre8r-gray-300 font-medium">
            {getStageMessage(smoothProgress)}
          </p>
        </div>
      </>
    );
  };

  // Simple helper for debug logging (not used for display)
  const getJobStatusForLogging = (job: ExportJob): string => {
    if (job.status === 'completed') return 'Export completed';
    if (job.status === 'failed') return 'Export failed';
    if (job.status === 'processing') return 'Processing...';
    return job.status;
  };

  // Load export profiles
  useEffect(() => {
    const loadProfiles = async () => {
      try {
        const response = await getExportProfiles();
        const profilesData = response.data;
        setProfiles(profilesData);
        // Auto-select a default profile (previously YouTube 1080p). We will present this generically.
        const defaultProfile = profilesData.find((p: ExportProfile) => p.id === 'youtube_1080p_h264') || profilesData[0];
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
      (async () => {
        await loadExportJobs();
        // If there is any processing job, default to jobs tab to observe progress
        const hasProcessing = exportJobs.some(j => j.status === 'processing');
        if (hasProcessing) setActiveTab('jobs');
      })();
    }
  }, [isOpen, toast]);

  // Load export jobs
  const loadExportJobs = async () => {
    try {
      const response = await getExportJobs();
      // Sort newest first so the most recent job is visible
      let jobs = [...response.data].sort((a: ExportJob, b: ExportJob) => {
        const at = new Date(a.created_at).getTime();
        const bt = new Date(b.created_at).getTime();
        return bt - at;
      });

      // If we're in the middle of starting an export and the server hasn't returned the job yet,
      // keep the local placeholder visible so the progress animation continues seamlessly.
      if (isStartingExport && startingJobId && startingJobPlaceholder) {
        const hasRealStartingJob = jobs.some(j => j.job_id === startingJobId);
        if (!hasRealStartingJob) {
          // Prepend the placeholder and filter out any duplicate IDs
          const merged = [startingJobPlaceholder, ...jobs.filter(j => j.job_id !== startingJobPlaceholder.job_id)];
          setExportJobs(merged);
          return;
        } else {
          // Attach clientKey from placeholder to the real job so React key remains stable
          jobs = jobs.map(j => (j.job_id === startingJobId ? ({ ...(j as any), clientKey: (startingJobPlaceholder as any).clientKey }) : j));
          setExportJobs(jobs);
          // We now have the real job; clear placeholder and stop local starting flag
          setStartingJobPlaceholder(null);
          setIsStartingExport(false);
          return;
        }
      } else {
        setExportJobs(jobs);
      }

      if (isStartingExport && startingJobId) {
        // Additional safety: stop the flag if real job present
        const hasRealStartingJob = jobs.some(j => j.job_id === startingJobId);
        if (hasRealStartingJob) setIsStartingExport(false);
      }
    } catch (error) {
      console.error('Failed to load export jobs:', error);
    }
  };

  // Load export jobs silently (for routine polling)
  const loadExportJobsSilent = async () => {
    try {
      const response = await getExportJobsSilent();
      // Sort newest first so the most recent job is visible
      const jobs = [...response.data].sort((a: ExportJob, b: ExportJob) => {
        const at = new Date(a.created_at).getTime();
        const bt = new Date(b.created_at).getTime();
        return bt - at;
      });
      setExportJobs(jobs);
    } catch (error) {
      console.error('Failed to load export jobs silently:', error);
      // Fall back to regular loading on error
      await loadExportJobs();
    }
  };

  // Smart polling while dialog is open
  useEffect(() => {
    if (!isOpen) return;
    
    // Initial fetch (always logs)
    loadExportJobs();
    
    let intervalId: NodeJS.Timeout;
    let isFirstPoll = true;
    
    const scheduleNextPoll = () => {
      const hasActiveJobs = exportJobs.some(job => job.status === 'processing');
      
      // Dynamic intervals: 500ms for active jobs, 3s for completed/idle
      const interval = hasActiveJobs ? 500 : 3000;
      
      intervalId = setTimeout(async () => {
        // Use silent polling for routine requests (after the first one)
        if (!isFirstPoll) {
          console.log('🔇 Using silent polling to reduce log noise');
          await loadExportJobsSilent(); // Silent polling to reduce log noise
        } else {
          console.log('📢 Using normal polling for initial request');
          await loadExportJobs(); // First poll logs normally
          isFirstPoll = false;
        }
        scheduleNextPoll(); // Reschedule with updated interval
      }, interval);
    };
    
    scheduleNextPoll();
    
    return () => {
      if (intervalId) clearTimeout(intervalId);
    };
  }, [isOpen, exportJobs]);

  // Track previous job states to detect completion
  const previousJobStates = useRef<Record<string, number | string>>({});

  // Watch for job completion and show toast notification (only once per job)
  useEffect(() => {
    if (!isOpen || exportJobs.length === 0) return;
    
    // Check for newly completed/failed jobs by comparing with previous states
    exportJobs.forEach(job => {
      const prevStatus = previousJobStates.current[job.job_id];
      
      // Get previous progress for comparison
      const prevProgressRaw = previousJobStates.current[job.job_id + '_progress'];
      const prevProgress = typeof prevProgressRaw === 'number' ? prevProgressRaw : Number(prevProgressRaw) || 0;
      const progressChanged = Math.abs((Number(job.progress) || 0) - prevProgress) > 5;
      const statusChanged = job.status !== prevStatus;
      
      if (statusChanged || progressChanged) {
        console.log('🍞 Toast Check Debug:', {
          jobId: job.job_id,
          status: job.status,
          prevStatus: prevStatus,
          progress: job.progress,
          prevProgress: prevProgress,
          stageMessage: getJobStatusForLogging(job)
        });
      }

      // Start the local simulation exactly when a job is first observed as 'queued'
      if (job.status === 'queued' && !previousJobStates.current[job.job_id] && !jobStartSignals[job.job_id]) {
        setJobStartSignals(prev => ({ ...prev, [job.job_id]: Date.now() }));
      }
      
      // Only show toast for NEWLY completed jobs (status changed to completed)
      if (job.status === 'completed' && prevStatus !== 'completed') {
        console.log('✅ Showing completion toast for job:', job.job_id);
        toast({
          title: "Export Completed",
          description: "Your video export is ready for download",
        });
      } else if (job.status === 'failed' && prevStatus !== 'failed') {
        console.log('❌ Showing failure toast for job:', job.job_id);
        toast({
          title: "Export Failed",
          description: job.error_message || "Export processing failed",
          variant: "destructive"
        });
      }
      
      // Update tracked state for next comparison
      previousJobStates.current[job.job_id] = job.status;
      previousJobStates.current[job.job_id + '_progress'] = job.progress ?? 0;
    });
  }, [exportJobs, isOpen, toast]);

  // Start export
  const handleExport = async () => {
    if (!selectedProfile || !timeline) {
      toast({
        title: "Error",
        description: "Please ensure timeline is available",
        variant: "destructive"
      });
      return;
    }

    console.log('🟢 [ExportUI] Start Export clicked');

    // Start client-side progress immediately when the user clicks
    setIsExporting(true);
    setIsStartingExport(true); // Start progress animation immediately
    const uiSignal = Date.now();
    setUiStartSignal(uiSignal);
    console.log('🟢 [ExportUI] uiStartSignal set:', uiSignal);

    // Immediately create a temporary placeholder job so progress starts instantly
    const tempJobId = `pending_${Date.now()}`;
    const tempJob: ExportJob = {
      job_id: tempJobId,
      status: 'queued',
      profile_id: selectedProfile.id,
      output_path: '',
      progress: 0,
      created_at: new Date().toISOString(),
    } as ExportJob;

    // Add a stable clientKey so the row doesn't remount when job_id changes
    (tempJob as any).clientKey = tempJobId;

    // CRITICAL: Set all state synchronously to prevent race conditions
    setStartingJobId(tempJobId);
    setStartingJobPlaceholder(tempJob);
    setJobStartSignals(prev => ({ ...prev, [tempJobId]: uiSignal }));
    setActiveTab('jobs');
    setExportJobs(prev => [tempJob, ...prev]);

    console.log('🚀 [Progress] Starting progress animation immediately for temp job:', tempJobId);

    try {
      // Determine export method: Multi-track or legacy
      let exportRequest: any;
      let exportDescription: string;
      
      if (multiTrackExport.isTimelineReadyForExport()) {
        // PRIORITY 1: Use multi-track export for professional composition
        console.log('🎬 [ExportUI] Using multi-track export system');
        
        const validation = multiTrackExport.validateTimelineForExport();
        if (!validation.isValid) {
          toast({
            title: "Multi-Track Export Error",
            description: validation.errors.join(', '),
            variant: "destructive"
          });
          // Cleanup the temporary job
          setExportJobs(prev => prev.filter(j => j.job_id !== tempJobId));
          setStartingJobId(null);
          setStartingJobPlaceholder(null);
          setIsStartingExport(false);
          setIsExporting(false);
          return;
        }
        
        const multitrackIntervals = multiTrackExport.buildExportIntervals();
        const timelineStats = multiTrackExport.getTimelineStats();
        
        console.log('🎬 [Export] Multi-track timeline stats:', timelineStats);
        console.log('🎬 [Export] Multi-track intervals:', multitrackIntervals.length);
        
        exportRequest = {
          timeline: timeline,                          // Keep for backward compatibility
          multitrack_intervals: multitrackIntervals,   // NEW: Multi-track intervals
          profile_id: selectedProfile.id,
          output_filename: customFilename || undefined
        };
        
        exportDescription = `Multi-track export: ${timelineStats?.activeTracks} tracks, ${timelineStats?.totalElements} elements`;
        
      } else {
        // FALLBACK: Use legacy export system
        console.log('🟣 [ExportUI] Using legacy export system (no multi-track content)');
        
        const exportIntervals = exportTree.buildExportIntervals();
        const exportSummary = exportTree.getExportSummary();
        
        // Validate export content
        if (exportSummary.isEmpty) {
          toast({
            title: "Export Error", 
            description: exportSummary.message,
            variant: "destructive"
          });
          // Cleanup the temporary job
          setExportJobs(prev => prev.filter(j => j.job_id !== tempJobId));
          setStartingJobId(null);
          setStartingJobPlaceholder(null);
          setIsStartingExport(false);
          setIsExporting(false);
          return;
        }
        
        console.log('🎬 [Export] Legacy export intervals:');
        debugExportIntervals(exportIntervals);
        
        exportRequest = {
          timeline: timeline,                                    // Keep for backward compatibility
          intervals: serializeExportIntervals(exportIntervals), // Frame-accurate intervals
          profile_id: selectedProfile.id,
          output_filename: customFilename || undefined
        };
        
        exportDescription = exportSummary.message;
      }

      console.log('🟣 [ExportUI] Calling startProfessionalExport');
      const response = await startProfessionalExport(exportRequest);
      console.log('🟣 [ExportUI] startProfessionalExport returned', response.data);

      if (response.data.success) {
        toast({
          title: "Export Started",
          description: `Export started - ${exportDescription}`,
        });
        
        // Replace the temporary job with the real job_id so the animation continues seamlessly
        const realJobId = response.data.job_id;
        console.log('🟢 [ExportUI] Swapping temp job to real job id', { tempJobId, realJobId });
        setExportJobs(prev => {
          const replaced = prev.map(j => (
            j.job_id === tempJobId ? ({ ...(j as any), job_id: realJobId }) : j
          ));
          // Ensure no duplicate with the same real id
          const deduped = [] as ExportJob[];
          const seen = new Set<string>();
          for (const j of replaced) {
            if (!seen.has(j.job_id)) {
              deduped.push(j);
              seen.add(j.job_id);
            }
          }
          return deduped;
        });
        setStartingJobId(realJobId);
        // Update placeholder to mirror the new real job id so merge logic stays consistent
        setStartingJobPlaceholder(prev => (prev ? { ...prev, job_id: realJobId } as ExportJob : prev));
        // Transfer startSignal from placeholder ID to real job ID
        setJobStartSignals(prev => {
          const next = { ...prev };
          if (next[tempJobId] && !next[realJobId]) {
            next[realJobId] = next[tempJobId];
          }
          delete next[tempJobId];
          console.log('🟢 [ExportUI] Transferred startSignal', next[realJobId]);
          return next;
        });

        await loadExportJobs();
        // Now that jobs have loaded, clear local starting flag
        setIsStartingExport(false);
        
        // The dynamic polling system above will handle job completion detection
      } else {
        throw new Error(response.data.message || 'Export failed');
      }
    } catch (error: any) {
      console.error('🔴 [ExportUI] Export start failed', error);
      toast({
        title: "Export Failed",
        description: error.response?.data?.detail || "Failed to start export",
        variant: "destructive"
      });
      // Remove the temporary job on failure
      setExportJobs(prev => prev.filter(j => j.job_id !== tempJobId));
      setStartingJobId(null);
      setStartingJobPlaceholder(null);
      setIsStartingExport(false);
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

  useEffect(() => {
    // When a job completes, clear starting flags to avoid flicker
    const hasCompleted = exportJobs.some(j => j.status === 'completed');
    if (hasCompleted) {
      setIsStartingExport(false);
      setStartingJobId(null);
    }
  }, [exportJobs]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-cre8r-gray-900 border-cre8r-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileVideo className="w-5 h-5" />
            Export
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-3 bg-cre8r-gray-800">
            <TabsTrigger value="profiles" className="text-white">Export</TabsTrigger>
            <TabsTrigger value="settings" className="text-white">Settings</TabsTrigger>
            <TabsTrigger value="jobs" className="text-white">Export Jobs</TabsTrigger>
          </TabsList>

          {/* Simplified: Single export option */}
          <TabsContent value="profiles" className="flex-1 mt-4">
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg border border-cre8r-gray-700 bg-cre8r-gray-800`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-white">Standard Export</h3>
                    <p className="text-sm text-cre8r-gray-400 mt-1">
                      {selectedProfile
                        ? `MP4 • ${selectedProfile.resolution} • ${selectedProfile.framerate} fps`
                        : 'Preparing default export settings...'}
                    </p>
                  </div>
                  {selectedProfile && (
                    <CheckCircle className="w-5 h-5 text-cre8r-violet" />
                  )}
                </div>

                {selectedProfile && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {selectedProfile.resolution}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {selectedProfile.framerate} fps
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {selectedProfile.container.toUpperCase()}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Simplified settings without platform/bitrate references */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            {selectedProfile && (
              <div className="space-y-6">
                <Alert className="bg-cre8r-gray-800 border-cre8r-gray-700">
                  <Settings className="h-4 w-4" />
                  <AlertDescription className="text-white">
                    Format: MP4 • {selectedProfile.resolution} • {selectedProfile.framerate} fps
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
            {/* UI-only progress shown immediately upon starting export, independent of polling */}
            {isStartingExport && uiStartSignal && !exportJobs.some(j => j.status === 'completed') && (
              <div className="mb-4">
                <Progress value={uiProgress} className="w-full" />
                <div className="flex justify-between items-center">
                  <p className="text-xs text-cre8r-gray-400">{Math.floor(uiProgress)}% complete</p>
                  <p className="text-xs text-cre8r-gray-300 font-medium">Preparing export...</p>
                </div>
              </div>
            )}
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
                      key={(job as any).clientKey || job.job_id}
                      className="p-4 border border-cre8r-gray-700 rounded-lg bg-cre8r-gray-800"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-medium text-white">Standard Export</h3>
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

                      <div className="space-y-2">
                        <JobProgressDisplay
                          job={{ ...job, status: (startingJobId && job.job_id === startingJobId && job.status === 'queued') ? 'starting' as any : job.status }}
                          startSignal={jobStartSignals[job.job_id] || (startingJobId && job.job_id === startingJobId ? (uiStartSignal || undefined) : undefined)}
                        />
                      </div>

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