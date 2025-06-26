import { renderHook, act } from "@testing-library/react";
import { useAddText } from "./useAddText";
import { server } from "../__tests__/mocks/server";
import { http, HttpResponse } from "msw";

// Scaffold for the useAddText hook tests

describe("useAddText", () => {
  it("calls the addText API and returns success", async () => {
    const { result } = renderHook(() => useAddText());

    await act(async () => {
      await result.current.executeAddText({
        clip_name: "clip1",
        text: "Hello World",
        position: "top",
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
      http.post("/api/timeline/add_text", () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useAddText());

    await act(async () => {
      await result.current.executeAddText({
        clip_name: "clip1",
        text: "Hello World",
        position: "top",
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
      http.post("/api/timeline/add_text", () =>
        HttpResponse.json({ detail: "Missing required field" }, { status: 400 })
      )
    );

    const { result } = renderHook(() => useAddText());

    await act(async () => {
      // @ts-expect-error: purposely omitting required field for test
      await result.current.executeAddText({
        // clip_name: "clip1", // omitted
        text: "Hello World",
        position: "top",
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