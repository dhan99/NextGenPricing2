import {
  dealId,
  type DealRepository,
  type EventBus,
} from "@dealpad/domain";

export interface RejectDealInput {
  dealId: number;
  actor: string;
  approvalId: number | null;
  reason: string | null;
}

export type RejectDealResult =
  | {
      ok: true;
      dealId: number;
      previousStatus: string;
      currentStatus: string;
    }
  | { ok: false; kind: "not_found" };

/**
 * Move a deal from `submitted` to `rejected`. **No gating** — per the
 * legacy route comments, rejections must always be allowed regardless
 * of Intapp screening state, so a stuck conflict can't block "no".
 */
export class RejectDealService {
  constructor(
    private readonly repo: DealRepository,
    private readonly bus: EventBus,
  ) {}

  async execute(input: RejectDealInput): Promise<RejectDealResult> {
    const deal = await this.repo.findById(dealId(input.dealId));
    if (!deal) {
      return { ok: false, kind: "not_found" };
    }
    const previousStatus = deal.status.value;
    deal.reject({
      actor: input.actor,
      approvalId: input.approvalId,
      reason: input.reason,
    });
    const events = deal.pullEvents();
    const persisted = await this.repo.save(deal, events);
    await this.bus.publishAll(persisted);
    return {
      ok: true,
      dealId: input.dealId,
      previousStatus,
      currentStatus: deal.status.value,
    };
  }
}
