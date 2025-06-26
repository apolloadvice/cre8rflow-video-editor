import { useState } from 'react';
import { Text, Music, FileVideo, Layers, Captions, Video, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AssetItem, assetTabs } from '@/config/assetsConfig';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editorStore';
import { supabase } from "@/integrations/supabase/client";

// Define VideoAsset type
type VideoAsset = {
  id: string;
  name: string;
  thumbnail: string;
  duration: number;
  uploaded: Date;
  src?: string;
  file_path?: string;
};

const AssetsIconBar = () => {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [uploadedVideos, setUploadedVideos] = useState<VideoAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const { setActiveVideoAsset, setVideoSrc, addAsset } = useEditorStore();

  const handleIconClick = (tabId: string) => {
    // If the video tab is clicked, open the upload dialog if there are no videos
    if (tabId === 'video') {
      setActiveTab(tabId); // Always set the video tab as active when clicked
      if (uploadedVideos.length === 0) {
        setIsVideoDialogOpen(true);
      }
      return;
    }
    
    // Otherwise, handle as before
    setActiveTab(prevTab => prevTab === tabId ? null : tabId);
  };

  const handleDragStart = (e: React.DragEvent, asset: AssetItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'ASSET',
      asset
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleVideoDragStart = (e: React.DragEvent, video: VideoAsset) => {
    e.dataTransfer.setData('application/json', JSON.stringify(video));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getTabItems = (tabId: string) => {
    const tab = assetTabs.find(t => t.id === tabId);
    return tab ? tab.items : [];
  };

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

        // Step 3: Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage.from("assets").upload(path, file, { upsert: true });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        // Step 4: Register asset with backend
        const registerRes = await fetch("/api/assets/register", {
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
        if (!registerRes.ok) throw new Error("Failed to register asset metadata");
        const { id, status } = await registerRes.json();
        if (status !== "registered") throw new Error("Asset registration failed");

        // Step 5: Update UI state (add to asset store, set thumbnail, etc.)
        const newVideo = {
          id,
          name: file.name,
          thumbnail,
          duration,
          uploaded: new Date(),
          src: videoUrl,
          file_path: path,
        };
        addAsset({
          id: newVideo.id,
          name: newVideo.name,
          file_path: newVideo.file_path!,
          duration: newVideo.duration,
          // Add other metadata as needed
        });
        setTimeout(() => {
          setUploadedVideos(prev => [newVideo, ...prev]);
          setIsUploading(false);
          setActiveVideoAsset(newVideo);
          if (newVideo.src) {
            setVideoSrc(newVideo.src);
          }
          toast({
            title: "Video uploaded",
            description: `${file.name} has been added to your assets`,
          });
          setIsVideoDialogOpen(false);
        }, 500);
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

  // Handle upload button click
  const handleUploadClick = () => {
    setIsVideoDialogOpen(true);
  };

  const tabIcons = [
    { id: 'video', name: 'Video', icon: Video },
    { id: 'text', name: 'Text', icon: Text },
    { id: 'sounds', name: 'Sounds', icon: Music },
    { id: 'media', name: 'Media', icon: FileVideo },
    { id: 'captions', name: 'Captions', icon: Captions },
    { id: 'layers', name: 'Layers', icon: Layers },
    { id: 'templates', name: 'Templates', icon: Layers }
  ];

  return (
    <div className="flex h-full">
      {/* Vertical Icon Bar */}
      <div className="bg-cre8r-gray-800 border-r border-cre8r-gray-700 w-14 flex flex-col items-center py-4 space-y-6">
        {tabIcons.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleIconClick(tab.id)}
            className={cn(
              "w-10 flex flex-col items-center gap-1 transition-colors",
              activeTab === tab.id 
                ? "text-white" 
                : "text-cre8r-gray-400 hover:text-white"
            )}
            title={tab.name}
          >
            <div className={cn(
              "h-10 w-10 rounded-md flex items-center justify-center",
              activeTab === tab.id 
                ? "bg-cre8r-violet" 
                : "hover:bg-cre8r-gray-700"
            )}>
              <tab.icon className="h-5 w-5" />
            </div>
            <span className="text-[10px] hidden sm:block">
              {tab.name}
            </span>
          </button>
        ))}
      </div>

      {/* Asset Items Panel - shown when a tab is active */}
      {activeTab && (
        <div className="bg-cre8r-gray-800 w-64 overflow-y-auto">
          <div className="p-4 border-b border-cre8r-gray-700 flex justify-between items-center">
            <h3 className="font-medium text-white">
              {tabIcons.find(tab => tab.id === activeTab)?.name}
            </h3>
            {activeTab === 'video' && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleUploadClick}
                className="text-xs border-cre8r-gray-600 hover:border-cre8r-violet"
              >
                <Upload className="h-3 w-3 mr-1" /> Upload
              </Button>
            )}
          </div>
          
          {/* Video assets display */}
          {activeTab === 'video' && (
            <div className="p-2 space-y-2">
              {uploadedVideos.length === 0 ? (
                <div className="text-center py-8 text-cre8r-gray-400 text-sm">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No videos uploaded yet</p>
                  <Button 
                    variant="link" 
                    onClick={handleUploadClick} 
                    className="text-cre8r-violet mt-2"
                  >
                    Upload a video
                  </Button>
                </div>
              ) : (
                uploadedVideos.map(video => (
                  <div 
                    key={video.id}
                    className="group flex flex-col p-2 rounded hover:bg-cre8r-gray-700 cursor-grab transition-colors"
                    draggable
                    onDragStart={(e) => handleVideoDragStart(e, video)}
                    onClick={() => {
                      setActiveVideoAsset(video);
                      if (video.src) {
                        setVideoSrc(video.src);
                      }
                    }}
                  >
                    <div className="relative mb-1 rounded overflow-hidden">
                      <img 
                        src={video.thumbnail} 
                        alt={video.name} 
                        className="w-full h-16 object-cover"
                      />
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                        {formatDuration(video.duration)}
                      </div>
                    </div>
                    <div className="truncate text-xs">{video.name}</div>
                  </div>
                ))
              )}
            </div>
          )}
          
          {/* Other asset tabs display */}
          {activeTab !== 'video' && (
            <div className="p-2 space-y-1">
              {getTabItems(activeTab).map(item => (
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
          )}
        </div>
      )}

      {/* Video Upload Dialog */}
      <Dialog open={isVideoDialogOpen} onOpenChange={setIsVideoDialogOpen}>
        <DialogContent className="bg-cre8r-gray-800 border-cre8r-gray-700 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Upload Video</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Drag and Drop Area */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                isDragging ? "border-cre8r-violet bg-cre8r-violet/10" : "border-cre8r-gray-600 hover:border-cre8r-gray-500"
              )}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-cre8r-gray-400" />
                <p className="text-sm text-cre8r-gray-300">
                  Drag and drop or click to upload a video
                </p>
                <p className="text-xs text-cre8r-gray-400">
                  MP4 or MOV format, max 1024MB
                </p>
              </div>
            </div>
            
            {/* File Input Button */}
            <div className="flex justify-center">
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
                variant="outline"
                onClick={() => document.getElementById("video-upload")?.click()}
                className="border-cre8r-gray-600 hover:border-cre8r-violet"
                disabled={isUploading}
              >
                {isUploading ? "Uploading..." : "Select Video File"}
              </Button>
            </div>
            
            {/* Uploaded Videos */}
            {uploadedVideos.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Recently Uploaded</h3>
                <div className="grid grid-cols-2 gap-2">
                  {uploadedVideos.slice(0, 4).map(video => (
                    <div 
                      key={video.id} 
                      className="bg-cre8r-gray-700 rounded-lg overflow-hidden cursor-pointer hover:ring-1 hover:ring-cre8r-violet transition-all"
                      onClick={() => {
                        setActiveVideoAsset(video);
                        if (video.src) {
                          setVideoSrc(video.src);
                        }
                        setIsVideoDialogOpen(false);
                      }}
                      draggable
                      onDragStart={(e) => handleVideoDragStart(e, video)}
                    >
                      <div className="relative">
                        <img 
                          src={video.thumbnail} 
                          alt={video.name} 
                          className="w-full h-16 object-cover"
                        />
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                          {formatDuration(video.duration)}
                        </div>
                      </div>
                      <div className="p-1">
                        <p className="text-xs truncate">{video.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssetsIconBar;
