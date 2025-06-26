import { renderHook, act } from "@testing-library/react";
import { useCutClip } from "./useCutClip";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Test for the useCutClip hook

describe("useCutClip", () => {
  it("calls the cutClip API and returns success", async () => {
    const { result } = renderHook(() => useCutClip());

    await act(async () => {
      await result.current.executeCut({
        clip_name: "clip1",
        timestamp: "00:10",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toMatchObject({
      success: true,
      message: "Clip cut successfully",
    });
  });

  it("handles API error", async () => {
    // Override the handler to return an error
    server.use(
      http.post("/api/timeline/cut", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useCutClip());

    await act(async () => {
      await result.current.executeCut({
        clip_name: "clip1",
        timestamp: "00:10",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Server error/);
    expect(result.current.result).toBeNull();
  });
}); 