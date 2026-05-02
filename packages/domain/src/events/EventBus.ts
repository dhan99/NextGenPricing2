import type { DomainEvent } from "../deal/events";

/**
 * Subscriber callback. Returning `void` (sync) is fine; returning a
 * Promise lets subscribers do async work (e.g. push to Dynamics).
 *
 * Subscribers must be **idempotent** — replays from the outbox table
 * (or restarts mid-flush) can fire the same event twice. Use
 * `(aggregateId, type, occurredAt)` as a natural dedupe key when
 * needed.
 */
export type EventHandler<E extends DomainEvent = DomainEvent> = (
  event: E,
) => void | Promise<void>;

/**
 * In-process pub/sub seam. The infrastructure layer ships a
 * synchronous fanout impl (`InProcessEventBus`); future iterations
 * may swap in Service Bus / Kafka without touching subscribers.
 *
 * Conventions:
 * - subscribe by exact event `type` string
 * - publish dispatches to all matching subscribers in registration order
 * - subscriber errors are logged + swallowed by the bus so one
 *   misbehaving subscriber can't break a checkout
 */
export interface EventBus {
  subscribe(type: string, handler: EventHandler): () => void;
  publish(event: DomainEvent): Promise<void>;
  publishAll(events: readonly DomainEvent[]): Promise<void>;
}
