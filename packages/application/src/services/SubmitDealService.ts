import {
  dealId,
  type DealRepository,
  type EventBus,
} from "@dealpad/domain";
import type {
  SubmissionGate,
  SubmissionGateBlock,
  WorkdayGate,
  WorkdayGateBlock,
} from "../ports/gates";

export interface SubmitDealInput {
  dealId: number;
  actor: string;
}

/**
 * One of three terminal shapes:
 *   - { ok: true, ... }                → 200/201
 *   - { ok: false, kind: "intapp", ... }  → 409 with screening payload
 *   - { ok: false, kind: "workday", ... } → 409 with validationId
 *   - { ok: false, kind: "not_found" }    → 404
 */
export type SubmitDealResult =
  | {
      ok: true;
      dealId: number;
      previousStatus: string;
      currentStatus: string;
      screening: unknown;
    }
  | { ok: false; kind: "not_found" }
  | ({ ok: false; kind: "intapp" } & SubmissionGateBlock)
  | ({ ok: false; kind: "workday" } & WorkdayGateBlock);

/**
 * Submit a draft deal for approval.
 *
 * Pipeline:
 *   1. Intapp submission gate (sync screening)
 *   2. Workday budget/staffing gate
 *   3. Load aggregate, deal.submit(actor), advance wizard to step 6
 *   4. Repository.save() — TX writes status + outbox in one shot
 *   5. EventBus.publishAll() — best-effort fanout to subscribers
 *      (auto-push, activity-log writer, etc.)
 *
 * Domain mutation runs **after** both gates pass. If the bus fanout
 * raises post-commit, the outbox row stays unpublished and the
 * OutboxDispatcher catches up on next boot — the deal status is
 * already correct in the DB, so no state inconsistency.
 */
export class SubmitDealService {
  constructor(
    private readonly repo: DealRepository,
    private readonly bus: EventBus,
    private readonly submissionGate: SubmissionGate,
    private readonly workdayGate: WorkdayGate,
  ) {}

  async execute(input: SubmitDealInput): Promise<SubmitDealResult> {
    const intapp = await this.submissionGate.check(input.dealId, input.actor);
    if (!intapp.allow) {
      return { ok: false, kind: "intapp", ...intapp };
    }

    const wd = await this.workdayGate.check(input.dealId, input.actor);
    if (wd.blocked) {
      return { ok: false, kind: "workday", ...wd };
    }

    const deal = await this.repo.findById(dealId(input.dealId));
    if (!deal) {
      return { ok: false, kind: "not_found" };
    }

    const previousStatus = deal.status.value;
    deal.submit(input.actor);
    deal.advanceWizardTo(6);
    const events = deal.pullEvents();
    const persisted = await this.repo.save(deal, events);
    await this.bus.publishAll(persisted);

    return {
      ok: true,
      dealId: input.dealId,
      previousStatus,
      currentStatus: deal.status.value,
      screening: intapp.screening,
    };
  }
}
