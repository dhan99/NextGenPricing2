import type { Deal } from "./Deal";
import type { DealEvent } from "./events";
import type { DealId } from "./DealId";

/**
 * Repository contract for the Deal aggregate. Implementations live in
 * @dealpad/infrastructure (e.g. DrizzleDealRepository). The application
 * layer depends on this interface, never on the concrete impl, so we
 * can swap to a different ORM or test double without touching services.
 *
 * Convention: `save(deal, events)` is **transactional** in the
 * concrete impl — aggregate row update + outbox event rows in a
 * single DB transaction. After commit, the impl is responsible for
 * publishing the events to the bus (or returning them so the service
 * does so explicitly, depending on the flush strategy).
 */
export interface DealRepository {
  /** Returns the aggregate or `null` if no row matches. */
  findById(id: DealId): Promise<Deal | null>;

  /** Throws if the deal does not exist. Useful in handlers that already 404'd. */
  getById(id: DealId): Promise<Deal>;

  /**
   * Persist mutations from the aggregate AND the events it accumulated.
   * Implementations must wrap both writes in one transaction. Returns
   * the events so the application layer can hand them to the bus.
   */
  save(deal: Deal, events: readonly DealEvent[]): Promise<readonly DealEvent[]>;
}
