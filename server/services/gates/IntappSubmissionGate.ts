import type { SubmissionGate, SubmissionGateResult } from "@dealpad/application";
import { assertSubmissionAllowed } from "../../intapp";

/**
 * Adapts the existing `assertSubmissionAllowed` (server/intapp.ts) to
 * the @dealpad/application `SubmissionGate` port. Live + simulated
 * modes are handled inside `assertSubmissionAllowed` already; this
 * is just shape translation.
 *
 * `code` is always "intapp_conflict" on a block — matches what the
 * legacy /submit handler emitted, so the UI doesn't have to change.
 */
export class IntappSubmissionGate implements SubmissionGate {
  async check(dealId: number, actor: string): Promise<SubmissionGateResult> {
    const result = await assertSubmissionAllowed(dealId, actor);
    if (result.allow) {
      return { allow: true, screening: result.screening };
    }
    return {
      allow: false,
      code: "intapp_conflict",
      reason: result.reason || "Intapp screening blocked submission",
      screening: result.screening,
    };
  }
}
