import { describe, it, expect } from "vitest";
import {
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_LINE_HEIGHT,
  MAX_LINE_HEIGHT,
  STEP,
} from "@/lib/db/preferences";

// The DB layer clamps to step on write; here we assert the contract bounds
// that the clamping function must honor (F6, F7).
describe("preferences bounds (F6, F7)", () => {
  it("font size bounds and step", () => {
    expect(MIN_FONT_SIZE).toBe(8);
    expect(MAX_FONT_SIZE).toBe(32);
    expect(STEP).toBe(2);
  });

  it("line height bounds", () => {
    expect(MIN_LINE_HEIGHT).toBe(4);
    expect(MAX_LINE_HEIGHT).toBe(24);
  });
});
