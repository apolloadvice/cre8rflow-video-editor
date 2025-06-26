import { useState } from "react";
import { cutClip, CutClipRequest, TimelineResponse } from "../api/apiClient";
import { useEditorStore } from "@/store/editorStore";

export function useCutClip() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { clips, selectedClipId } = useEditorStore();

  const executeCut = async (payload: CutClipRequest) => {
    setLoading(true);
    setError(null);
    // Find the clip by selectedClipId if not already in payload
    let clip_id = payload.clip_id;
    if (!clip_id && selectedClipId) {
      clip_id = selectedClipId;
    }
    try {
      const res = await cutClip({ ...payload, clip_id });
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { executeCut, loading, result, error };
} 