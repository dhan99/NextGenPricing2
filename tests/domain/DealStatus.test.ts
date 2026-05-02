/**
 * F1.4.2 — DealStatus value-object tests.
 *
 * The transition graph here is the single source of truth — pin every
 * edge so adding/removing one is a deliberate test change.
 */
import { describe, it, expect } from "vitest";
import { DealStatus, IllegalStateError, InvariantError } from "@dealpad/domain";

describe("DealStatus construction", () => {
  it("named factories produce the right values", () => {
    expect(DealStatus.draft().value).toBe("draft");
    expect(DealStatus.submitted().value).toBe("submitted");
    expect(DealStatus.approved().value).toBe("approved");
    expect(DealStatus.rejected().value).toBe("rejected");
    expect(DealStatus.archived().value).toBe("archived");
  });

  it("fromString accepts canonical values", () => {
    expect(DealStatus.fromString("draft").value).toBe("draft");
    expect(DealStatus.fromString("submitted").value).toBe("submitted");
  });

  it("fromString rejects unknown / empty input", () => {
    expect(() => DealStatus.fromString("won")).toThrow(InvariantError);
    expect(() => DealStatus.fromString("")).toThrow(InvariantError);
    expect(() => DealStatus.fromString(null)).toThrow(InvariantError);
    expect(() => DealStatus.fromString(undefined)).toThrow(InvariantError);
  });
});

describe("DealStatus transition graph", () => {
  const allow: Array<[string, string]> = [
    ["draft", "submitted"],
    ["draft", "archived"],
    ["submitted", "approved"],
    ["submitted", "rejected"],
    ["submitted", "draft"],
    ["approved", "archived"],
    ["rejected", "draft"],
    ["rejected", "archived"],
    ["archived", "draft"],
  ];
  const deny: Array<[string, string]> = [
    ["draft", "approved"],
    ["draft", "rejected"],
    ["draft", "draft"],
    ["submitted", "submitted"],
    ["submitted", "archived"],
    ["approved", "submitted"],
    ["approved", "draft"],
    ["approved", "rejected"],
    ["rejected", "submitted"],
    ["rejected", "approved"],
    ["archived", "submitted"],
    ["archived", "approved"],
  ];

  for (const [from, to] of allow) {
    it(`allows ${from} → ${to}`, () => {
      const s = DealStatus.fromString(from);
      const t = DealStatus.fromString(to);
      expect(s.canTransitionTo(t)).toBe(true);
      expect(() => s.assertCanTransitionTo(t)).not.toThrow();
    });
  }
  for (const [from, to] of deny) {
    it(`denies ${from} → ${to}`, () => {
      const s = DealStatus.fromString(from);
      const t = DealStatus.fromString(to);
      expect(s.canTransitionTo(t)).toBe(false);
      expect(() => s.assertCanTransitionTo(t)).toThrow(IllegalStateError);
    });
  }
});

describe("DealStatus predicates", () => {
  it("isDraft / isSubmitted / …", () => {
    expect(DealStatus.draft().isDraft()).toBe(true);
    expect(DealStatus.submitted().isSubmitted()).toBe(true);
    expect(DealStatus.approved().isApproved()).toBe(true);
    expect(DealStatus.rejected().isRejected()).toBe(true);
    expect(DealStatus.archived().isArchived()).toBe(true);
  });

  it("isDecided is approved or rejected", () => {
    expect(DealStatus.approved().isDecided()).toBe(true);
    expect(DealStatus.rejected().isDecided()).toBe(true);
    expect(DealStatus.submitted().isDecided()).toBe(false);
    expect(DealStatus.draft().isDecided()).toBe(false);
  });

  it("equals", () => {
    expect(DealStatus.draft().equals(DealStatus.draft())).toBe(true);
    expect(DealStatus.draft().equals(DealStatus.submitted())).toBe(false);
  });

  it("toString returns the raw value", () => {
    expect(`${DealStatus.draft()}`).toBe("draft");
  });
});

describe("DealStatus IllegalStateError shape", () => {
  it("carries from + to + code", () => {
    try {
      DealStatus.draft().assertCanTransitionTo(DealStatus.approved());
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e).toBeInstanceOf(IllegalStateError);
      expect(e.code).toBe("illegal_state_transition");
      expect(e.from).toBe("draft");
      expect(e.to).toBe("approved");
      expect(e.message).toContain("Deal");
    }
  });
});
