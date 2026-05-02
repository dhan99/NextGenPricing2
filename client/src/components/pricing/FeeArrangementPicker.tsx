/**
 * F2.4.3 — Fee arrangement picker.
 *
 * Renders the 6 supported arrangements as cards with a side panel
 * for the selected arrangement's amount/percent inputs. On apply,
 * PATCHes /api/deals/:id/fee-arrangement and refetches the
 * fee-projection so the totals reflect the new arrangement.
 */
import { useEffect, useMemo, useState } from "react";
import {
  useDealFeeProjection,
  useFeeArrangements,
  useUpdateFeeArrangement,
} from "@/hooks/use-api";

interface Props {
  dealId: number;
  deal: {
    feeArrangement?: string | null;
    fixedFeeAmount?: string | null;
    cappedFeeAmount?: string | null;
    contingentFeePercent?: string | null;
    contingentFeeBase?: string | null;
    retainerAmount?: string | null;
    successFeePercent?: string | null;
  };
  canEdit: boolean;
}

const LABELS: Record<string, { title: string; subtitle: string }> = {
  time_and_materials: {
    title: "Time & Materials",
    subtitle: "Bill as work happens. No cap, no fixed fee.",
  },
  fixed: {
    title: "Fixed fee",
    subtitle: "One total price, regardless of hours worked.",
  },
  capped: {
    title: "Capped",
    subtitle: "T&M with a not-to-exceed ceiling.",
  },
  contingent: {
    title: "Contingent",
    subtitle: "Percentage of an outcome (savings, settlement, etc.).",
  },
  retainer: {
    title: "Retainer",
    subtitle: "Recurring fixed amount per period.",
  },
  hybrid: {
    title: "Hybrid (T&M + success fee)",
    subtitle: "Base T&M plus a success fee on milestones.",
  },
};

function formatMoney(s: string | number | null | undefined): string {
  if (s == null || s === "") return "—";
  const n = typeof s === "number" ? s : parseFloat(s);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPct(s: string | number | null | undefined, digits = 1): string {
  if (s == null || s === "") return "—";
  const n = typeof s === "number" ? s : parseFloat(s);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function FeeArrangementPicker({ dealId, deal, canEdit }: Props) {
  const { data: arrangements } = useFeeArrangements();
  const { data: projection, refetch: refetchProjection } = useDealFeeProjection(dealId);
  const updateArr = useUpdateFeeArrangement();

  const [selected, setSelected] = useState<string>(deal.feeArrangement || "time_and_materials");
  const [fixedAmt, setFixedAmt] = useState<string>(deal.fixedFeeAmount ?? "");
  const [cappedAmt, setCappedAmt] = useState<string>(deal.cappedFeeAmount ?? "");
  const [contingentPct, setContingentPct] = useState<string>(deal.contingentFeePercent ?? "");
  const [contingentBase, setContingentBase] = useState<string>(deal.contingentFeeBase ?? "");
  const [retainerAmt, setRetainerAmt] = useState<string>(deal.retainerAmount ?? "");
  const [successPct, setSuccessPct] = useState<string>(deal.successFeePercent ?? "");

  useEffect(() => {
    setSelected(deal.feeArrangement || "time_and_materials");
    setFixedAmt(deal.fixedFeeAmount ?? "");
    setCappedAmt(deal.cappedFeeAmount ?? "");
    setContingentPct(deal.contingentFeePercent ?? "");
    setContingentBase(deal.contingentFeeBase ?? "");
    setRetainerAmt(deal.retainerAmount ?? "");
    setSuccessPct(deal.successFeePercent ?? "");
  }, [
    deal.feeArrangement,
    deal.fixedFeeAmount,
    deal.cappedFeeAmount,
    deal.contingentFeePercent,
    deal.contingentFeeBase,
    deal.retainerAmount,
    deal.successFeePercent,
  ]);

  const dirty = useMemo(() => {
    return (
      selected !== (deal.feeArrangement || "time_and_materials") ||
      fixedAmt !== (deal.fixedFeeAmount ?? "") ||
      cappedAmt !== (deal.cappedFeeAmount ?? "") ||
      contingentPct !== (deal.contingentFeePercent ?? "") ||
      contingentBase !== (deal.contingentFeeBase ?? "") ||
      retainerAmt !== (deal.retainerAmount ?? "") ||
      successPct !== (deal.successFeePercent ?? "")
    );
  }, [selected, fixedAmt, cappedAmt, contingentPct, contingentBase, retainerAmt, successPct, deal]);

  const onApply = async () => {
    const body: Record<string, unknown> = { feeArrangement: selected };
    if (selected === "fixed") body.fixedFeeAmount = fixedAmt === "" ? null : parseFloat(fixedAmt);
    if (selected === "capped") body.cappedFeeAmount = cappedAmt === "" ? null : parseFloat(cappedAmt);
    if (selected === "contingent") {
      body.contingentFeePercent = contingentPct === "" ? null : parseFloat(contingentPct);
      body.contingentFeeBase = contingentBase || null;
    }
    if (selected === "retainer") body.retainerAmount = retainerAmt === "" ? null : parseFloat(retainerAmt);
    if (selected === "hybrid") body.successFeePercent = successPct === "" ? null : parseFloat(successPct);
    await updateArr.mutateAsync({ dealId, body });
    await refetchProjection();
  };

  const list = Array.isArray(arrangements) ? arrangements : Object.keys(LABELS);

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-md font-semibold">Fee arrangement</h3>
        {canEdit && dirty && (
          <button
            onClick={onApply}
            disabled={updateArr.isPending}
            className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {updateArr.isPending ? "Saving…" : "Apply"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
        {list.map((arr: string) => {
          const meta = LABELS[arr] ?? { title: arr, subtitle: "" };
          const isSelected = selected === arr;
          return (
            <button
              key={arr}
              type="button"
              onClick={() => canEdit && setSelected(arr)}
              disabled={!canEdit}
              className={[
                "text-left p-3 rounded-md border transition",
                isSelected ? "border-amber-500 bg-amber-50" : "border-slate-200 hover:border-slate-300",
                !canEdit ? "opacity-70 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <div className="text-sm font-medium">{meta.title}</div>
              <div className="text-xs text-foreground/60 mt-1">{meta.subtitle}</div>
            </button>
          );
        })}
      </div>

      {selected === "fixed" && (
        <Field label="Fixed fee amount">
          <CurrencyInput value={fixedAmt} onChange={setFixedAmt} disabled={!canEdit} />
        </Field>
      )}
      {selected === "capped" && (
        <Field label="Cap (not-to-exceed)">
          <CurrencyInput value={cappedAmt} onChange={setCappedAmt} disabled={!canEdit} />
        </Field>
      )}
      {selected === "contingent" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Percent of outcome">
            <PercentInput value={contingentPct} onChange={setContingentPct} disabled={!canEdit} />
          </Field>
          <Field label="Base">
            <input
              value={contingentBase}
              onChange={(e) => setContingentBase(e.target.value)}
              disabled={!canEdit}
              placeholder="savings_realized"
              className="w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
            />
          </Field>
        </div>
      )}
      {selected === "retainer" && (
        <Field label="Retainer amount (per period)">
          <CurrencyInput value={retainerAmt} onChange={setRetainerAmt} disabled={!canEdit} />
        </Field>
      )}
      {selected === "hybrid" && (
        <Field label="Success fee %">
          <PercentInput value={successPct} onChange={setSuccessPct} disabled={!canEdit} />
        </Field>
      )}

      {projection && (
        <div className="mt-4 border-t pt-3">
          <div className="text-xs uppercase tracking-wide text-foreground/60 mb-2">Projection</div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-foreground/60 text-xs">Base T&M fee</div>
              <div className="font-medium">{formatMoney(projection.baseTotals?.totalFee)}</div>
            </div>
            <div>
              <div className="text-foreground/60 text-xs">Adjusted total</div>
              <div className="font-semibold">{formatMoney(projection.adjustedTotals?.totalFee)}</div>
            </div>
            <div>
              <div className="text-foreground/60 text-xs">Margin</div>
              <div className="font-medium">{formatPct(projection.adjustedTotals?.marginPercent)}</div>
            </div>
          </div>
          {projection.meta && Object.keys(projection.meta).length > 0 && (
            <div className="mt-3 text-xs text-foreground/60">
              {projection.meta.capApplied !== undefined && (
                <span>
                  {projection.meta.capApplied
                    ? "Cap applied — clipped to ceiling. "
                    : projection.meta.capSlack != null
                      ? `Cap headroom: ${formatMoney(projection.meta.capSlack)}. `
                      : ""}
                </span>
              )}
              {projection.meta.successFeeAmount != null && (
                <span>Success fee uplift: {formatMoney(projection.meta.successFeeAmount)}.</span>
              )}
              {projection.meta.contingentFeePercent != null && projection.arrangement === "contingent" && (
                <span>
                  Contingent {projection.meta.contingentFeePercent}% of {projection.meta.contingentFeeBase || "outcome"}.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-foreground/70 mb-1">{label}</div>
      {children}
    </label>
  );
}

function CurrencyInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-foreground/60">$</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
      />
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full border rounded-md px-2 py-1.5 text-sm disabled:bg-slate-50"
      />
      <span className="text-sm text-foreground/60">%</span>
    </div>
  );
}
