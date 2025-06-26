import { useState } from "react";
import { joinClips, JoinClipsRequest, TimelineResponse } from "../api/apiClient";
import { useEditorStore } from "@/store/editorStore";

export function useJoinClips() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { clips, selectedClipId } = useEditorStore();

  const executeJoin = async (payload: JoinClipsRequest) => {
    setLoading(true);
    setError(null);
    // Find the clips by id if not already in payload
    let clip_id = payload.clip_id;
    let second_clip_id = payload.second_clip_id;
    // Try to infer from selectedClipId if not provided
    if (!clip_id && selectedClipId) {
      clip_id = selectedClipId;
    }
    // Optionally, you could infer second_clip_id from UI context if needed
    try {
      const res = await joinClips({ ...payload, clip_id, second_clip_id });
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { executeJoin, loading, result, error };
} 