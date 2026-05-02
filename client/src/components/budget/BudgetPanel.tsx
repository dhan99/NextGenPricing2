/**
 * F2.2.4 — Budget panel for the deal-detail page.
 *
 * Three sections:
 *   1. Header with current budget summary (latest snapshot) + a
 *      Recompute button.
 *   2. Open alerts list with acknowledge/resolve/snooze actions.
 *   3. Recent snapshot history table (last 20).
 *
 * No new design tokens — sticks to the brand amber + olive set
 * already in use elsewhere in the app.
 */
import { useState } from "react";
import {
  useDealBudgetActuals,
  useDealBudgetAlerts,
  useRecomputeDealBudget,
  useUpdateBudgetAlert,
} from "@/hooks/use-api";

interface Props {
  dealId: number;
  canEdit: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-orange-100 text-orange-700 border-orange-200",
  acknowledged: "bg-blue-100 text-blue-700 border-blue-200",
  snoozed: "bg-slate-100 text-slate-600 border-slate-200",
  resolved: "bg-green-100 text-green-700 border-green-200",
};

function formatMoney(s: string | number | null | undefined): string {
  if (s == null || s === "") return "—";
  const n = typeof s === "number" ? s : parseFloat(s);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPct(s: string | number | null | undefined): string {
  if (s == null || s === "") return "—";
  const n = typeof s === "number" ? s : parseFloat(s);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function pctClass(s: string | number | null | undefined): string {
  if (s == null || s === "") return "text-foreground/60";
  const n = typeof s === "number" ? s : parseFloat(s);
  if (!Number.isFinite(n)) return "text-foreground/60";
  if (n > 5) return "text-red-600";
  if (n > 0) return "text-amber-600";
  if (n < -5) return "text-emerald-600";
  return "text-foreground/80";
}

export function BudgetPanel({ dealId, canEdit }: Props) {
  const { data: actuals } = useDealBudgetActuals(dealId, 20);
  const { data: alerts } = useDealBudgetAlerts(dealId);
  const recompute = useRecomputeDealBudget();
  const updateAlert = useUpdateBudgetAlert();
  const [busy, setBusy] = useState(false);

  const latest = Array.isArray(actuals) && actuals.length > 0 ? actuals[0] : null;
  const openAlerts = Array.isArray(alerts) ? alerts.filter((a: any) => a.status === "open") : [];
  const recentAlerts = Array.isArray(alerts) ? alerts : [];

  const onRecompute = async () => {
    setBusy(true);
    try {
      await recompute.mutateAsync({ dealId, body: {} });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold">Budget vs. actuals</h2>
          <p className="text-sm text-foreground/60">
            {latest
              ? `Latest snapshot: ${new Date(latest.periodStart).toLocaleDateString()} – ${new Date(latest.periodEnd).toLocaleDateString()}`
              : "No snapshots yet — run a recompute to capture the first one."}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={onRecompute}
            disabled={busy || recompute.isPending}
            className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {busy || recompute.isPending ? "Computing…" : "Recompute"}
          </button>
        )}
      </div>

      {latest && (
        <div className="grid grid-cols-3 gap-4">
          {(["hours", "cost", "fee"] as const).map((m) => {
            const budgeted = (latest as any)[`${m}Budgeted`];
            const actual = (latest as any)[`${m}Actual`];
            const varPct = (latest as any)[`${m}VarPct`];
            return (
              <div key={m} className="border rounded-lg p-4">
                <div className="text-xs uppercase tracking-wide text-foreground/60 mb-2">{m}</div>
                <div className="text-2xl font-semibold">
                  {m === "hours" ? Number(actual ?? 0).toLocaleString() : formatMoney(actual)}
                </div>
                <div className="text-sm text-foreground/60 mt-1">
                  vs {m === "hours" ? Number(budgeted ?? 0).toLocaleString() : formatMoney(budgeted)} budgeted
                </div>
                <div className={`text-sm font-medium mt-2 ${pctClass(varPct)}`}>{formatPct(varPct)}</div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-md font-semibold">Open alerts ({openAlerts.length})</h3>
        </div>
        {openAlerts.length === 0 ? (
          <p className="text-sm text-foreground/60">No open alerts. Re-run the monitor to refresh.</p>
        ) : (
          <ul className="space-y-2">
            {openAlerts.map((a: any) => (
              <li key={a.id} className="border rounded-md p-3 flex items-start gap-3">
                <span className={`text-xs uppercase font-medium border rounded px-2 py-0.5 ${SEVERITY_COLORS[a.kind === "burn_rate" ? "high" : "medium"]}`}>
                  {a.kind.replace(/_/g, " ")}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.message}</div>
                  <div className="text-xs text-foreground/60 mt-1">
                    {a.metric} • threshold {Number(a.threshold).toFixed(0)}% • observed {Number(a.observed).toFixed(1)}%
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateAlert.mutate({ id: a.id, status: "acknowledged" })}
                      className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                    >
                      Ack
                    </button>
                    <button
                      onClick={() => updateAlert.mutate({ id: a.id, status: "resolved" })}
                      className="text-xs px-2 py-1 border rounded hover:bg-slate-50"
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {recentAlerts.length > openAlerts.length && (
        <div>
          <h3 className="text-md font-semibold mb-2">Recently closed</h3>
          <ul className="space-y-1">
            {recentAlerts.filter((a: any) => a.status !== "open").slice(0, 5).map((a: any) => (
              <li key={a.id} className="text-xs text-foreground/60 flex items-center gap-2">
                <span className={`border rounded px-1.5 py-0.5 ${STATUS_COLORS[a.status] || ""}`}>{a.status}</span>
                <span>{a.kind.replace(/_/g, " ")} — {a.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-md font-semibold mb-3">Snapshot history</h3>
        {!Array.isArray(actuals) || actuals.length === 0 ? (
          <p className="text-sm text-foreground/60">No snapshots yet.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-foreground/60 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">Period</th>
                  <th className="text-right px-3 py-2">Hours act / bud</th>
                  <th className="text-right px-3 py-2">Cost act / bud</th>
                  <th className="text-right px-3 py-2">Fee act / bud</th>
                </tr>
              </thead>
              <tbody>
                {actuals.map((s: any) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">
                      {new Date(s.periodStart).toLocaleDateString()} — {new Date(s.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {Number(s.hoursActual ?? 0).toLocaleString()} / {Number(s.hoursBudgeted ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(s.costActual)} / {formatMoney(s.costBudgeted)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(s.feeActual)} / {formatMoney(s.feeBudgeted)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
