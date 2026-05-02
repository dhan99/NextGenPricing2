import {
  dealId,
  type DealRepository,
  type EventBus,
} from "@dealpad/domain";
import type { ApprovalGate, ApprovalGateBlock } from "../ports/gates";

export interface ApproveDealInput {
  dealId: number;
  actor: string;
  approvalId: number | null;
  scenarioId: number | null;
}

export type ApproveDealResult =
  | {
      ok: true;
      dealId: number;
      previousStatus: string;
      currentStatus: string;
      screening: unknown;
    }
  | { ok: false; kind: "not_found" }
  | ({ ok: false; kind: "intapp" } & ApprovalGateBlock);

/**
 * Move a deal from `submitted` to `approved`.
 *
 * The Intapp re-screen at the approval-decision point is the one
 * gate the legacy route runs here (rejections never gate, so they
 * have a separate service). All bi-directional auto-pushes
 * (Dynamics, Workday, Intapp) are wired as `DealApproved`
 * subscribers in F1.4.5/6.
 */
export class ApproveDealService {
  constructor(
    private readonly repo: DealRepository,
    private readonly bus: EventBus,
    private readonly approvalGate: ApprovalGate,
  ) {}

  async execute(input: ApproveDealInput): Promise<ApproveDealResult> {
    const intapp = await this.approvalGate.check(input.dealId, input.actor);
    if (!intapp.allow) {
      return { ok: false, kind: "intapp", ...intapp };
    }

    const deal = await this.repo.findById(dealId(input.dealId));
    if (!deal) {
      return { ok: false, kind: "not_found" };
    }

    const previousStatus = deal.status.value;
    deal.approve({
      actor: input.actor,
      approvalId: input.approvalId,
      scenarioId: input.scenarioId,
    });
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
