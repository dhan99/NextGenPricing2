/**
 * Gates — the precondition checks the application layer runs before
 * a domain mutation. Concrete implementations adapt the existing
 * server-side functions (assertSubmissionAllowed, onDealSubmitted,
 * assertApprovalAllowed); the application service depends on the
 * port, not the impl, so we can stub gates in unit tests and swap
 * impls when we replace simulated integrations with live ones.
 *
 * Result shapes intentionally carry the *full failure context* a
 * route handler needs to render a structured 409 — `code` for the
 * machine, plus the failing-system-specific payload (screening,
 * validationId) for the UI.
 */

export interface SubmissionGateAllow {
  allow: true;
  /** Optional payload subscribers may want (e.g. screening result). */
  screening?: unknown;
}
export interface SubmissionGateBlock {
  allow: false;
  code: string;
  reason: string;
  screening?: unknown;
}
export type SubmissionGateResult = SubmissionGateAllow | SubmissionGateBlock;

export interface SubmissionGate {
  check(dealId: number, actor: string): Promise<SubmissionGateResult>;
}

export interface WorkdayGateAllow {
  blocked: false;
}
export interface WorkdayGateBlock {
  blocked: true;
  code: string;
  reason: string;
  validationId?: number | null;
}
export type WorkdayGateResult = WorkdayGateAllow | WorkdayGateBlock;

export interface WorkdayGate {
  check(dealId: number, actor: string): Promise<WorkdayGateResult>;
}

export interface ApprovalGateAllow {
  allow: true;
  screening?: unknown;
}
export interface ApprovalGateBlock {
  allow: false;
  code: string;
  reason: string;
  screening?: unknown;
}
export type ApprovalGateResult = ApprovalGateAllow | ApprovalGateBlock;

export interface ApprovalGate {
  check(dealId: number, actor: string): Promise<ApprovalGateResult>;
}
