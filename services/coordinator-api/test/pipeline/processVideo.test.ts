import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryResult, mockSupabaseAdmin, type MockSupabaseAdmin } from "../helpers/mockSupabaseAdmin.js";
import { AppError } from "../../src/lib/errors.js";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn().mockRejectedValue(new Error("no network in tests")) },
  })),
}));

const { processVideo } = await import("../../src/pipeline/processVideo.js");

const CV_SERVICE_URL = "http://localhost:8000";
const DEPS_BASE = { cvServiceUrl: CV_SERVICE_URL, anthropicApiKey: "test-key" };

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
      processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1"),
    ).rejects.toMatchObject({ code: "VIDEO_NOT_FOUND" } satisfies Partial<AppError>);
  });

  it("skips a video that isn't in 'validating' status (idempotency guard)", async () => {
    admin.from.mockImplementation(() =>
      queryResult({
        data: { id: "video-1", player_id: "player-1", storage_path: "u/v/original.mp4", status: "uploaded" },
      }),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "skipped" });
  });

  it("skips a video with no storage_path", async () => {
    admin.from.mockImplementation(() =>
      queryResult({ data: { id: "video-1", player_id: "player-1", storage_path: null, status: "validating" } }),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "skipped" });
  });

  it("runs diagnose/explain/match_drill and completes when the measurement is out of range", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) {
          return queryResult({
            data: {
              id: "video-1",
              player_id: "player-1",
              storage_path: "u/video-1/original.mp4",
              status: "validating",
            },
          });
        }
        return queryResult({ data: null }); // status update calls
      }
      if (table === "processing_jobs") return queryResult({ data: null });
      if (table === "analyses") return queryResult({ data: { id: "analysis-1" } });
      if (table === "measurements") return queryResult({ data: { id: "measurement-1" } });
      if (table === "root_causes") {
        return queryResult({ data: { id: "root-cause-1", description: "Head drifts sideways." } });
      }
      if (table === "issues") return queryResult({ data: { id: "issue-1" } });
      if (table === "profiles") {
        return queryResult({
          data: { age_band: "13_17", batting_hand: "right", playing_level: "junior_club" },
        });
      }
      if (table === "drill_root_causes") return queryResult({ data: { drill_id: "drill-1" } });
      if (table === "drill_prescriptions") return queryResult({ data: null });
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

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toEqual({
      status: "processed",
      videoId: "video-1",
      measurementValue: 11.4,
      confidence: 0.86,
      primaryIssueId: "issue-1",
    });
  });

  it("completes with no primary issue when the measurement is within the reference range", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) {
          return queryResult({
            data: {
              id: "video-1",
              player_id: "player-1",
              storage_path: "u/video-1/original.mp4",
              status: "validating",
            },
          });
        }
        return queryResult({ data: null });
      }
      if (table === "processing_jobs") return queryResult({ data: null });
      if (table === "analyses") return queryResult({ data: { id: "analysis-1" } });
      if (table === "measurements") return queryResult({ data: { id: "measurement-1" } });
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(headStabilityResponse({ value: 2.1 })), { status: 200 }),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toEqual({
      status: "processed",
      videoId: "video-1",
      measurementValue: 2.1,
      confidence: 0.86,
      primaryIssueId: null,
    });
  });

  it("returns a 'failed' result at the diagnose stage when the root cause isn't seeded", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) {
          return queryResult({
            data: {
              id: "video-1",
              player_id: "player-1",
              storage_path: "u/video-1/original.mp4",
              status: "validating",
            },
          });
        }
        return queryResult({ data: null });
      }
      if (table === "processing_jobs") return queryResult({ data: null });
      if (table === "analyses") return queryResult({ data: { id: "analysis-1" } });
      if (table === "measurements") return queryResult({ data: { id: "measurement-1" } });
      if (table === "root_causes") return queryResult({ data: null });
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

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "failed", stage: "diagnose" });
  });

  it("returns a 'failed' result when creating the signed URL fails", async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        return queryResult({
          data: {
            id: "video-1",
            player_id: "player-1",
            storage_path: "u/video-1/original.mp4",
            status: "validating",
          },
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

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "failed", stage: "pose_estimate", error: "no such object" });
  });

  it("returns a 'failed' result when cv-service errors", async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        return queryResult({
          data: {
            id: "video-1",
            player_id: "player-1",
            storage_path: "u/video-1/original.mp4",
            status: "validating",
          },
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

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "failed", stage: "pose_estimate" });
    expect((result as { error: string }).error).toContain("422");
  });
});
