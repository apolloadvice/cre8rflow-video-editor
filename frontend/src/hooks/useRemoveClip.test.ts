import { renderHook, act } from "@testing-library/react";
import { useRemoveClip } from "./useRemoveClip";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Scaffold for the useRemoveClip hook tests

describe("useRemoveClip", () => {
  it("calls the removeClip API and returns success", async () => {
    const { result } = renderHook(() => useRemoveClip());

    await act(async () => {
      await result.current.executeRemove({
        clip_name: "clip1",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toMatchObject({
      success: true,
    });
  });

  it("handles API error", async () => {
    server.use(
      http.post("/api/timeline/remove_clip", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useRemoveClip());

    await act(async () => {
      await result.current.executeRemove({
        clip_name: "clip1",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Server error/);
    expect(result.current.result).toBeNull();
  });

  it("handles edge case (missing required field)", async () => {
    server.use(
      http.post("/api/timeline/remove_clip", () =>
        HttpResponse.json({ detail: "Missing required field" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useRemoveClip());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executeRemove({
        // clip_name: "clip1", // omitted
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Missing required field/);
    expect(result.current.result).toBeNull();
  });
}); 