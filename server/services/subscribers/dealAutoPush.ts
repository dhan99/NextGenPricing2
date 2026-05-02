import type { EventBus } from "@dealpad/domain";
import { autoPushDeal } from "../../dynamics";
import { onDealSubmittedTrigger } from "../../intapp";

/**
 * Wires legacy fire-and-forget side effects to the DealSubmitted
 * event. The legacy /submit handler called these inline:
 *
 *   autoPushDeal(dealId, ["status"], actor).catch(() => {});
 *   onDealSubmittedTrigger(dealId, actor).catch(() => {});
 *
 * F1.4.5 moves them behind the bus so the route handler shrinks to
 * "parse → call service → render result". The handlers swallow
 * errors (matching the legacy `.catch(() => {})` behavior); the
 * outbox row is the durable record either way.
 */
export function registerDealAutoPushSubscribers(bus: EventBus): void {
  bus.subscribe("DealSubmitted", async (event) => {
    const e = event as unknown as {
      aggregateId: number;
      actor: string;
    };
    try {
      await autoPushDeal(e.aggregateId, ["status"], e.actor);
    } catch {
      /* legacy parity — swallow */
    }
    try {
      await onDealSubmittedTrigger(e.aggregateId, e.actor);
    } catch {
      /* legacy parity — swallow */
    }
  });
}
