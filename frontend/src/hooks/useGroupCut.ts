import { useState } from "react";
import { groupCut, GroupCutRequest, TimelineResponse } from "../api/apiClient";

export function useGroupCut() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeGroupCut = async (payload: GroupCutRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await groupCut(payload);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { executeGroupCut, loading, result, error };
} 