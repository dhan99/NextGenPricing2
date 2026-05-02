/**
 * F1.4.4 — RejectDealService unit tests.
 *
 * Reject is **never gated** — rejections must be possible regardless
 * of Intapp screening state, so a stuck conflict can't block "no".
 */
import { describe, it, expect } from "vitest";
import { RejectDealService } from "@dealpad/application";
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
    totalFee: null,
    totalCost: null,
    marginPercent: null,
    currentStep: 6,
  });

describe("RejectDealService", () => {
  it("submitted → rejected emits DealRejected with reason + approvalId", async () => {
    const repo = new StubRepo(submitted());
    const bus = new StubBus();
    const svc = new RejectDealService(repo, bus);
    const r = await svc.execute({
      dealId: 42,
      actor: "Carol",
      approvalId: 8,
      reason: "Margin too thin",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.currentStatus).toBe("rejected");
    expect(repo.saved?.status.value).toBe("rejected");
    const ev = bus.published[0] as unknown as Record<string, unknown>;
    expect(ev.type).toBe("DealRejected");
    expect(ev.approvalId).toBe(8);
    expect(ev.reason).toBe("Margin too thin");
  });

  it("not_found when repo returns null", async () => {
    const svc = new RejectDealService(new StubRepo(null), new StubBus());
    const r = await svc.execute({
      dealId: 42,
      actor: "C",
      approvalId: null,
      reason: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("not_found");
  });

  it("rejects from draft is an illegal state (domain error)", async () => {
    const repo = new StubRepo(
      Deal.fromPersistence({
        id: 42,
        dealNumber: "DL",
        title: "T",
        status: "draft",
        totalFee: null,
        totalCost: null,
        marginPercent: null,
        currentStep: 1,
      }),
    );
    const svc = new RejectDealService(repo, new StubBus());
    try {
      await svc.execute({
        dealId: 42,
        actor: "C",
        approvalId: null,
        reason: null,
      });
      throw new Error("expected throw");
    } catch (e) {
      const err = e as { code?: string };
      expect(err.code).toBe("illegal_state_transition");
    }
  });
});
