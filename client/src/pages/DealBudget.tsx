import { useRoute, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useDeal } from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";
import { BudgetPanel } from "@/components/budget/BudgetPanel";

export function DealBudget() {
  const [, params] = useRoute<{ id: string }>("/deals/:id/budget");
  const dealId = params ? parseInt(params.id, 10) : 0;
  const { data: deal } = useDeal(dealId);
  const { persona } = useAuth();
  const canEdit = persona?.permissions.editDeals ?? false;

  if (!deal) {
    return (
      <div className="p-8">
        <p className="text-foreground/60">Loading deal…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/deals/${dealId}`} className="text-sm text-foreground/60 hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to deal
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold">{deal.title}</h1>
        <p className="text-sm text-foreground/60">
          {deal.dealNumber} · {deal.businessUnit ?? "—"} · {deal.serviceLine ?? "—"}
        </p>
      </div>
      <BudgetPanel dealId={dealId} canEdit={canEdit} />
    </div>
  );
}
