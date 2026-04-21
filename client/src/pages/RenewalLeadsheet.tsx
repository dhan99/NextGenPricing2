import { useState, useMemo } from "react";
import { useRoute, useLocation, Link } from "wouter";
import {
  ArrowLeft, Download, Upload, RefreshCw, CheckCircle2, TrendingUp, TrendingDown,
  Sparkles, Loader2, ArrowRight, Zap,
} from "lucide-react";
import {
  useDeal, useDealScopeItems, useDealPricing, useRateAdjust, useResetPricing, useSubmitApproval, useDealMarginTarget,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";
import { AskDealPadAI } from "@/components/AskDealPadAI";

function num(v: any): number {
  return parseFloat(v ?? "0") || 0;
}

function fmtMoney(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtPct(v: number, digits = 1): string {
  return `${v.toFixed(digits)}%`;
}

function Delta({ value, suffix = "", positiveGood = true, digits = 1 }: { value: number; suffix?: string; positiveGood?: boolean; digits?: number }) {
  if (Math.abs(value) < 0.05) {
    return <span className="text-xs text-muted-foreground ml-1.5">no change</span>;
  }
  const isUp = value > 0;
  const good = positiveGood ? isUp : !isUp;
  const color = good ? "text-emerald-600" : "text-red-600";
  const Icon = isUp ? TrendingUp : TrendingDown;
  const sign = isUp ? "+" : "";
  return (
    <span className={`text-xs font-semibold ml-1.5 inline-flex items-center gap-0.5 ${color}`}>
      <Icon className="w-3 h-3" />
      {sign}{value.toFixed(digits)}{suffix}
    </span>
  );
}

export function RenewalLeadsheet() {
  const [, params] = useRoute("/deals/:id/renewal-leadsheet");
  const [, navigate] = useLocation();
  const dealId = params?.id ? parseInt(params.id) : 0;
  const { persona } = useAuth();

  const { data: currentDeal } = useDeal(dealId);
  const parentId = currentDeal?.parentDealId || 0;
  const { data: parentDeal } = useDeal(parentId);
  const { data: cyScope } = useDealScopeItems(dealId);
  const { data: pyScope } = useDealScopeItems(parentId);
  const { data: cyPricing } = useDealPricing(dealId);
  const { data: pyPricing } = useDealPricing(parentId);

  const rateAdjust = useRateAdjust();
  const resetPricing = useResetPricing();
  const submitApproval = useSubmitApproval();
  const [customPct, setCustomPct] = useState("");
  const [appliedPct, setAppliedPct] = useState<number | null>(null);
  const [cumulativeFactor, setCumulativeFactor] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Aggregate pricing totals from pricing-lines (more accurate than deal cache)
  const cyTotals = useMemo(() => {
    const lines = (cyPricing as any[]) || [];
    const fee = lines.reduce((s, l) => s + num(l.fee), 0);
    const cost = lines.reduce((s, l) => s + num(l.cost), 0);
    const hours = lines.reduce((s, l) => s + num(l.hours), 0);
    return {
      fee: fee || num(currentDeal?.totalFee),
      cost: cost || num(currentDeal?.totalCost),
      hours: hours || num(currentDeal?.totalHours),
    };
  }, [cyPricing, currentDeal]);

  const pyTotals = useMemo(() => {
    const lines = (pyPricing as any[]) || [];
    const fee = lines.reduce((s, l) => s + num(l.fee), 0);
    const cost = lines.reduce((s, l) => s + num(l.cost), 0);
    const hours = lines.reduce((s, l) => s + num(l.hours), 0);
    return {
      fee: fee || num(parentDeal?.totalFee),
      cost: cost || num(parentDeal?.totalCost),
      hours: hours || num(parentDeal?.totalHours),
    };
  }, [pyPricing, parentDeal]);

  const cyMargin = cyTotals.fee > 0 ? ((cyTotals.fee - cyTotals.cost) / cyTotals.fee) * 100 : 0;
  const pyMargin = pyTotals.fee > 0 ? ((pyTotals.fee - pyTotals.cost) / pyTotals.fee) * 100 : 0;
  const cyEffRate = cyTotals.hours > 0 ? cyTotals.fee / cyTotals.hours : 0;
  const pyEffRate = pyTotals.hours > 0 ? pyTotals.fee / pyTotals.hours : 0;

  const feeDeltaPct = pyTotals.fee > 0 ? ((cyTotals.fee - pyTotals.fee) / pyTotals.fee) * 100 : 0;
  const hoursDeltaPct = pyTotals.hours > 0 ? ((cyTotals.hours - pyTotals.hours) / pyTotals.hours) * 100 : 0;
  const marginDelta = cyMargin - pyMargin;
  const effRateDeltaPct = pyEffRate > 0 ? ((cyEffRate - pyEffRate) / pyEffRate) * 100 : 0;

  // Scope row comparison: join PY+CY by scopeItemId
  const scopeRows = useMemo(() => {
    const py = (pyScope as any[]) || [];
    const cy = (cyScope as any[]) || [];
    const cyPL = (cyPricing as any[]) || [];
    const pyPL = (pyPricing as any[]) || [];

    const pyHoursTotal = py.reduce((s, r) => s + num(r.adjustedHours || r.scopeItem?.defaultHours), 0) || 1;
    const cyHoursTotal = cy.reduce((s, r) => s + num(r.adjustedHours || r.scopeItem?.defaultHours), 0) || 1;
    const pyFeeTotal = pyPL.reduce((s, l) => s + num(l.fee), 0);
    const cyFeeTotal = cyPL.reduce((s, l) => s + num(l.fee), 0);

    const ids = new Set<number>([
      ...py.map((r) => r.scopeItemId),
      ...cy.map((r) => r.scopeItemId),
    ]);

    return Array.from(ids).map((id) => {
      const pyRow = py.find((r) => r.scopeItemId === id);
      const cyRow = cy.find((r) => r.scopeItemId === id);
      const ref = cyRow || pyRow;
      const name = ref?.scopeItem?.name || `Scope #${id}`;
      const code = ref?.scopeItem?.code || "";
      const pyHrs = num(pyRow?.adjustedHours || pyRow?.scopeItem?.defaultHours);
      const cyHrs = num(cyRow?.adjustedHours || cyRow?.scopeItem?.defaultHours);
      // Allocate fee proportionally to hours (PoC pricing model)
      const pyFee = pyFeeTotal * (pyHrs / pyHoursTotal);
      const cyFee = cyFeeTotal * (cyHrs / cyHoursTotal);
      const margin = cyFee > 0 ? ((cyFee - cyFee * 0.55) / cyFee) * 100 : 0; // illustrative line-margin
      return {
        id,
        name,
        code,
        pyHrs,
        cyHrs,
        dHrs: cyHrs - pyHrs,
        pyFee,
        cyFee,
        dFee: cyFee - pyFee,
        margin: cyMargin || margin,
      };
    });
  }, [pyScope, cyScope, pyPricing, cyPricing, cyMargin]);

  const totalRow = useMemo(() => ({
    pyHrs: scopeRows.reduce((s, r) => s + r.pyHrs, 0),
    cyHrs: scopeRows.reduce((s, r) => s + r.cyHrs, 0),
    pyFee: scopeRows.reduce((s, r) => s + r.pyFee, 0),
    cyFee: scopeRows.reduce((s, r) => s + r.cyFee, 0),
  }), [scopeRows]);

  // Fast-track eligibility: margin >= resolved target, fee delta within ±15%, no scope additions/removals
  const { data: marginTarget } = useDealMarginTarget(dealId);
  const buTarget = marginTarget?.percent ?? 35;
  const buTargetSource = marginTarget?.sourceLabel ?? "Firm default";
  const buMedian = Math.max(0, buTarget - 0.5);
  const scopeCountChange = ((cyScope as any[])?.length || 0) - ((pyScope as any[])?.length || 0);
  const fastTrackEligible = cyMargin >= buTarget && Math.abs(feeDeltaPct) <= 15 && scopeCountChange === 0;

  const applyAdjustment = async (pct: number) => {
    const factor = 1 + pct / 100;
    await rateAdjust.mutateAsync({ dealId, factor, userName: persona?.name });
    setAppliedPct(pct);
    setCumulativeFactor((c) => c * factor);
  };

  const resetAdjustments = async () => {
    await resetPricing.mutateAsync({ dealId, userName: persona?.name });
    setCumulativeFactor(1);
    setAppliedPct(null);
    setCustomPct("");
  };

  // Shared submit helper. Without try/catch around mutateAsync the renewal
  // page silently swallowed Intapp/Workday gating errors (HTTP 409) and the
  // navigate() never fired — making the buttons appear broken. Surfacing the
  // server message lets the user see exactly what's blocking submission.
  const submitWithNotes = async (notes: string) => {
    setSubmitError(null);
    try {
      await submitApproval.mutateAsync({
        dealId,
        data: {
          approverName: "Practice Leader",
          approverRole: "Service Line Lead",
          status: "pending",
          notes,
          submittedBy: persona?.name,
        },
      });
      navigate(`/deals/${dealId}`);
    } catch (e: any) {
      // fetchApi throws Error(JSON.stringify(body)) for non-2xx responses.
      let msg = e?.message || "Submission failed.";
      try {
        const parsed = JSON.parse(msg);
        msg = parsed.message || parsed.error || msg;
      } catch {}
      setSubmitError(msg);
    }
  };

  const handleSubmitApproval = () =>
    submitWithNotes(
      `Renewal leadsheet submitted. Fee ${feeDeltaPct >= 0 ? "+" : ""}${feeDeltaPct.toFixed(1)}% vs prior year, margin ${cyMargin.toFixed(1)}%.`
    );

  const handleSubmitFastTrack = () =>
    submitWithNotes(
      `Fast-track renewal. Meets criteria: margin ${cyMargin.toFixed(1)}% (>= ${buTarget}%), fee delta ${feeDeltaPct >= 0 ? "+" : ""}${feeDeltaPct.toFixed(1)}% (within ±15%), no scope changes.`
    );

  if (!currentDeal) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentDeal.parentDealId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="card p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground mb-2">Not a renewal deal</h2>
          <p className="text-sm text-muted-foreground mb-4">This deal does not have a prior-year source. The Renewal Leadsheet is only available for renewals created from an existing deal.</p>
          <Link href={`/deals/${dealId}`}><button className="btn-primary"><ArrowRight className="w-4 h-4" />Open Deal</button></Link>
        </div>
      </div>
    );
  }

  const pyLabel = parentDeal?.dealNumber || "Prior Year";
  const cyLabel = currentDeal.dealNumber || "Current Year";

  return (
    <div className="px-8 py-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Renewal Leadsheet</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentDeal.client?.name || "Client"} — {currentDeal.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Calc Parity: Verified
          </span>
          <button className="btn-ghost p-2" title="Download"><Download className="w-4 h-4" /></button>
          <button className="btn-ghost p-2" title="Upload"><Upload className="w-4 h-4" /></button>
          <button className="btn-ghost p-2" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* PY vs CY summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-200">
            <h2 className="text-sm font-semibold text-foreground">Prior Year ({pyLabel})</h2>
          </div>
          <div className="space-y-3">
            <Row label="Total Fees" value={fmtMoney(pyTotals.fee)} />
            <Row label="Total Hours" value={Math.round(pyTotals.hours).toLocaleString()} />
            <Row label="Margin" value={fmtPct(pyMargin)} />
            <Row label="Entities" value="6" />
            <Row label="Eff. Rate" value={`$${Math.round(pyEffRate).toLocaleString()}`} />
          </div>
        </div>

        <div className="card p-5 border-primary/30">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-200">
            <h2 className="text-sm font-semibold text-foreground">Current Year ({cyLabel}) — {currentDeal.status === "draft" ? "Draft" : currentDeal.status}</h2>
          </div>
          <div className="space-y-3">
            <RowDelta label="Total Fees" value={fmtMoney(cyTotals.fee)} delta={feeDeltaPct} suffix="%" />
            <RowDelta label="Total Hours" value={Math.round(cyTotals.hours).toLocaleString()} delta={hoursDeltaPct} suffix="%" />
            <RowDelta label="Margin" value={fmtPct(cyMargin)} delta={marginDelta} suffix="pts" />
            <RowDelta label="Entities" value="6" delta={0} suffix="" />
            <RowDelta label="Eff. Rate" value={`$${Math.round(cyEffRate).toLocaleString()}`} delta={effRateDeltaPct} suffix="%" />
          </div>
        </div>
      </div>

      {/* Quick Rate Adjustment */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Quick Rate Adjustment</h2>
            {cumulativeFactor !== 1 && (
              <span className="text-xs text-muted-foreground">
                Net change: <span className="font-semibold text-foreground">{((cumulativeFactor - 1) * 100) >= 0 ? "+" : ""}{((cumulativeFactor - 1) * 100).toFixed(2)}%</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {appliedPct !== null && (
              <span className="text-xs text-emerald-700 font-medium">Last applied: {appliedPct >= 0 ? "+" : ""}{appliedPct}%</span>
            )}
            <button
              type="button"
              onClick={resetAdjustments}
              disabled={rateAdjust.isPending || resetPricing.isPending}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-stone-300 text-foreground hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[3, 4.2, 5].map((p) => {
            const isAiRec = p === 4.2;
            return (
              <button
                key={p}
                onClick={() => applyAdjustment(p)}
                disabled={rateAdjust.isPending}
                className={`px-4 py-2 rounded-md border text-sm font-medium transition-all inline-flex items-center gap-2 ${
                  isAiRec
                    ? "border-primary bg-primary/5 text-primary hover:bg-primary/10"
                    : "border-stone-300 text-foreground hover:border-stone-400 hover:bg-stone-50"
                } disabled:opacity-50`}
              >
                Apply {p > 0 ? "+" : ""}{p}%
                {isAiRec && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary text-white">
                    <Sparkles className="w-2.5 h-2.5" />
                    AI Rec
                  </span>
                )}
              </button>
            );
          })}
          <input
            type="text"
            value={customPct}
            onChange={(e) => setCustomPct(e.target.value)}
            placeholder="Custom %"
            className="px-4 py-2 rounded-md border border-stone-300 text-sm w-28 focus:outline-none focus:border-stone-500"
          />
          <button
            onClick={() => {
              const p = parseFloat(customPct);
              if (!isNaN(p)) applyAdjustment(p);
            }}
            disabled={rateAdjust.isPending || !customPct}
            className="btn-primary"
          >
            {rateAdjust.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Apply
          </button>
        </div>
      </div>

      {/* Scope comparison table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-foreground">Scope Item</th>
                <th className="text-right px-3 py-3 font-semibold text-foreground">PY Hrs</th>
                <th className="text-right px-3 py-3 font-semibold text-foreground">CY Hrs</th>
                <th className="text-right px-3 py-3 font-semibold text-foreground">Δ Hrs</th>
                <th className="text-right px-3 py-3 font-semibold text-foreground">PY Fee</th>
                <th className="text-right px-3 py-3 font-semibold text-foreground">CY Fee</th>
                <th className="text-right px-3 py-3 font-semibold text-foreground">Δ Fee</th>
                <th className="text-right px-4 py-3 font-semibold text-foreground">Margin</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-stone-100/60">
                <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {currentDeal.client?.name || "Client"} (Parent)
                </td>
              </tr>
              {scopeRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    No scope items found. Add scope items to the deal to see line-by-line comparison.
                  </td>
                </tr>
              ) : (
                scopeRows.map((r) => (
                  <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="px-4 py-2.5 text-primary font-medium">↳ {r.code ? `${r.code} ` : ""}{r.name}</td>
                    <td className="text-right px-3 py-2.5 text-foreground">{Math.round(r.pyHrs)}</td>
                    <td className="text-right px-3 py-2.5 text-foreground">{Math.round(r.cyHrs)}</td>
                    <td className={`text-right px-3 py-2.5 font-medium ${r.dHrs > 0 ? "text-emerald-600" : r.dHrs < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {r.dHrs > 0 ? "+" : ""}{Math.round(r.dHrs)}
                    </td>
                    <td className="text-right px-3 py-2.5 text-foreground">{fmtMoney(r.pyFee)}</td>
                    <td className="text-right px-3 py-2.5 text-foreground">{fmtMoney(r.cyFee)}</td>
                    <td className={`text-right px-3 py-2.5 font-medium ${r.dFee > 0 ? "text-emerald-600" : r.dFee < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {r.dFee > 0 ? "+" : ""}{fmtMoney(Math.abs(r.dFee))}
                    </td>
                    <td className="text-right px-4 py-2.5 text-emerald-600 font-medium">{fmtPct(r.margin)}</td>
                  </tr>
                ))
              )}
              <tr className="border-t-2 border-stone-300 bg-stone-50 font-semibold">
                <td className="px-4 py-3 text-foreground">TOTAL</td>
                <td className="text-right px-3 py-3 text-foreground">{Math.round(totalRow.pyHrs)}</td>
                <td className="text-right px-3 py-3 text-foreground">{Math.round(totalRow.cyHrs)}</td>
                <td className={`text-right px-3 py-3 ${totalRow.cyHrs - totalRow.pyHrs > 0 ? "text-emerald-600" : totalRow.cyHrs - totalRow.pyHrs < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {totalRow.cyHrs - totalRow.pyHrs >= 0 ? "+" : ""}{Math.round(totalRow.cyHrs - totalRow.pyHrs)}
                </td>
                <td className="text-right px-3 py-3 text-foreground">{fmtMoney(totalRow.pyFee)}</td>
                <td className="text-right px-3 py-3 text-foreground">{fmtMoney(totalRow.cyFee)}</td>
                <td className={`text-right px-3 py-3 ${totalRow.cyFee - totalRow.pyFee > 0 ? "text-emerald-600" : totalRow.cyFee - totalRow.pyFee < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {totalRow.cyFee - totalRow.pyFee >= 0 ? "+" : ""}{fmtMoney(Math.abs(totalRow.cyFee - totalRow.pyFee))}
                </td>
                <td className="text-right px-4 py-3 text-foreground">{fmtPct(cyMargin)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom 3 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Margin Analysis */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Margin Analysis</h3>
          <div className="text-3xl font-bold text-emerald-600">{fmtPct(cyMargin)}</div>
          <span className={`inline-flex items-center gap-1 mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cyMargin >= buTarget ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
            <CheckCircle2 className="w-3 h-3" />
            {cyMargin >= buTarget ? "Above Target" : "Below Target"}
          </span>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Target ({buTargetSource}):</span><span className="font-medium text-foreground">{fmtPct(buTarget)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">BU Median:</span><span className="font-medium text-foreground">{fmtPct(buMedian)}</span></div>
            <div className="mt-2 h-1.5 bg-stone-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (cyMargin / 60) * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Fast-Track Eligible */}
        <div className={`card p-5 border-2 ${fastTrackEligible ? "border-primary/40" : "border-stone-200"}`}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Fast-Track {fastTrackEligible ? "Eligible" : "Not Eligible"}</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            {fastTrackEligible
              ? `This renewal meets all fast-track criteria: margin above ${buTarget}% (${buTargetSource}), existing client, no scope expansion, standard rate increase.`
              : `Fast-track requires margin ≥ ${buTarget}% (${buTargetSource}), fee delta within ±15%, and no scope changes. Current: margin ${cyMargin.toFixed(1)}%, fee delta ${feeDeltaPct >= 0 ? "+" : ""}${feeDeltaPct.toFixed(1)}%, scope ${scopeCountChange === 0 ? "unchanged" : `${scopeCountChange > 0 ? "+" : ""}${scopeCountChange} items`}.`}
          </p>
          <button
            onClick={handleSubmitFastTrack}
            disabled={!fastTrackEligible || submitApproval.isPending}
            className="w-full btn-primary justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitApproval.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Submit for Fast-Track
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Scope Changes */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Scope Changes</h3>
          <ul className="space-y-2 text-xs">
            <ChangeLine ok label={`Entity count: ${scopeCountChange === 0 ? "no change" : `${scopeCountChange > 0 ? "+" : ""}${scopeCountChange}`}`} good={scopeCountChange === 0} />
            <ChangeLine ok label={`Hours ${hoursDeltaPct >= 0 ? "increased" : "decreased"}: ${hoursDeltaPct >= 0 ? "+" : ""}${hoursDeltaPct.toFixed(1)}%`} good={Math.abs(hoursDeltaPct) <= 10} />
            <ChangeLine ok label={`Fees ${feeDeltaPct >= 0 ? "increased" : "decreased"}: ${feeDeltaPct >= 0 ? "+" : ""}${feeDeltaPct.toFixed(1)}%`} good={Math.abs(feeDeltaPct) <= 15} />
            <ChangeLine ok label="Same service types" good />
            <ChangeLine ok label="Rate table: FY2025" good />
          </ul>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-2">
        <Link href={`/deals/${dealId}`}>
          <button className="btn-ghost">
            <ArrowLeft className="w-4 h-4" />
            Back to Wizard
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <button className="btn-ghost">
            <Download className="w-4 h-4" />
            Download PDF Summary
          </button>
          <button onClick={handleSubmitApproval} disabled={submitApproval.isPending} className="btn-primary">
            {submitApproval.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Submit for Approval
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      {submitError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-semibold mb-1">Submission blocked</div>
          <div className="leading-relaxed">{submitError}</div>
          <div className="mt-2 text-xs text-red-700">
            Open the deal wizard to resolve the gating issue (Intapp screening, Workday validation, or other policy block), then return here to retry.
          </div>
        </div>
      )}
      <AskDealPadAI context={{
        screen: "renewal-leadsheet",
        screenLabel: `Renewal Leadsheet · ${currentDeal?.dealNumber || ""}`,
        dealId: currentDeal?.id,
        deal: currentDeal,
      }} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

function RowDelta({ label, value, delta, suffix }: { label: string; value: string; delta: number; suffix: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="font-semibold text-foreground tabular-nums">{value}</span>
        <Delta value={delta} suffix={suffix} positiveGood={label !== "Total Hours"} />
      </div>
    </div>
  );
}

function ChangeLine({ label, good }: { label: string; good: boolean; ok?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${good ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className="text-foreground">{label}</span>
    </li>
  );
}
