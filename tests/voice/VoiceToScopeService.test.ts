/**
 * F3.4.1 — VoiceToScopeService unit tests (pure helpers).
 *
 * The DB-bound transcribeAndExtract + applyExtractions are
 * exercised in tests/integration/voice-routes.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  rankCatalogMatches,
  simulatedTranscript,
} from "../../server/services/VoiceToScopeService";

describe("rankCatalogMatches", () => {
  const CATALOG = [
    { id: 1, code: "TAX-1040", name: "Federal 1040 Individual Return", defaultHours: "8" },
    { id: 2, code: "TAX-1120", name: "Corporate 1120 Return", defaultHours: "20" },
    { id: 3, code: "AUDIT-AR", name: "Accounts Receivable Confirmations", defaultHours: "10" },
    { id: 4, code: "AUDIT-REV", name: "Revenue Recognition Testing", defaultHours: "16" },
    { id: 5, code: "WIDGET-MFG", name: "Widget Manufacturing Inventory", defaultHours: "12" },
  ];

  it("ranks matching catalog rows above non-matching", () => {
    const r = rankCatalogMatches("Federal 1040 individual return for client", CATALOG);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].catalogCode).toBe("TAX-1040");
  });

  it("returns empty when transcript has no overlapping tokens", () => {
    const r = rankCatalogMatches("blue elephant zebra", CATALOG);
    expect(r).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(rankCatalogMatches("", CATALOG)).toEqual([]);
    expect(rankCatalogMatches("anything", [])).toEqual([]);
  });

  it("respects topK", () => {
    const r = rankCatalogMatches(
      "federal corporate audit revenue accounts receivable confirmations widget",
      CATALOG,
      2,
    );
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("confidence is in [0, 1]", () => {
    const r = rankCatalogMatches("federal 1040 individual return", CATALOG);
    for (const e of r) {
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("strips short tokens (length < 3)", () => {
    // "if it" alone matches nothing meaningful — no extractions
    const r = rankCatalogMatches("if it of", CATALOG);
    expect(r).toEqual([]);
  });

  it("multi-keyword extraction surfaces multiple candidates", () => {
    const r = rankCatalogMatches(
      "audit revenue recognition and accounts receivable confirmations",
      CATALOG,
    );
    const codes = r.map((e) => e.catalogCode);
    expect(codes).toContain("AUDIT-REV");
    expect(codes).toContain("AUDIT-AR");
  });
});

describe("simulatedTranscript", () => {
  it("is deterministic by seed", () => {
    expect(simulatedTranscript("a")).toBe(simulatedTranscript("a"));
  });

  it("varies across seeds", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(simulatedTranscript(`seed-${i}`));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("produces non-empty plausible text", () => {
    const t = simulatedTranscript("test");
    expect(t.length).toBeGreaterThan(20);
    expect(/[a-z]/.test(t)).toBe(true);
  });
});
