/**
 * F1.2 — Tax PHB Assembly Excel-parity golden test.
 *
 * Pins the deterministic expansion of the seeded `TAX-ASM-PHB-001`
 * assembly against a known engagement-inputs fixture. Today this is
 * the deterministic "Excel parity" check the BACKLOG done-when calls
 * for; once a real Tax PHB workbook is loaded into the repo, the
 * fixture below can be replaced by parsed Excel rows.
 *
 * Strategy: build the ExpansionContext in-memory (no DB mutation) and
 * call expandAssembly() directly. We verify against the COMPONENTS
 * stored in the DB (so the test catches drift in the seeded
 * formulas/overrides) but the engagement_inputs are hardcoded to a
 * "Tax-Corporate" baseline, NOT pulled from a deal — keeps the test
 * deterministic regardless of which deals exist locally.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../server/db";
import { scopeCatalog, assemblyTemplates, assemblyComponents } from "../../shared/schema";
import { expandAssembly, type ExpansionContext } from "../../server/services/AssemblyExpansionService";

// Fixture: Tax-Corporate engagement_inputs from the audit-scope seed
// (deal 28 in the dev DB has these values exactly). Test runs even
// if no such deal exists.
const FIXTURE_INPUTS: Record<string, unknown> = {
  taxEntities: "5",
  taxReturnsPerYear: "12",
  tpTransactions: "20",
  recurringMixPct: "55",
  techAdminFeePct: "17",
  tmRateAdjustmentPct: "30",
};

describe("F1.2 — Tax PHB assembly Excel-parity golden", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let templateId: number;
  let components: any[];
  let catalogById: Map<number, any>;

  beforeAll(async () => {
    const [asm] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.code, "TAX-ASM-PHB-001"));
    if (!asm) {
      throw new Error("Seed has not run — TAX-ASM-PHB-001 missing from scope_catalog");
    }
    const [tpl] = await db.select().from(assemblyTemplates).where(eq(assemblyTemplates.scopeItemId, asm.id));
    if (!tpl) {
      throw new Error("Seed has not run — assembly_template for TAX-ASM-PHB-001 missing");
    }
    templateId = tpl.id;
    components = await db.select().from(assemblyComponents).where(eq(assemblyComponents.templateId, templateId));
    expect(components.length).toBe(5); // matches seedTaxPhbAssembly's TAX_PHB_COMPONENTS length

    // Build the catalog map by re-querying each leaf — small N (5),
    // a per-id loop is fine and avoids importing inArray.
    const leafIds = components.map((c) => c.scopeItemId);
    catalogById = new Map();
    for (const id of leafIds) {
      const [leaf] = await db.select().from(scopeCatalog).where(eq(scopeCatalog.id, id));
      if (leaf) catalogById.set(leaf.id, leaf);
    }
  });

  it("expands to 5 lines at Ultimate tier with the canonical totals", () => {
    const ctx: ExpansionContext = {
      tier: "ultimate",
      engagementInputs: FIXTURE_INPUTS,
      promptAnswers: {},
    };
    const lines = expandAssembly(components as any, catalogById as any, ctx);

    expect(lines.length).toBe(5);

    // Sort by sourceComponentId for stable assertion (matches sortOrder).
    const sorted = [...lines].sort((a, b) => a.sourceComponentId - b.sourceComponentId);
    const totals = sorted.map((l) => ({ qty: l.quantity, hrs: l.adjustedHours, total: l.quantity * l.adjustedHours }));

    // EXPECTED (BACKLOG.md F1.2 done-when, "Ultimate tier" line):
    //   TAX-DIR-001 — qty=taxEntities=5,           hrs=28 → 140h
    //   TAX-DIR-002 — qty=taxEntities*4=20,        hrs=6  → 120h
    //   TAX-DIR-004 — qty=taxReturnsPerYear=12,    hrs=22 → 264h
    //   TAX-TP-004  — qty=tpTransactions=20,       hrs=12 → 240h
    //   PMO-001     — qty=1 (null formula),        hrs=80 → 80h
    //   ─────────────────────────────────────────────────────
    //   Total                                              844h
    expect(totals[0]).toEqual({ qty: 5,  hrs: 28, total: 140 });
    expect(totals[1]).toEqual({ qty: 20, hrs: 6,  total: 120 });
    expect(totals[2]).toEqual({ qty: 12, hrs: 22, total: 264 });
    expect(totals[3]).toEqual({ qty: 20, hrs: 12, total: 240 });
    expect(totals[4]).toEqual({ qty: 1,  hrs: 80, total: 80 });

    const totalHours = totals.reduce((s, t) => s + t.total, 0);
    expect(totalHours).toBe(844);
  });

  it("Enhanced tier swaps overrides without changing quantities", () => {
    const ctx: ExpansionContext = { tier: "enhanced", engagementInputs: FIXTURE_INPUTS, promptAnswers: {} };
    const lines = expandAssembly(components as any, catalogById as any, ctx);
    const sorted = [...lines].sort((a, b) => a.sourceComponentId - b.sourceComponentId);
    expect(sorted.map((l) => l.adjustedHours)).toEqual([24, 5, 18, 10, 60]);
    expect(sorted.map((l) => l.quantity)).toEqual([5, 20, 12, 20, 1]); // unchanged from Ultimate
    const total = sorted.reduce((s, l) => s + l.quantity * l.adjustedHours, 0);
    // 5*24 + 20*5 + 12*18 + 20*10 + 1*60 = 120+100+216+200+60 = 696
    expect(total).toBe(696);
  });

  it("Essential tier", () => {
    const ctx: ExpansionContext = { tier: "essential", engagementInputs: FIXTURE_INPUTS, promptAnswers: {} };
    const lines = expandAssembly(components as any, catalogById as any, ctx);
    const sorted = [...lines].sort((a, b) => a.sourceComponentId - b.sourceComponentId);
    expect(sorted.map((l) => l.adjustedHours)).toEqual([20, 4, 16, 8, 40]);
    const total = sorted.reduce((s, l) => s + l.quantity * l.adjustedHours, 0);
    // 5*20 + 20*4 + 12*16 + 20*8 + 1*40 = 100+80+192+160+40 = 572
    expect(total).toBe(572);
  });

  it("a single-entity client produces a smaller bundle deterministically", () => {
    const ctx: ExpansionContext = {
      tier: "ultimate",
      engagementInputs: { ...FIXTURE_INPUTS, taxEntities: "1", tpTransactions: "0", taxReturnsPerYear: "1" },
      promptAnswers: {},
    };
    const lines = expandAssembly(components as any, catalogById as any, ctx);
    const sorted = [...lines].sort((a, b) => a.sourceComponentId - b.sourceComponentId);

    // tpTransactions=0 → TP benchmarking component drops out (quantity=0).
    expect(sorted.find((l) => l.sourceComponentId === components.find((c) => c.scopeItemId !== null && c.quantityFormula === "tpTransactions")?.id)).toBeUndefined();
    expect(lines.length).toBe(4);

    // Per-line: 1*28 + 4*6 + 1*22 + 1*80 = 28+24+22+80 = 154
    const total = lines.reduce((s, l) => s + l.quantity * l.adjustedHours, 0);
    expect(total).toBe(154);
  });
});
