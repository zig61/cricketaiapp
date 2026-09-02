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

function battingResponse(overrides: {
  headStability?: Partial<Record<string, unknown>>;
  weightTransfer?: Partial<Record<string, unknown>> | null;
} = {}) {
  return {
    headStability: {
      value: 11.4,
      unit: "cm",
      confidence: 0.86,
      frameCount: 24,
      framesWithDetection: 22,
      ...overrides.headStability,
    },
    weightTransfer:
      overrides.weightTransfer === null
        ? null
        : {
            value: 75,
            unit: "percent_of_base_width",
            confidence: 0.9,
            frameCount: 24,
            framesWithDetection: 22,
            ...overrides.weightTransfer,
          },
    weightTransferSkipReason: overrides.weightTransfer === null ? "batting_hand not provided" : null,
  };
}

function mockVideoRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "video-1",
    player_id: "player-1",
    storage_path: "u/video-1/original.mp4",
    status: "validating",
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
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") return queryResult({ data: mockVideoRow({ status: "uploaded" }) });
      if (table === "profiles") return queryResult({ data: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "skipped" });
  });

  it("skips a video with no storage_path", async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") return queryResult({ data: mockVideoRow({ storage_path: null }) });
      if (table === "profiles") return queryResult({ data: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "skipped" });
  });

  it("computes only head_stability and completes with no primary issue when in range and batting_hand is unknown", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) return queryResult({ data: mockVideoRow() });
        return queryResult({ data: null });
      }
      if (table === "profiles") return queryResult({ data: { age_band: null, batting_hand: null, playing_level: null } });
      if (table === "processing_jobs") return queryResult({ data: null });
      if (table === "analyses") return queryResult({ data: { id: "analysis-1" } });
      if (table === "measurements") return queryResult({ data: { id: "measurement-hs" } });
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(battingResponse({ headStability: { value: 2.1 }, weightTransfer: null })), {
        status: 200,
      }),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toEqual({
      status: "processed",
      videoId: "video-1",
      measurementValue: 2.1,
      confidence: 0.86,
      primaryIssueId: null,
    });
    // Only one measurement row should have been attempted (head_stability) —
    // weight_transfer was never even a marker to write since cv-service
    // returned null for it.
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `${CV_SERVICE_URL}/measurements/batting`,
      expect.objectContaining({
        body: JSON.stringify({ video_url: "https://storage.example.com/signed", batting_hand: null }),
      }),
    );
  });

  it("writes both measurements and selects head_stability as primary when it has higher priority", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) return queryResult({ data: mockVideoRow() });
        return queryResult({ data: null });
      }
      if (table === "profiles") {
        return queryResult({ data: { age_band: "13_17", batting_hand: "right", playing_level: "junior_club" } });
      }
      if (table === "processing_jobs") return queryResult({ data: null });
      if (table === "analyses") return queryResult({ data: { id: "analysis-1" } });
      if (table === "measurements") return queryResult({ data: { id: "measurement-1" } });
      if (table === "root_causes") {
        return queryResult({ data: { id: "root-cause-head", description: "Head drifts sideways." } });
      }
      if (table === "issues") return queryResult({ data: { id: "issue-1" } });
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
    // head_stability: value 30.65, severity 1, priority ~0.999
    // weight_transfer: value 40 (below 55 range), severity 0.375, priority ~0.35
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          battingResponse({
            headStability: { value: 30.65, confidence: 0.999 },
            weightTransfer: { value: 40, confidence: 0.95 },
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toEqual({
      status: "processed",
      videoId: "video-1",
      measurementValue: 30.65,
      confidence: 0.999,
      primaryIssueId: "issue-1",
    });
  });

  it("selects weight_transfer as primary when it has higher priority than head_stability", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) return queryResult({ data: mockVideoRow() });
        return queryResult({ data: null });
      }
      if (table === "profiles") {
        return queryResult({ data: { age_band: null, batting_hand: "right", playing_level: null } });
      }
      if (table === "processing_jobs") return queryResult({ data: null });
      if (table === "analyses") return queryResult({ data: { id: "analysis-1" } });
      if (table === "measurements") return queryResult({ data: { id: "measurement-1" } });
      if (table === "root_causes") {
        return queryResult({ data: { id: "root-cause-wt", description: "Weight stays back." } });
      }
      if (table === "issues") return queryResult({ data: { id: "issue-wt" } });
      if (table === "drill_root_causes") return queryResult({ data: { drill_id: "drill-wt" } });
      if (table === "drill_prescriptions") return queryResult({ data: null });
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    // head_stability: value 6 (barely out of range), low severity/priority
    // weight_transfer: value 130 (overbalanced), severity ~0.875, high priority
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          battingResponse({
            headStability: { value: 6, confidence: 0.6 },
            weightTransfer: { value: 130, confidence: 0.95 },
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect((result as { primaryIssueId: string }).primaryIssueId).toBe("issue-wt");
  });

  it("returns a 'failed' result when creating the signed URL fails", async () => {
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") return queryResult({ data: mockVideoRow() });
      if (table === "profiles") return queryResult({ data: null });
      if (table === "processing_jobs") return queryResult({ data: null });
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
      if (table === "videos") return queryResult({ data: mockVideoRow() });
      if (table === "profiles") return queryResult({ data: null });
      if (table === "processing_jobs") return queryResult({ data: null });
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
