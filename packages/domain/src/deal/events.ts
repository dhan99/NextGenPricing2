import type { DealId } from "./DealId";

/**
 * Versioned domain events emitted by the `Deal` aggregate. Subscribers
 * (Dynamics auto-push, Workday push, activity-log writer, …) bind to
 * `type` + `version`; never reorder or rename fields without bumping
 * `version`. The outbox table preserves the wire shape for replay.
 *
 * F1.4 ships v1 of each event. Schema changes go to v2 alongside the
 * subscriber that handles both.
 */
export interface DomainEvent {
  readonly type: string;
  readonly version: number;
  readonly aggregateId: number;
  readonly occurredAt: Date;
}

export interface DealSubmittedEventV1 extends DomainEvent {
  type: "DealSubmitted";
  version: 1;
  actor: string;
  previousStatus: string;
}

export interface DealApprovedEventV1 extends DomainEvent {
  type: "DealApproved";
  version: 1;
  actor: string;
  approvalId: number | null;
  scenarioId: number | null;
}

export interface DealRejectedEventV1 extends DomainEvent {
  type: "DealRejected";
  version: 1;
  actor: string;
  approvalId: number | null;
  reason: string | null;
}

export type DealEvent =
  | DealSubmittedEventV1
  | DealApprovedEventV1
  | DealRejectedEventV1;

/** Convenience factories — keep call sites narrow + typed. */
export function dealSubmitted(input: {
  dealId: DealId;
  actor: string;
  previousStatus: string;
  occurredAt?: Date;
}): DealSubmittedEventV1 {
  return {
    type: "DealSubmitted",
    version: 1,
    aggregateId: input.dealId,
    occurredAt: input.occurredAt ?? new Date(),
    actor: input.actor,
    previousStatus: input.previousStatus,
  };
}

export function dealApproved(input: {
  dealId: DealId;
  actor: string;
  approvalId: number | null;
  scenarioId: number | null;
  occurredAt?: Date;
}): DealApprovedEventV1 {
  return {
    type: "DealApproved",
    version: 1,
    aggregateId: input.dealId,
    occurredAt: input.occurredAt ?? new Date(),
    actor: input.actor,
    approvalId: input.approvalId,
    scenarioId: input.scenarioId,
  };
}

export function dealRejected(input: {
  dealId: DealId;
  actor: string;
  approvalId: number | null;
  reason: string | null;
  occurredAt?: Date;
}): DealRejectedEventV1 {
  return {
    type: "DealRejected",
    version: 1,
    aggregateId: input.dealId,
    occurredAt: input.occurredAt ?? new Date(),
    actor: input.actor,
    approvalId: input.approvalId,
    reason: input.reason,
  };
}
