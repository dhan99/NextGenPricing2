/**
 * F3.2.1 — PortalAuthService unit tests.
 *
 * Pin the pure crypto helpers here. The DB-bound flow
 * (createInvite + verifyToken + revoke) is exercised in
 * tests/integration/portal-auth.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  generateRawToken,
  hashToken,
  constantTimeHexEq,
} from "../../server/services/PortalAuthService";
import { createHash } from "node:crypto";

describe("generateRawToken", () => {
  it("returns 64 hex chars (32 bytes)", () => {
    const t = generateRawToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces unique values across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateRawToken());
    expect(seen.size).toBe(1000);
  });
});

describe("hashToken", () => {
  it("returns 64-char hex (sha256)", () => {
    const h = hashToken("test");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches Node's crypto sha256 of the same input", () => {
    const expected = createHash("sha256").update("hello world", "utf8").digest("hex");
    expect(hashToken("hello world")).toBe(expected);
  });

  it("is deterministic", () => {
    expect(hashToken("a")).toBe(hashToken("a"));
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("constantTimeHexEq", () => {
  const a = "deadbeef".repeat(8);     // 64 hex
  const b = "deadbeef".repeat(8);
  const c = "feedface".repeat(8);
  const short = "deadbeef";

  it("returns true on equal hex strings", () => {
    expect(constantTimeHexEq(a, b)).toBe(true);
  });

  it("returns false on different content", () => {
    expect(constantTimeHexEq(a, c)).toBe(false);
  });

  it("returns false on length mismatch (no throw)", () => {
    expect(constantTimeHexEq(a, short)).toBe(false);
  });

  it("returns false on empty string", () => {
    expect(constantTimeHexEq("", "")).toBe(false);
  });
});
