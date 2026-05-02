import { eq, isNull, asc } from "drizzle-orm";
import type { DomainEvent, EventBus } from "@dealpad/domain";
import { domainEventsOutbox } from "../../../../shared/schema";

/**
 * Replay unpublished outbox rows on boot. The application services
 * write outbox rows + aggregate state in a single transaction, then
 * (best-effort) publish to the in-process bus. If the process crashes
 * between commit and publish, the outbox row stays unpublished — this
 * dispatcher catches up on the next boot.
 *
 * Marks rows `published_at = NOW()` after subscribers run. Subscriber
 * failures leave the row unpublished so the next boot retries.
 */
export class OutboxDispatcher {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any, private readonly bus: EventBus) {}

  /**
   * Dispatch every unpublished row in (occurred_at, id) order.
   * Returns the number of rows successfully marked published.
   */
  async dispatchUnpublished(): Promise<{ dispatched: number; failed: number }> {
    const rows = await this.db
      .select()
      .from(domainEventsOutbox)
      .where(isNull(domainEventsOutbox.publishedAt))
      .orderBy(asc(domainEventsOutbox.occurredAt), asc(domainEventsOutbox.id));

    let dispatched = 0;
    let failed = 0;
    for (const row of rows) {
      const event = this.toEvent(row);
      try {
        await this.bus.publish(event);
        await this.db
          .update(domainEventsOutbox)
          .set({ publishedAt: new Date() })
          .where(eq(domainEventsOutbox.id, row.id));
        dispatched++;
      } catch {
        failed++;
      }
    }
    return { dispatched, failed };
  }

  private toEvent(row: {
    type: string;
    version: number;
    aggregateId: number;
    payload: unknown;
    occurredAt: Date;
  }): DomainEvent {
    const payload = (row.payload as Record<string, unknown>) || {};
    return {
      ...payload,
      type: row.type,
      version: row.version,
      aggregateId: row.aggregateId,
      occurredAt: row.occurredAt,
    } as DomainEvent;
  }
}
