import { describe, it, expect } from "vitest";
import { matchDrill } from "../../src/pipeline/matchDrill.js";
import { queryResult, mockSupabaseAdmin } from "../helpers/mockSupabaseAdmin.js";

describe("matchDrill", () => {
  it("looks up the drill for the root cause and writes a prescription", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation((table: string) => {
      if (table === "drill_root_causes") return queryResult({ data: { drill_id: "drill-1" } });
      if (table === "drill_prescriptions") return queryResult({ data: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await matchDrill(admin as never, "root-cause-1", "issue-1");

    expect(result).toEqual({ drillId: "drill-1" });
  });

  it("returns null when no drill is catalogued for the root cause", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation((table: string) => {
      if (table === "drill_root_causes") return queryResult({ data: null });
      throw new Error(`unexpected table ${table}`);
    });

    const result = await matchDrill(admin as never, "root-cause-1", "issue-1");

    expect(result).toBeNull();
  });

  it("throws when the prescription insert fails", async () => {
    const admin = mockSupabaseAdmin();
    admin.from.mockImplementation((table: string) => {
      if (table === "drill_root_causes") return queryResult({ data: { drill_id: "drill-1" } });
      if (table === "drill_prescriptions") {
        return queryResult({ data: null, error: { message: "duplicate key" } });
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(matchDrill(admin as never, "root-cause-1", "issue-1")).rejects.toThrow("duplicate key");
  });
});
