import { useState } from "react";
import { useToast } from "./use-toast";
import { sendCommand } from "@/api/apiClient";
import { useEditorStore } from "@/store/editorStore";

export interface Operation {
  start_sec: number;
  end_sec: number;
  effect: "cut" | "fade" | "zoom" | "speed" | "textOverlay" | "caption" | "brightness" | "colorGrade";
  params?: Record<string, any>;
}

export interface CommandResult {
  operations: Operation[];
  videoUrl?: string; // For storing the processed video URL
}

export const useCommand = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { activeVideoAsset } = useEditorStore();

  const executeCommand = async (commandText: string, timeline?: any) => {
    if (!commandText.trim()) return null;
    setIsProcessing(true);
    setError(null);
    setLogs([]);
    setLastResult(null);

    const assetPath = activeVideoAsset?.file_path;
    if (!assetPath || typeof assetPath !== "string") {
      const errorMsg = "No valid video asset selected";
      setError(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      console.log("🎬 [useCommand] Calling sendCommand with:", { assetPath, commandText });
      const res = await sendCommand(assetPath, commandText);
      console.log("🎬 [useCommand] sendCommand response:", res);
      
      const responseData = res.data;
      setLastResult(responseData);
      setLogs(responseData.logs || []);
      
      console.log("🎬 [useCommand] Returning response data:", responseData);
      return responseData;
    } catch (err: any) {
      console.error("🎬 [useCommand] Error in sendCommand:", err);
      const msg = err.response?.data?.detail || err.message || "Unknown error";
      setError(msg);
      
      // Re-throw the error instead of returning null
      // This allows calling code to handle the error appropriately
      throw new Error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    executeCommand,
    isProcessing,
    lastResult,
    logs,
    error,
  };
};
