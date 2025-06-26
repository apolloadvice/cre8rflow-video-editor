import { renderHook, act } from "@testing-library/react";
import { useGeneratePreview } from "./useGeneratePreview";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Scaffold for the useGeneratePreview hook tests

describe("useGeneratePreview", () => {
  it("calls the generatePreview API and returns a blob", async () => {
    const { result } = renderHook(() => useGeneratePreview());

    await act(async () => {
      await result.current.executePreview({
        timeline: { /* mock timeline data */ },
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeInstanceOf(Blob);
  });

  it("handles API error", async () => {
    server.use(
      http.post("/api/preview", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useGeneratePreview());

    await act(async () => {
      await result.current.executePreview({
        timeline: { /* mock timeline data */ },
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Request failed with status code 500/);
    expect(result.current.result).toBeNull();
  });

  it("handles edge case (missing timeline)", async () => {
    server.use(
      http.post("/api/preview", () =>
        HttpResponse.json({ detail: "Missing timeline" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useGeneratePreview());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executePreview({
        // timeline: undefined, // omitted
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toMatch(/Request failed with status code 400/);
    expect(result.current.result).toBeNull();
  });
}); 