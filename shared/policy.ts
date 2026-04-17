// Single source of truth for pricing & approval gating policy. Imported by
// both server (for routing/gating decisions) and client (for the Review &
// Submit validation checklist) so the UI never lies about what will actually
// be enforced at submission time.

export const POLICY = {
  // Target gross margin BU expects on every deal.
  targetMarginPercent: 35,
  // Calc parity tolerance: |Σ line fees − deal.totalFee| must be < this.
  calcParityToleranceDollars: 1,
  // Practice Lead approval is required when ANY of these trigger.
  practiceLeadApproval: {
    feeOver: 500_000,
    marginBelow: 35,
    scopeItemsAtOrAbove: 8,
  },
} as const;

export type ApprovalTrigger = "fee" | "margin" | "scope" | null;

export function evaluatePracticeLeadTrigger(input: {
  totalFee: number;
  marginPercent: number;
  scopeItemCount: number;
}): { required: boolean; trigger: ApprovalTrigger; reason: string } {
  const p = POLICY.practiceLeadApproval;
  if (input.marginPercent < p.marginBelow) {
    return {
      required: true,
      trigger: "margin",
      reason: `Margin ${input.marginPercent.toFixed(1)}% is below the ${p.marginBelow}% BU target`,
    };
  }
  if (input.totalFee > p.feeOver) {
    return {
      required: true,
      trigger: "fee",
      reason: `Total fee $${Math.round(input.totalFee).toLocaleString()} exceeds $${p.feeOver.toLocaleString()}`,
    };
  }
  if (input.scopeItemCount >= p.scopeItemsAtOrAbove) {
    return {
      required: true,
      trigger: "scope",
      reason: `${input.scopeItemCount} scope items requires Practice Lead approval`,
    };
  }
  return { required: false, trigger: null, reason: "Within auto-approval thresholds" };
}
