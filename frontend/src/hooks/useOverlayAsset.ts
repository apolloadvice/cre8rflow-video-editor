import { useState } from "react";
import { overlayAsset, OverlayAssetRequest, TimelineResponse } from "../api/apiClient";

export function useOverlayAsset() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeOverlay = async (payload: OverlayAssetRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await overlayAsset(payload);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { executeOverlay, loading, result, error };
} 