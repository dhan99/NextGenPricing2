/**
 * F1.4.2 — Deal aggregate tests.
 *
 * Pins:
 *   - persistence-row marshaling round-trips Money / Percentage shapes
 *   - business methods enforce status transitions
 *   - business methods emit the right versioned events with right fields
 *   - pullEvents drains; peekEvents doesn't
 *   - actor normalization
 */
import { describe, it, expect } from "vitest";
import {
  Deal,
  DealStatus,
  IllegalStateError,
  InvariantError,
  Money,
  Percentage,
  type DealRow,
} from "@dealpad/domain";

const baseRow = (over: Partial<DealRow> = {}): DealRow => ({
  id: 42,
  dealNumber: "DL-2026-042",
  title: "Acme Tax Renewal",
  status: "draft",
  totalFee: "10000.00",
  totalCost: "6000.00",
  marginPercent: "40.00",
  currentStep: 3,
  ...over,
});

describe("Deal.fromPersistence", () => {
  it("marshals Money / Percentage from numeric strings", () => {
    const d = Deal.fromPersistence(baseRow());
    expect(d.id).toBe(42);
    expect(d.dealNumber).toBe("DL-2026-042");
    expect(d.totalFee.equals(Money.fromDecimal(10000))).toBe(true);
    expect(d.totalCost.equals(Money.fromDecimal(6000))).toBe(true);
    expect(d.marginPercent.equals(Percentage.fromPercent(40))).toBe(true);
    expect(d.status.equals(DealStatus.draft())).toBe(true);
    expect(d.currentStep).toBe(3);
  });

  it("tolerates null money / percent fields (zero defaults)", () => {
    const d = Deal.fromPersistence(
      baseRow({ totalFee: null, totalCost: null, marginPercent: null }),
    );
    expect(d.totalFee.isZero()).toBe(true);
    expect(d.totalCost.isZero()).toBe(true);
    expect(d.marginPercent.isZero()).toBe(true);
  });

  it("defaults currentStep to 1 when null", () => {
    const d = Deal.fromPersistence(baseRow({ currentStep: null }));
    expect(d.currentStep).toBe(1);
  });

  it("rejects rows missing required fields", () => {
    expect(() =>
      Deal.fromPersistence(baseRow({ id: 0 })),
    ).toThrow(InvariantError);
    expect(() =>
      Deal.fromPersistence(baseRow({ dealNumber: "" })),
    ).toThrow(InvariantError);
    expect(() =>
      Deal.fromPersistence(baseRow({ title: "" })),
    ).toThrow(InvariantError);
  });

  it("rejects rows with unknown status", () => {
    expect(() =>
      Deal.fromPersistence(baseRow({ status: "in_review" })),
    ).toThrow(InvariantError);
  });
});

describe("Deal.submit", () => {
  it("draft → submitted emits DealSubmitted v1", () => {
    const d = Deal.fromPersistence(baseRow({ status: "draft" }));
    d.submit("Alice");
    expect(d.status.value).toBe("submitted");
    const events = d.pullEvents();
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.type).toBe("DealSubmitted");
    expect(ev.version).toBe(1);
    expect(ev.aggregateId).toBe(42);
    expect((ev as any).actor).toBe("Alice");
    expect((ev as any).previousStatus).toBe("draft");
  });

  it("rejects submit from already-submitted", () => {
    const d = Deal.fromPersistence(baseRow({ status: "submitted" }));
    expect(() => d.submit("Alice")).toThrow(IllegalStateError);
    expect(d.peekEvents()).toHaveLength(0);
  });

  it("rejects submit from approved / rejected / archived", () => {
    for (const s of ["approved", "rejected", "archived"] as const) {
      const d = Deal.fromPersistence(baseRow({ status: s }));
      expect(() => d.submit("Alice")).toThrow(IllegalStateError);
    }
  });

  it("normalizes empty/whitespace actor to 'Unknown'", () => {
    const d = Deal.fromPersistence(baseRow({ status: "draft" }));
    d.submit("   ");
    const ev = d.pullEvents()[0] as any;
    expect(ev.actor).toBe("Unknown");
  });
});

describe("Deal.approve", () => {
  it("submitted → approved emits DealApproved v1 with ids", () => {
    const d = Deal.fromPersistence(baseRow({ status: "submitted" }));
    d.approve({ actor: "Bob", approvalId: 7, scenarioId: 12 });
    expect(d.status.value).toBe("approved");
    const ev = d.pullEvents()[0] as any;
    expect(ev.type).toBe("DealApproved");
    expect(ev.version).toBe(1);
    expect(ev.actor).toBe("Bob");
    expect(ev.approvalId).toBe(7);
    expect(ev.scenarioId).toBe(12);
  });

  it("approve from draft is illegal", () => {
    const d = Deal.fromPersistence(baseRow({ status: "draft" }));
    expect(() =>
      d.approve({ actor: "Bob", approvalId: 1, scenarioId: null }),
    ).toThrow(IllegalStateError);
  });

  it("approve from approved / rejected is illegal (no double-decide)", () => {
    for (const s of ["approved", "rejected"] as const) {
      const d = Deal.fromPersistence(baseRow({ status: s }));
      expect(() =>
        d.approve({ actor: "Bob", approvalId: 1, scenarioId: null }),
      ).toThrow(IllegalStateError);
    }
  });
});

describe("Deal.reject", () => {
  it("submitted → rejected emits DealRejected v1 with reason", () => {
    const d = Deal.fromPersistence(baseRow({ status: "submitted" }));
    d.reject({ actor: "Carol", approvalId: 8, reason: "Margin too thin" });
    expect(d.status.value).toBe("rejected");
    const ev = d.pullEvents()[0] as any;
    expect(ev.type).toBe("DealRejected");
    expect(ev.actor).toBe("Carol");
    expect(ev.approvalId).toBe(8);
    expect(ev.reason).toBe("Margin too thin");
  });

  it("trims reason whitespace; empty reason → null", () => {
    const d = Deal.fromPersistence(baseRow({ status: "submitted" }));
    d.reject({ actor: "C", approvalId: null, reason: "   " });
    const ev = d.pullEvents()[0] as any;
    expect(ev.reason).toBeNull();
  });

  it("reject from draft is illegal", () => {
    const d = Deal.fromPersistence(baseRow({ status: "draft" }));
    expect(() =>
      d.reject({ actor: "C", approvalId: null, reason: null }),
    ).toThrow(IllegalStateError);
  });
});

describe("Deal.advanceWizardTo", () => {
  it("only ratchets forward (never backwards)", () => {
    const d = Deal.fromPersistence(baseRow({ currentStep: 4 }));
    d.advanceWizardTo(2);
    expect(d.currentStep).toBe(4);
    d.advanceWizardTo(6);
    expect(d.currentStep).toBe(6);
  });

  it("rejects non-1..8 values", () => {
    const d = Deal.fromPersistence(baseRow());
    expect(() => d.advanceWizardTo(0)).toThrow(InvariantError);
    expect(() => d.advanceWizardTo(9)).toThrow(InvariantError);
    expect(() => d.advanceWizardTo(1.5)).toThrow(InvariantError);
  });
});

describe("Deal event buffer", () => {
  it("pullEvents drains the buffer; subsequent calls are empty", () => {
    const d = Deal.fromPersistence(baseRow({ status: "draft" }));
    d.submit("A");
    expect(d.pullEvents()).toHaveLength(1);
    expect(d.pullEvents()).toHaveLength(0);
  });

  it("peekEvents does NOT drain", () => {
    const d = Deal.fromPersistence(baseRow({ status: "draft" }));
    d.submit("A");
    expect(d.peekEvents()).toHaveLength(1);
    expect(d.peekEvents()).toHaveLength(1);
    expect(d.pullEvents()).toHaveLength(1);
  });

  it("multiple methods queue events in call order", () => {
    const d = Deal.fromPersistence(baseRow({ status: "draft" }));
    d.submit("A");
    d.approve({ actor: "B", approvalId: 1, scenarioId: 2 });
    const events = d.pullEvents();
    expect(events.map((e) => e.type)).toEqual(["DealSubmitted", "DealApproved"]);
  });
});
