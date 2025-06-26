import { renderHook, act } from "@testing-library/react";
import { useOverlayAsset } from "./useOverlayAsset";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Scaffold for the useOverlayAsset hook tests

describe("useOverlayAsset", () => {
  it("calls the overlayAsset API and returns success", async () => {
    const { result } = renderHook(() => useOverlayAsset());

    await act(async () => {
      await result.current.executeOverlay({
        asset: "logo.png",
        position: "top right",
        start: "00:05",
        end: "00:10",
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
      http.post("/api/timeline/overlay", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useOverlayAsset());

    await act(async () => {
      await result.current.executeOverlay({
        asset: "logo.png",
        position: "top right",
        start: "00:05",
        end: "00:10",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Server error/);
    expect(result.current.result).toBeNull();
  });

  it("handles edge case (missing required field)", async () => {
    server.use(
      http.post("/api/timeline/overlay", () =>
        HttpResponse.json({ detail: "Missing required field" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useOverlayAsset());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executeOverlay({
        // asset: "logo.png", // omitted
        position: "top right",
        start: "00:05",
        end: "00:10",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Missing required field/);
    expect(result.current.result).toBeNull();
  });
}); 