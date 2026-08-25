import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabaseClient, queryResult, type MockSupabaseClient } from "./helpers/mockSupabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/videos/[videoId]/confirm-upload/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/videos/video-1/confirm-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function callRoute(body: unknown, videoId = "video-1") {
  return POST(makeRequest(body), { params: Promise.resolve({ videoId }) });
}

describe("POST /api/videos/[videoId]/confirm-upload", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = mockSupabaseClient();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
  });

  it("returns 401 when there is no session", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: null });

    const res = await callRoute({ durationSeconds: 12 });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid duration", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const res = await callRoute({ durationSeconds: -1 });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_DURATION");
  });

  it("returns 404 when the video doesn't exist or isn't owned by the caller", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    supabase.from.mockImplementation(() => queryResult({ data: null }));

    const res = await callRoute({ durationSeconds: 12 });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("VIDEO_NOT_FOUND");
  });

  it("returns 409 when the video has already been submitted", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    supabase.from.mockImplementation(() =>
      queryResult({ data: { id: "video-1", status: "validating" } }),
    );

    const res = await callRoute({ durationSeconds: 12 });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("ALREADY_SUBMITTED");
  });

  it("confirms the upload and queues a validate job on success", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    let callCount = 0;
    supabase.from.mockImplementation((table: string) => {
      callCount += 1;
      if (table === "videos" && callCount === 1) {
        return queryResult({ data: { id: "video-1", status: "uploaded" } });
      }
      return queryResult({ data: null });
    });

    const res = await callRoute({ durationSeconds: 42 });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.status).toBe("validating");
  });
});
