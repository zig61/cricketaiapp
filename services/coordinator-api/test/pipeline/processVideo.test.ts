import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryResult, mockSupabaseAdmin, type MockSupabaseAdmin } from "../helpers/mockSupabaseAdmin.js";
import { AppError } from "../../src/lib/errors.js";
import { FRONT_FOOT_SHOT_SCOPE_NOTE } from "../../src/lib/confidence.js";
import { FRONT_FOOT_SHOT_MIN_WEIGHT_TRANSFER_PERCENT } from "../../src/pipeline/diagnose.js";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn().mockRejectedValue(new Error("no network in tests")) },
  })),
}));

const { processVideo } = await import("../../src/pipeline/processVideo.js");

const CV_SERVICE_URL = "http://localhost:8000";
const DEPS_BASE = { cvServiceUrl: CV_SERVICE_URL, anthropicApiKey: "test-key" };

function defaultConfidenceBreakdown(confidence: number) {
  // A plausible breakdown consistent with `confidence`, used as the default
  // for tests that aren't specifically exercising confidence-gating
  // behavior (see processVideo.test.ts's dedicated confidence-level tests
  // for those) -- evaluateCandidate/selectPrimary only ever read the raw
  // `confidence` number, so this doesn't need to be exact, just present.
  return {
    visibilityScore: confidence,
    consistencyScore: confidence,
    geometryScore: confidence,
    overallScore: confidence,
    level: confidence >= 0.75 ? "high" : confidence >= 0.4 ? "medium" : "low",
  };
}

function battingResponse(overrides: {
  headStability?: Partial<Record<string, unknown>>;
  weightTransfer?: Partial<Record<string, unknown>> | null;
} = {}) {
  const headStabilityConfidence = (overrides.headStability?.confidence as number | undefined) ?? 0.86;
  const weightTransferConfidence = (overrides.weightTransfer?.confidence as number | undefined) ?? 0.9;

  return {
    headStability: {
      value: 11.4,
      unit: "cm",
      confidence: 0.86,
      confidenceBreakdown: defaultConfidenceBreakdown(headStabilityConfidence),
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
            confidenceBreakdown: defaultConfidenceBreakdown(weightTransferConfidence),
            frameCount: 24,
            framesWithDetection: 22,
            ...overrides.weightTransfer,
          },
    weightTransferSkipReason: overrides.weightTransfer === null ? "batting_hand not provided" : null,
    weightTransferDiagnostics:
      overrides.weightTransfer === null
        ? null
        : {
            totalSampledFrames: 24,
            framesWithHipsOk: 24,
            framesWithFrontAnkleOk: 22,
            framesWithBackAnkleOk: 22,
            framesWithBothAnklesOk: 22,
            meanFrontAnkleVisibility: 0.9,
            meanBackAnkleVisibility: 0.9,
            baselineBaseWidthM: 0.3,
          },
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

  // --- confidence-gating (2026-09-06) ---

  it("writes a deterministic confidence_note for a LOW-confidence measurement, and none for a HIGH one", async () => {
    const measurementInserts: Array<Record<string, unknown>> = [];

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
      if (table === "measurements") {
        return {
          select: () => ({ single: () => Promise.resolve({ error: null, data: { id: "measurement-1" } }) }),
          insert: (payload: Record<string, unknown>) => {
            measurementInserts.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({ error: null, data: { id: "measurement-1" } }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    // head_stability: HIGH confidence. weight_transfer: LOW confidence
    // (0.3, below the 0.5 candidate floor) -- the exact borderline-angle
    // case this pass exists to surface, rather than silently dropping it.
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          battingResponse({
            headStability: { value: 2.1, confidence: 0.95 },
            weightTransfer: { value: 30, confidence: 0.3 },
          }),
        ),
        { status: 200 },
      ),
    );

    await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    const headStabilityInsert = measurementInserts.find((i) => i.marker_key === "head_stability");
    const weightTransferInsert = measurementInserts.find((i) => i.marker_key === "balance_weight_transfer");

    expect(headStabilityInsert?.confidence_note).toBeNull();
    expect(weightTransferInsert?.confidence_note).toContain("camera");
  });

  it("never lets a LOW-confidence candidate become the primary issue, even if its raw value is out of range", async () => {
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
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    // Both markers are technically "out of range" (would normally be
    // candidates), but both have LOW confidence -- neither should ever
    // reach diagnose/explain/match_drill.
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          battingResponse({
            headStability: { value: 30, confidence: 0.3 },
            weightTransfer: { value: 20, confidence: 0.35 },
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "processed", primaryIssueId: null });
  });

  it("does not prescribe a drill when the primary issue's marker is in UNVALIDATED_RANGE_MARKERS", async () => {
    // Same setup as "writes both measurements and selects head_stability as
    // primary..." above -- head_stability legitimately becomes the primary
    // issue (2026-09-09: still true, severity is still computed/stored
    // internally) -- but with UNVALIDATED_RANGE_MARKERS in place, no drill
    // should be prescribed for it, since head_stability's reference range
    // isn't validated (diagnose.ts).
    let videoFromCalls = 0;
    let drillPrescriptionInsertCalled = false;
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
      if (table === "drill_prescriptions") {
        return {
          ...queryResult({ data: null }),
          insert: () => {
            drillPrescriptionInsertCalled = true;
            return queryResult({ data: null });
          },
        };
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

    expect(result).toMatchObject({ status: "processed", primaryIssueId: "issue-1" });
    expect(drillPrescriptionInsertCalled).toBe(false);
  });

  // --- front-foot-shot scope gate (2026-09-11): a reasoned placeholder
  // threshold (25%), not yet validated against real back-foot footage --
  // see FRONT_FOOT_SHOT_MIN_WEIGHT_TRANSFER_PERCENT's comment in diagnose.ts.

  it("forces both markers to LOW with the shared scope note when weight_transfer% is below the threshold", async () => {
    const measurementInserts: Array<Record<string, unknown>> = [];
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
      if (table === "measurements") {
        return {
          select: () => ({ single: () => Promise.resolve({ error: null, data: { id: "measurement-1" } }) }),
          insert: (payload: Record<string, unknown>) => {
            measurementInserts.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({ error: null, data: { id: "measurement-1" } }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://storage.example.com/signed" },
        error: null,
      }),
    });
    // A confidently-HIGH head_stability reading and an out-of-range
    // weight_transfer value would normally both clear the candidate floor
    // easily -- the point of this test is confirming the gate suppresses
    // that entirely, not just relabels it.
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          battingResponse({
            headStability: { value: 30.65, confidence: 0.999 },
            weightTransfer: { value: 15, confidence: 0.95 },
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    const headStabilityInsert = measurementInserts.find((i) => i.marker_key === "head_stability");
    const weightTransferInsert = measurementInserts.find((i) => i.marker_key === "balance_weight_transfer");

    expect(headStabilityInsert).toMatchObject({ confidence: 0, confidence_note: FRONT_FOOT_SHOT_SCOPE_NOTE });
    expect(weightTransferInsert).toMatchObject({ confidence: 0, confidence_note: FRONT_FOOT_SHOT_SCOPE_NOTE });
    expect(result).toMatchObject({ status: "processed", primaryIssueId: null });
  });

  it("does not trip the gate at the lowest real confirmed front-foot value (41.53%)", async () => {
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
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          battingResponse({
            headStability: { value: 2, confidence: 0.9 },
            weightTransfer: { value: 41.53, confidence: 0.973 },
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    // weight_transfer is out of its own [55,100] reference range at 41.53%,
    // so it legitimately becomes the primary candidate here -- the gate
    // staying out of the way is what's under test, not this specific value.
    expect(result).toMatchObject({ status: "processed", primaryIssueId: "issue-wt" });
  });

  it("does not trip the gate when weight_transfer is null (an unrelated, already-handled failure mode)", async () => {
    let videoFromCalls = 0;
    admin.from.mockImplementation((table: string) => {
      if (table === "videos") {
        videoFromCalls += 1;
        if (videoFromCalls === 1) return queryResult({ data: mockVideoRow() });
        return queryResult({ data: null });
      }
      if (table === "profiles") {
        return queryResult({ data: { age_band: null, batting_hand: null, playing_level: null } });
      }
      if (table === "processing_jobs") return queryResult({ data: null });
      if (table === "analyses") return queryResult({ data: { id: "analysis-1" } });
      if (table === "measurements") return queryResult({ data: { id: "measurement-1" } });
      if (table === "root_causes") {
        return queryResult({ data: { id: "root-cause-head", description: "Head drifts sideways." } });
      }
      if (table === "issues") return queryResult({ data: { id: "issue-head" } });
      if (table === "drill_root_causes") return queryResult({ data: { drill_id: "drill-head" } });
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
      new Response(
        JSON.stringify(battingResponse({ headStability: { value: 30.65, confidence: 0.999 }, weightTransfer: null })),
        { status: 200 },
      ),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "processed", primaryIssueId: "issue-head" });
  });

  it("threshold boundary is inclusive: exactly the threshold value does not trip the gate", async () => {
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
        return queryResult({ data: { id: "root-cause-head", description: "Head drifts sideways." } });
      }
      if (table === "issues") return queryResult({ data: { id: "issue-head" } });
      if (table === "drill_root_causes") return queryResult({ data: { drill_id: "drill-head" } });
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
      new Response(
        JSON.stringify(
          battingResponse({
            headStability: { value: 30.65, confidence: 0.999 },
            weightTransfer: { value: FRONT_FOOT_SHOT_MIN_WEIGHT_TRANSFER_PERCENT, confidence: 0.9 },
          }),
        ),
        { status: 200 },
      ),
    );

    const result = await processVideo({ supabaseAdmin: admin as never, ...DEPS_BASE }, "video-1");

    expect(result).toMatchObject({ status: "processed", primaryIssueId: "issue-head" });
  });
});
