/**
 * F2.3.2 — TimeEntryService unit tests.
 *
 * Pin the simulated-suggest contract:
 *   - deterministic by (dealId, workDate, hint)
 *   - hours snapped to 0.25h
 *   - confidence in [0.6, 0.7]
 *   - workDate defaults to today when omitted
 */
import { describe, it, expect } from "vitest";
import {
  simulatedSuggest,
  snapToQuarterHour,
  __INTERNALS_FOR_TEST,
} from "../../server/services/TimeEntryService";

describe("snapToQuarterHour", () => {
  it("snaps to nearest 15-min", () => {
    expect(snapToQuarterHour(0.4)).toBe(0.5);
    expect(snapToQuarterHour(1.1)).toBe(1.0);
    expect(snapToQuarterHour(2.85)).toBe(2.75);
    expect(snapToQuarterHour(3.875)).toBe(4.0);
  });

  it("never returns 0 (floors at 0.25)", () => {
    expect(snapToQuarterHour(0.05)).toBe(0.25);
    expect(snapToQuarterHour(0)).toBe(0.25);
    expect(snapToQuarterHour(-1)).toBe(0.25);
    expect(snapToQuarterHour(Number.NaN)).toBe(0.25);
  });
});

describe("simulatedSuggest determinism", () => {
  it("same input → same output", () => {
    const a = simulatedSuggest({ dealId: 42, workDate: "2026-04-15", hint: "client review" });
    const b = simulatedSuggest({ dealId: 42, workDate: "2026-04-15", hint: "client review" });
    expect(a).toEqual(b);
  });

  it("different dealId → different output", () => {
    const a = simulatedSuggest({ dealId: 42, workDate: "2026-04-15" });
    const b = simulatedSuggest({ dealId: 99, workDate: "2026-04-15" });
    // Either description or hours will differ across templates
    const same = a.description === b.description && a.hours === b.hours;
    expect(same).toBe(false);
  });

  it("hint is incorporated into the description", () => {
    const r = simulatedSuggest({ dealId: 1, workDate: "2026-04-15", hint: "renewal kickoff" });
    expect(r.description).toContain("renewal kickoff");
  });
});

describe("simulatedSuggest contract", () => {
  it("returns valid 0.25h-snapped hours > 0", () => {
    const r = simulatedSuggest({ dealId: 1, workDate: "2026-04-15" });
    expect(r.hours).toBeGreaterThan(0);
    expect(r.hours * 4).toBe(Math.round(r.hours * 4));
  });

  it("confidence is in [0.60, 0.70]", () => {
    for (let d = 1; d <= 50; d++) {
      const r = simulatedSuggest({ dealId: d, workDate: "2026-04-15" });
      expect(r.confidence).toBeGreaterThanOrEqual(0.6);
      expect(r.confidence).toBeLessThanOrEqual(0.7);
    }
  });

  it("source is 'ai'", () => {
    const r = simulatedSuggest({ dealId: 1, workDate: "2026-04-15" });
    expect(r.source).toBe("ai");
  });

  it("metadata carries mode + tag + seed", () => {
    const r = simulatedSuggest({ dealId: 1, workDate: "2026-04-15" });
    expect(r.metadata.mode).toBe("simulated");
    expect(typeof r.metadata.tag).toBe("string");
    expect(typeof r.metadata.seed).toBe("number");
  });

  it("workDate defaults to today (YYYY-MM-DD) when omitted", () => {
    const r = simulatedSuggest({ dealId: 1 });
    expect(r.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rationale references the picked tag", () => {
    const r = simulatedSuggest({ dealId: 1, workDate: "2026-04-15" });
    const tags = __INTERNALS_FOR_TEST.SIM_TEMPLATES.map((t) => t.tag);
    expect(tags.some((t) => r.rationale.includes(t))).toBe(true);
  });
});

describe("simulatedSuggest distribution", () => {
  it("varies the picked template across many seeds", () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 200; d++) {
      const r = simulatedSuggest({ dealId: d, workDate: "2026-04-15" });
      seen.add(r.metadata.tag as string);
    }
    // 6 templates exist; expect at least 4 to be hit by deterministic
    // sampling across 200 inputs
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});
