import { renderHook, act } from "@testing-library/react";
import { useExportVideo } from "./useExportVideo";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

describe("useExportVideo", () => {
  it("calls the exportVideo API and returns a blob", async () => {
    const { result } = renderHook(() => useExportVideo());

    await act(async () => {
      await result.current.executeExport({
        timeline: { /* mock timeline data */ },
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeInstanceOf(Blob);
  });

  it("handles API error (quality=high)", async () => {
    server.use(
      http.post("/api/export?quality=high", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useExportVideo());

    await act(async () => {
      await result.current.executeExport({
        timeline: { /* mock timeline data */ },
      }, "high");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Request failed with status code 500/);
    expect(result.current.result).toBeNull();
  });

  it("handles edge case (missing timeline)", async () => {
    server.use(
      http.post("/api/export", () =>
        HttpResponse.json({ detail: "Missing timeline" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useExportVideo());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executeExport({
        // timeline: undefined, // omitted
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Request failed with status code 400/);
    expect(result.current.result).toBeNull();
  });
}); 