import { describe, it, expect, vi } from "vitest";
import { markJob } from "../../src/pipeline/markJob.js";
import { queryResult, mockSupabaseAdmin } from "../helpers/mockSupabaseAdmin.js";

describe("markJob", () => {
  it("inserts a new row when no job exists yet for (video_id, stage)", async () => {
    const admin = mockSupabaseAdmin();
    const insert = vi.fn(() => queryResult({ data: null }));
    admin.from.mockImplementation((table: string) => {
      if (table === "processing_jobs") {
        return { ...queryResult({ data: null }), insert };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await markJob(admin as never, "video-1", "validate", { status: "succeeded" });

    expect(insert).toHaveBeenCalledWith({
      video_id: "video-1",
      stage: "validate",
      status: "succeeded",
    });
  });

  it("updates the existing row when one already exists for (video_id, stage)", async () => {
    const admin = mockSupabaseAdmin();
    const update = vi.fn(() => queryResult({ data: null }));
    admin.from.mockImplementation((table: string) => {
      if (table === "processing_jobs") {
        return { ...queryResult({ data: { id: "job-1" } }), update };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await markJob(admin as never, "video-1", "validate", { status: "succeeded" });

    expect(update).toHaveBeenCalledWith({ status: "succeeded" });
  });
});
