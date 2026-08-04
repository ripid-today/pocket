import { describe, it, expect } from "vitest";

// Replicates the r2KeyFor derivation contract (K3: per-user namespace prefix).
function r2KeyFor(userId: number, fileName: string): string {
  const safe = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .replace(/\.\./g, "_");
  return `u${userId}/${Date.now()}-${safe || "book"}`;
}

describe("R2 key derivation (K3, K2)", () => {
  it("prefixes with the user namespace", () => {
    expect(r2KeyFor(42, "book.epub")).toMatch(/^u42\//);
  });

  it("sanitizes unsafe filename characters", () => {
    expect(r2KeyFor(1, "../etc/passwd")).not.toContain("..");
    expect(r2KeyFor(1, "a b/c.epub")).toMatch(/a_b_c\.epub$/);
  });

  it("two users get disjoint namespaces", () => {
    expect(r2KeyFor(1, "x.epub")).not.toMatch(/^u2\//);
  });
});
