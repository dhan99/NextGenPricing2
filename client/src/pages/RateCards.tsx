import { useRateCards, useRateCardEntries } from "@/hooks/use-api";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { DollarSign, CheckCircle, XCircle } from "lucide-react";

export function RateCards() {
  const { data: rateCards } = useRateCards();
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const { data: entries } = useRateCardEntries(selectedCard || 0);

  const activeCard = selectedCard || (rateCards && rateCards.length > 0 ? rateCards[0].id : null);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Rate Cards</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage billing rates by role and region</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Rate Cards</h2>
          {(rateCards || []).map((rc: any) => (
            <button
              key={rc.id}
              onClick={() => setSelectedCard(rc.id)}
              className={`w-full card p-4 text-left transition-all ${(selectedCard || activeCard) === rc.id ? "ring-2 ring-primary bg-primary/5" : "hover:shadow-md"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">{rc.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {rc.isActive ? (
                  <span className="flex items-center gap-1 text-xs text-success"><CheckCircle className="w-3 h-3" />Active</span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="w-3 h-3" />Inactive</span>
                )}
                <span className="text-xs text-muted-foreground">{rc.region}</span>
              </div>
              {rc.effectiveDate && <p className="text-xs text-muted-foreground mt-1">{rc.effectiveDate} to {rc.expirationDate}</p>}
            </button>
          ))}
        </div>

        <div className="lg:col-span-3">
          {activeCard ? (
            <RateCardDetail cardId={selectedCard || activeCard} />
          ) : (
            <div className="card p-12 text-center text-muted-foreground">Select a rate card to view details</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RateCardDetail({ cardId }: { cardId: number }) {
  const { data: entries } = useRateCardEntries(cardId);

  return (
    <div className="card overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Rate Table</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Role</th>
            <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Level</th>
            <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Bill Rate</th>
            <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Cost Rate</th>
            <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Margin</th>
            <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Margin %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(entries || []).map((entry: any) => {
            const rate = parseFloat(entry.rate);
            const cost = parseFloat(entry.costRate);
            const marginAmt = rate - cost;
            const marginPct = rate > 0 ? (marginAmt / rate) * 100 : 0;
            return (
              <tr key={entry.id} className="hover:bg-muted/30">
                <td className="px-6 py-3 text-sm font-medium text-foreground">{entry.roleName}</td>
                <td className="px-6 py-3 text-sm text-muted-foreground">{entry.roleLevel}</td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-foreground">{formatCurrency(rate)}</td>
                <td className="px-6 py-3 text-right text-sm text-muted-foreground">{formatCurrency(cost)}</td>
                <td className="px-6 py-3 text-right text-sm text-success font-medium">{formatCurrency(marginAmt)}</td>
                <td className="px-6 py-3 text-right text-sm text-success font-medium">{marginPct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
