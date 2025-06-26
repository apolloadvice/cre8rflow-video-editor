import { useState } from "react";
import { addText, AddTextRequest, TimelineResponse } from "../api/apiClient";

export function useAddText() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeAddText = async (payload: AddTextRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await addText(payload);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return { executeAddText, loading, result, error };
} 