import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Upload, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEditorStore } from "@/store/editorStore";

type VideoAsset = {
  id: string;
  name: string;
  thumbnail: string;
  duration: number;
  uploaded: Date;
  src?: string;
  file_path: string;
  width: number;
  height: number;
  size: number;
  mimetype: string;
};

const placeholderVideos: VideoAsset[] = [];

interface AssetPanelProps {
  onVideoSelect: (video: VideoAsset) => void;
}

const AssetPanel = ({ onVideoSelect }: AssetPanelProps) => {
  
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("uploaded");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<VideoAsset[]>(placeholderVideos);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [selectionOrder, setSelectionOrder] = useState<string[]>([]); // Track order of selection
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const { setActiveVideoAsset, addAsset } = useEditorStore();

  // Fetch assets from backend and storage, auto-register missing
  const fetchAndSyncAssets = useCallback(async () => {
    try {
      console.log("Starting fetchAndSyncAssets...");
      
      // 1. Fetch registered assets
      const res = await fetch("/api/assets/list");
      if (!res.ok) throw new Error("Failed to fetch assets");
      const assets = await res.json();
      console.log("Registered assets:", assets);
      
      // 2. Fetch files from Supabase Storage bucket 'assets'
      console.log("Fetching storage files...");
      const { data: storageFiles, error: storageError } = await supabase.storage.from("assets").list("user123", { limit: 1000 });
      if (storageError) {
        console.error("Storage error:", storageError);
        // Don't throw here, continue with just registered assets
        console.log("Continuing with registered assets only due to storage error");
      } else {
        console.log("Storage files:", storageFiles);
      }
      
      const registeredPaths = new Set(assets.map((a: any) => a.path));
      console.log("Registered paths:", Array.from(registeredPaths));
      
      // 3. Find files not in the registered assets (auto-register missing files)
      const missingFiles = storageFiles?.filter((f: any) => 
        f.name.endsWith(".mp4") || f.name.endsWith(".mov") || f.name.endsWith(".avi")
      ).filter((f: any) => !registeredPaths.has(`user123/${f.name}`)) || [];
      
      console.log("Missing files to auto-register:", missingFiles);
      
      // 4. Auto-register missing files (skip if storage error)
      let autoRegisteredCount = 0;
      if (!storageError && missingFiles.length > 0) {
        for (const file of missingFiles) {
          try {
            console.log("Auto-registering file:", file.name);
            
            // Create signed URL to get metadata
            const { data: urlData, error: urlError } = await supabase.storage
              .from('assets')
              .createSignedUrl(`user123/${file.name}`, 60); // 1 minute for metadata extraction
            
            if (urlError) {
              console.error(`Failed to create signed URL for ${file.name}:`, urlError);
              continue;
            }
            
            const videoUrl = urlData.signedUrl;
            
            // Extract metadata
            const videoElement = document.createElement("video");
            videoElement.crossOrigin = "anonymous";
            videoElement.src = videoUrl;
            
            await new Promise((resolve, reject) => {
              videoElement.onloadedmetadata = resolve;
              videoElement.onerror = reject;
              setTimeout(reject, 10000); // 10 second timeout
            });
            
            const metadata = {
              originalName: file.name,
              path: `user123/${file.name}`,
              duration: videoElement.duration,
              width: videoElement.videoWidth || 1920,
              height: videoElement.videoHeight || 1080,
              size: file.metadata?.size || 0,
              mimetype: file.metadata?.mimetype || "video/mp4"
            };
            
            console.log("Extracted metadata for auto-registration:", metadata);
            
            const registerRes = await fetch("/api/assets/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(metadata)
            });
            
            if (registerRes.ok) {
              console.log(`Successfully auto-registered ${file.name}`);
              autoRegisteredCount++;
            } else {
              console.error(`Failed to auto-register ${file.name}`);
            }
          } catch (error) {
            console.error(`Error auto-registering ${file.name}:`, error);
          }
        }
      }
      
      // 5. Re-fetch updated assets if any were auto-registered
      let updatedAssets = assets;
      if (autoRegisteredCount > 0) {
        console.log(`Re-fetching assets after auto-registering ${autoRegisteredCount} files...`);
        const updatedRes = await fetch("/api/assets/list");
        if (updatedRes.ok) {
          updatedAssets = await updatedRes.json();
          console.log("Updated assets after auto-registration:", updatedAssets);
        }
      }
      
      console.log(`Processing ${updatedAssets.length} assets for thumbnails...`);
      
      // 6. Generate thumbnails and video URLs for assets (with better error handling)
      const mapped = await Promise.allSettled(updatedAssets.map(async (a: any) => {
        console.log(`Processing asset: ${a.original_name || a.path}`);
        
        // Get Supabase Storage signed URL for the video with CORS headers
        let videoUrl = null;
        try {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('assets')
            .createSignedUrl(a.path, 3600, {
              download: false // Ensure we get a viewable URL, not a download URL
            });
          
          if (urlError) {
            console.error(`Failed to create signed URL for ${a.path}:`, urlError);
          } else {
            videoUrl = urlData?.signedUrl;
            console.log(`✅ Created signed URL for ${a.original_name || a.path}`);
          }
        } catch (e) {
          console.error(`Error creating signed URL for ${a.path}:`, e);
        }
        
        // Generate thumbnail from video if URL is available
        let thumbnail = ""; // Start with empty - no fallback thumbnails as requested
        if (videoUrl) {
          try {
            console.log(`Generating thumbnail for ${a.original_name || a.path}...`);
            thumbnail = await generateVideoThumbnail(videoUrl);
            console.log(`✅ Generated thumbnail for ${a.original_name || a.path}`);
          } catch (e) {
            console.warn(`Failed to generate thumbnail for ${a.path}:`, e);
            // If CORS fails, try creating a new signed URL without download flag
            if (e.message?.includes('SecurityError') || e.message?.includes('tainted') || e.message?.includes('CORS')) {
              try {
                console.log(`Retrying thumbnail generation with public URL for ${a.original_name || a.path}...`);
                const { data: publicData } = supabase.storage
                  .from('assets')
                  .getPublicUrl(a.path);
                
                if (publicData?.publicUrl) {
                  thumbnail = await generateVideoThumbnail(publicData.publicUrl);
                  console.log(`✅ Generated thumbnail with public URL for ${a.original_name || a.path}`);
                }
              } catch (retryError) {
                console.error(`Retry also failed for ${a.path}:`, retryError);
                // Leave thumbnail empty as requested - no fallbacks
              }
            }
          }
        }
        
        return {
          id: a.id,
          name: a.original_name || a.path.split("/").pop() || a.path,
          file_path: a.path,
          duration: a.duration || 0,
          width: a.width || 0,
          height: a.height || 0,
          size: a.size || 0,
          mimetype: a.mimetype || "",
          thumbnail,
          uploaded: a.updated_at ? new Date(a.updated_at) : new Date(),
          src: videoUrl, // Add the signed video URL for drag and drop
        };
      }));
      
      // Handle settled promises (both fulfilled and rejected)
      const successfulAssets = mapped
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);
      
      const failedAssets = mapped
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason);
      
      if (failedAssets.length > 0) {
        console.warn(`Failed to process ${failedAssets.length} assets:`, failedAssets);
      }
      
      console.log(`Successfully processed ${successfulAssets.length} assets:`, successfulAssets);
      setUploadedVideos(successfulAssets);
      
      // Add assets to the editor store for drag and drop functionality
      successfulAssets.forEach(asset => {
        addAsset({
          id: asset.id,
          name: asset.name,
          file_path: asset.file_path,
          duration: asset.duration,
        });
      });
      
      console.log(`✅ Completed fetchAndSyncAssets with ${successfulAssets.length} assets`);
      
    } catch (error) {
      console.error("Error in fetchAndSyncAssets:", error);
      toast({
        title: "Failed to fetch assets",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  }, [toast, addAsset]);

  // Function to generate thumbnail from video URL
  const generateVideoThumbnail = (videoUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      console.log(`🎬 [AssetPanel] Starting thumbnail generation for URL: ${videoUrl.substring(0, 100)}...`);
      
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous'; // Required to avoid canvas taint issues
      video.muted = true; // Required for autoplay in some browsers
      video.preload = 'metadata';
      video.playsInline = true; // Better support for mobile/iOS
      
      let isResolved = false;
      let timeoutId: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        video.removeEventListener('abort', onAbort);
        video.removeEventListener('canplay', onCanPlay);
        video.src = '';
        video.load(); // Clear video element completely
      };
      
      const resolveOnce = (result: string) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          console.log(`🎬 [AssetPanel] ✅ Successfully generated thumbnail`);
          resolve(result);
        }
      };
      
      const rejectOnce = (error: Error) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          console.error(`🎬 [AssetPanel] ❌ Failed to generate thumbnail:`, error);
          reject(error);
        }
      };
      
      const onLoadedMetadata = () => {
        console.log(`🎬 [AssetPanel] Video metadata loaded - duration: ${video.duration}s, dimensions: ${video.videoWidth}x${video.videoHeight}`);
        
        // Validate video dimensions before proceeding
        if (video.videoWidth === 0 || video.videoHeight === 0) {
          console.warn(`🎬 [AssetPanel] Video has invalid dimensions, waiting for canplay event...`);
          return; // Wait for canplay event which might have correct dimensions
        }
        
        try {
          // Always use 1 second as requested by user, with fallback for very short videos
          let seekTime = 1.0;
          if (video.duration < 1.0) {
            seekTime = Math.max(0.1, video.duration * 0.5); // Use middle point for very short videos
          }
          console.log(`🎬 [AssetPanel] Seeking to ${seekTime}s for thumbnail capture`);
          video.currentTime = seekTime;
        } catch (e) {
          rejectOnce(new Error(`Failed to seek video: ${e}`));
        }
      };
      
      const onCanPlay = () => {
        console.log(`🎬 [AssetPanel] Video can play - dimensions: ${video.videoWidth}x${video.videoHeight}`);
        // If we still don't have dimensions from loadedmetadata, try again here
        if (video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime === 0) {
          onLoadedMetadata();
        }
      };
      
      const onSeeked = () => {
        console.log(`🎬 [AssetPanel] Video seeked successfully to ${video.currentTime}s, capturing frame...`);
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Failed to get canvas 2D context');
          }
          
          // Use fallback dimensions if video dimensions are still invalid
          const width = video.videoWidth || 320;
          const height = video.videoHeight || 240;
          
          if (width === 0 || height === 0) {
            throw new Error('Video has invalid dimensions even after canplay');
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Clear canvas with black background first
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, width, height);
          
          ctx.drawImage(video, 0, 0, width, height);
          
          try {
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.9); // Higher quality
            
            if (!thumbnailDataUrl || thumbnailDataUrl === 'data:,' || thumbnailDataUrl.length < 100) {
              throw new Error('Failed to generate valid thumbnail data');
            }
            
            resolveOnce(thumbnailDataUrl);
          } catch (canvasError) {
            // Check if this is a CORS/SecurityError
            if (canvasError instanceof DOMException && canvasError.name === 'SecurityError') {
              rejectOnce(new Error(`SecurityError: Failed to extract canvas data due to CORS restrictions. The video may be from a different origin. ${canvasError.message}`));
            } else {
              rejectOnce(new Error(`Failed to extract thumbnail data: ${canvasError}`));
            }
          }
        } catch (e) {
          rejectOnce(new Error(`Failed to capture video frame: ${e}`));
        }
      };
      
      const onError = (e: any) => {
        console.error('🎬 [AssetPanel] Video error event:', e);
        console.error('🎬 [AssetPanel] Video error details:', {
          error: video.error,
          networkState: video.networkState,
          readyState: video.readyState,
          src: video.src.substring(0, 100) + '...'
        });
        rejectOnce(new Error('Failed to load video for thumbnail generation'));
      };
      
      const onAbort = () => {
        console.warn('🎬 [AssetPanel] Video loading was aborted');
        rejectOnce(new Error('Video loading was aborted'));
      };
      
      // Add event listeners
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      video.addEventListener('abort', onAbort);
      video.addEventListener('canplay', onCanPlay);
      
      // Set longer timeout for larger videos
      timeoutId = setTimeout(() => {
        rejectOnce(new Error('Timeout: Video took too long to load (30 seconds)'));
      }, 30000); // Increased to 30 second timeout
      
      // Start loading the video
      try {
        console.log(`🎬 [AssetPanel] Setting video source...`);
        video.src = videoUrl;
      } catch (e) {
        rejectOnce(new Error(`Failed to set video source: ${e}`));
      }
    });
  };

  useEffect(() => {
    console.log("AssetPanel useEffect running...");
    fetchAndSyncAssets();
  }, [fetchAndSyncAssets]);

  // Clear selection when videos change
  useEffect(() => {
    setSelectedAssets(new Set());
    setSelectionOrder([]);
    setLastSelectedIndex(-1);
  }, [uploadedVideos]);

  // Handle video selection with multi-select support
  const handleVideoClick = (video: VideoAsset, index: number, event: React.MouseEvent) => {
    const videoIndex = uploadedVideos.findIndex(v => v.id === video.id);
    
    if (event.metaKey || event.ctrlKey) {
      // Cmd/Ctrl click - toggle selection
      const newSelected = new Set(selectedAssets);
      let newOrder = [...selectionOrder];
      
      if (newSelected.has(video.id)) {
        newSelected.delete(video.id);
        newOrder = newOrder.filter(id => id !== video.id);
      } else {
        newSelected.add(video.id);
        newOrder.push(video.id); // Add to end of selection order
      }
      
      setSelectedAssets(newSelected);
      setSelectionOrder(newOrder);
      setLastSelectedIndex(videoIndex);
    } else if (event.shiftKey && lastSelectedIndex !== -1) {
      // Shift click - range selection
      const newSelected = new Set<string>();
      const newOrder: string[] = [];
      const start = Math.min(lastSelectedIndex, videoIndex);
      const end = Math.max(lastSelectedIndex, videoIndex);
      
      for (let i = start; i <= end; i++) {
        if (uploadedVideos[i]) {
          newSelected.add(uploadedVideos[i].id);
          newOrder.push(uploadedVideos[i].id);
        }
      }
      
      setSelectedAssets(newSelected);
      setSelectionOrder(newOrder);
    } else {
      // Regular click - single selection
      setSelectedAssets(new Set([video.id]));
      setSelectionOrder([video.id]);
      setLastSelectedIndex(videoIndex);
      onVideoSelect(video);
    }
  };

  // Handle drag start with multi-select support
  const handleDragStart = (e: React.DragEvent, video: VideoAsset) => {
    // If the dragged video is not selected, select only it
    if (!selectedAssets.has(video.id)) {
      setSelectedAssets(new Set([video.id]));
      setSelectionOrder([video.id]);
    }
    
    // Get selected videos in the order they were selected
    const selectedVideos = selectionOrder
      .map(id => uploadedVideos.find(v => v.id === id))
      .filter((v): v is VideoAsset => v !== undefined);
    
    if (selectedVideos.length > 1) {
      // Multiple assets drag - ordered by selection
      e.dataTransfer.setData("application/json", JSON.stringify({
        type: "MULTIPLE_ASSETS",
        assets: selectedVideos
      }));
    } else {
      // Single asset drag
      e.dataTransfer.setData("application/json", JSON.stringify(video));
    }
    
    e.dataTransfer.effectAllowed = "copy";
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return; // Don't interfere with input fields
      
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        // Cmd/Ctrl + A - select all in upload order
        e.preventDefault();
        const allIds = uploadedVideos.map(v => v.id);
        setSelectedAssets(new Set(allIds));
        setSelectionOrder(allIds);
      } else if (e.key === 'Escape') {
        // Escape - clear selection
        setSelectedAssets(new Set());
        setSelectionOrder([]);
        setLastSelectedIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [uploadedVideos]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleFileUpload = async (files: FileList) => {
    const file = files[0];
    if (!file) return;

    // Always fetch the latest asset list before upload
    await fetchAndSyncAssets();
    // Check if file already exists in asset list by exact path
    const expectedPath = `user123/${file.name}`;
    const existing = uploadedVideos.find(v => v.file_path === expectedPath);
    if (existing) {
      toast({
        title: "File already exists",
        description: `${file.name} is already in your assets. Using the existing asset.`,
      });
      addAsset({
        id: existing.id,
        name: existing.name,
        file_path: existing.file_path,
        duration: existing.duration,
      });
      onVideoSelect(existing);
      return;
    }

    if (!file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file (MP4 or MOV)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 1024 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 1024MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    // Step 1: Extract metadata in browser
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = videoUrl;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;

      // Generate a thumbnail (optional)
      let thumbnail = "";
      try {
        video.currentTime = 1;
        await new Promise((resolve) => {
          video.onseeked = () => {
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbnail = canvas.toDataURL("image/jpeg");
            resolve(true);
          };
        });
      } catch {
        thumbnail = "https://i.imgur.com/JcGrHtu.jpg";
      }

      try {
        // Step 2: Get upload path from backend
        const uploadUrlRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, folder: "user123/" }),
        });
        if (!uploadUrlRes.ok) throw new Error("Failed to get upload URL");
        const { path } = await uploadUrlRes.json();
        console.log("uploadUrlRes path", path, typeof path);

        // Step 3: Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
        if (uploadError && !uploadError.message.includes("The resource already exists")) throw new Error(`Upload failed: ${uploadError.message}`);

        // Step 4: Register asset with backend
        let registerRes, registerJson;
        try {
          registerRes = await fetch("/api/assets/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path,
              originalName: file.name,
              duration,
              width,
              height,
              size: file.size,
              mimetype: file.type,
            }),
          });
          registerJson = await registerRes.json();
        } catch (err) {
          // fallback
          registerJson = {};
        }
        if (!registerRes?.ok && registerJson?.detail && registerJson.detail.includes("duplicate key value")) {
          toast({
            title: "File already exists",
            description: `${file.name} is already in your assets. Using the existing asset.`,
          });
          await fetchAndSyncAssets();
          // Find and select the asset
          const refreshed = uploadedVideos.find(v => v.file_path === path);
          if (refreshed) {
            addAsset({
              id: refreshed.id,
              name: refreshed.name,
              file_path: refreshed.file_path,
              duration: refreshed.duration,
            });
            onVideoSelect(refreshed);
          }
          setIsUploading(false);
          return;
        } else if (!registerRes?.ok) {
          throw new Error(registerJson?.detail || "Failed to register asset metadata");
        }
        const { id, status } = registerJson;
        if (status !== "registered") throw new Error("Asset registration failed");

        // Step 5: Update UI state
        await fetchAndSyncAssets();
        setIsUploading(false);
        // Find and select the asset
        const refreshed = uploadedVideos.find(v => v.file_path === path);
        if (refreshed) {
          addAsset({
            id: refreshed.id,
            name: refreshed.name,
            file_path: refreshed.file_path,
            duration: refreshed.duration,
          });
          onVideoSelect(refreshed);
        }
        toast({
          title: "Video uploaded",
          description: `${file.name} has been added to your assets`,
        });
      } catch (error) {
        setIsUploading(false);
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "There was an error processing your video",
          variant: "destructive",
        });
      }
    };

    video.onerror = () => {
      setIsUploading(false);
      toast({
        title: "Upload failed",
        description: "There was an error processing your video",
        variant: "destructive",
      });
    };
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-full flex flex-col bg-cre8r-gray-800 border-r border-cre8r-gray-700">
      <div className="p-4 border-b border-cre8r-gray-700">
        <h2 className="text-lg font-semibold mb-3">Upload Video</h2>
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
            isDragging ? "border-cre8r-violet bg-cre8r-violet/10" : "border-cre8r-gray-600 hover:border-cre8r-gray-500"
          )}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-6 w-6 text-cre8r-gray-400" />
            <p className="text-sm text-cre8r-gray-300">
              Drag and drop or click to upload a video
            </p>
            <p className="text-xs text-cre8r-gray-400">
              MP4 or MOV format, max 1024MB
            </p>
            <input
              type="file"
              className="hidden"
              accept="video/mp4,video/quicktime"
              onChange={(e) => {
                if (e.target.files) {
                  handleFileUpload(e.target.files);
                }
              }}
              id="video-upload"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => document.getElementById("video-upload")?.click()}
              className="mt-2"
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Select File"}
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        defaultValue="uploaded"
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="border-b border-cre8r-gray-700">
          <TabsList className="w-full bg-transparent border-b border-cre8r-gray-700 rounded-none gap-2">
            <TabsTrigger
              value="uploaded"
              className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-cre8r-violet rounded-none"
            >
              Uploaded Videos
            </TabsTrigger>
            <TabsTrigger
              value="stock"
              className="flex-1 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-cre8r-violet rounded-none"
            >
              Stock Videos
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-3 border-b border-cre8r-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-cre8r-gray-400" />
            <Input
              type="text"
              placeholder={`Search ${activeTab} videos...`}
              className="pl-9 bg-cre8r-gray-700 border-cre8r-gray-600 focus:border-cre8r-violet"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <TabsContent value="uploaded" className="flex-1 overflow-y-auto m-0 p-0">
          <div className="p-3 space-y-3">
            {/* Selection info header */}
            {selectedAssets.size > 0 && (
              <div className="flex items-center justify-between p-2 bg-cre8r-violet/20 rounded-lg border border-cre8r-violet/40">
                <span className="text-sm text-cre8r-violet font-medium">
                  {selectedAssets.size} asset{selectedAssets.size > 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedAssets(new Set());
                    setLastSelectedIndex(-1);
                  }}
                  className="text-xs text-cre8r-gray-300 hover:text-white"
                >
                  Clear selection
                </Button>
              </div>
            )}
            
            {uploadedVideos.length === 0 ? (
              <div className="text-center py-8 text-cre8r-gray-400">
                <p>No uploaded videos yet</p>
              </div>
            ) : (
              uploadedVideos.map((video, index) => {
                const isSelected = selectedAssets.has(video.id);
                return (
                  <div 
                    key={video.id} 
                    className={cn(
                      "bg-cre8r-gray-700 rounded-lg overflow-hidden cursor-pointer transition-all group",
                      isSelected 
                        ? "ring-2 ring-cre8r-violet bg-cre8r-violet/10" 
                        : "hover:ring-1 hover:ring-cre8r-violet"
                    )}
                    onClick={(event) => handleVideoClick(video, index, event)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, video)}
                  >
                    <div className="relative">
                      <img 
                        src={video.thumbnail} 
                        alt={video.name} 
                        className="w-full h-24 object-cover"
                      />
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                        {formatDuration(video.duration)}
                      </div>
                      {/* Selection indicator */}
                      {isSelected && (
                        <div className="absolute top-1 left-1 w-5 h-5 bg-cre8r-violet rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      )}
                      {/* Multi-select badge */}
                      {selectedAssets.size > 1 && isSelected && (
                        <div className="absolute top-1 right-1 bg-cre8r-violet text-white text-xs px-1.5 py-0.5 rounded-full font-medium">
                          {Array.from(selectedAssets).indexOf(video.id) + 1}
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm truncate">{video.name}</p>
                    </div>
                  </div>
                );
              })
            )}
            
            {/* Instructions for multi-select */}
            {uploadedVideos.length > 1 && selectedAssets.size === 0 && (
              <div className="text-center p-4 text-xs text-cre8r-gray-500 border-t border-cre8r-gray-700">
                <p>💡 Tip: Use Cmd/Ctrl+click for multi-select, Shift+click for range selection</p>
                <p>Drag multiple selected videos to timeline</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stock" className="flex-1 overflow-y-auto m-0 p-0">
          <div className="text-center py-8 text-cre8r-gray-400">
            <p>Stock videos coming soon</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AssetPanel;