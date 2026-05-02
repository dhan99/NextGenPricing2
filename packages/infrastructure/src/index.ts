/**
 * @dealpad/infrastructure — concrete adapters.
 *
 * Wraps the existing Drizzle calls behind repository interfaces
 * defined in @dealpad/domain, plus the in-process EventBus and
 * an outbox flusher. The seam between application and persistence.
 */
export { DrizzleDealRepository } from "./repositories/DrizzleDealRepository";
export { InProcessEventBus } from "./events/InProcessEventBus";
export { OutboxDispatcher } from "./events/OutboxDispatcher";
