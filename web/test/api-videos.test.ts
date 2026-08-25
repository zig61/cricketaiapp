import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSupabaseClient, queryResult, type MockSupabaseClient } from "./helpers/mockSupabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/videos/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/videos", () => {
  let supabase: MockSupabaseClient;

  beforeEach(() => {
    supabase = mockSupabaseClient();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
  });

  it("returns 401 when there is no session", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: null });

    const res = await POST(makeRequest({ kind: "initial", linkedIssueId: null }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 400 for an invalid kind", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const res = await POST(makeRequest({ kind: "not-real", linkedIssueId: null }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_KIND");
  });

  it("returns 400 when kind=followup has no linkedIssueId", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });

    const res = await POST(makeRequest({ kind: "followup", linkedIssueId: null }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_LINKED_ISSUE");
  });

  it("creates a video and returns a signed upload URL for a valid initial video", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    supabase.from.mockImplementation((table: string) => {
      if (table === "videos") {
        return queryResult({ data: { id: "video-1" } });
      }
      throw new Error(`unexpected table ${table}`);
    });
    supabase.storage.from.mockReturnValue({
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/upload", token: "tok" },
        error: null,
      }),
    });

    const res = await POST(makeRequest({ kind: "initial", linkedIssueId: null }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.videoId).toBe("video-1");
    expect(body.uploadUrl).toBe("https://example.com/upload");
    expect(body.storagePath).toBe("user-1/video-1/original.mp4");
  });

  it("returns 404 when the linked issue doesn't exist or isn't owned by the caller", async () => {
    supabase.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    supabase.from.mockImplementation((table: string) => {
      if (table === "issues") return queryResult({ data: null });
      throw new Error(`unexpected table ${table}`);
    });

    const res = await POST(
      makeRequest({ kind: "followup", linkedIssueId: "00000000-0000-0000-0000-000000000000" }),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("ISSUE_NOT_FOUND");
  });
});
