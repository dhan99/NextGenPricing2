/**
 * Domain-layer error types. Throw — don't return error envelopes.
 *
 * The application layer translates these to HTTP responses. Routes
 * should never `instanceof DomainError` for behavior — they should
 * either propagate or surface a structured error.
 */
export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

/**
 * Aggregate is in the wrong state for the requested operation.
 * Examples: approving a draft deal, submitting an archived deal.
 */
export class IllegalStateError extends DomainError {
  readonly from: string;
  readonly to: string;
  constructor(from: string, to: string, aggregate: string) {
    super(
      "illegal_state_transition",
      `Cannot transition ${aggregate} from "${from}" to "${to}"`,
    );
    this.name = "IllegalStateError";
    this.from = from;
    this.to = to;
  }
}

/** A required field/argument is missing or invalid. */
export class InvariantError extends DomainError {
  constructor(message: string) {
    super("invariant_violation", message);
    this.name = "InvariantError";
  }
}
