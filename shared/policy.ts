// Single source of truth for pricing & approval gating policy. Imported by
// both server (for routing/gating decisions) and client (for the Review &
// Submit validation checklist) so the UI never lies about what will actually
// be enforced at submission time.

export const POLICY = {
  // Calc parity tolerance: |Σ line fees − deal.totalFee| must be < this.
  calcParityToleranceDollars: 1,
  // Practice Lead approval is required when ANY of these trigger.
  practiceLeadApproval: {
    feeOver: 500_000,
    scopeItemsAtOrAbove: 8,
  },
  // Firm-wide fallback used only if the margin_targets table is empty (e.g.
  // a fresh DB before seedDefaultMarginTargets has run). Real reads must
  // always come from the resolver below.
  fallbackTargetMarginPercent: 35,
} as const;

export type ApprovalTrigger = "fee" | "margin" | "scope" | null;

export function evaluatePracticeLeadTrigger(input: {
  totalFee: number;
  marginPercent: number;
  scopeItemCount: number;
  targetMarginPercent: number;
}): { required: boolean; trigger: ApprovalTrigger; reason: string } {
  const p = POLICY.practiceLeadApproval;
  if (input.marginPercent < input.targetMarginPercent) {
    return {
      required: true,
      trigger: "margin",
      reason: `Margin ${input.marginPercent.toFixed(1)}% is below the ${input.targetMarginPercent}% target`,
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

// ============ MARGIN TARGET RESOLVER (Task #33) ============
// One source of truth for "what's the margin target?". Server and client both
// call this so the displayed Target on every surface (Deal Detail KPI, Review
// & Submit, Margin Advisor, Pricing thresholds, Renewal leadsheet, Analytics
// tile) cannot disagree.

export type MarginTargetSource =
  | { kind: "deal" }
  | { kind: "bu"; key: string }
  | { kind: "serviceLine"; key: string }
  | { kind: "firm" }
  | { kind: "fallback" };

export type MarginTargetRow = {
  scope: "firm" | "bu" | "serviceLine";
  scopeKey: string | null;
  percent: number;
};

export type ResolvedMarginTarget = {
  percent: number;
  source: MarginTargetSource;
  // Short human label for badges, e.g. "firm default", "BU: Tax",
  // "Service line: Cloud Services", "deal override".
  sourceLabel: string;
};

export type DealLike = {
  businessUnit?: string | null;
  serviceLine?: string | null;
  targetMarginPercent?: string | number | null;
};

function findRow(
  rows: MarginTargetRow[],
  scope: "firm" | "bu" | "serviceLine",
  key: string | null,
): MarginTargetRow | undefined {
  const norm = (s: string | null) => (s == null ? "" : s.trim().toLowerCase());
  const targetKey = norm(key);
  return rows.find(
    (r) => r.scope === scope && norm(r.scopeKey) === targetKey,
  );
}

export function resolveMarginTarget(
  deal: DealLike | null | undefined,
  rows: MarginTargetRow[],
): ResolvedMarginTarget {
  // 1) Deal-level override always wins.
  const dealOverride =
    deal?.targetMarginPercent != null && deal.targetMarginPercent !== ""
      ? Number(deal.targetMarginPercent)
      : NaN;
  if (Number.isFinite(dealOverride) && dealOverride > 0) {
    return {
      percent: dealOverride,
      source: { kind: "deal" },
      sourceLabel: "deal override",
    };
  }
  // 2) Per-business-unit override.
  if (deal?.businessUnit) {
    const buRow = findRow(rows, "bu", deal.businessUnit);
    if (buRow) {
      return {
        percent: Number(buRow.percent),
        source: { kind: "bu", key: deal.businessUnit },
        sourceLabel: `BU: ${deal.businessUnit}`,
      };
    }
  }
  // 3) Per-service-line override.
  if (deal?.serviceLine) {
    const slRow = findRow(rows, "serviceLine", deal.serviceLine);
    if (slRow) {
      return {
        percent: Number(slRow.percent),
        source: { kind: "serviceLine", key: deal.serviceLine },
        sourceLabel: `Service line: ${deal.serviceLine}`,
      };
    }
  }
  // 4) Firm default.
  const firmRow = findRow(rows, "firm", null);
  if (firmRow) {
    return {
      percent: Number(firmRow.percent),
      source: { kind: "firm" },
      sourceLabel: "firm default",
    };
  }
  // 5) Hardcoded fallback (only reached on a fresh DB before the seed).
  return {
    percent: POLICY.fallbackTargetMarginPercent,
    source: { kind: "fallback" },
    sourceLabel: "firm default",
  };
}
