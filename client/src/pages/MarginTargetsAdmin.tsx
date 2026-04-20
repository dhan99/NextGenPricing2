import { useMemo, useState } from "react";
import { Target, Plus, Trash2, Save, Building2, Layers } from "lucide-react";
import {
  useMarginTargets,
  useUpdateFirmMarginTarget,
  useCreateMarginTargetOverride,
  useUpdateMarginTargetOverride,
  useDeleteMarginTargetOverride,
} from "@/hooks/use-api";

type Override = {
  id: number;
  scope: "bu" | "serviceLine";
  scopeKey: string | null;
  percent: number;
};

export function MarginTargetsAdmin() {
  const { data } = useMarginTargets();
  const updateFirm = useUpdateFirmMarginTarget();
  const createOverride = useCreateMarginTargetOverride();
  const updateOverride = useUpdateMarginTargetOverride();
  const deleteOverride = useDeleteMarginTargetOverride();

  const firmDefault: number | null = data?.firmDefault ?? null;
  const overrides: Override[] = data?.overrides || [];
  const buRows = useMemo(() => overrides.filter((r) => r.scope === "bu"), [overrides]);
  const slRows = useMemo(() => overrides.filter((r) => r.scope === "serviceLine"), [overrides]);

  const [firmInput, setFirmInput] = useState<string>("");
  const firmDisplay = firmInput !== "" ? firmInput : firmDefault != null ? String(firmDefault) : "35";

  const [newScope, setNewScope] = useState<"bu" | "serviceLine">("bu");
  const [newKey, setNewKey] = useState("");
  const [newPct, setNewPct] = useState("");

  const handleSaveFirm = () => {
    const v = parseFloat(firmDisplay);
    if (Number.isFinite(v) && v >= 1 && v <= 100) {
      updateFirm.mutate(v);
      setFirmInput("");
    }
  };

  const handleAddOverride = () => {
    const v = parseFloat(newPct);
    const key = newKey.trim();
    if (!key || !Number.isFinite(v) || v < 1 || v > 100) return;
    createOverride.mutate({ scope: newScope, scopeKey: key, percent: v });
    setNewKey("");
    setNewPct("");
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Target className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Margin Targets</h1>
          <p className="text-sm text-muted-foreground">
            Single source of truth for the gross-margin target used across Deal Detail, Pricing, Review, Analytics, and the Renewal Leadsheet.
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-6 ml-13">
        Resolution order on every deal: <strong>Deal override</strong> → <strong>Service Line</strong> → <strong>Business Unit</strong> → <strong>Firm default</strong>.
      </p>

      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Firm Default</h2>
        <p className="text-xs text-muted-foreground mb-4">Applied to every deal that has no business unit, service line, or deal override set.</p>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Target margin (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              step="0.1"
              value={firmDisplay}
              onChange={(e) => setFirmInput(e.target.value)}
              className="w-32 px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleSaveFirm}
            disabled={updateFirm.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Add Override</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Override the firm default for a specific business unit or service line. Use the exact name as it appears on deals (e.g., "Tax", "Audit", "Advisory").
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Scope</label>
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as "bu" | "serviceLine")}
              className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="bu">Business Unit</option>
              <option value="serviceLine">Service Line</option>
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={newScope === "bu" ? "e.g. Advisory" : "e.g. Tax"}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Target (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              step="0.1"
              value={newPct}
              onChange={(e) => setNewPct(e.target.value)}
              className="w-28 px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleAddOverride}
            disabled={createOverride.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      <OverrideList
        title="Business Unit Overrides"
        icon={<Building2 className="w-4 h-4 text-muted-foreground" />}
        rows={buRows}
        onSave={(id, percent) => updateOverride.mutate({ id, percent })}
        onDelete={(id) => deleteOverride.mutate(id)}
      />

      <OverrideList
        title="Service Line Overrides"
        icon={<Layers className="w-4 h-4 text-muted-foreground" />}
        rows={slRows}
        onSave={(id, percent) => updateOverride.mutate({ id, percent })}
        onDelete={(id) => deleteOverride.mutate(id)}
      />
    </div>
  );
}

function OverrideList({
  title,
  icon,
  rows,
  onSave,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Override[];
  onSave: (id: number, percent: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="card overflow-hidden mb-6">
      <div className="px-6 py-3 border-b border-border flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-6 text-xs text-muted-foreground">No overrides configured.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-6 py-2 text-xs font-semibold text-muted-foreground uppercase">Name</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Target %</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <OverrideRow key={r.id} row={r} onSave={onSave} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function OverrideRow({
  row,
  onSave,
  onDelete,
}: {
  row: Override;
  onSave: (id: number, percent: number) => void;
  onDelete: (id: number) => void;
}) {
  const [val, setVal] = useState(String(row.percent));
  const dirty = val !== String(row.percent);
  return (
    <tr>
      <td className="px-6 py-3 text-sm text-foreground font-medium">{row.scopeKey}</td>
      <td className="px-4 py-3 text-right">
        <input
          type="number"
          min={1}
          max={100}
          step="0.1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-24 px-2 py-1 text-sm border border-border rounded-md bg-background text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            onClick={() => {
              const v = parseFloat(val);
              if (Number.isFinite(v) && v >= 1 && v <= 100) onSave(row.id, v);
            }}
            disabled={!dirty}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
          <button
            onClick={() => onDelete(row.id)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
