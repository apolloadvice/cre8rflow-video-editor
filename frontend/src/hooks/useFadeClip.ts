import { useState } from "react";
import { fadeClip, FadeClipRequest, TimelineResponse } from "../api/apiClient";

export function useFadeClip() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeFade = async (payload: FadeClipRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fadeClip(payload);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { executeFade, loading, result, error };
} 