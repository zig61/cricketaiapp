import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { processVideo } from "../../src/pipeline/processVideo.js";
import { queryResult, mockSupabaseAdmin, type MockSupabaseAdmin } from "../helpers/mockSupabaseAdmin.js";
import { AppError } from "../../src/lib/errors.js";

const CV_SERVICE_URL = "http://localhost:8000";

function headStabilityResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    value: 11.4,
    unit: "cm",
    confidence: 0.86,
    frameCount: 24,
    framesWithDetection: 22,
    ...overrides,
  };
}

describe("processVideo", () => {
  let admin: MockSupabaseAdmin;

  beforeEach(() => {
    admin = mockSupabaseAdmin();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws VIDEO_NOT_FOUND when the video doesn't exist", async () => {
    admin.from.mockImplementation(() => queryResult({ data: null }));

    await expect(
      processVideo({ supabaseAdmin: admin as never, cvServiceUrl: CV_SERVICE_URL }, "video-1"),
    ).rejects.toMatchObject({ code: "VIDEO_NOT_FOUND" } satisfies Partial<AppError>);
  });

  it("skips a video that isn't in 'validating' status (idempotency guard)", async () => {
    admin.from.mockImplementation(() =>
      queryResult({ data: { id: "video-1", storage_path: "u/v/original.mp4", status: "uploaded" } }),
    );

    const result = await processVideo(
      { supabaseAdmin: admin as never, cvServiceUrl: CV_SERVICE_URL },
      "video-1",
    );

    expect(result).toMatchObject({ status: "skipped" });
  });

  it("skips a video with no storage_path", async () => {
    admin.from.mockImplementation(() =>
      queryResult({ data: { id: "video-1", storage_path: null, status: "validating" } }),
    );

    const result = await processVideo(
      { supabaseAdmin: admin as never, cvServiceUrl: CV_SERVICE_URL },
      "video-1",
    );

    expect(result).toMatchObject({ status: "skipped" });
  });

  it("writes analyses + one measurement and returns 'processed' on the happy path", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) {
          return queryResult({
            data: { id: "video-1", storage_path: "u/video-1/original.mp4", status: "validating" },
          });
        }
        return queryResult({ data: null }); // status update calls
      }
      if (table === "processing_jobs") {
        return queryResult({ data: null }); // always the "insert" branch of markJob
      }
      if (table === "analyses") {
        return queryResult({ data: { id: "analysis-1" } });
      }
      if (table === "measurements") {
        return queryResult({ data: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(headStabilityResponse()), { status: 200 }),
    );

    const result = await processVideo(
      { supabaseAdmin: admin as never, cvServiceUrl: CV_SERVICE_URL },
      "video-1",
    );

    expect(result).toEqual({
      status: "processed",
      videoId: "video-1",
      measurementValue: 11.4,
      confidence: 0.86,
    });
    expect(fetch).toHaveBeenCalledWith(
      `${CV_SERVICE_URL}/measurements/head-stability`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns a 'failed' result when creating the signed URL fails", async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        return queryResult({
          data: { id: "video-1", storage_path: "u/video-1/original.mp4", status: "validating" },
        });
      }
      if (table === "processing_jobs") {
        return queryResult({ data: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: "no such object" } }),
    });

    const result = await processVideo(
      { supabaseAdmin: admin as never, cvServiceUrl: CV_SERVICE_URL },
      "video-1",
    );

    expect(result).toMatchObject({ status: "failed", stage: "pose_estimate", error: "no such object" });
  });

  it("returns a 'failed' result when cv-service errors", async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        return queryResult({
          data: { id: "video-1", storage_path: "u/video-1/original.mp4", status: "validating" },
        });
      }
      if (table === "processing_jobs") {
        return queryResult({ data: null });
      }
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "INSUFFICIENT_DETECTION", message: "too few frames" } }),
        { status: 422 },
      ),
    );

    const result = await processVideo(
      { supabaseAdmin: admin as never, cvServiceUrl: CV_SERVICE_URL },
      "video-1",
    );

    expect(result).toMatchObject({ status: "failed", stage: "pose_estimate" });
    expect((result as { error: string }).error).toContain("422");
  });
});
