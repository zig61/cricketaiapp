import { describe, it, expect } from "vitest";
import { APP_NAME, TAGLINE } from "../src/lib/constants";

describe("app constants", () => {
  it("exports a non-empty app name and tagline", () => {
    expect(APP_NAME).toBe("Cricket AI");
    expect(TAGLINE.length).toBeGreaterThan(0);
  });
});
