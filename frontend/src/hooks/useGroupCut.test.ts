import { renderHook, act } from "@testing-library/react";
import { useGroupCut } from "./useGroupCut";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Scaffold for the useGroupCut hook tests

describe("useGroupCut", () => {
  it("calls the groupCut API and returns success", async () => {
    const { result } = renderHook(() => useGroupCut());

    await act(async () => {
      await result.current.executeGroupCut({
        target_type: "clips",
        timestamp: "00:30",
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
      http.post("/api/timeline/group_cut", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useGroupCut());

    await act(async () => {
      await result.current.executeGroupCut({
        target_type: "clips",
        timestamp: "00:30",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Server error/);
    expect(result.current.result).toBeNull();
  });

  it("handles edge case (missing required field)", async () => {
    server.use(
      http.post("/api/timeline/group_cut", () =>
        HttpResponse.json({ detail: "Missing required field" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useGroupCut());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executeGroupCut({
        // target_type: "clips", // omitted
        timestamp: "00:30",
        track_type: "video",
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Missing required field/);
    expect(result.current.result).toBeNull();
  });
}); 