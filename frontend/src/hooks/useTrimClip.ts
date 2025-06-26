import { useState } from "react";
import { trimClip, TrimClipRequest, TimelineResponse } from "../api/apiClient";
import { useEditorStore } from "@/store/editorStore";

export function useTrimClip() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { clips, selectedClipId } = useEditorStore();

  const executeTrim = async (payload: TrimClipRequest) => {
    setLoading(true);
    setError(null);
    // Find the clip by selectedClipId if not already in payload
    let clip_id = payload.clip_id;
    if (!clip_id && selectedClipId) {
      clip_id = selectedClipId;
    }
    try {
      const res = await trimClip({ ...payload, clip_id });
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { executeTrim, loading, result, error };
} 