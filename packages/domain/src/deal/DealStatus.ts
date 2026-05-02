import { IllegalStateError, InvariantError } from "../shared/errors";

/**
 * Canonical deal lifecycle. Storage column is `deals.status` (text).
 *
 * The transition table here is the **single source of truth**:
 * routes/services may run *additional* gating (Intapp screening,
 * Workday budget) but must not allow transitions outside this graph.
 *
 *   draft     →  submitted  |  archived
 *   submitted →  approved   |  rejected   |  draft  (rework)
 *   approved  →  archived
 *   rejected  →  draft      |  archived
 *   archived  →  draft      (restore)
 *
 * Notes:
 * - `draft → archived` matches `DELETE /api/deals/:id` (soft-delete via
 *   archive). Pre-F1.4 routes also archive from approved/rejected.
 * - `submitted → draft` covers "rework" on rejection or pre-decision
 *   recall. Currently rare in routes, but allowed in the graph so
 *   future flows don't have to fight the state machine.
 */
export const DEAL_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "archived",
] as const;

export type DealStatusValue = (typeof DEAL_STATUSES)[number];

const TRANSITIONS: Record<DealStatusValue, ReadonlySet<DealStatusValue>> = {
  draft: new Set<DealStatusValue>(["submitted", "archived"]),
  submitted: new Set<DealStatusValue>(["approved", "rejected", "draft"]),
  approved: new Set<DealStatusValue>(["archived"]),
  rejected: new Set<DealStatusValue>(["draft", "archived"]),
  archived: new Set<DealStatusValue>(["draft"]),
};

export class DealStatus {
  readonly value: DealStatusValue;

  private constructor(value: DealStatusValue) {
    this.value = value;
  }

  static fromString(raw: string | null | undefined): DealStatus {
    if (!raw) {
      throw new InvariantError("DealStatus: missing status");
    }
    if (!(DEAL_STATUSES as readonly string[]).includes(raw)) {
      throw new InvariantError(`DealStatus: unknown value "${raw}"`);
    }
    return new DealStatus(raw as DealStatusValue);
  }

  static draft(): DealStatus {
    return new DealStatus("draft");
  }
  static submitted(): DealStatus {
    return new DealStatus("submitted");
  }
  static approved(): DealStatus {
    return new DealStatus("approved");
  }
  static rejected(): DealStatus {
    return new DealStatus("rejected");
  }
  static archived(): DealStatus {
    return new DealStatus("archived");
  }

  /** True if `next` is reachable from `this` per the transition table. */
  canTransitionTo(next: DealStatus): boolean {
    return TRANSITIONS[this.value].has(next.value);
  }

  /**
   * Throw if the transition is illegal. Callers should use this on the
   * write path; the graph is small and explicit so the error tells the
   * caller exactly which edge is missing.
   */
  assertCanTransitionTo(next: DealStatus): void {
    if (!this.canTransitionTo(next)) {
      throw new IllegalStateError(this.value, next.value, "Deal");
    }
  }

  isDraft(): boolean {
    return this.value === "draft";
  }
  isSubmitted(): boolean {
    return this.value === "submitted";
  }
  isApproved(): boolean {
    return this.value === "approved";
  }
  isRejected(): boolean {
    return this.value === "rejected";
  }
  isArchived(): boolean {
    return this.value === "archived";
  }

  /** True if the deal has reached a final decision (approved/rejected). */
  isDecided(): boolean {
    return this.isApproved() || this.isRejected();
  }

  equals(other: DealStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
