// F1.2 — AssemblyPicker.
//
// Adds explicit assembly templates to the deal's scope step. Today's
// scope picker pulls flat catalog items one at a time (with the legacy
// parent_id cascade for is_assembly rows). The new model lets users
// pick a TEMPLATE (e.g. "Tax PHB — 1040 Calculator") that expands
// into a deterministic set of pricing rows via the F1.2 sandbox
// (server/services/AssemblyExpansionService.ts).
//
// Flow:
//   1. User opens the picker (button next to the existing Add Scope
//      panel in DealDetail's ScopeStep).
//   2. List of active templates with one-line descriptions. User
//      clicks one.
//   3. Tier selector (Ultimate / Enhanced / Essential) drives a
//      live preview via POST /api/assemblies/:id/expand.
//   4. Apply button calls POST /api/deals/:dealId/scope-items
//      /from-assembly, which inserts + recalcs.
//
// Edit-permission gated; in read-only mode the trigger is hidden
// entirely.

import { useState } from "react";
import { Plus, Loader2, AlertTriangle, Layers, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAssemblies,
  useExpandAssembly,
  useApplyAssembly,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";

type Tier = "ultimate" | "enhanced" | "essential";

type Assembly = {
  id: number;
  name: string;
  description: string | null;
  serviceLine: string | null;
  assemblyCode: string;
  assemblyName: string;
};

type ExpansionLine = {
  scopeItemId: number;
  quantity: number;
  adjustedHours: number;
  sourceComponentId: number;
  formulaUsed: string | null;
};

type Props = {
  dealId: number;
  activeEntityId: number | null;
  serviceLine: string | null;
};

export function AssemblyPicker({ dealId, activeEntityId, serviceLine }: Props) {
  // Hooks must run unconditionally per the Rules of Hooks. Permission
  // gate is evaluated after — falsy result short-circuits to null.
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasPermission("editDeals")) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
        data-testid="assembly-picker-open"
      >
        <Layers className="w-3.5 h-3.5" /> Add from Assembly
      </button>
      {open && (
        <AssemblyPickerPanel
          dealId={dealId}
          activeEntityId={activeEntityId}
          serviceLine={serviceLine}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AssemblyPickerPanel({
  dealId, activeEntityId, serviceLine, onClose,
}: Props & { onClose: () => void }) {
  const { data, isLoading, error } = useAssemblies();
  const [selected, setSelected] = useState<Assembly | null>(null);
  const [tier, setTier] = useState<Tier>("ultimate");
  const expand = useExpandAssembly();
  const apply = useApplyAssembly();
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ inserted: number; skipped: number } | null>(null);

  const assemblies: Assembly[] = data || [];
  // Soft service-line filter: prefer matching templates, but keep all
  // visible so the user can pick a generic one if their deal is on a
  // service line the template author hasn't explicitly tagged.
  const recommended = serviceLine ? assemblies.filter(a => a.serviceLine === serviceLine) : [];
  const others = assemblies.filter(a => !recommended.includes(a));

  function onPick(a: Assembly) {
    setSelected(a);
    setApplyError(null);
    setApplyResult(null);
    expand.mutate({ id: a.id, dealId, tier });
  }

  function onTierChange(next: Tier) {
    setTier(next);
    setApplyResult(null);
    if (selected) expand.mutate({ id: selected.id, dealId, tier: next });
  }

  function onApply() {
    if (!selected) return;
    setApplyError(null);
    apply.mutate(
      { dealId, assemblyTemplateId: selected.id, entityId: activeEntityId, tier },
      {
        onSuccess: (resp: any) => {
          setApplyResult({ inserted: resp.inserted?.length ?? 0, skipped: resp.skipped?.length ?? 0 });
        },
        onError: (e: any) => {
          setApplyError(e?.body?.error || e?.message || "Apply failed");
        },
      },
    );
  }

  const expansion: { lines: ExpansionLine[]; totalHours: number } | undefined = expand.data;
  const expansionError = expand.error as any;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Add from Assembly Template
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Pick a registered assembly. Components expand by tier × engagement inputs into deal scope rows.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading assembly templates…
            </div>
          )}
          {error && (
            <div className="m-5 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
              Failed to load assemblies: {(error as any)?.message || String(error)}
            </div>
          )}
          {!isLoading && !error && assemblies.length === 0 && (
            <div className="p-8 text-sm text-muted-foreground text-center">
              No assembly templates registered. Pricing Operations sets these up in the admin area.
            </div>
          )}

          {!isLoading && !error && assemblies.length > 0 && !selected && (
            <div className="p-5 space-y-4">
              {recommended.length > 0 && (
                <Section title={`Recommended for ${serviceLine ?? "this deal"}`}>
                  {recommended.map(a => (
                    <AssemblyRow key={a.id} a={a} onPick={onPick} />
                  ))}
                </Section>
              )}
              {others.length > 0 && (
                <Section title={recommended.length > 0 ? "Other templates" : "All templates"}>
                  {others.map(a => (
                    <AssemblyRow key={a.id} a={a} onPick={onPick} />
                  ))}
                </Section>
              )}
            </div>
          )}

          {selected && (
            <div className="p-5 space-y-4">
              <button
                onClick={() => { setSelected(null); setApplyResult(null); setApplyError(null); }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                data-testid="assembly-picker-back"
              >
                ← Back to template list
              </button>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Catalog: {selected.assemblyCode} · {selected.assemblyName}
                </p>
                {selected.description && (
                  <p className="text-xs text-foreground/80 mt-2">{selected.description}</p>
                )}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Tier</p>
                <div className="flex gap-2">
                  {(["ultimate", "enhanced", "essential"] as Tier[]).map(t => (
                    <button
                      key={t}
                      onClick={() => onTierChange(t)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-lg border capitalize",
                        t === tier
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:border-primary/40"
                      )}
                      data-testid={`assembly-picker-tier-${t}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Preview</p>
                {expand.isPending && (
                  <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Computing expansion…
                  </div>
                )}
                {expansionError && (
                  <div className="p-2 text-[11px] rounded bg-red-50 border border-red-200 text-red-700 inline-flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    {expansionError?.body?.error || expansionError?.message || "Expansion failed"}
                  </div>
                )}
                {expansion && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Component</th>
                          <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Qty</th>
                          <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Hrs each</th>
                          <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expansion.lines.map((l, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="px-3 py-1.5">#{l.sourceComponentId}{l.formulaUsed ? <span className="ml-1 text-muted-foreground/70">[{l.formulaUsed}]</span> : null}</td>
                            <td className="px-3 py-1.5 text-right">{l.quantity}</td>
                            <td className="px-3 py-1.5 text-right">{l.adjustedHours}h</td>
                            <td className="px-3 py-1.5 text-right">{l.quantity * l.adjustedHours}h</td>
                          </tr>
                        ))}
                        {expansion.lines.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">No lines (all components had quantity 0).</td></tr>
                        )}
                      </tbody>
                      {expansion.lines.length > 0 && (
                        <tfoot className="bg-muted/40 font-semibold">
                          <tr>
                            <td className="px-3 py-1.5" colSpan={3}>Total hours</td>
                            <td className="px-3 py-1.5 text-right">{expansion.totalHours}h</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>

              {applyResult && (
                <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  Applied: {applyResult.inserted} new line{applyResult.inserted === 1 ? "" : "s"}
                  {applyResult.skipped > 0 && ` (${applyResult.skipped} duplicate${applyResult.skipped === 1 ? "" : "s"} skipped)`}
                  . Pricing recalculated.
                </div>
              )}
              {applyError && (
                <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 inline-flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {applyError}
                </div>
              )}
            </div>
          )}
        </div>

        {selected && (
          <footer className="flex items-center justify-between px-5 py-3 border-t border-border">
            <span className="text-[11px] text-muted-foreground">
              {activeEntityId ? `Adds to active entity (id ${activeEntityId})` : "Adds to deal's primary entity"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={onApply}
                disabled={apply.isPending || !!expansionError || !expansion || expansion.lines.length === 0 || !!applyResult}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5",
                  apply.isPending || !!expansionError || !expansion || expansion.lines.length === 0 || !!applyResult
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
                data-testid="assembly-picker-apply"
              >
                {apply.isPending ? <><Loader2 className="w-3 h-3 animate-spin" /> Applying…</> :
                 applyResult ? <>Applied ✓</> :
                 <><Plus className="w-3 h-3" /> Apply expansion</>}
              </button>
            </div>
          </footer>
        )}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function AssemblyRow({ a, onPick }: { a: Assembly; onPick: (a: Assembly) => void }) {
  return (
    <button
      onClick={() => onPick(a)}
      className="w-full text-left p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-start justify-between gap-3"
      data-testid={`assembly-picker-row-${a.id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{a.name}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {a.assemblyCode} · {a.serviceLine ?? "any service line"}
        </p>
        {a.description && (
          <p className="text-xs text-foreground/70 mt-1.5 line-clamp-2">{a.description}</p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
    </button>
  );
}
