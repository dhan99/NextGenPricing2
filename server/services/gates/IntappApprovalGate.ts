import type { ApprovalGate, ApprovalGateResult } from "@dealpad/application";
import { assertApprovalAllowed } from "../../intapp";

/** Adapts `assertApprovalAllowed` (server/intapp.ts) to the port. */
export class IntappApprovalGate implements ApprovalGate {
  async check(dealId: number, actor: string): Promise<ApprovalGateResult> {
    const result = await assertApprovalAllowed(dealId, actor);
    if (result.allow) {
      return { allow: true, screening: result.screening };
    }
    return {
      allow: false,
      code: "intapp_conflict",
      reason: result.reason || "Intapp screening blocked approval",
      screening: result.screening,
    };
  }
}
