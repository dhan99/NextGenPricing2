// 001_multi_entity_backfill — F1.1
//
// Every deal needs at least one entity row before the entity-aware UI ships,
// otherwise scope items and pricing lines have nowhere to attach. This script
// is idempotent: it skips deals that already have entities, and only updates
// scope/pricing rows whose entity_id is still NULL.
//
// Runs automatically on dev server boot from server/index.ts:start() (gated
// by NODE_ENV !== "production"). For production environments, run once with:
//
//     RUN_MULTI_ENTITY_BACKFILL=1 npx tsx scripts/migrations/001_multi_entity_backfill.ts
//
// Same gating pattern as backfillDealTotals — pay the cost once at deploy
// time, not on every cold start.

import { eq, sql } from "drizzle-orm";
import { db } from "../../server/db";
import { deals, dealEntities, dealScopeItems, pricingLines } from "../../shared/schema";

export type MultiEntityBackfillResult = {
  dealsScanned: number;
  entitiesCreated: number;
  scopeItemsAssigned: number;
  pricingLinesAssigned: number;
};

const PRIMARY_ENTITY_NAME = "Primary Entity";

export async function backfillMultiEntity(): Promise<MultiEntityBackfillResult> {
  const all = await db.select({ id: deals.id }).from(deals);
  let entitiesCreated = 0;
  let scopeItemsAssigned = 0;
  let pricingLinesAssigned = 0;

  for (const d of all) {
    // Skip if this deal already has any entity rows. We only want to
    // create the Primary Entity for deals that have never been touched
    // by F1.1, never to add a duplicate.
    const existing = await db.select({ id: dealEntities.id })
      .from(dealEntities).where(eq(dealEntities.dealId, d.id)).limit(1);
    let primaryId: number;
    if (existing.length > 0) {
      primaryId = existing[0].id;
    } else {
      const [created] = await db.insert(dealEntities).values({
        dealId: d.id,
        name: PRIMARY_ENTITY_NAME,
        isPrimary: true,
      }).returning({ id: dealEntities.id });
      primaryId = created.id;
      entitiesCreated++;
    }

    // Backfill the dependent rows — only those still NULL, so re-running
    // is a no-op once the deal is already wired up.
    const scopeRes = await db.update(dealScopeItems)
      .set({ entityId: primaryId })
      .where(sql`${dealScopeItems.dealId} = ${d.id} AND ${dealScopeItems.entityId} IS NULL`);
    scopeItemsAssigned += scopeRes.rowCount ?? 0;

    const pricingRes = await db.update(pricingLines)
      .set({ entityId: primaryId })
      .where(sql`${pricingLines.dealId} = ${d.id} AND ${pricingLines.entityId} IS NULL`);
    pricingLinesAssigned += pricingRes.rowCount ?? 0;
  }

  return {
    dealsScanned: all.length,
    entitiesCreated,
    scopeItemsAssigned,
    pricingLinesAssigned,
  };
}

// Allow direct invocation: `npx tsx scripts/migrations/001_multi_entity_backfill.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillMultiEntity()
    .then((r) => {
      console.log("[001_multi_entity_backfill] " + JSON.stringify(r));
      process.exit(0);
    })
    .catch((e) => {
      console.error("[001_multi_entity_backfill] failed:", e);
      process.exit(1);
    });
}
