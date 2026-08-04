import { describe, it, expect } from "vitest";
import { hashBuffer } from "@/lib/hash";

describe("hashBuffer (K/A-adjacent: dedup key)", () => {
  it("produces a stable 64-char hex SHA-256", () => {
    const buf = Buffer.from("hello pocket");
    const h = hashBuffer(buf);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBuffer(Buffer.from("hello pocket"))).toBe(h);
  });

  it("differs for different content", () => {
    expect(hashBuffer(Buffer.from("a"))).not.toBe(hashBuffer(Buffer.from("b")));
  });
});
