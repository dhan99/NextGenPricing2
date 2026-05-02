/**
 * F1.4.4 — ApproveDealService unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  ApproveDealService,
  type ApprovalGate,
} from "@dealpad/application";
import {
  Deal,
  type DealRepository,
  type DealEvent,
  type DealId,
  type DomainEvent,
  type EventBus,
  type EventHandler,
} from "@dealpad/domain";

class StubRepo implements DealRepository {
  saved: Deal | null = null;
  savedEvents: readonly DealEvent[] = [];
  constructor(private readonly initial: Deal | null) {}
  async findById(_id: DealId) {
    return this.initial;
  }
  async getById(id: DealId) {
    if (!this.initial) throw new Error(`not found: ${id}`);
    return this.initial;
  }
  async save(d: Deal, e: readonly DealEvent[]) {
    this.saved = d;
    this.savedEvents = e;
    return e;
  }
}

class StubBus implements EventBus {
  published: DomainEvent[] = [];
  subscribe(_t: string, _h: EventHandler) {
    return () => {};
  }
  async publish(e: DomainEvent) {
    this.published.push(e);
  }
  async publishAll(es: readonly DomainEvent[]) {
    for (const e of es) await this.publish(e);
  }
}

const submitted = () =>
  Deal.fromPersistence({
    id: 42,
    dealNumber: "DL-TEST",
    title: "Test",
    status: "submitted",
    totalFee: "10000.00",
    totalCost: "6000.00",
    marginPercent: "40.00",
    currentStep: 6,
  });

const allow = (): ApprovalGate => ({
  check: async () => ({ allow: true, screening: { id: 1, status: "clear" } }),
});
const block = (): ApprovalGate => ({
  check: async () => ({
    allow: false,
    code: "intapp_conflict",
    reason: "blocked at decision",
  }),
});

describe("ApproveDealService", () => {
  it("submitted → approved emits DealApproved with ids", async () => {
    const repo = new StubRepo(submitted());
    const bus = new StubBus();
    const svc = new ApproveDealService(repo, bus, allow());
    const r = await svc.execute({
      dealId: 42,
      actor: "Bob",
      approvalId: 7,
      scenarioId: 12,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.previousStatus).toBe("submitted");
    expect(r.currentStatus).toBe("approved");
    expect(repo.saved?.status.value).toBe("approved");
    expect(bus.published).toHaveLength(1);
    const ev = bus.published[0] as unknown as Record<string, unknown>;
    expect(ev.type).toBe("DealApproved");
    expect(ev.approvalId).toBe(7);
    expect(ev.scenarioId).toBe(12);
  });

  it("intapp block → kind=intapp, no save, no publish", async () => {
    const repo = new StubRepo(submitted());
    const bus = new StubBus();
    const svc = new ApproveDealService(repo, bus, block());
    const r = await svc.execute({
      dealId: 42,
      actor: "Bob",
      approvalId: 1,
      scenarioId: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("intapp");
    expect(repo.saved).toBeNull();
    expect(bus.published).toHaveLength(0);
  });

  it("not_found when repo returns null", async () => {
    const repo = new StubRepo(null);
    const bus = new StubBus();
    const svc = new ApproveDealService(repo, bus, allow());
    const r = await svc.execute({
      dealId: 42,
      actor: "Bob",
      approvalId: 1,
      scenarioId: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("not_found");
  });

  it("rejects approve from a draft deal (illegal state)", async () => {
    const repo = new StubRepo(
      Deal.fromPersistence({
        id: 42,
        dealNumber: "DL-DRAFT",
        title: "T",
        status: "draft",
        totalFee: null,
        totalCost: null,
        marginPercent: null,
        currentStep: 1,
      }),
    );
    const bus = new StubBus();
    const svc = new ApproveDealService(repo, bus, allow());
    try {
      await svc.execute({
        dealId: 42,
        actor: "Bob",
        approvalId: 1,
        scenarioId: null,
      });
      throw new Error("expected throw");
    } catch (e) {
      const err = e as { code?: string; message: string };
      expect(err.code).toBe("illegal_state_transition");
      expect(err.message).toMatch(/Cannot transition/);
    }
    expect(repo.saved).toBeNull();
  });
});
