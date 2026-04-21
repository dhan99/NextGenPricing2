import { useEffect, useMemo, useState } from "react";
import { Target, Plus, Trash2, Save, Building2, Layers } from "lucide-react";
import {
  useMarginTargets,
  useUpdateFirmMarginTarget,
  useCreateMarginTargetOverride,
  useUpdateMarginTargetOverride,
  useDeleteMarginTargetOverride,
  useEngagementInputSpec,
} from "@/hooks/use-api";

// Canonical service-line and business-unit lists — mirror PromptSetsAdmin so
// admins see the same names everywhere. Update both files together when the
// firm adds a new line or BU.
const SERVICE_LINES = [
  "Tax-PHB",
  "Tax-Corporate",
  "Audit",
  "Risk Assurance",
  "Cloud Services",
  "Digital Transformation",
  "Compliance Consulting",
];
const BUSINESS_UNITS = [
  "Tax Advisory",
  "Audit",
  "Risk Advisory",
  "Consulting",
  "Technology Consulting",
  "Compliance Consulting",
];

type Override = {
  id: number;
  scope: "bu" | "serviceLine";
  scopeKey: string | null;
  percent: number;
  techAdminFeePct: number | null;
  lineItemRounding: number | null;
  fixedFeeRounding: number | null;
};

const numOrEmpty = (v: number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

const parseOptionalNum = (s: string): number | null | undefined => {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : undefined;
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

  const [newScope, setNewScopeState] = useState<"bu" | "serviceLine">("serviceLine");
  const [newKey, setNewKey] = useState("");
  const setNewScope = (s: "bu" | "serviceLine") => {
    setNewScopeState(s);
    setNewKey(""); // reset name when scope changes (dropdown vs text input)
    setNewPct(""); setNewTechFee(""); setNewLineRound(""); setNewFixedRound("");
  };
  const [newPct, setNewPct] = useState("");
  const [newTechFee, setNewTechFee] = useState("");
  const [newLineRound, setNewLineRound] = useState("");
  const [newFixedRound, setNewFixedRound] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // When the user picks a service line, pre-fill all four fields with the
  // engagement-input preset defaults for that line (margin → firm default since
  // presets don't carry margin). The user can then tweak before saving.
  const prefillSL = newScope === "serviceLine" && newKey ? newKey : null;
  const { data: prefillSpec } = useEngagementInputSpec(prefillSL);
  useEffect(() => {
    if (!prefillSL || !prefillSpec) return;
    const d = prefillSpec.defaults || {};
    setNewPct(firmDefault != null ? String(firmDefault) : "35");
    setNewTechFee(d.techAdminFeePct != null ? String(d.techAdminFeePct) : "");
    setNewLineRound(d.lineItemRounding != null ? String(d.lineItemRounding) : "");
    setNewFixedRound(d.fixedFeeRounding != null ? String(d.fixedFeeRounding) : "");
    setAddError(null);
    // Only re-run when the picked SL or its spec changes — not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSL, prefillSpec?.serviceLine, JSON.stringify(prefillSpec?.defaults || {})]);

  const handleSaveFirm = () => {
    const v = parseFloat(firmDisplay);
    if (Number.isFinite(v) && v >= 1 && v <= 100) {
      updateFirm.mutate(v);
      setFirmInput("");
    }
  };

  const handleAddOverride = () => {
    setAddError(null);
    const v = parseFloat(newPct);
    const key = newKey.trim();
    if (!key) return setAddError("Name is required.");
    if (!Number.isFinite(v) || v < 1 || v > 100) return setAddError("Target margin must be a number between 1 and 100.");
    const payload: any = { scope: newScope, scopeKey: key, percent: v };
    if (newScope === "serviceLine") {
      const tech = parseOptionalNum(newTechFee);
      if (tech === undefined) return setAddError("Tech-admin fee must be a number or blank.");
      const line = parseOptionalNum(newLineRound);
      if (line === undefined) return setAddError("Line-item rounding must be a number or blank.");
      const fixed = parseOptionalNum(newFixedRound);
      if (fixed === undefined) return setAddError("Fixed-fee rounding must be a number or blank.");
      if (tech !== null) payload.techAdminFeePct = tech;
      if (line !== null) payload.lineItemRounding = line;
      if (fixed !== null) payload.fixedFeeRounding = fixed;
    }
    createOverride.mutate(payload, {
      onSuccess: () => {
        setNewKey(""); setNewPct(""); setNewTechFee(""); setNewLineRound(""); setNewFixedRound("");
      },
      onError: (e: any) => setAddError(e?.message || "Failed to create override."),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Target className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Margin Targets &amp; Service-Line Policy</h1>
          <p className="text-sm text-muted-foreground">
            Single source of truth for the gross-margin target and per-service-line pricing policy used across Deal Detail, Pricing, Review, Analytics, and the Renewal Leadsheet.
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-6 ml-13">
        Resolution order on every deal: <strong>Deal override</strong> → <strong>Business Unit</strong> → <strong>Service Line</strong> → <strong>Firm default</strong>.
        Service-line overrides may also carry per-SL policy knobs that overlay the engagement-input preset defaults.
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
          Override the firm default for a specific business unit or service line. Use the exact name as it appears on deals (e.g. "Tax", "Audit", "Advisory", "Digital Transformation"). Policy fields apply only to service-line overrides — leave blank to inherit the engagement-input preset default.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Scope</label>
            <select
              value={newScope}
              onChange={(e) => setNewScope(e.target.value as "bu" | "serviceLine")}
              className="px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="serviceLine">Service Line</option>
              <option value="bu">Business Unit</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <select
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">
                {newScope === "serviceLine" ? "— Select service line —" : "— Select business unit —"}
              </option>
              {newScope === "serviceLine"
                ? SERVICE_LINES.filter((sl) => !slRows.some((r) => r.scopeKey === sl)).map((sl) => (
                    <option key={sl} value={sl}>{sl}</option>
                  ))
                : BUSINESS_UNITS.filter((bu) => !buRows.some((r) => r.scopeKey === bu)).map((bu) => (
                    <option key={bu} value={bu}>{bu}</option>
                  ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Target margin (%)</label>
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
          {newScope === "serviceLine" && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tech-Admin Fee (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={newTechFee}
                  onChange={(e) => setNewTechFee(e.target.value)}
                  placeholder="default"
                  className="w-28 px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Line Rounding ($)</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step="1"
                  value={newLineRound}
                  onChange={(e) => setNewLineRound(e.target.value)}
                  placeholder="default"
                  className="w-28 px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Fixed-Fee Rounding ($)</label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step="1"
                  value={newFixedRound}
                  onChange={(e) => setNewFixedRound(e.target.value)}
                  placeholder="default"
                  className="w-32 px-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </>
          )}
          <button
            onClick={handleAddOverride}
            disabled={createOverride.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
        {addError && (
          <p className="text-xs text-rose-600 mt-3">{addError}</p>
        )}
      </div>

      <OverrideList
        title="Business Unit Overrides"
        icon={<Building2 className="w-4 h-4 text-muted-foreground" />}
        rows={buRows}
        showPolicyFields={false}
        onSave={(id, payload) => updateOverride.mutate({ id, ...payload })}
        onDelete={(id) => deleteOverride.mutate(id)}
      />

      <OverrideList
        title="Service Line Overrides"
        icon={<Layers className="w-4 h-4 text-muted-foreground" />}
        rows={slRows}
        showPolicyFields={true}
        onSave={(id, payload) => updateOverride.mutate({ id, ...payload })}
        onDelete={(id) => deleteOverride.mutate(id)}
      />
    </div>
  );
}

type SavePayload = {
  percent?: number;
  techAdminFeePct?: number | null;
  lineItemRounding?: number | null;
  fixedFeeRounding?: number | null;
};

function OverrideList({
  title,
  icon,
  rows,
  showPolicyFields,
  onSave,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Override[];
  showPolicyFields: boolean;
  onSave: (id: number, payload: SavePayload) => void;
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
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-muted/40">
              <th className="text-left px-6 py-2 text-xs font-semibold text-muted-foreground uppercase">Name</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Margin %</th>
              {showPolicyFields && (
                <>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Tech Fee %</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Line Round $</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Fixed Round $</th>
                </>
              )}
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <OverrideRow key={r.id} row={r} showPolicyFields={showPolicyFields} onSave={onSave} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

function OverrideRow({
  row,
  showPolicyFields,
  onSave,
  onDelete,
}: {
  row: Override;
  showPolicyFields: boolean;
  onSave: (id: number, payload: SavePayload) => void;
  onDelete: (id: number) => void;
}) {
  const [pct, setPct] = useState(String(row.percent));
  const [tech, setTech] = useState(numOrEmpty(row.techAdminFeePct));
  const [line, setLine] = useState(numOrEmpty(row.lineItemRounding));
  const [fixed, setFixed] = useState(numOrEmpty(row.fixedFeeRounding));
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    pct !== String(row.percent) ||
    (showPolicyFields && (
      tech !== numOrEmpty(row.techAdminFeePct) ||
      line !== numOrEmpty(row.lineItemRounding) ||
      fixed !== numOrEmpty(row.fixedFeeRounding)
    ));

  const handleSave = () => {
    setErr(null);
    const v = parseFloat(pct);
    if (!Number.isFinite(v) || v < 1 || v > 100) return setErr("Margin 1–100");
    const payload: SavePayload = { percent: v };
    if (showPolicyFields) {
      const t = parseOptionalNum(tech);
      const l = parseOptionalNum(line);
      const f = parseOptionalNum(fixed);
      if (t === undefined || l === undefined || f === undefined) return setErr("Numeric or blank");
      payload.techAdminFeePct = t;
      payload.lineItemRounding = l;
      payload.fixedFeeRounding = f;
    }
    onSave(row.id, payload);
  };

  const numInput = (val: string, setVal: (s: string) => void, min: number, max: number, w: string) => (
    <input
      type="number"
      min={min}
      max={max}
      step="0.1"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      placeholder="—"
      className={`${w} px-2 py-1 text-sm border border-border rounded-md bg-background text-right focus:outline-none focus:ring-2 focus:ring-primary/30`}
    />
  );

  return (
    <tr>
      <td className="px-6 py-3 text-sm text-foreground font-medium">{row.scopeKey}</td>
      <td className="px-4 py-3 text-right">{numInput(pct, setPct, 1, 100, "w-20")}</td>
      {showPolicyFields && (
        <>
          <td className="px-4 py-3 text-right">{numInput(tech, setTech, 0, 100, "w-20")}</td>
          <td className="px-4 py-3 text-right">{numInput(line, setLine, 0, 10000, "w-24")}</td>
          <td className="px-4 py-3 text-right">{numInput(fixed, setFixed, 0, 100000, "w-24")}</td>
        </>
      )}
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            onClick={handleSave}
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
        {err && <p className="text-[10px] text-rose-600 mt-1">{err}</p>}
      </td>
    </tr>
  );
}
