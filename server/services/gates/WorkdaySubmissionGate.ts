import type { WorkdayGate, WorkdayGateResult } from "@dealpad/application";
import { onDealSubmitted } from "../../workday";

/**
 * Adapts `onDealSubmitted` (server/workday.ts) to the port.
 *
 * Note: the legacy /submit endpoint did NOT call this — only the
 * /approvals POST endpoint did. F1.4.5 keeps that asymmetry by
 * passing a NoOpWorkdayGate to SubmitDealService for /submit, and
 * the real adapter to F1.4.6's approvals route.
 */
export class WorkdaySubmissionGate implements WorkdayGate {
  async check(dealId: number, actor: string): Promise<WorkdayGateResult> {
    const result = await onDealSubmitted(dealId, actor);
    if (!result.blocked) return { blocked: false };
    return {
      blocked: true,
      code: "workday_validation_blocked",
      reason: result.reason || "Workday validation blocked submission",
      validationId: result.validationId ?? null,
    };
  }
}

/**
 * No-op WorkdayGate for callers that historically didn't run the
 * Workday check (the dedicated /api/deals/:id/submit endpoint).
 */
export class NoOpWorkdayGate implements WorkdayGate {
  async check(): Promise<WorkdayGateResult> {
    return { blocked: false };
  }
}
