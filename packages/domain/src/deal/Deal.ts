import { Money } from "../shared/Money";
import { Percentage } from "../shared/Percentage";
import { DealStatus } from "./DealStatus";
import { dealId, type DealId } from "./DealId";
import {
  dealApproved,
  dealRejected,
  dealSubmitted,
  type DealEvent,
} from "./events";
import { InvariantError } from "../shared/errors";

/**
 * Persistence row shape (subset of `deals` columns we currently care
 * about). Marshaling lives in `Deal.fromPersistence` — the aggregate
 * never imports Drizzle.
 */
export interface DealRow {
  id: number;
  dealNumber: string;
  title: string;
  status: string;
  totalFee: string | null;
  totalCost: string | null;
  marginPercent: string | null;
  currentStep: number | null;
}

export interface DealSnapshot {
  id: DealId;
  dealNumber: string;
  title: string;
  status: DealStatus;
  totalFee: Money;
  totalCost: Money;
  marginPercent: Percentage;
  currentStep: number;
}

/**
 * Deal aggregate root. Holds invariants for status transitions and
 * exposes business methods (`submit`, `approve`, `reject`, …) that
 * append to a buffered `pendingEvents` list.
 *
 * Application services flush `pullEvents()` once persistence has
 * succeeded — preserving the order: write → flush → publish.
 */
export class Deal {
  readonly id: DealId;
  readonly dealNumber: string;
  title: string;
  private _status: DealStatus;
  private _totalFee: Money;
  private _totalCost: Money;
  private _marginPercent: Percentage;
  private _currentStep: number;
  private readonly _events: DealEvent[] = [];

  private constructor(snapshot: DealSnapshot) {
    this.id = snapshot.id;
    this.dealNumber = snapshot.dealNumber;
    this.title = snapshot.title;
    this._status = snapshot.status;
    this._totalFee = snapshot.totalFee;
    this._totalCost = snapshot.totalCost;
    this._marginPercent = snapshot.marginPercent;
    this._currentStep = snapshot.currentStep;
  }

  static fromPersistence(row: DealRow): Deal {
    if (!row.id || !row.dealNumber || !row.title) {
      throw new InvariantError("Deal row missing required fields");
    }
    return new Deal({
      id: dealId(row.id),
      dealNumber: row.dealNumber,
      title: row.title,
      status: DealStatus.fromString(row.status),
      totalFee: Money.fromDecimalString(row.totalFee),
      totalCost: Money.fromDecimalString(row.totalCost),
      marginPercent: Percentage.fromPercentString(row.marginPercent),
      currentStep: row.currentStep ?? 1,
    });
  }

  get status(): DealStatus {
    return this._status;
  }
  get totalFee(): Money {
    return this._totalFee;
  }
  get totalCost(): Money {
    return this._totalCost;
  }
  get marginPercent(): Percentage {
    return this._marginPercent;
  }
  get currentStep(): number {
    return this._currentStep;
  }

  /**
   * Submit a draft deal for approval.
   *
   * Pre-conditions external to the aggregate (Intapp screening,
   * Workday budget) are enforced in the application layer; the
   * aggregate only enforces the legal status transition.
   */
  submit(actor: string): void {
    const previous = this._status.value;
    const target = DealStatus.submitted();
    this._status.assertCanTransitionTo(target);
    this._status = target;
    this._events.push(
      dealSubmitted({
        dealId: this.id,
        actor: this.normalizeActor(actor),
        previousStatus: previous,
      }),
    );
  }

  /**
   * Mark the deal approved. Caller passes the linked approval-row id
   * + chosen scenario id (both nullable for legacy paths).
   */
  approve(input: {
    actor: string;
    approvalId: number | null;
    scenarioId: number | null;
  }): void {
    const target = DealStatus.approved();
    this._status.assertCanTransitionTo(target);
    this._status = target;
    this._events.push(
      dealApproved({
        dealId: this.id,
        actor: this.normalizeActor(input.actor),
        approvalId: input.approvalId,
        scenarioId: input.scenarioId,
      }),
    );
  }

  reject(input: {
    actor: string;
    approvalId: number | null;
    reason: string | null;
  }): void {
    const target = DealStatus.rejected();
    this._status.assertCanTransitionTo(target);
    this._status = target;
    this._events.push(
      dealRejected({
        dealId: this.id,
        actor: this.normalizeActor(input.actor),
        approvalId: input.approvalId,
        reason: input.reason && input.reason.trim() ? input.reason.trim() : null,
      }),
    );
  }

  /**
   * Bump the wizard's persisted `currentStep`. Used during status
   * transitions (e.g. submit advances the wizard to step 6 so the
   * user lands on the approvals tab on next visit).
   */
  advanceWizardTo(step: number): void {
    if (!Number.isInteger(step) || step < 1 || step > 8) {
      throw new InvariantError(`currentStep must be 1..8, got ${step}`);
    }
    if (step > this._currentStep) {
      this._currentStep = step;
    }
  }

  /**
   * Returns and clears the buffered events. Application services
   * call this *after* the persistence write succeeds.
   */
  pullEvents(): readonly DealEvent[] {
    const out = [...this._events];
    this._events.length = 0;
    return out;
  }

  /** Read-only peek (tests / debugging). Doesn't drain the buffer. */
  peekEvents(): readonly DealEvent[] {
    return [...this._events];
  }

  toSnapshot(): DealSnapshot {
    return {
      id: this.id,
      dealNumber: this.dealNumber,
      title: this.title,
      status: this._status,
      totalFee: this._totalFee,
      totalCost: this._totalCost,
      marginPercent: this._marginPercent,
      currentStep: this._currentStep,
    };
  }

  private normalizeActor(actor: string): string {
    const trimmed = (actor || "").trim();
    return trimmed || "Unknown";
  }
}
