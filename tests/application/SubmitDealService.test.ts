/**
 * F1.4.4 — SubmitDealService unit tests.
 *
 * Stub repo + bus + gates so the service contract is pinned without
 * touching the DB. Integration coverage (route → service → DB)
 * lands in F1.4.5 alongside the route swap.
 *
 * What we pin:
 *   - gate ordering (Intapp first, Workday second, then domain)
 *   - either gate failure short-circuits before touching the deal
 *   - 404 path: gates pass but repo returns null
 *   - happy path: deal.submit fires + events flow through bus
 *   - wizard advances to step 6 on submit
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  SubmitDealService,
  type SubmissionGate,
  type WorkdayGate,
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
  async findById(_id: DealId): Promise<Deal | null> {
    return this.initial;
  }
  async getById(id: DealId): Promise<Deal> {
    if (!this.initial) throw new Error(`deal not found: ${id}`);
    return this.initial;
  }
  async save(deal: Deal, events: readonly DealEvent[]) {
    this.saved = deal;
    this.savedEvents = events;
    return events;
  }
}

class StubBus implements EventBus {
  published: DomainEvent[] = [];
  subscribe(_type: string, _h: EventHandler) {
    return () => {};
  }
  async publish(e: DomainEvent) {
    this.published.push(e);
  }
  async publishAll(es: readonly DomainEvent[]) {
    for (const e of es) await this.publish(e);
  }
}

const submissionAllow = (): SubmissionGate => ({
  check: async () => ({ allow: true, screening: { id: 99, status: "clear" } }),
});
const submissionBlock = (): SubmissionGate => ({
  check: async () => ({
    allow: false,
    code: "intapp_conflict",
    reason: "Conflict of interest detected",
    screening: { id: 99, status: "conflict" },
  }),
});
const workdayAllow = (): WorkdayGate => ({
  check: async () => ({ blocked: false }),
});
const workdayBlock = (): WorkdayGate => ({
  check: async () => ({
    blocked: true,
    code: "workday_validation_blocked",
    reason: "Cost center over budget",
    validationId: 7,
  }),
});

const draftRow = {
  id: 42,
  dealNumber: "DL-TEST",
  title: "Test",
  status: "draft",
  totalFee: "10000.00",
  totalCost: "6000.00",
  marginPercent: "40.00",
  currentStep: 3,
};

describe("SubmitDealService — happy path", () => {
  let repo: StubRepo;
  let bus: StubBus;
  let svc: SubmitDealService;

  beforeEach(() => {
    repo = new StubRepo(Deal.fromPersistence(draftRow));
    bus = new StubBus();
    svc = new SubmitDealService(
      repo,
      bus,
      submissionAllow(),
      workdayAllow(),
    );
  });

  it("submits + advances wizard + saves + publishes one event", async () => {
    const result = await svc.execute({ dealId: 42, actor: "Alice" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.previousStatus).toBe("draft");
    expect(result.currentStatus).toBe("submitted");

    expect(repo.saved?.status.value).toBe("submitted");
    expect(repo.saved?.currentStep).toBe(6);
    expect(repo.savedEvents).toHaveLength(1);
    expect(repo.savedEvents[0].type).toBe("DealSubmitted");

    expect(bus.published).toHaveLength(1);
    expect(bus.published[0].type).toBe("DealSubmitted");
  });

  it("includes the intapp screening payload on success", async () => {
    const r = await svc.execute({ dealId: 42, actor: "Alice" });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.screening).toEqual({ id: 99, status: "clear" });
  });
});

describe("SubmitDealService — gate short-circuits", () => {
  it("intapp block returns kind=intapp and skips workday + repo", async () => {
    const repo = new StubRepo(Deal.fromPersistence(draftRow));
    const bus = new StubBus();
    let workdayCalled = 0;
    const wd: WorkdayGate = {
      check: async () => {
        workdayCalled++;
        return { blocked: false };
      },
    };
    const svc = new SubmitDealService(repo, bus, submissionBlock(), wd);
    const r = await svc.execute({ dealId: 42, actor: "Alice" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("intapp");
    if (r.kind === "intapp") {
      expect(r.code).toBe("intapp_conflict");
      expect(r.reason).toMatch(/Conflict/);
    }
    expect(workdayCalled).toBe(0);
    expect(repo.saved).toBeNull();
    expect(bus.published).toHaveLength(0);
  });

  it("workday block returns kind=workday and skips repo", async () => {
    const repo = new StubRepo(Deal.fromPersistence(draftRow));
    const bus = new StubBus();
    const svc = new SubmitDealService(
      repo,
      bus,
      submissionAllow(),
      workdayBlock(),
    );
    const r = await svc.execute({ dealId: 42, actor: "Alice" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("workday");
    if (r.kind === "workday") {
      expect(r.code).toBe("workday_validation_blocked");
      expect(r.validationId).toBe(7);
    }
    expect(repo.saved).toBeNull();
  });
});

describe("SubmitDealService — 404", () => {
  it("returns kind=not_found when repo can't find the deal", async () => {
    const repo = new StubRepo(null);
    const bus = new StubBus();
    const svc = new SubmitDealService(
      repo,
      bus,
      submissionAllow(),
      workdayAllow(),
    );
    const r = await svc.execute({ dealId: 42, actor: "Alice" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("not_found");
  });
});
