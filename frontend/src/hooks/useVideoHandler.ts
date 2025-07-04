import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useEditorStore, Clip } from "@/store/editorStore";
import { updateAssetDuration } from "@/api/apiClient";
import { supabase } from "@/integrations/supabase/client";

// Utility function to check if two clips overlap
const clipsOverlap = (clip1: { start: number; end: number }, clip2: { start: number; end: number }) => {
  return clip1.start < clip2.end && clip1.end > clip2.start;
};

// Utility function to find the next available position on a track
const findNextAvailablePosition = (clips: Clip[], track: number, startTime: number, clipDuration: number) => {
  // Get all clips on the same track, sorted by start time
  const trackClips = clips
    .filter(clip => clip.track === track)
    .sort((a, b) => a.start - b.start);
  
  // Try the originally requested position first
  const proposedClip = {
    start: startTime,
    end: startTime + clipDuration
  };
  
  // Check if this position overlaps with any existing clip
  const hasOverlap = trackClips.some(existingClip => clipsOverlap(proposedClip, existingClip));
  
  if (!hasOverlap) {
    return startTime; // Original position is fine
  }
  
  // If there's an overlap, try to find the next available gap
  for (let i = 0; i < trackClips.length; i++) {
    const currentClip = trackClips[i];
    const nextClip = trackClips[i + 1];
    
    // Try placing after the current clip
    const candidateStart = currentClip.end;
    const candidateEnd = candidateStart + clipDuration;
    
    // Check if this fits before the next clip (or if there's no next clip)
    if (!nextClip || candidateEnd <= nextClip.start) {
      return candidateStart;
    }
  }
  
  // If no gap found, place at the end of the last clip
  if (trackClips.length > 0) {
    return trackClips[trackClips.length - 1].end;
  }
  
  // Fallback to original position (shouldn't happen)
  return startTime;
};

// Utility function to find the best track for a new clip
const findBestTrack = (clips: Clip[], clipType: string, startTime: number, clipDuration: number) => {
  // For video clips, prefer track 0 first
  if (clipType === 'video') {
    const track0Position = findNextAvailablePosition(clips, 0, startTime, clipDuration);
    // If we can place it at the requested time on track 0, use it
    if (track0Position === startTime) {
      return { track: 0, startTime: track0Position };
    }
    // If track 0 is occupied at the requested time, check if there's a suitable gap
    const track0Clips = clips.filter(clip => clip.track === 0).sort((a, b) => a.start - b.start);
    const hasGoodGap = track0Clips.some((clip, i) => {
      const nextClip = track0Clips[i + 1];
      if (nextClip) {
        const gapStart = clip.end;
        const gapEnd = nextClip.start;
        return gapStart <= startTime && startTime + clipDuration <= gapEnd;
      }
      return false;
    });
    
    if (hasGoodGap) {
      return { track: 0, startTime: track0Position };
    }
  }
  
  // For non-video clips or when track 0 doesn't work well, find any available track
  const maxTrack = clips.length > 0 ? Math.max(...clips.map(clip => clip.track)) : -1;
  
  // Try existing tracks first
  for (let track = 0; track <= maxTrack; track++) {
    const position = findNextAvailablePosition(clips, track, startTime, clipDuration);
    // If we can place it close to the requested time (within 5 seconds), use this track
    if (Math.abs(position - startTime) <= 5) {
      return { track, startTime: position };
    }
  }
  
  // Create a new track if no existing track works well
  const newTrack = maxTrack + 1;
  return { track: newTrack, startTime };
};

// Function to generate thumbnail from video URL
const generateVideoThumbnail = (videoUrl: string): Promise<string> => {
  console.log("🖼️ [Thumbnail] Starting thumbnail generation for URL:", videoUrl.substring(0, 100) + "...");
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true; // Required for autoplay in some browsers
    video.preload = 'metadata';
    video.playsInline = true; // Helps with mobile devices
    
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
      if (video.src) {
        video.src = '';
        video.load(); // Clear the video element completely
      }
    };
    
    const onLoadedMetadata = () => {
      console.log("🖼️ [Thumbnail] Video metadata loaded, duration:", video.duration, "dimensions:", video.videoWidth, "x", video.videoHeight);
      // Set the time to capture thumbnail (use 1st second as requested)
      if (video.duration > 1) {
        video.currentTime = 1.0;
      } else {
        // For very short videos, use middle point
        video.currentTime = video.duration / 2;
      }
    };
    
    const onCanPlay = () => {
      console.log("🖼️ [Thumbnail] Video can play, ready state:", video.readyState);
    };
    
    const onSeeked = () => {
      console.log("🖼️ [Thumbnail] Video seeked to:", video.currentTime);
      try {
        const canvas = document.createElement('canvas');
        
        // Ensure we have valid dimensions
        const width = video.videoWidth || 320;
        const height = video.videoHeight || 240;
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        console.log("🖼️ [Thumbnail] Canvas created:", canvas.width, "x", canvas.height);
        
        if (ctx && width > 0 && height > 0) {
          // Clear canvas with black background first
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, width, height);
          
          // Draw the video frame
          ctx.drawImage(video, 0, 0, width, height);
          
          // Convert to data URL with higher quality
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.9);
          console.log("🖼️ [Thumbnail] ✅ Generated thumbnail, data URL length:", thumbnailDataUrl.length);
          console.log("🖼️ [Thumbnail] Thumbnail data URL starts with:", thumbnailDataUrl.substring(0, 100));
          
          cleanup();
          resolve(thumbnailDataUrl);
        } else {
          console.error("🖼️ [Thumbnail] ❌ Failed to get valid video dimensions or canvas context");
          console.error("🖼️ [Thumbnail] Context:", !!ctx, "Width:", width, "Height:", height);
          cleanup();
          reject(new Error('Failed to get valid video dimensions or canvas context'));
        }
      } catch (e) {
        console.error("🖼️ [Thumbnail] ❌ Error during canvas processing:", e);
        cleanup();
        reject(e);
      }
    };
    
    const onError = (e: any) => {
      console.error('🖼️ [Thumbnail] ❌ Video error event:', e);
      console.error('🖼️ [Thumbnail] Video error details:', {
        error: video.error,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.src
      });
      cleanup();
      reject(new Error('Failed to load video for thumbnail generation'));
    };
    
    const onAbort = () => {
      console.error('🖼️ [Thumbnail] ❌ Video loading was aborted');
      cleanup();
      reject(new Error('Video loading was aborted'));
    };
    
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.addEventListener('abort', onAbort);
    video.addEventListener('canplay', onCanPlay);
    
    // Set timeout to prevent hanging
    timeoutId = setTimeout(() => {
      console.error('🖼️ [Thumbnail] ❌ Timeout: Video took too long to load');
      cleanup();
      reject(new Error('Timeout: Video took too long to load'));
    }, 20000); // 20 second timeout
    
    console.log("🖼️ [Thumbnail] Setting video source...");
    video.src = videoUrl;
  });
};

export const useVideoHandler = () => {
  const { toast } = useToast();
  const {
    clips,
    duration,
    selectedClipId,
    activeVideoAsset,
    videoSrc,
    setClips,
    setSelectedClipId,
    setActiveVideoAsset,
    setVideoSrc,
    setDuration,
    setCurrentTime,
    getAssetById
  } = useEditorStore();

  const handleVideoSelect = (video: any) => {
    setClips([]);
    setActiveVideoAsset(video);
    
    if (video.src) {
      setVideoSrc(video.src);
    }
    
    toast({
      title: "Video selected",
      description: `${video.name} is now ready to edit`,
    });
  };

  const handleVideoDrop = (file: File, track: number, dropTime: number) => {
    const videoUrl = URL.createObjectURL(file);
    
    const video = document.createElement("video");
    video.src = videoUrl;
    
    video.onloadedmetadata = async () => {
      const clipDuration = video.duration;
      
      // Generate thumbnail for the video
      let thumbnail = "";
      try {
        thumbnail = await generateVideoThumbnail(videoUrl);
      } catch (e) {
        console.warn("Failed to generate thumbnail for dropped video:", e);
      }
      
      // Find the best track and position for this video clip
      const { track: bestTrack, startTime: adjustedStartTime } = findBestTrack(clips, 'video', dropTime, clipDuration);
      
      const newClip: Clip = {
        id: `clip-${Date.now()}`,
        start: adjustedStartTime,
        end: adjustedStartTime + clipDuration,
        track: bestTrack,
        type: "video",
        name: file.name,
        thumbnail: thumbnail // Include generated thumbnail
      };
      
      setClips([...clips, newClip]);
      setSelectedClipId(newClip.id);
      
      if (!videoSrc) {
        setVideoSrc(videoUrl);
        setDuration(clipDuration);
      }
      
      // Try to update asset duration in Supabase
      try {
        await updateAssetDuration(file.name, clipDuration);
      } catch (e) {
        console.warn("Failed to update asset duration in Supabase", e);
      }
      
      // Show feedback about placement
      const message = adjustedStartTime !== dropTime 
        ? `${file.name} was placed at ${Math.round(adjustedStartTime)}s on track ${bestTrack + 1} to avoid overlap`
        : bestTrack !== track
        ? `${file.name} was placed on track ${bestTrack + 1} for better organization`
        : `${file.name} has been added to track ${bestTrack + 1}`;
      
      toast({
        title: "Video added to timeline",
        description: message,
      });
    };
  };

  const handleVideoAssetDrop = async (videoAsset: any, track: number, dropTime: number) => {
    console.log("🎬 [Video Handler] Starting handleVideoAssetDrop for:", videoAsset.name);
    
    // Always look up the asset in the asset store by id
    const asset = getAssetById ? getAssetById(videoAsset.id) : videoAsset;
    if (!asset || !asset.file_path) {
      toast({
        title: "Error",
        description: "Video file path not found. Please re-upload the video.",
        variant: "destructive"
      });
      return;
    }

    console.log("🎬 [Video Handler] Asset found:", asset.name, "file_path:", asset.file_path);

    // Generate thumbnail from Supabase video URL FIRST
    let thumbnail = "";
    let videoUrl = "";
    
    try {
      console.log("🎬 [Video Handler] Creating signed URL for thumbnail generation...");
      // Create signed URL for thumbnail generation
      const { data: urlData, error } = await supabase.storage
        .from('assets')
        .createSignedUrl(asset.file_path, 3600); // 1 hour expiry
      
      if (error) {
        console.error('Failed to create signed URL for thumbnail:', error);
      } else if (urlData?.signedUrl) {
        videoUrl = urlData.signedUrl;
        console.log("🎬 [Video Handler] Signed URL created, generating thumbnail for:", asset.name);
        console.log("🎬 [Video Handler] Video URL:", videoUrl.substring(0, 100) + "...");
        
        // Wait for thumbnail generation to complete
        thumbnail = await generateVideoThumbnail(videoUrl);
        console.log("🎬 [Video Handler] ✅ Successfully generated thumbnail for:", asset.name);
        console.log("🎬 [Video Handler] Thumbnail data length:", thumbnail.length);
      }
    } catch (e) {
      console.error("🎬 [Video Handler] ❌ Failed to generate thumbnail for asset:", asset.name, e);
    }

    // Find the best track and position for this video clip
    const { track: bestTrack, startTime: adjustedStartTime } = findBestTrack(clips, 'video', dropTime, asset.duration);

    console.log("🎬 [Video Handler] Creating clip with thumbnail:", {
      name: asset.name,
      track: bestTrack,
      hasThumbnail: !!thumbnail,
      thumbnailLength: thumbnail.length
    });

    // Create a backend-ready timeline clip with the generated thumbnail
    const newClip: Clip = {
      id: `clip-${Date.now()}`,
      name: asset.name,
      start: adjustedStartTime,
      end: adjustedStartTime + asset.duration,
      track: bestTrack,
      type: "video",
      file_path: asset.file_path,
      thumbnail: thumbnail, // Use generated thumbnail from Supabase video
      effects: [],
      _type: "VideoClip"
    } as any;
    
    console.log("🎬 [Video Handler] Adding clip to timeline:", newClip);
    const updatedClips = [...clips, newClip];
    setClips(updatedClips);
    
    // Force recalculate duration after adding clip
    setTimeout(() => {
      const { recalculateDuration } = useEditorStore.getState();
      console.log("🎬 [Video Handler] Manually calling recalculateDuration...");
      recalculateDuration();
    }, 100); // Small delay to ensure state is updated
    
    setSelectedClipId(newClip.id);
    
    // Set the video source for the player if we don't have one yet or if this is the first clip
    if (!videoSrc || clips.length === 0) {
      // Use the generated video URL or try to create a new one
      if (videoUrl) {
        setVideoSrc(videoUrl);
        setActiveVideoAsset(asset);
      } else if (videoAsset.src) {
        setVideoSrc(videoAsset.src);
        setActiveVideoAsset(asset);
      } else {
        try {
          const { data: urlData, error } = await supabase.storage
            .from('assets')
            .createSignedUrl(asset.file_path, 3600); // 1 hour expiry
          
          if (error) {
            console.error('Failed to create signed URL for video player:', error);
          } else if (urlData?.signedUrl) {
            setVideoSrc(urlData.signedUrl);
            setActiveVideoAsset(asset);
          }
        } catch (e) {
          console.error('Error creating signed URL for video player:', e);
        }
      }
    }
    
    // Try to update asset duration in Supabase
    try {
      await updateAssetDuration(asset.file_path, asset.duration);
    } catch (e) {
      console.warn("Failed to update asset duration in Supabase", e);
    }
    
    // Show feedback about placement
    const message = adjustedStartTime !== dropTime 
      ? `${asset.name} was placed at ${Math.round(adjustedStartTime)}s on track ${bestTrack + 1} to avoid overlap`
      : bestTrack !== track
      ? `${asset.name} was placed on track ${bestTrack + 1} for better organization`
      : `${asset.name} has been added to track ${bestTrack + 1}`;
    
    toast({
      title: "Video added to timeline",
      description: message,
    });
  };

  const handleMultipleVideoAssetDrop = async (videoAssets: any[], track: number, dropTime: number) => {
    console.log("🎬 [Video Handler] Multiple assets dropped:", videoAssets.map(a => a.name));
    console.log("🎬 [Video Handler] Initial drop time:", dropTime, "Initial track:", track);
    
    let currentDropTime = dropTime;
    const newClips: Clip[] = [];
    
    for (let i = 0; i < videoAssets.length; i++) {
      const videoAsset = videoAssets[i];
      console.log(`🎬 [Video Handler] Processing asset ${i + 1}/${videoAssets.length}:`, videoAsset.name);
      
      // Always look up the asset in the asset store by id
      const asset = getAssetById ? getAssetById(videoAsset.id) : videoAsset;
      if (!asset || !asset.file_path) {
        console.warn(`Skipping asset ${videoAsset.name}: file path not found`);
        continue;
      }

      console.log(`🎬 [Video Handler] Asset details:`, {
        name: asset.name,
        duration: asset.duration,
        currentDropTime: currentDropTime
      });

      // Generate thumbnail from Supabase video URL FIRST
      let thumbnail = "";
      try {
        console.log("🎬 [Video Handler] Creating signed URL for thumbnail generation:", asset.name);
        const { data: urlData, error } = await supabase.storage
          .from('assets')
          .createSignedUrl(asset.file_path, 3600); // 1 hour expiry
        
        if (error) {
          console.error(`Failed to create signed URL for thumbnail (${asset.name}):`, error);
        } else if (urlData?.signedUrl) {
          console.log("🎬 [Video Handler] Generating thumbnail for:", asset.name);
          // Wait for thumbnail generation to complete
          thumbnail = await generateVideoThumbnail(urlData.signedUrl);
          console.log("🎬 [Video Handler] ✅ Successfully generated thumbnail for:", asset.name);
        }
      } catch (e) {
        console.error(`🎬 [Video Handler] ❌ Failed to generate thumbnail for asset ${asset.name}:`, e);
      }

      // For sequential placement, use the current drop time directly
      // Don't use findBestTrack for multi-drop to ensure sequential placement
      const clipStartTime = currentDropTime;
      const clipEndTime = clipStartTime + asset.duration;
      
      console.log(`🎬 [Video Handler] Placing clip "${asset.name}" at:`, {
        start: clipStartTime,
        end: clipEndTime,
        duration: asset.duration,
        track: track
      });

      // Create a backend-ready timeline clip with the generated thumbnail
      const newClip: Clip = {
        id: `clip-${Date.now()}-${Math.random()}`,
        name: asset.name,
        start: clipStartTime,
        end: clipEndTime,
        track: track, // Use the original track for all clips in multi-drop
        type: "video",
        file_path: asset.file_path,
        thumbnail: thumbnail, // Use generated thumbnail from Supabase video
        effects: [],
        _type: "VideoClip"
      } as any;
      
      newClips.push(newClip);
      
      // Update drop time for next clip (place them sequentially)
      currentDropTime = clipEndTime; // Use the end time of this clip
      
      console.log(`🎬 [Video Handler] Next drop time will be:`, currentDropTime);
    }
    
    if (newClips.length > 0) {
      console.log("🎬 [Video Handler] Final clips to add:", newClips.map(c => ({ 
        name: c.name, 
        start: c.start, 
        end: c.end, 
        duration: c.end - c.start,
        hasThumbnail: !!c.thumbnail 
      })));
      
      // Add all clips at once
      const updatedClips = [...clips, ...newClips];
      setClips(updatedClips);
      
      // Force recalculate duration after adding multiple clips
      setTimeout(() => {
        const { recalculateDuration } = useEditorStore.getState();
        console.log("🎬 [Video Handler] Manually calling recalculateDuration after multiple clip add...");
        recalculateDuration();
      }, 100); // Small delay to ensure state is updated
      
      setSelectedClipId(newClips[newClips.length - 1].id); // Select the last added clip
      
      // Set the video source for the player if we don't have one yet
      if (!videoSrc || clips.length === 0) {
        const firstAsset = videoAssets[0];
        const asset = getAssetById ? getAssetById(firstAsset.id) : firstAsset;
        if (asset?.file_path) {
          try {
            const { data: urlData, error } = await supabase.storage
              .from('assets')
              .createSignedUrl(asset.file_path, 3600);
            
            if (!error && urlData?.signedUrl) {
              setVideoSrc(urlData.signedUrl);
              setActiveVideoAsset(asset);
            }
          } catch (e) {
            console.error('Error creating signed URL for video player:', e);
          }
        }
      }
      
      toast({
        title: "Videos added to timeline",
        description: `${newClips.length} video${newClips.length > 1 ? 's' : ''} added to the timeline`,
      });
    }
  };

  // Handle processed video update
  const handleVideoProcessed = (processedVideoUrl: string) => {
    console.log("🎬 [Video Handler] handleVideoProcessed called with:", processedVideoUrl);
    console.log("🎬 [Video Handler] Current clips before processing:", clips);
    
    if (processedVideoUrl) {
      console.log("Video processed, updating source:", processedVideoUrl);
      
      // Create a temporary video element to get metadata of the processed video
      const tempVideo = document.createElement("video");
      tempVideo.src = processedVideoUrl;
      
      tempVideo.onloadedmetadata = () => {
        const processedDuration = tempVideo.duration;
        
        console.log("🎬 [Video Handler] Video metadata loaded, duration:", processedDuration);
        
        // Get fresh clips state to avoid stale closure
        const currentClips = useEditorStore.getState().clips;
        console.log("🎬 [Video Handler] Fresh clips state during metadata load:", currentClips);
        
        // Update the video source to show the processed video
        setVideoSrc(processedVideoUrl);
        setDuration(processedDuration);
        
        // Create a new active video asset based on the processed video
        const newVideoAsset = {
          ...activeVideoAsset,
          src: processedVideoUrl,
          duration: processedDuration,
          id: `processed-${Date.now()}`,
          name: activeVideoAsset?.name ? `${activeVideoAsset.name} (Edited)` : "Processed Video"
        };
        
        setActiveVideoAsset(newVideoAsset);
        
        // FIXED: Instead of replacing all clips, preserve the timeline structure
        // Only update video clips to reflect the new processed video source
        if (currentClips.length > 0) {
          console.log("🎬 [Video Handler] Preserving existing clips, updating video clips");
          // Keep existing timeline structure but update video clips to use processed video
          const updatedClips = currentClips.map(clip => {
            if (clip.type === "video") {
              return {
                ...clip,
                name: clip.name.includes("(Edited)") ? clip.name : `${clip.name} (Edited)`
              };
            }
            return clip;
          });
          console.log("🎬 [Video Handler] Updated clips:", updatedClips);
          setClips(updatedClips);
        } else {
          console.log("🎬 [Video Handler] No existing clips, creating new clip for processed video");
          // If no clips exist, create a single clip for the processed video
          const newClip: Clip = {
            id: `clip-${Date.now()}`,
            start: 0,
            end: processedDuration,
            track: 0,
            type: "video",
            name: newVideoAsset.name
          };
          console.log("🎬 [Video Handler] Created new clip:", newClip);
          setClips([newClip]);
        }
        
        // Don't reset current time if user is in the middle of editing
        // setCurrentTime(0);  // Removed: Let user stay at current position
        
        toast({
          title: "Video processed",
          description: "Your video has been updated with the latest edits",
        });
      };
      
      tempVideo.onerror = () => {
        console.log("🎬 [Video Handler] Error loading processed video");
        toast({
          title: "Error",
          description: "Failed to load processed video",
          variant: "destructive"
        });
      };
    }
  };

  return {
    handleVideoSelect,
    handleVideoDrop,
    handleVideoAssetDrop,
    handleMultipleVideoAssetDrop,
    handleVideoProcessed
  };
};
