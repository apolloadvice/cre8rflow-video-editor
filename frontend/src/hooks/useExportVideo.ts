import { useState } from "react";
import { exportVideo, PreviewExportRequest } from "../api/apiClient";

export function useExportVideo() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeExport = async (
    payload: PreviewExportRequest,
    quality: "high" | "medium" | "low" = "high"
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await exportVideo(payload, quality);
      setResult(res.data);
    } catch (err: any) {
      let errorMsg = err.message || "Unknown error";
      if (err.response && err.response.data) {
        let data = err.response.data;
        if (data instanceof Blob) {
          try {
            const text = await data.text();
            try {
              const parsed = JSON.parse(text);
              if (parsed && parsed.detail) {
                errorMsg = parsed.detail;
              } else {
                errorMsg = text;
              }
            } catch {
              if (err.response.status === 500) {
                errorMsg = "Server error";
              } else if (err.response.status === 400) {
                errorMsg = "Missing timeline";
              } else {
                errorMsg = text;
              }
            }
          } catch {
            errorMsg = err.message || "Unknown error";
          }
        } else if (typeof data === "string") {
          try {
            const parsed = JSON.parse(data);
            if (parsed && parsed.detail) {
              errorMsg = parsed.detail;
            } else {
              errorMsg = data;
            }
          } catch {
            errorMsg = data;
          }
        } else if (typeof data === "object" && data.detail) {
          errorMsg = data.detail;
        }
      }
      setError(errorMsg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return { executeExport, loading, result, error };
} 