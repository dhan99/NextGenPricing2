/**
 * Helpers for guaranteeing a deal has a Primary Entity row.
 *
 * The F1.1 multi-entity feature added `deal_entities` and a backfill
 * (scripts/migrations/001_multi_entity_backfill.ts) that runs on
 * server boot, ensuring every existing deal has at least one
 * Primary Entity. The deal-create paths historically did NOT
 * insert one — so any deal created mid-server-life (CRM import,
 * manual create, agent-draft, clone) ended up without an entity,
 * and the EntityTabs UI showed an empty tab strip until the next
 * server restart.
 *
 * Calling `ensurePrimaryEntity(dealId)` from every create site
 * closes that gap idempotently. Safe to call on a deal that
 * already has entities — it short-circuits.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { dealEntities } from "../../shared/schema";

export async function ensurePrimaryEntity(dealId: number): Promise<{ created: boolean; id: number | null }> {
  const [existing] = await db
    .select({ id: dealEntities.id })
    .from(dealEntities)
    .where(and(eq(dealEntities.dealId, dealId), eq(dealEntities.isPrimary, true)))
    .limit(1);
  if (existing) return { created: false, id: existing.id };
  const [created] = await db
    .insert(dealEntities)
    .values({
      dealId,
      name: "Primary Entity",
      isPrimary: true,
      sortOrder: 0,
    })
    .returning({ id: dealEntities.id });
  return { created: true, id: created?.id ?? null };
}
