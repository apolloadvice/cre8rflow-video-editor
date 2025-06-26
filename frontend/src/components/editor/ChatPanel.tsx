import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowUp, Bot } from "lucide-react";
import { useCommand } from "@/hooks/useCommand";
import { useEditorStore } from "@/store/editorStore";
import { parseCommand } from "@/api/apiClient";
import { useToast } from "@/components/ui/use-toast";
import { simulateCutCommand, simulateOptimisticEdit } from "@/utils/optimisticEdit";
import { useAnimationStore } from "@/store/animationStore";
import { generateCaptionSequence, generateRandomCaption } from "@/utils/viralCaptions";

interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  timestamp: Date;
  thinking?: boolean;
}

interface ChatPanelProps {
  onChatCommand: (command: string) => void;
  onVideoProcessed?: (videoUrl: string) => void; // New prop to handle processed video
}

const quickActions = [
  "Auto-Cut Silence",
  "Highlight Reel",
  "Add Subtitles",
  "Color Grade",
  "Sync to Music",
  "Cinematic Look",
  "Vertical Crop"
];

// Debug logger with timestamp
const debugLog = (component: string, action: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`🐛 [${timestamp}] [${component}] ${action}`, data || '');
};

const ChatPanel = ({ onChatCommand, onVideoProcessed }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [status, setStatus] = useState<string | null>(null); // New: step-by-step status
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const statusTimersRef = useRef<NodeJS.Timeout[]>([]); // Store timer IDs for cleanup
  const { executeCommand, isProcessing, logs, error } = useCommand();
  const clips = useEditorStore((state) => state.clips);
  const setClips = useEditorStore((state) => state.setClips);
  const { activeVideoAsset, setActiveVideoAsset } = useEditorStore();
  const { toast } = useToast();
  const { startAnimation, processNextClip, simulateProgress, clearCurrentAnimation, startBatchCaptionAnimation, startTrackingTextAnimation } = useAnimationStore();

  // Store caption data for timeline integration after animation completes
  const captionDataRef = useRef<{ textPlacements: any[]; timelineDuration: number } | null>(null);
  const trackingTextDataRef = useRef<{ text: string; start: number; end: number; track: number } | null>(null);
  
  // Ref for the textarea to handle keyboard shortcuts
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debug component lifecycle
  useEffect(() => {
    debugLog('ChatPanel', 'Component mounted');
    return () => {
      debugLog('ChatPanel', 'Component unmounting');
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    debugLog('ChatPanel', 'Messages or status changed', { messagesCount: messages.length, status });
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      debugLog('ChatPanel', 'Cleanup useEffect triggered');
      clearStatusTimers();
      // Additional cleanup: clear any animation state
      clearCurrentAnimation();
    };
  }, []);

  // Additional cleanup on component unmount - using a ref to track if component is mounted
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    debugLog('ChatPanel', 'isMountedRef set to true');
    return () => {
      debugLog('ChatPanel', 'Setting isMountedRef to false and cleaning up');
      isMountedRef.current = false;
      clearStatusTimers();
      clearCurrentAnimation();
      console.log('🧹 [ChatPanel] Component unmounted, all timers and animations cleared');
    };
  }, []);

  // Cleanup function for status timers
  const clearStatusTimers = () => {
    debugLog('ChatPanel', 'Clearing status timers', { count: statusTimersRef.current?.length || 0 });
    if (statusTimersRef.current) {
      statusTimersRef.current.forEach((timer, index) => {
        if (timer) {
          debugLog('ChatPanel', `Clearing timer ${index}`);
          clearTimeout(timer);
        }
      });
      statusTimersRef.current = [];
    }
  };

  // Safety wrapper for state updates to prevent updates on unmounted components
  const safeSetMessages = (updater: any) => {
    debugLog('ChatPanel', 'safeSetMessages called', { isMounted: isMountedRef.current });
    if (isMountedRef.current) {
      setMessages(updater);
    } else {
      debugLog('ChatPanel', 'Prevented setMessages on unmounted component');
    }
  };

  const safeSetStatus = (status: string | null) => {
    debugLog('ChatPanel', 'safeSetStatus called', { status, isMounted: isMountedRef.current });
    if (isMountedRef.current) {
      setStatus(status);
    } else {
      debugLog('ChatPanel', 'Prevented setStatus on unmounted component');
    }
  };

  const safeSetIsThinking = (thinking: boolean) => {
    debugLog('ChatPanel', 'safeSetIsThinking called', { thinking, isMounted: isMountedRef.current });
    if (isMountedRef.current) {
      setIsThinking(thinking);
    } else {
      debugLog('ChatPanel', 'Prevented setIsThinking on unmounted component');
    }
  };

  // Helper to summarize parsed command in friendly language
  function summarizeParsed(parsed: any, userInput: string): string {
    if (!parsed || typeof parsed !== 'object') {
      return "operation completed";
    }

    // Handle arrays of operations
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return "operation completed";
      if (parsed.length === 1) return summarizeParsed(parsed[0], userInput);
      
      // Multiple operations - summarize them
      const summaries = parsed.map(p => summarizeParsed(p, userInput)).filter(s => s !== "operation completed");
      if (summaries.length === 0) return "multiple operations completed";
      if (summaries.length === 1) return summaries[0];
      if (summaries.length === 2) return `${summaries[0]} and ${summaries[1]}`;
      
      // More than 2 operations
      const lastSummary = summaries.pop();
      return `${summaries.join(', ')}, and ${lastSummary}`;
    }

    const action = parsed.action?.toLowerCase();
    const text = parsed.text;
    const start = parsed.start;
    const end = parsed.end;
    const clipName = parsed.clip_name;
    const target = parsed.target;

    // Create descriptive summaries based on operation type
    switch (action) {
      case 'cut':
        if (target === 'each_clip') {
          return `trimmed all clips by ${parsed.trim_start || 0}s from start and ${parsed.trim_end || 0}s from end`;
        } else if (start !== undefined && end !== undefined) {
          return `extracted segment from ${start}s to ${end}s`;
        } else {
          return "performed cut operation";
        }
      
      case 'add_text':
        if (target === 'viral_captions') {
          const interval = parsed.interval || 3;
          const style = parsed.caption_style || 'viral';
          return `created ${style} captions every ${interval} seconds across the timeline`;
        } else if (target === 'each_clip') {
          return `added text overlays to all clips`;
        } else if (text && start !== undefined && end !== undefined) {
          return `added text "${text}" from ${start}s to ${end}s`;
        } else if (text) {
          return `added text overlay "${text}"`;
        } else {
          return "added text overlay";
        }
      
      case 'trim':
        return `trimmed clip ${clipName ? `"${clipName}"` : ''}`;
      
      case 'fade':
        const direction = parsed.direction;
        return `applied ${direction || ''} fade effect`.trim();
      
      case 'overlay':
        const asset = parsed.asset;
        return `overlaid ${asset ? `"${asset}"` : 'element'}`;
      
      default:
        return `applied ${action || 'edit'} operation`;
    }
  }

  // Generate completion message using GPT for more natural responses
  async function generateCompletionMessage(summary: string, userInput: string): Promise<string> {
    // For now, use local completion to avoid environment variable issues
    // The OpenAI integration can be enabled later when needed
    console.log('Using local completion message for now');
    return getLocalCompletionMessage(summary);
    
    /* TODO: Enable this when OpenAI integration is needed
    // Check if OpenAI API key is available
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey || apiKey.length < 10) {
      console.log('OpenAI API key not available, using local completion message');
      return getLocalCompletionMessage(summary);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a video editing assistant. Generate a brief, natural confirmation message (without emojis) that paraphrases what the user accomplished. Keep it concise, friendly, and avoid repeating the user\'s exact words. Maximum 15 words.'
            },
            {
              role: 'user', 
              content: `User said: "${userInput}"\nWhat was accomplished: ${summary}\n\nGenerate a natural confirmation message:`
            }
          ],
          max_tokens: 60,
          temperature: 0.7
        })
      });

      if (response.ok) {
        const data = await response.json();
        const message = data.choices?.[0]?.message?.content?.trim();
        if (message && message.length > 0) {
          console.log('Generated GPT completion message:', message);
          return message;
        }
      } else {
        console.warn('OpenAI API request failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.warn('Failed to generate GPT completion message:', error);
    }
    
    // Fallback to local generation
    return getLocalCompletionMessage(summary);
    */
  }

  function getLocalCompletionMessage(summary: string): string {
    // Fallback message generation without GPT
    const variations = [
      `Perfect! I've ${summary} on your timeline.`,
      `Great! Successfully ${summary} for your video.`,
      `Done! I've completed the ${summary} as requested.`,
      `Excellent! The ${summary} has been applied to your project.`,
      `Success! I've finished ${summary} on your video.`,
      `All set! Your video now has the ${summary}.`,
      `Complete! I've ${summary} as you wanted.`,
      `Finished! The ${summary} is now active on your timeline.`,
      `Ready! I've successfully ${summary} for you.`,
      `Applied! Your ${summary} is complete and ready to preview.`
    ];
    
    return variations[Math.floor(Math.random() * variations.length)];
  }

  // Function to detect if command is a batch operation
  const detectBatchOperation = (command: string, parsedResult?: any): boolean => {
    debugLog('ChatPanel', 'Detecting batch operation', { command, parsedResult });
    // Frontend detection based on keywords
    const batchKeywords = ['each clip', 'all clips', 'every clip', 'all videos', 'each video'];
    const captionKeywords = ['captions', 'subtitles', 'viral captions', 'story-telling captions'];
    
    // New: Tracking text keywords and patterns
    const trackingTextPatterns = [
      /add\s+['""][^'"]*['"]\s+on\s+me/i,  // "Add 'text' on me"
      /make\s+it\s+track\s+me/i,           // "make it track me"
      /track\s+me\s+when/i,                // "track me when"
      /add.*on\s+me.*track/i,              // "add ... on me ... track"
      /track.*text.*on\s+me/i              // "track ... text ... on me"
    ];
    
    const hasBatchKeyword = batchKeywords.some(keyword => 
      command.toLowerCase().includes(keyword)
    );
    
    const isCaptionCommand = captionKeywords.some(keyword => 
      command.toLowerCase().includes(keyword)
    );

    // New: Check for tracking text patterns
    const isTrackingTextCommand = trackingTextPatterns.some(pattern => 
      pattern.test(command)
    );

    // Backend detection - check if parsed result indicates batch operation
    const isBatchFromBackend = parsedResult && 
      (Array.isArray(parsedResult) || 
       parsedResult.target === 'each_clip' || 
       parsedResult.target === 'all_clips' ||
       parsedResult.target === 'viral_captions' ||
       parsedResult.target === 'tracking_text' ||  // New: backend tracking text detection
       parsedResult.action === 'tracking_text');   // Alternative backend detection

    const result = hasBatchKeyword || isCaptionCommand || isTrackingTextCommand || isBatchFromBackend;
    debugLog('ChatPanel', 'Batch operation detection result', { 
      result, 
      hasBatchKeyword, 
      isCaptionCommand, 
      isTrackingTextCommand,  // New debug info
      isBatchFromBackend 
    });
    return result;
  };

  // Helper function to extract quoted text from tracking text commands
  const extractTrackingText = (command: string): string | null => {
    debugLog('ChatPanel', 'Extracting tracking text', { command });
    
    // Try different quote patterns to extract the text
    const quotePatterns = [
      /add\s+['"]([^'"]*)['\"]/i,           // "Add 'text'" or "Add \"text\""
      /['"]([^'"]*)['"]\s+on\s+me/i,       // "'text' on me" or "\"text\" on me"
      /(?:add|put)\s+['"]([^'"]*)['\"]/i,   // "put 'text'" variations
    ];
    
    for (const pattern of quotePatterns) {
      const match = command.match(pattern);
      if (match && match[1] && match[1].trim()) {
        const extractedText = match[1].trim();
        debugLog('ChatPanel', 'Successfully extracted tracking text', { extractedText });
        return extractedText;
      }
    }
    
    debugLog('ChatPanel', 'No tracking text found', { command });
    return null;
  };

  // Smart placement logic for tracking text
  const generateRandomTimeframe = (videoDuration: number): { start: number; end: number } => {
    debugLog('ChatPanel', 'Generating random timeframe for tracking text', { videoDuration });
    
    const TRACKING_TEXT_DURATION = 3; // Fixed 3-second duration as specified
    
    // Ensure we don't go beyond video duration
    const maxStartTime = Math.max(0, videoDuration - TRACKING_TEXT_DURATION);
    const randomStart = Math.random() * maxStartTime;
    
    const timeframe = {
      start: Math.round(randomStart * 10) / 10, // Round to 1 decimal place
      end: Math.round((randomStart + TRACKING_TEXT_DURATION) * 10) / 10
    };
    
    debugLog('ChatPanel', 'Generated random timeframe', { timeframe, videoDuration });
    return timeframe;
  };

  const checkTextCollision = (newStart: number, newEnd: number, trackIndex: number): boolean => {
    debugLog('ChatPanel', 'Checking text collision', { newStart, newEnd, trackIndex });
    
    // Check existing clips on the specified track for collisions
    const existingClips = clips.filter(clip => 
      clip.track === trackIndex && 
      clip.type === 'text' &&
      clip.id !== undefined // Only check actual clips, not pending ones
    );
    
    for (const clip of existingClips) {
      const clipStart = clip.start || 0;
      const clipEnd = clip.end || clipStart + 3;
      
      // Check for overlap: new text overlaps if it starts before existing ends and ends after existing starts
      const hasOverlap = newStart < clipEnd && newEnd > clipStart;
      
      if (hasOverlap) {
        debugLog('ChatPanel', 'Text collision detected', { 
          newStart, 
          newEnd, 
          clipStart, 
          clipEnd, 
          clipId: clip.id 
        });
        return true;
      }
    }
    
    debugLog('ChatPanel', 'No text collision detected', { newStart, newEnd, trackIndex });
    return false;
  };

  const findAvailableTextTrack = (newStart: number, newEnd: number): number => {
    debugLog('ChatPanel', 'Finding available text track', { newStart, newEnd });
    
    // Start checking from track 1 (track 0 is typically for video)
    // Check up to 5 potential text tracks (1, 2, 3, 4, 5)
    for (let trackIndex = 1; trackIndex <= 5; trackIndex++) {
      if (!checkTextCollision(newStart, newEnd, trackIndex)) {
        debugLog('ChatPanel', 'Found available text track', { trackIndex, newStart, newEnd });
        return trackIndex;
      }
    }
    
    // If no available track found in tracks 1-5, create a new one (track 6+)
    const newTrackIndex = Math.max(6, 
      Math.max(...clips.filter(c => c.type === 'text').map(c => c.track || 1)) + 1
    );
    
    debugLog('ChatPanel', 'No available text track found, creating new track', { 
      newTrackIndex, 
      newStart, 
      newEnd 
    });
    return newTrackIndex;
  };

  const generateSmartTrackingTextPlacement = (
    trackingText: string, 
    videoDuration: number
  ): { text: string; start: number; end: number; track: number } => {
    debugLog('ChatPanel', 'Generating smart tracking text placement', { trackingText, videoDuration });
    
    // Generate random timeframe
    const timeframe = generateRandomTimeframe(videoDuration);
    
    // Find available track
    const trackIndex = findAvailableTextTrack(timeframe.start, timeframe.end);
    
    const placement = {
      text: trackingText,
      start: timeframe.start,
      end: timeframe.end,
      track: trackIndex
    };
    
    debugLog('ChatPanel', 'Generated smart placement', { placement });
    return placement;
  };

  // Function to calculate caption placements based on timeline duration and interval
  const calculateCaptionPlacements = (timelineDuration: number, interval: number = 3) => {
    const textCount = Math.ceil(timelineDuration / interval);
    const placements = [];
    
    for (let i = 0; i < textCount; i++) {
      placements.push({
        start: i * interval,
        end: Math.min((i * interval) + interval, timelineDuration),
        index: i,
        id: `viral_caption_${i}`,
        name: `Viral Caption ${i + 1}`
      });
    }
    
    return placements;
  };

  // Function to add actual text clips to timeline after animation completes
  const addCaptionsToTimeline = (textPlacements: any[], timelineDuration: number) => {
    debugLog('ChatPanel', 'Adding viral captions to timeline', { placementCount: textPlacements.length, timelineDuration });
    
    const newClips = textPlacements.map((placement, index) => {
      const clipId = `caption-${Date.now()}-${index}`;
      const captionText = generateRandomCaption(index); // Use viral caption content
      
      return {
        id: clipId,
        name: captionText, // Show actual caption text in timeline
        type: 'text' as const,
        track: 1, // Place on track 1 (below video track 0)
        start: placement.start,
        end: placement.end,
        duration: placement.end - placement.start,
        text: captionText,
        style: {
          fontSize: '12px',
          fontWeight: 'bold',
          color: '#ffffff',
          backgroundColor: 'transparent',
          position: 'bottom-third'
        }
      };
    });
    
    // Add the new clips to the timeline
    setClips([...clips, ...newClips]);
    
    debugLog('ChatPanel', 'Viral captions added to timeline', { 
      newClipsCount: newClips.length,
      clipIds: newClips.map(c => c.id)
    });
  };

  const addTrackingTextToTimeline = (placement: { text: string; start: number; end: number; track: number }) => {
    debugLog('ChatPanel', 'Adding tracking text to timeline', { placement });
    
    const clipId = `tracking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newClip = {
      id: clipId,
      name: placement.text, // Show actual tracking text in timeline
      type: 'text' as const,
      track: placement.track, // Use the smart-assigned track
      start: placement.start,
      end: placement.end,
      duration: placement.end - placement.start,
      text: placement.text,
      style: {
        fontSize: '20px',
        fontWeight: 'bold',
        color: '#ffff00', // Yellow for tracking text to distinguish from captions
        backgroundColor: 'rgba(0,0,0,0.8)',
        position: 'center',
        border: '1px solid #ffff00' // Border to indicate tracking functionality
      }
    };
    
    // Add the new tracking text clip to the timeline
    setClips([...clips, newClip]);
    
    debugLog('ChatPanel', 'Tracking text added to timeline', { 
      clipId: newClip.id,
      track: placement.track,
      timeframe: `${placement.start}-${placement.end}s`
    });
    
    return newClip;
  };

  // Function to start visual batch animation
  const startBatchCutAnimation = (command: string, targetClips: any[]) => {
    debugLog('ChatPanel', 'Starting batch cut animation', { command, clipsCount: targetClips.length });
    console.log('🎬 [ChatPanel] Starting batch cut animation for', targetClips.length, 'clips');

    // Create clip animations for cut operation
    const clipAnimations = targetClips.map((clip) => ({
      clipId: clip.id,
      clipName: clip.name || `Clip ${clip.id}`,
      operationType: 'cut' as const,
      state: 'idle' as const,
      progress: 0,
      metadata: {
        trimStart: 0.1,
        trimEnd: 0.1,
      },
    }));

    debugLog('ChatPanel', 'Created clip animations', { clipAnimations });

    // Start the animation
    const animationId = startAnimation(command, clipAnimations);
    debugLog('ChatPanel', 'Animation started', { animationId });

    // Start processing clips one by one with realistic timing
    processNextClip();

    // Simulate progress for each clip with more realistic timing
    // Each clip takes about 2.5 seconds to process
    targetClips.forEach((clip, index) => {
      const baseDelay = index * 300; // Stagger start times
      const processingDuration = 2200 + (Math.random() * 600); // 2.2-2.8 seconds per clip
      
      const timer = setTimeout(() => {
        debugLog('ChatPanel', `Starting animation for clip ${index + 1}/${targetClips.length}`, { clipName: clip.name });
        console.log(`🎬 [ChatPanel] Starting animation for clip ${index + 1}/${targetClips.length}: ${clip.name}`);
        simulateProgress(clip.id, processingDuration);
      }, baseDelay);
      
      statusTimersRef.current.push(timer);
    });

    console.log(`🎬 [ChatPanel] Animation initiated for ${targetClips.length} clips, expected duration: ${(targetClips.length * 2.5) + 1}s`);
    debugLog('ChatPanel', 'Batch animation setup complete', { expectedDuration: (targetClips.length * 2.5) + 1 });

    return animationId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    debugLog('ChatPanel', 'handleSubmit started', { input, isMounted: isMountedRef.current });
    
    if (!input.trim()) {
      debugLog('ChatPanel', 'Empty input, returning early');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      sender: "user",
      timestamp: new Date(),
    };

    debugLog('ChatPanel', 'Adding user message', userMessage);
    safeSetMessages((prevMessages) => [...prevMessages, userMessage]);
    safeSetIsThinking(true);
    safeSetStatus("Got it! Let me figure out what you want to do…");

    // Ensure we pass only the file_path string
    const assetPath = activeVideoAsset?.file_path;
    debugLog('ChatPanel', 'Asset path check', { assetPath, activeVideoAsset });
    
    if (!assetPath || typeof assetPath !== "string" || assetPath.length < 5) {
      debugLog('ChatPanel', 'Invalid asset path, showing error');
      clearStatusTimers(); // Clean up any existing timers
      safeSetStatus(null);
      toast({ variant: "destructive", description: "No valid video selected or uploaded." });
      safeSetIsThinking(false);
      safeSetMessages((prev) => [...prev, {
        id: Date.now().toString() + "-assistant",
        content: "I couldn't find a valid video to edit. Please upload or select a video first.",
        sender: "assistant",
        timestamp: new Date(),
      }]);
      return;
    }

    try {
      debugLog('ChatPanel', 'Starting command parsing', { input, assetPath });

    // Step 1: Parsing
      safeSetStatus("I'm reading your instructions…");
    const { parsed, error } = await parseCommand(input, assetPath);
      
      debugLog('ChatPanel', 'Parse command result', { parsed, error });
      
    if (error) {
        debugLog('ChatPanel', 'Parse error occurred', error);
        clearStatusTimers(); // Clean up any existing timers
        safeSetStatus(null);
      toast({ variant: "destructive", description: error });
        safeSetIsThinking(false);
        safeSetMessages((prev) => [...prev, {
        id: Date.now().toString() + "-assistant",
        content: `Hmm, I couldn't understand that. Could you rephrase? (${error})`,
        sender: "assistant",
        timestamp: new Date(),
      }]);
      return;
    }
      
    if (!parsed) {
        debugLog('ChatPanel', 'No parsed result');
        clearStatusTimers(); // Clean up any existing timers
        safeSetStatus(null);
        safeSetIsThinking(false);
        safeSetMessages((prev) => [...prev, {
        id: Date.now().toString() + "-assistant",
        content: `Hmm, I couldn't understand that. Could you rephrase?`,
        sender: "assistant",
        timestamp: new Date(),
      }]);
      return;
    }

      // Step 2: Check if this is a batch operation
      const isBatchOperation = detectBatchOperation(input, parsed);
      debugLog('ChatPanel', 'Batch operation check', { isBatchOperation });

      // Step 3: Show what was understood and start animations if batch
    const summary = summarizeParsed(parsed, input);
      debugLog('ChatPanel', 'Command summary', { summary });
      safeSetStatus(`I understood: ${summary.charAt(0).toUpperCase() + summary.slice(1)}.`);
      
      let animationPromise: Promise<void> | null = null;
      let expectedAnimationDuration = 0;
      
      // Start visual animations for batch operations
      if (isBatchOperation && clips.length > 0) {
        debugLog('ChatPanel', 'Starting batch animation workflow', { clipsCount: clips.length });
        console.log('🎬 [ChatPanel] Starting batch animation with', clips.length, 'clips');
        safeSetStatus("Starting visual editing process…");
        
        // Calculate expected animation duration
        // Each clip takes 2-3 seconds, plus some buffer time
        expectedAnimationDuration = (clips.length * 2500) + 1000; // 2.5s per clip + 1s buffer
        debugLog('ChatPanel', 'Animation duration calculated', { expectedAnimationDuration });
        
        // Check for specific operation types to determine animation workflow
        const isTrackingTextCommand = (parsed && parsed.target === 'tracking_text') || 
                                      (parsed && parsed.action === 'tracking_text') ||
                                      ['add', 'put'].some(verb => input.toLowerCase().includes(verb)) && 
                                      /['""][^'"]*['"]/.test(input) && 
                                      input.toLowerCase().includes('on me');
        
        // Detect operation type from command
        if (input.toLowerCase().includes('cut') || input.toLowerCase().includes('trim')) {
          debugLog('ChatPanel', 'Starting cut animation');
          startBatchCutAnimation(input, clips);
          safeSetStatus(`Processing ${clips.length} clips on timeline…`);
          
          // Update status during animation to show progress - store timer IDs for cleanup
          const timer1 = setTimeout(() => {
            debugLog('ChatPanel', 'Animation status update 1');
            safeSetStatus("Analyzing clip content…");
          }, 1500);
          statusTimersRef.current.push(timer1);
          
          const timer2 = setTimeout(() => {
            debugLog('ChatPanel', 'Animation status update 2');
            safeSetStatus("Applying cuts to each clip…");
          }, expectedAnimationDuration * 0.3);
          statusTimersRef.current.push(timer2);
          
          const timer3 = setTimeout(() => {
            debugLog('ChatPanel', 'Animation status update 3');
            safeSetStatus("Finalizing timeline updates…");
          }, expectedAnimationDuration * 0.7);
          statusTimersRef.current.push(timer3);
          
          // Create a promise that resolves when the animation should be complete
          animationPromise = new Promise((resolve) => {
            const animationTimer = setTimeout(() => {
              debugLog('ChatPanel', 'Animation duration completed');
              console.log('🎬 [ChatPanel] Animation duration completed');
              resolve();
            }, expectedAnimationDuration);
            statusTimersRef.current.push(animationTimer);
          });
        } else if ((parsed && parsed.target === 'viral_captions') || 
                   (clips.length > 0 && ['captions', 'subtitles', 'viral captions', 'story-telling captions'].some(keyword => 
                     input.toLowerCase().includes(keyword)))) {
          debugLog('ChatPanel', 'Starting viral caption animation');
          
          try {
            // Check if we have clips or an active video asset
            if (clips.length === 0 && !activeVideoAsset) {
              throw new Error('Please add video clips to the timeline before adding captions');
            }
          
          // Calculate timeline duration based on clips or asset
          const timelineDuration = clips.length > 0 ? Math.max(...clips.map(clip => clip.end || 0)) : (activeVideoAsset?.duration || 60);
          const interval = (parsed && parsed.interval) || 3; // Default to 3 seconds
          
          // Calculate caption placements for the animation store
          const textPlacements = calculateCaptionPlacements(timelineDuration, interval);
          
          // Store caption data for timeline integration after animation completes
          captionDataRef.current = { textPlacements, timelineDuration };
          
          // Generate consistent timestamp for clip IDs
          const timestamp = Date.now();
          startBatchCaptionAnimation(input, textPlacements, timestamp);
          safeSetStatus(`Adding ${textPlacements.length} captions to timeline...`);
          
          // Calculate expected animation duration for captions
          const captionCount = textPlacements.length;
          expectedAnimationDuration = (captionCount * 1500) + 1000; // 1.5s per caption + 1s buffer
          debugLog('ChatPanel', 'Viral caption animation duration calculated', { captionCount, expectedAnimationDuration });
          
          // Status updates as requested
          const timer1 = setTimeout(() => {
            debugLog('ChatPanel', 'Caption animation status update 1');
            safeSetStatus("Generating viral captions...");
          }, 1500);
          statusTimersRef.current.push(timer1);
          
          const timer2 = setTimeout(() => {
            debugLog('ChatPanel', 'Caption animation status update 2');
            safeSetStatus("Placing captions on timeline...");
          }, 3000);
          statusTimersRef.current.push(timer2);
          
          // Start processing captions one by one
          processNextClip();
          
          // Simulate progress for each caption with staggered timing
          // Generate consistent clip IDs that match what the animation store will create
          textPlacements.forEach((placement, index) => {
            const clipId = `caption-${timestamp}-${index}`;
            const baseDelay = index * 200; // Stagger start times (faster than cuts)
            const processingDuration = 1200 + (Math.random() * 400); // 1.2-1.6 seconds per caption
            
            const timer = setTimeout(() => {
              debugLog('ChatPanel', `Starting animation for caption ${index + 1}/${textPlacements.length}`, { 
                placementName: placement.name,
                clipId
              });
              console.log(`🎬 [ChatPanel] Starting animation for caption ${index + 1}/${textPlacements.length}: ${placement.name}`);
              simulateProgress(clipId, processingDuration);
            }, baseDelay);
            
            statusTimersRef.current.push(timer);
          });
          
          // Create a promise that resolves when the caption animation should be complete
          animationPromise = new Promise((resolve) => {
            const animationTimer = setTimeout(() => {
              debugLog('ChatPanel', 'Caption animation duration completed');
              console.log('🎬 [ChatPanel] Caption animation duration completed');
              resolve();
            }, expectedAnimationDuration);
            statusTimersRef.current.push(animationTimer);
          });
          
          } catch (error) {
            debugLog('ChatPanel', 'Error in viral caption animation setup', error);
            console.error('🎬 [ChatPanel] Error setting up viral caption animation:', error);
            throw error; // Re-throw to be handled by outer try-catch
          }
        } else if ((parsed && parsed.target === 'tracking_text') || 
                   (parsed && parsed.action === 'tracking_text') ||
                   isTrackingTextCommand) {
          debugLog('ChatPanel', 'Starting tracking text animation');
          
          // Extract the tracking text from the command
          const trackingText = extractTrackingText(input);
          if (!trackingText) {
            debugLog('ChatPanel', 'Could not extract tracking text from command');
            throw new Error('Could not extract text to track from command. Please use quotes around the text (e.g., "Add \'fried\' on me")');
          }
          
          // Use smart placement logic for intelligent positioning
          const timelineDuration = clips.length > 0 ? Math.max(...clips.map(clip => clip.end || 0)) : (activeVideoAsset?.duration || 60);
          const smartPlacement = generateSmartTrackingTextPlacement(trackingText, timelineDuration);
          
          debugLog('ChatPanel', 'Smart placement generated for tracking text', { 
            trackingText, 
            timelineDuration, 
            smartPlacement 
          });
          
          // Store tracking text data for timeline integration after animation completes
          trackingTextDataRef.current = smartPlacement;
          
          // Generate consistent timestamp for clip ID
          const timestamp = Date.now();
          startTrackingTextAnimation(input, trackingText, smartPlacement, timestamp);
          safeSetStatus(`Preparing to add "${trackingText}" with tracking on track ${smartPlacement.track}...`);
          
          // Calculate expected animation duration (short: 2-3 seconds total as specified)
          expectedAnimationDuration = 2500; // 2.5 seconds total
          debugLog('ChatPanel', 'Tracking text animation duration calculated', { expectedAnimationDuration });
          
          // Status updates with the specified progress messages
          const timer1 = setTimeout(() => {
            debugLog('ChatPanel', 'Tracking text animation status update 1');
            safeSetStatus("Analyzing speech patterns...");
          }, 400);
          statusTimersRef.current.push(timer1);
          
          const timer2 = setTimeout(() => {
            debugLog('ChatPanel', 'Tracking text animation status update 2');
            safeSetStatus("Finding optimal placement...");
          }, 1200);
          statusTimersRef.current.push(timer2);
          
          const timer3 = setTimeout(() => {
            debugLog('ChatPanel', 'Tracking text animation status update 3');
            safeSetStatus("Adding tracking text...");
          }, 2000);
          statusTimersRef.current.push(timer3);
          
          // Start processing the tracking text
          processNextClip();
          
          // Simulate progress for the tracking text element
          const clipId = `tracking-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
          const processingDuration = 2000; // 2 seconds processing time
          
          const progressTimer = setTimeout(() => {
            debugLog('ChatPanel', 'Starting tracking text progress simulation', { 
              trackingText, 
              clipId, 
              placement: smartPlacement 
            });
            console.log(`🎬 [ChatPanel] Starting tracking text animation for: "${trackingText}" at ${smartPlacement.start}-${smartPlacement.end}s on track ${smartPlacement.track}`);
            simulateProgress(clipId, processingDuration);
          }, 200);
          statusTimersRef.current.push(progressTimer);
          
          // Create a promise that resolves when the tracking text animation should be complete
          animationPromise = new Promise((resolve) => {
            const animationTimer = setTimeout(() => {
              debugLog('ChatPanel', 'Tracking text animation duration completed');
              console.log('🎬 [ChatPanel] Tracking text animation duration completed');
              resolve();
            }, expectedAnimationDuration);
            statusTimersRef.current.push(animationTimer);
          });
        }
        
        await new Promise((res) => setTimeout(res, 800)); // Let user see the animation start
      } else {
        debugLog('ChatPanel', 'No batch operation, normal processing');
        await new Promise((res) => setTimeout(res, 400)); // Normal pause for UX
      }
      
      safeSetStatus("Applying your edit to the video…");
      debugLog('ChatPanel', 'Starting backend processing');

      try {
        // Start backend processing and animation in parallel
        debugLog('ChatPanel', 'Starting parallel processing', { hasAnimation: !!animationPromise });
        const backendPromise = onChatCommand(input);
        
        // Wait for both backend processing AND animation to complete
        const [result] = await Promise.all([
          backendPromise,
          animationPromise || Promise.resolve() // If no animation, resolve immediately
        ]);
        
        debugLog('ChatPanel', 'Parallel processing completed', { result });
        
        // Add a small delay to show the completion state
        if (isBatchOperation) {
          debugLog('ChatPanel', 'Finishing batch operation');
          safeSetStatus("Finishing up visual effects…");
          await new Promise(resolve => setTimeout(resolve, 800)); // Show completion for a moment
        }
        
        // Clear all status timers since processing is complete
        debugLog('ChatPanel', 'Clearing timers after success');
        clearStatusTimers();
        
        safeSetStatus(null);
        safeSetIsThinking(false);
        toast({ description: "Edit applied" });
      setInput(""); // Clear input after success
      
        // Generate a natural completion message
        const completionMessage = await generateCompletionMessage(summary, input);
        
        const botMessage: Message = {
          id: Date.now().toString(),
          content: completionMessage,
        sender: "assistant",
        timestamp: new Date(),
        };
        safeSetMessages((prevMessages) => [...prevMessages, botMessage]);
        
        // Clear animation state after both processing and animation complete
        if (isBatchOperation) {
          debugLog('ChatPanel', 'Clearing animation state after completion');
          console.log("🎬 [ChatPanel] Clearing animation state after full animation and processing complete");
          clearCurrentAnimation();
        }
        
        // Add captions to timeline if this was a caption command
        if (captionDataRef.current) {
          debugLog('ChatPanel', 'Adding captions to timeline after animation completion');
          addCaptionsToTimeline(captionDataRef.current.textPlacements, captionDataRef.current.timelineDuration);
          captionDataRef.current = null; // Clear after use
        }
        
        // Add tracking text to timeline if this was a tracking text command
        if (trackingTextDataRef.current) {
          debugLog('ChatPanel', 'Adding tracking text to timeline after animation completion');
          addTrackingTextToTimeline(trackingTextDataRef.current);
          trackingTextDataRef.current = null; // Clear after use
        }
        
        debugLog('ChatPanel', 'Command processing completed successfully');
        
      } catch (error) {
        debugLog('ChatPanel', 'Error during command processing', error);
        console.error("🎬 [ChatPanel] Error processing command:", error);
        
        // Clear status timers on error to prevent memory leaks
        clearStatusTimers();
        
        // If there's an error, we still want to wait for animation to complete for better UX
        if (animationPromise) {
          debugLog('ChatPanel', 'Waiting for animation to complete despite error');
          console.log("🎬 [ChatPanel] Waiting for animation to complete despite error");
          await animationPromise;
        }
        
        safeSetStatus(null);
        safeSetIsThinking(false);
        
        // Clear animation state on error
        if (isBatchOperation) {
          debugLog('ChatPanel', 'Clearing animation state after error');
          console.log("🎬 [ChatPanel] Clearing animation state after error and animation completion");
          clearCurrentAnimation();
        }
        
        // Enhanced error message extraction
      let message = "Unknown error";
        let fullErrorInfo = "";
        
        if (error && typeof error === 'object') {
          console.log("🚨 [ChatPanel] Full error object:", error);
          
          if ('response' in error) {
            const err = error as any;
            console.log("🚨 [ChatPanel] Error response:", err?.response);
            console.log("🚨 [ChatPanel] Error response data:", err?.response?.data);
            console.log("🚨 [ChatPanel] Error response status:", err?.response?.status);
            
      if (err?.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          message = err.response.data.detail.map((d: any) => d.msg).join(", ");
        } else {
          message = err.response.data.detail;
        }
            } else if (err?.response?.data?.message) {
              message = err.response.data.message;
      } else if (err?.message) {
        message = err.message;
            } else if (err?.response?.statusText) {
              message = `Server error: ${err.response.statusText} (${err.response.status})`;
            }
            
            fullErrorInfo = `Status: ${err?.response?.status}, Data: ${JSON.stringify(err?.response?.data)}`;
          } else if (error instanceof Error) {
            message = error.message;
            fullErrorInfo = `Error type: ${error.constructor.name}, Stack: ${error.stack}`;
          } else if ('message' in error) {
            message = error.message as string;
          }
        } else if (error instanceof Error) {
          message = error.message;
          fullErrorInfo = `Error: ${error.constructor.name}`;
        } else if (typeof error === 'string') {
          message = error;
        }
        
        // Provide helpful guidance for common errors
        let userFriendlyMessage = message;
        if (message.includes("No video clips found")) {
          userFriendlyMessage = "I don't see any clips on your timeline yet. Please drag a video from the asset panel to the timeline first, then try your command again.";
        } else if (message.includes("No valid video selected")) {
          userFriendlyMessage = "Please select or upload a video first before running commands.";
        } else if (message.includes("Could not understand")) {
          userFriendlyMessage = "I couldn't understand that command. Try rephrasing it or use simpler language.";
        }
        
        // Log detailed error info for debugging
        console.error("🚨 [ChatPanel] Detailed error info:", fullErrorInfo);
        debugLog('ChatPanel', 'Error message determined', { message, fullErrorInfo, userFriendlyMessage });
        
        toast({ 
          variant: "destructive", 
          title: "Command Error",
          description: userFriendlyMessage 
        });
        
        const errorMessage: Message = {
          id: Date.now().toString(),
          content: `${userFriendlyMessage}`,
          sender: "assistant",
          timestamp: new Date(),
        };
        safeSetMessages((prevMessages) => [...prevMessages, errorMessage]);
        
      }
    } catch (outerError) {
      debugLog('ChatPanel', 'Outer catch block error', outerError);
      console.error("🎬 [ChatPanel] Outer error in handleSubmit:", outerError);
      
      // Emergency cleanup
      clearStatusTimers();
      clearCurrentAnimation();
      safeSetStatus(null);
      safeSetIsThinking(false);
      
      toast({ 
        variant: "destructive", 
        title: "Unexpected Error",
        description: "An unexpected error occurred. Please try again." 
      });
    }
    
    debugLog('ChatPanel', 'handleSubmit completed');
  };

  const handleQuickAction = (action: string) => {
    const formattedAction = action.toLowerCase();
    setInput(`Apply ${formattedAction} to my video`);
  };

  return (
    <div className="h-full flex flex-col bg-cre8r-gray-800 border-l border-cre8r-gray-700">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="bg-cre8r-violet/20 p-3 rounded-full mb-4">
              <Bot className="h-6 w-6 text-cre8r-violet" />
            </div>
            <h3 className="font-semibold mb-2">Tell me what edits to apply to your video</h3>
            <p className="text-sm text-cre8r-gray-400 mb-6">
              For example: "Trim silent parts", "Add cinematic color grade", or "Crop for vertical"
            </p>
            
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {quickActions.slice(0, 6).map((action) => (
                <Button
                  key={action}
                  variant="outline"
                  className="border-cre8r-gray-600 hover:border-cre8r-violet hover:bg-cre8r-violet/10 justify-center"
                  onClick={() => handleQuickAction(action)}
                >
                  {action}
                </Button>
              ))}
              <Button
                variant="outline"
                className="border-cre8r-gray-600 hover:border-cre8r-violet hover:bg-cre8r-violet/10 justify-center col-span-2"
                onClick={() => handleQuickAction(quickActions[6])}
              >
                {quickActions[6]}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[90%] rounded-lg p-3",
                  message.sender === "user"
                    ? "bg-cre8r-violet text-white self-end"
                    : "bg-cre8r-gray-700 text-white self-start"
                )}
              >
                {message.content}
              </div>
            ))}
            {/* Step-by-step assistant status (thinking) block */}
            {isThinking && status && (
              <div className="bg-cre8r-gray-600 text-cre8r-gray-200 self-start max-w-[90%] rounded-lg p-3 text-sm italic flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                <span>{status}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="p-3 border-t border-cre8r-gray-700">
        <div className="w-full flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {messages.length > 0 && quickActions.slice(0, 6).map((action, i) => (
              i < 6 && (
                <Button
                  key={action}
                  variant="outline"
                  size="sm"
                  className="border-cre8r-gray-600 hover:border-cre8r-violet hover:bg-cre8r-violet/10 justify-center text-xs h-8"
                  onClick={() => handleQuickAction(action)}
                >
                  {action}
                </Button>
              )
            ))}
          </div>
          <form className="flex w-full items-end gap-2" onSubmit={handleSubmit}>
            <Textarea
              placeholder="Tell me what edits to apply to your video... (e.g. 'cut 0-5', 'add text at 10s saying Welcome')&#10;&#10;💡 Tip: Press Enter to send, Shift+Enter for new line, Cmd+A to select all"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Handle Cmd+A (Mac) or Ctrl+A (Windows/Linux) to select all text
                // Only if the textarea is focused and we're actually handling this event
                if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                  // Only handle if the textarea is the focused element
                  if (textareaRef.current && document.activeElement === textareaRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    textareaRef.current.select();
                  }
                  return;
                }
                
                // Handle Enter to submit (Shift+Enter for new line)
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !isProcessing && !isThinking) {
                    handleSubmit(e);
                  }
                }
              }}
              className="bg-cre8r-gray-700 border-cre8r-gray-600 focus:border-cre8r-violet focus:ring-cre8r-violet resize-none min-h-[60px] max-h-[120px]"
              disabled={isProcessing || isThinking}
              rows={2}
              ref={textareaRef}
            />
            <Button
              type="submit"
              size="icon"
              className="bg-cre8r-violet hover:bg-cre8r-violet-dark flex-shrink-0"
              disabled={!input.trim() || isProcessing || isThinking}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
