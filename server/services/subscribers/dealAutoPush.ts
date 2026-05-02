import { db } from "../../db";
import { activityLog } from "../../../shared/schema";
import type { EventBus } from "@dealpad/domain";
import { autoPushDeal } from "../../dynamics";
import { onDealSubmittedTrigger, autoPushIntappOutcome } from "../../intapp";
import { autoPushWorkdayProject } from "../../workday";

/**
 * Wires legacy fire-and-forget side effects to deal-lifecycle
 * domain events. Each subscriber matches what the legacy handlers
 * called inline, so the route handlers can shrink to
 * "parse → call service → render result".
 *
 * Activity-log writes that are *deal-level* (deal_approved /
 * deal_rejected) move here. Approval-row activity entries
 * (approval_submitted, approval_advanced) stay in the route
 * because they describe the approval row, not the deal.
 *
 * Auto-push handlers swallow errors (matches legacy
 * `.catch(() => {})` behavior); the outbox row is the durable
 * record either way and the dispatcher catches up if needed.
 */
export function registerDealAutoPushSubscribers(bus: EventBus): void {
  bus.subscribe("DealSubmitted", async (event) => {
    const e = event as unknown as {
      aggregateId: number;
      actor: string;
    };
    try {
      await autoPushDeal(e.aggregateId, ["status"], e.actor);
    } catch { /* legacy parity — swallow */ }
    try {
      await onDealSubmittedTrigger(e.aggregateId, e.actor);
    } catch { /* legacy parity — swallow */ }
  });

  bus.subscribe("DealApproved", async (event) => {
    const e = event as unknown as {
      aggregateId: number;
      actor: string;
    };
    try {
      await db.insert(activityLog).values({
        dealId: e.aggregateId,
        action: "deal_approved",
        description: `Deal approved by ${e.actor}`,
        userName: e.actor,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[DealApproved] activity_log insert failed:", err);
    }
    try { await autoPushDeal(e.aggregateId, ["status"], e.actor); } catch { /* swallow */ }
    try { await autoPushIntappOutcome(e.aggregateId, "approved", e.actor); } catch { /* swallow */ }
    try { await autoPushWorkdayProject(e.aggregateId, "approval", e.actor); } catch { /* swallow */ }
  });

  bus.subscribe("DealRejected", async (event) => {
    const e = event as unknown as {
      aggregateId: number;
      actor: string;
    };
    try {
      await db.insert(activityLog).values({
        dealId: e.aggregateId,
        action: "deal_rejected",
        description: `Deal rejected by ${e.actor}`,
        userName: e.actor,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[DealRejected] activity_log insert failed:", err);
    }
    try { await autoPushDeal(e.aggregateId, ["status"], e.actor); } catch { /* swallow */ }
    try { await autoPushIntappOutcome(e.aggregateId, "rejected", e.actor); } catch { /* swallow */ }
  });
}
