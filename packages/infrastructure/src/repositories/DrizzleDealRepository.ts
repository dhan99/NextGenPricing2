import { eq } from "drizzle-orm";
import { Deal, dealId, type DealEvent, type DealId, type DealRepository, DomainError } from "@dealpad/domain";
import { deals, domainEventsOutbox } from "../../../../shared/schema";

/**
 * Drizzle-backed implementation of `DealRepository`. Reads come back
 * as a `Deal` aggregate via `Deal.fromPersistence`; writes are wrapped
 * in a single transaction so the aggregate state and the outbox rows
 * commit atomically.
 *
 * Generic on the Drizzle handle so this works against either the
 * production `db` (node-postgres) or a test transaction. Imports the
 * tables directly — no orm-level magic.
 */
export class DrizzleDealRepository implements DealRepository {
  // Use `any` for the Drizzle handle to avoid pulling in the deep
  // generic types here. The schema is captured by the imported tables.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: any) {}

  async findById(id: DealId): Promise<Deal | null> {
    const [row] = await this.db.select().from(deals).where(eq(deals.id, id));
    if (!row) return null;
    return Deal.fromPersistence({
      id: row.id,
      dealNumber: row.dealNumber,
      title: row.title,
      status: row.status,
      totalFee: row.totalFee,
      totalCost: row.totalCost,
      marginPercent: row.marginPercent,
      currentStep: row.currentStep,
    });
  }

  async getById(id: DealId): Promise<Deal> {
    const found = await this.findById(id);
    if (!found) {
      throw new DomainError("deal_not_found", `Deal #${id} not found`);
    }
    return found;
  }

  async save(
    deal: Deal,
    events: readonly DealEvent[],
  ): Promise<readonly DealEvent[]> {
    const snap = deal.toSnapshot();
    await this.db.transaction(async (tx: typeof this.db) => {
      await tx
        .update(deals)
        .set({
          status: snap.status.value,
          currentStep: snap.currentStep,
          updatedAt: new Date(),
        })
        .where(eq(deals.id, snap.id));
      if (events.length > 0) {
        await tx.insert(domainEventsOutbox).values(
          events.map((e) => ({
            type: e.type,
            version: e.version,
            aggregateType: "Deal",
            aggregateId: e.aggregateId,
            payload: e as unknown as Record<string, unknown>,
            occurredAt: e.occurredAt,
          })),
        );
      }
    });
    return events;
  }

  /** Convenience: hydrate by raw `id` value (no branding required). */
  async findByRawId(id: number): Promise<Deal | null> {
    return this.findById(dealId(id));
  }
}
