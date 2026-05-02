/**
 * F3.1 — Collaborative scoping foundation.
 *
 * Ships the durability + room-allocation seam without the actual
 * Yjs CRDT + WebSocket gateway. The gateway, when it lands, will:
 *   - receive `awareness` + `update` messages over WS
 *   - call applyUpdate(doc, update) to merge
 *   - call this service's `persistDocumentState` on idle to snapshot
 *
 * The server-side restart story is straightforward: reload all
 * unfinished rooms from this table on boot, and the gateway resumes
 * where it left off.
 */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { collaborationSessions, deals } from "../../shared/schema";

export interface CollabSession {
  id: number;
  dealId: number;
  documentKey: string;
  roomId: string;
  documentState: { format: string; payload: string } | null;
  presence: unknown;
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
}

export const ALLOWED_DOCUMENT_KEYS = [
  "scope_v1",
  "pricing_notes_v1",
  "approval_thread_v1",
] as const;
export type DocumentKey = (typeof ALLOWED_DOCUMENT_KEYS)[number];

export function isDocumentKey(raw: unknown): raw is DocumentKey {
  return typeof raw === "string" && (ALLOWED_DOCUMENT_KEYS as readonly string[]).includes(raw);
}

/**
 * 16-byte room id, hex. Stable across reconnects, opaque to
 * clients, easily pasted into URL fragments. Matches the eventual
 * gateway's room-id expectations.
 */
function generateRoomId(): string {
  return randomBytes(16).toString("hex");
}

function rowToSession(row: typeof collaborationSessions.$inferSelect): CollabSession {
  return {
    id: row.id,
    dealId: row.dealId,
    documentKey: row.documentKey,
    roomId: row.roomId,
    documentState: (row.documentState as CollabSession["documentState"]) ?? null,
    presence: row.presence,
    lastEditedBy: row.lastEditedBy,
    lastEditedAt: row.lastEditedAt,
  };
}

/**
 * Get-or-create the (deal, documentKey) session row. The gateway
 * calls this on first connection to a room; the room id returned
 * is the one the WS server should bind to.
 */
export async function ensureSession(input: {
  dealId: number;
  documentKey: DocumentKey;
}): Promise<CollabSession | null> {
  // Validate the deal exists; refuse to create rooms on unknown deals.
  const [deal] = await db.select({ id: deals.id }).from(deals).where(eq(deals.id, input.dealId));
  if (!deal) return null;

  const [existing] = await db
    .select()
    .from(collaborationSessions)
    .where(
      and(
        eq(collaborationSessions.dealId, input.dealId),
        eq(collaborationSessions.documentKey, input.documentKey),
      ),
    );
  if (existing) return rowToSession(existing);

  const roomId = generateRoomId();
  // Race with another concurrent caller is OK — the unique index
  // ensures only one row wins; on conflict we re-select.
  try {
    const [created] = await db
      .insert(collaborationSessions)
      .values({
        dealId: input.dealId,
        documentKey: input.documentKey,
        roomId,
        documentState: null,
        presence: null,
      })
      .returning();
    return rowToSession(created);
  } catch (err: unknown) {
    const e = err as { code?: string; cause?: { code?: string } };
    if (e?.code === "23505" || e?.cause?.code === "23505") {
      const [refetched] = await db
        .select()
        .from(collaborationSessions)
        .where(
          and(
            eq(collaborationSessions.dealId, input.dealId),
            eq(collaborationSessions.documentKey, input.documentKey),
          ),
        );
      return refetched ? rowToSession(refetched) : null;
    }
    throw err;
  }
}

/**
 * Persist a snapshot of the document state. Called by the gateway
 * on a debounce (typically every few seconds of idle). Idempotent.
 */
export async function persistDocumentState(input: {
  dealId: number;
  documentKey: DocumentKey;
  /** Base64-encoded Yjs update vector. */
  payload: string;
  editedBy: string;
}): Promise<CollabSession | null> {
  const session = await ensureSession({ dealId: input.dealId, documentKey: input.documentKey });
  if (!session) return null;
  const [updated] = await db
    .update(collaborationSessions)
    .set({
      documentState: { format: "y-update-v1", payload: input.payload },
      lastEditedBy: input.editedBy,
      lastEditedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(collaborationSessions.id, session.id))
    .returning();
  return updated ? rowToSession(updated) : null;
}

export async function setPresence(input: {
  dealId: number;
  documentKey: DocumentKey;
  presence: unknown;
}): Promise<CollabSession | null> {
  const session = await ensureSession({ dealId: input.dealId, documentKey: input.documentKey });
  if (!session) return null;
  const [updated] = await db
    .update(collaborationSessions)
    .set({ presence: input.presence as object | null, updatedAt: new Date() })
    .where(eq(collaborationSessions.id, session.id))
    .returning();
  return updated ? rowToSession(updated) : null;
}

export async function getSession(input: {
  dealId: number;
  documentKey: DocumentKey;
}): Promise<CollabSession | null> {
  const [row] = await db
    .select()
    .from(collaborationSessions)
    .where(
      and(
        eq(collaborationSessions.dealId, input.dealId),
        eq(collaborationSessions.documentKey, input.documentKey),
      ),
    );
  return row ? rowToSession(row) : null;
}
