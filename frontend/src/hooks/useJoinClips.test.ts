import { renderHook, act } from "@testing-library/react";
import { useJoinClips } from "./useJoinClips";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Scaffold for the useJoinClips hook tests

describe("useJoinClips", () => {
  it("calls the joinClips API and returns success", async () => {
    const { result } = renderHook(() => useJoinClips());

    await act(async () => {
      await result.current.executeJoin({
        first_clip_name: "clip1",
        second_clip_name: "clip2",
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
      http.post("/api/timeline/join", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useJoinClips());

    await act(async () => {
      await result.current.executeJoin({
        first_clip_name: "clip1",
        second_clip_name: "clip2",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Server error/);
    expect(result.current.result).toBeNull();
  });

  it("handles edge case (missing required field)", async () => {
    server.use(
      http.post("/api/timeline/join", () =>
        HttpResponse.json({ detail: "Missing required field" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useJoinClips());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executeJoin({
        // first_clip_name: "clip1", // omitted
        second_clip_name: "clip2",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Missing required field/);
    expect(result.current.result).toBeNull();
  });
}); 