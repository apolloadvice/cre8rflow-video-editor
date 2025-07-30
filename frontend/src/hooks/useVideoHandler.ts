import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useEditorStore, Clip, createClip } from "@/store/editorStore";
import { updateAssetDuration } from "@/api/apiClient";
import { supabase } from "@/integrations/supabase/client";
import { convertClipsToOTIOTimeline } from "@/utils/timelineAdapter";

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

  // 🔍 Enhanced Debug Logging: Track all setClips calls with source tracking
  const debugSetClips = (newClips: any[], source: string) => {
    const timestamp = new Date().toISOString();
    console.log(`🔍 [useVideoHandler] [${timestamp}] setClips called from: ${source}`);
    console.log(`🔍 [useVideoHandler] Previous clip count: ${clips.length}`);
    console.log(`🔍 [useVideoHandler] New clip count: ${newClips.length}`);
    console.log(`🔍 [useVideoHandler] Previous clips:`, clips.map(c => ({ id: c.id, name: c.name, start: c.start, end: c.end, track: c.track })));
    console.log(`🔍 [useVideoHandler] New clips:`, newClips.map(c => ({ id: c.id, name: c.name, start: c.start, end: c.end, track: c.track })));
    
    setClips(newClips);
    
    // Verify clips after a short delay to catch any immediate overrides
    setTimeout(() => {
      const currentClips = useEditorStore.getState().clips;
      if (currentClips.length !== newClips.length) {
        console.error(`🔍 [useVideoHandler] CLIPS MISMATCH after ${source}! Expected: ${newClips.length}, Got: ${currentClips.length}`);
        console.error(`🔍 [useVideoHandler] Current clips after ${source}:`, currentClips.map(c => ({ id: c.id, name: c.name })));
      } else {
        console.log(`🔍 [useVideoHandler] ✅ Clips verified after ${source}: ${currentClips.length} clips`);
      }
    }, 100);
  };
  
  // Modern v2 API auto-save function
  const saveTimelineV2 = async (clips: Clip[], primaryAssetPath: string) => {
    try {
      console.log("💾 [Video Handler] Auto-saving timeline via v2 API...");
      console.log("💾 [Video Handler] Clips to save:", clips.length);
      
      if (clips.length === 0) {
        console.warn("⚠️ [Video Handler] No clips to save, skipping auto-save");
        return { success: false, message: "No clips to save" };
      }
      
      // Convert clips to OTIO timeline format
      const otioTimeline = convertClipsToOTIOTimeline(clips);
      
      // Use a simple "save timeline" command through our v2 API
      const response = await fetch('/api/command/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: "save timeline",
          asset_path: primaryAssetPath,
          timeline_format: "otio",
          migration_mode: true,
          current_timeline: otioTimeline
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log("✅ [Video Handler] Timeline auto-saved via v2 API successfully");
      
      return { success: true, message: result.message || "Timeline saved" };
      
    } catch (error: any) {
      console.error("❌ [Video Handler] V2 API auto-save failed:", error);
      return { success: false, message: error.message || "Auto-save failed" };
    }
  };

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
      
      const newClip = createClip({
        id: `clip-${Date.now()}`,
        name: file.name,
        start: adjustedStartTime,
        end: adjustedStartTime + clipDuration,
        track: bestTrack,
        type: "video",
        thumbnail: thumbnail, // Include generated thumbnail
        in_point: 0 // Default source media in-point
      });
      
      debugSetClips([...clips, newClip], 'video_file_drop');
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

    console.log("🎬 [Video Handler] Asset found:", asset.name, "file_path:", asset.file_path, "duration:", asset.duration);

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

    // 🔧 FIX: Start at 00:00 if timeline is empty, regardless of drop position
    let adjustedStartTime = dropTime;
    let bestTrack = track;
    
    if (clips.length === 0) {
      // Empty timeline: Always start at 00:00 on track 0
      adjustedStartTime = 0;
      bestTrack = 0;
      console.log("🎬 [Video Handler] Empty timeline detected - positioning first clip at 00:00 on track 0");
    } else {
      // Non-empty timeline: Use smart positioning
      const result = findBestTrack(clips, 'video', dropTime, asset.duration);
      bestTrack = result.track;
      adjustedStartTime = result.startTime;
      console.log("🎬 [Video Handler] Non-empty timeline - using smart positioning");
    }

    console.log("🎬 [Video Handler] Creating clip with timing:", {
      name: asset.name,
      track: bestTrack,
      adjustedStartTime,
      assetDuration: asset.duration,
      calculatedEnd: adjustedStartTime + asset.duration,
      hasThumbnail: !!thumbnail,
      thumbnailLength: thumbnail.length
    });

    // Create a backend-ready timeline clip with the generated thumbnail using createClip helper
    const newClip = createClip({
      id: `clip-${Date.now()}`,
      name: asset.name,
      start: adjustedStartTime,
      end: adjustedStartTime + asset.duration,
      track: bestTrack,
      type: "video",
      file_path: asset.file_path,
      thumbnail: thumbnail, // Use generated thumbnail from Supabase video
      in_point: 0, // Default source media in-point
      effects: [],
      _type: "VideoClip"
    });
    
    console.log("🎬 [Video Handler] Adding clip to timeline:", newClip);
    const updatedClips = [...clips, newClip];
    
    // 🔍 DEBUG LOGGING: Show timeline state before and after drop
    console.log("🎬 [DRAG & DROP DEBUG] Frontend timeline state BEFORE drop:");
    console.log("🎬 [DRAG & DROP DEBUG] Total clips before:", clips.length);
    clips.forEach((clip, i) => {
      console.log(`🎬 [DRAG & DROP DEBUG] Existing clip ${i+1}:`, {
        id: clip.id,
        name: clip.name,
        file_path: clip.file_path,
        start: clip.start,
        end: clip.end,
        track: clip.track,
        duration: clip.duration || (clip.end - clip.start)
      });
    });
    
    console.log("🎬 [DRAG & DROP DEBUG] Frontend timeline state AFTER drop:");
    console.log("🎬 [DRAG & DROP DEBUG] Total clips after:", updatedClips.length);
    updatedClips.forEach((clip, i) => {
      console.log(`🎬 [DRAG & DROP DEBUG] Final clip ${i+1}:`, {
        id: clip.id,
        name: clip.name,
        file_path: clip.file_path,
        start: clip.start,
        end: clip.end,
        track: clip.track,
        duration: clip.duration || (clip.end - clip.start)
      });
    });
    
    debugSetClips(updatedClips, 'single_video_asset_drop');
    
    // 💾 AUTO-SAVE: Save timeline to backend after adding clip using v2 API
    const saveResult = await saveTimelineV2(updatedClips, asset.file_path);
    if (saveResult.success) {
      console.log("✅ [Video Handler] Single clip timeline auto-saved successfully");
      
      // 🎬 IMMEDIATE PLAYBACK: Set video source and start position for seamless playback
      if (adjustedStartTime === 0 && clips.length === 0) {
        // First clip at 00:00 - set playhead to beginning for immediate playback
        setCurrentTime(0);
        console.log("🎬 [Video Handler] First clip at 00:00 - playhead set to beginning");
      }
    } else {
      console.warn("⚠️ [Video Handler] Single clip timeline auto-save failed:", saveResult.message);
    }
    
    // Duration will be recalculated automatically by the store
    
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
    
    // 🔧 FIX: Start at 00:00 if timeline is empty, regardless of drop position
    let currentDropTime = dropTime;
    if (clips.length === 0) {
      currentDropTime = 0;
      console.log("🎬 [Video Handler] Empty timeline detected - starting multi-drop at 00:00");
    }
    
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

      // Create a backend-ready timeline clip with the generated thumbnail using createClip helper
      const newClip = createClip({
        id: `clip-${Date.now()}-${Math.random()}`,
        name: asset.name,
        start: clipStartTime,
        end: clipEndTime,
        track: track, // Use the original track for all clips in multi-drop
        type: "video",
        file_path: asset.file_path,
        thumbnail: thumbnail, // Use generated thumbnail from Supabase video
        in_point: 0, // Default source media in-point
        effects: [],
        _type: "VideoClip"
      });
      
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
      debugSetClips(updatedClips, 'multiple_video_asset_drop');
      
      // Duration will be recalculated automatically by the store
      
      setSelectedClipId(newClips[newClips.length - 1].id); // Select the last added clip
      
      // 💾 AUTO-SAVE: Save timeline to backend after adding multiple clips using v2 API
      // Use the first asset's file path as the primary save path
      const firstAsset = videoAssets[0];
      const primaryAsset = getAssetById ? getAssetById(firstAsset.id) : firstAsset;
      const saveAssetPath = primaryAsset?.file_path || 'default_timeline';
      
      const saveResult = await saveTimelineV2(updatedClips, saveAssetPath);
      if (saveResult.success) {
        console.log("✅ [Video Handler] Multi-asset timeline auto-saved successfully");
        console.log("✅ [Video Handler] Saved under asset path:", saveAssetPath);
        
        // 🎬 IMMEDIATE PLAYBACK: Set playhead for seamless playback after multi-drop
        if (clips.length === 0 && newClips.length > 0 && newClips[0].start === 0) {
          // First clips starting at 00:00 - set playhead to beginning
          setCurrentTime(0);
          console.log("🎬 [Video Handler] Multi-drop starting at 00:00 - playhead set to beginning");
        }
      } else {
        console.warn("⚠️ [Video Handler] Multi-asset timeline auto-save failed:", saveResult.message);
      }
      
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
          debugSetClips(updatedClips, 'video_processed_preserve_timeline');
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
          debugSetClips([newClip], 'video_processed_new_clip');
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
