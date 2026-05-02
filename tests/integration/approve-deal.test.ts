/**
 * F1.4.6 — POST /api/deals/:dealId/approvals + PATCH /api/approvals/:id
 * integration test.
 *
 * Pin behavioral parity after wiring through ApproveDealService +
 * RejectDealService:
 *   - POST creates an approval row, flips the deal to submitted, and
 *     writes a DealSubmitted outbox event
 *   - PATCH to approved updates the deal to approved + writes a
 *     DealApproved outbox event + activity_log "deal_approved" via
 *     subscriber
 *   - PATCH to rejected on a fresh deal updates to rejected + writes
 *     DealRejected + activity_log "deal_rejected"
 *   - Illegal state transitions return 409 illegal_state_transition
 *
 * Each test owns its own throwaway deal; no live data is touched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { attachRole } from "../../server/rbac";
import {
  activityLog,
  approvals,
  clients,
  deals,
  domainEventsOutbox,
} from "../../shared/schema";

const RUN_TAG = `__test_F1_4_approve_${Date.now()}`;

const PDL_HEADERS = {
  "x-user-role": "pdl",
  "x-user-name": `vitest-${RUN_TAG}-pdl`,
};
const APPROVER_HEADERS = {
  "x-user-role": "sll", // SLL has approveDeals permission
  "x-user-name": `vitest-${RUN_TAG}-approver`,
};

async function createDraftDeal(suffix: string): Promise<{ dealId: number; clientId: number }> {
  const [client] = await db
    .insert(clients)
    .values({ name: `${RUN_TAG}-${suffix} Client`, industry: "Test" })
    .returning();
  const [deal] = await db
    .insert(deals)
    .values({
      title: `${RUN_TAG}-${suffix} Deal`,
      dealNumber: `DL-TEST-${Date.now()}-${suffix}`,
      clientId: client.id,
      status: "draft",
      currentStep: 1,
      // Audit BU avoids the seeded over-budget Tech Consulting cost-center
      // (CC-CONS-300 is intentionally near 99.7% utilization for the demo).
      businessUnit: "Audit & Assurance",
      serviceLine: "Audit",
      totalFee: "10000.00",
      totalCost: "6000.00",
      marginPercent: "40.00",
    })
    .returning();
  return { dealId: deal.id, clientId: client.id };
}

async function cleanupDeal(dealId: number, clientId: number): Promise<void> {
  try {
    await db.delete(domainEventsOutbox).where(eq(domainEventsOutbox.aggregateId, dealId));
    await db.delete(activityLog).where(eq(activityLog.dealId, dealId));
    await db.delete(approvals).where(eq(approvals.dealId, dealId));
    await db.delete(deals).where(eq(deals.id, dealId));
    await db.delete(clients).where(eq(clients.id, clientId));
  } catch {
    /* swallow */
  }
}

describe("F1.4.6 — approval routes via Approve/RejectDealService", () => {
  if (!process.env.DATABASE_URL) {
    it.skip("DATABASE_URL not set — skipping integration test", () => {});
    return;
  }

  let app: express.Express;
  const owned: Array<{ dealId: number; clientId: number }> = [];

  beforeAll(async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS domain_events_outbox (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        version INTEGER NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id INTEGER NOT NULL,
        payload JSONB NOT NULL,
        occurred_at TIMESTAMP NOT NULL,
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(attachRole);
    registerRoutes(app);
  });

  afterAll(async () => {
    for (const o of owned) await cleanupDeal(o.dealId, o.clientId);
  });

  it("POST /approvals submits the deal AND creates the approval row", async () => {
    const o = await createDraftDeal("post-approve");
    owned.push(o);

    const res = await request(app)
      .post(`/api/deals/${o.dealId}/approvals`)
      .set(PDL_HEADERS)
      .send({
        approverName: "Jane Approver",
        approverRole: "Service Line Lead",
        submittedBy: PDL_HEADERS["x-user-name"],
        status: "pending",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.dealId).toBe(o.dealId);

    // Deal is submitted, currentStep advanced
    const [dRow] = await db.select().from(deals).where(eq(deals.id, o.dealId));
    expect(dRow.status).toBe("submitted");
    expect(dRow.currentStep ?? 1).toBeGreaterThanOrEqual(6);

    // Outbox holds the DealSubmitted event
    const outbox = await db
      .select()
      .from(domainEventsOutbox)
      .where(eq(domainEventsOutbox.aggregateId, o.dealId));
    expect(outbox.find((r) => r.type === "DealSubmitted")).toBeTruthy();
  });

  it("PATCH /approvals/:id to approved flips the deal AND writes DealApproved", async () => {
    const o = await createDraftDeal("patch-approve");
    owned.push(o);

    // Submit first
    const post = await request(app)
      .post(`/api/deals/${o.dealId}/approvals`)
      .set(PDL_HEADERS)
      .send({ approverName: "A", status: "pending" });
    expect(post.status).toBe(201);
    const approvalId = post.body.id;

    const patch = await request(app)
      .patch(`/api/approvals/${approvalId}`)
      .set(APPROVER_HEADERS)
      .send({ status: "approved", approverName: "Bob" });
    expect(patch.status).toBe(200);

    const [dRow] = await db.select().from(deals).where(eq(deals.id, o.dealId));
    expect(dRow.status).toBe("approved");

    const outbox = await db
      .select()
      .from(domainEventsOutbox)
      .where(eq(domainEventsOutbox.aggregateId, o.dealId));
    const approved = outbox.find((r) => r.type === "DealApproved");
    expect(approved).toBeTruthy();
    expect(approved!.version).toBe(1);
    const payload = approved!.payload as Record<string, unknown>;
    expect(payload.approvalId).toBe(approvalId);

    // Subscriber wrote a deal_approved activity log entry
    const log = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.dealId, o.dealId));
    expect(log.find((r) => r.action === "deal_approved")).toBeTruthy();
  });

  it("PATCH /approvals/:id to rejected flips the deal AND writes DealRejected", async () => {
    const o = await createDraftDeal("patch-reject");
    owned.push(o);

    const post = await request(app)
      .post(`/api/deals/${o.dealId}/approvals`)
      .set(PDL_HEADERS)
      .send({ approverName: "A", status: "pending" });
    const approvalId = post.body.id;

    const patch = await request(app)
      .patch(`/api/approvals/${approvalId}`)
      .set(APPROVER_HEADERS)
      .send({
        status: "rejected",
        approverName: "Carol",
        comments: "Margin too thin",
      });
    expect(patch.status).toBe(200);

    const [dRow] = await db.select().from(deals).where(eq(deals.id, o.dealId));
    expect(dRow.status).toBe("rejected");

    const outbox = await db
      .select()
      .from(domainEventsOutbox)
      .where(eq(domainEventsOutbox.aggregateId, o.dealId));
    const rejected = outbox.find((r) => r.type === "DealRejected");
    expect(rejected).toBeTruthy();
    const payload = rejected!.payload as Record<string, unknown>;
    expect(payload.reason).toBe("Margin too thin");
    expect(payload.approvalId).toBe(approvalId);

    const log = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.dealId, o.dealId));
    expect(log.find((r) => r.action === "deal_rejected")).toBeTruthy();
  });

  it("PATCH /approvals/:id with illegal approval-row transition returns 409", async () => {
    const o = await createDraftDeal("patch-illegal");
    owned.push(o);
    const post = await request(app)
      .post(`/api/deals/${o.dealId}/approvals`)
      .set(PDL_HEADERS)
      .send({ approverName: "A", status: "pending" });
    const approvalId = post.body.id;

    // Approve once → terminal. Then attempt rejected → terminal-to-
    // terminal flip is illegal in the approval-row stage graph
    // (`approved: []`). Should 409 with illegal_approval_transition.
    await request(app)
      .patch(`/api/approvals/${approvalId}`)
      .set(APPROVER_HEADERS)
      .send({ status: "approved", approverName: "B" });

    const second = await request(app)
      .patch(`/api/approvals/${approvalId}`)
      .set(APPROVER_HEADERS)
      .send({ status: "rejected", approverName: "B" });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/illegal_approval_transition/);
  });
});
