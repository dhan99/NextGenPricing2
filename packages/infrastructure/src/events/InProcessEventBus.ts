import type { DomainEvent, EventBus, EventHandler } from "@dealpad/domain";

/**
 * Synchronous in-process pub/sub. Subscribers run sequentially in
 * registration order; each gets its own try/catch so one misbehaving
 * subscriber doesn't break the chain.
 *
 * Async work is allowed (handlers may return a Promise); the bus
 * `await`s them one at a time. If you need parallel fanout, do it
 * inside the subscriber, not in the bus — keeping the order fixed
 * makes integration tests deterministic.
 *
 * Subscriber failures are reported via `onError` (defaults to
 * console.error). Failures DO NOT prevent later subscribers from
 * running — the bus is best-effort delivery, with the outbox table
 * as the durable record.
 */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly onError: (error: unknown, event: DomainEvent, type: string) => void;

  constructor(opts?: {
    onError?: (error: unknown, event: DomainEvent, type: string) => void;
  }) {
    this.onError =
      opts?.onError ??
      ((err, event, type) => {
        const dealId = (event as { aggregateId?: number }).aggregateId;
        // eslint-disable-next-line no-console
        console.error(
          `[EventBus] subscriber for "${type}" (aggregate=${dealId}) threw:`,
          err,
        );
      });
  }

  subscribe(type: string, handler: EventHandler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const cur = this.handlers.get(type);
      if (!cur) return;
      const idx = cur.indexOf(handler);
      if (idx >= 0) cur.splice(idx, 1);
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    const list = this.handlers.get(event.type) ?? [];
    for (const handler of list) {
      try {
        await handler(event);
      } catch (err) {
        this.onError(err, event, event.type);
      }
    }
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const e of events) {
      await this.publish(e);
    }
  }

  /** Test helper: clear all subscribers. Don't use in production code. */
  clear(): void {
    this.handlers.clear();
  }
}
