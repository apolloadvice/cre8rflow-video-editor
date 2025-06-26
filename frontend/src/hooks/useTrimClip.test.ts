import { renderHook, act } from "@testing-library/react";
import { useTrimClip } from "./useTrimClip";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Scaffold for the useTrimClip hook tests

describe("useTrimClip", () => {
  it("calls the trimClip API and returns success", async () => {
    const { result } = renderHook(() => useTrimClip());

    await act(async () => {
      await result.current.executeTrim({
        clip_name: "clip1",
        timestamp: "00:10",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    // Accept either a generic or specific message, since the mock may be generic
    expect(result.current.result).toMatchObject({
      success: true,
    });
  });

  it("handles API error", async () => {
    server.use(
      http.post("/api/timeline/trim", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useTrimClip());

    await act(async () => {
      await result.current.executeTrim({
        clip_name: "clip1",
        timestamp: "00:10",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Server error/);
    expect(result.current.result).toBeNull();
  });

  it("handles edge case (missing required field)", async () => {
    server.use(
      http.post("/api/timeline/trim", () =>
        HttpResponse.json({ detail: "Missing required field" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useTrimClip());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executeTrim({
        // clip_name: "clip1", // omitted
        timestamp: "00:10",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Missing required field/);
    expect(result.current.result).toBeNull();
  });
}); 