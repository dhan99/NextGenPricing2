import { useMemo, useState } from "react";
import {
  usePromptSets, usePromptSet,
  useCreatePromptSet, useUpdatePromptSet, useDeletePromptSet,
  usePublishPromptSet, useClonePromptSet, useArchivePromptSet,
  useCreatePromptSetItem, useUpdatePromptSetItem, useDeletePromptSetItem,
} from "@/hooks/use-api";
import { MessageSquare, Plus, Send, Copy, Archive, Trash2, Pencil, Check, X, AlertCircle } from "lucide-react";
import { ReadOnlyAdminBanner } from "@/components/ReadOnlyAdminBanner";

const BUSINESS_UNITS = ["", "Tax Advisory", "Audit", "Risk Advisory", "Consulting", "Technology Consulting", "Compliance Consulting"];
const SERVICE_LINES = ["", "Tax-PHB", "Tax-Corporate", "Audit", "Risk Assurance", "Cloud Services", "Digital Transformation", "Compliance Consulting"];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-50 text-amber-800 border-amber-200",
  published: "bg-emerald-50 text-emerald-800 border-emerald-200",
  archived: "bg-stone-100 text-stone-600 border-stone-200",
};

export function PromptSetsAdmin({ readOnly = false }: { readOnly?: boolean }) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: sets } = usePromptSets({ status: statusFilter || undefined });
  const { data: detail } = usePromptSet(selectedId);

  const filtered = useMemo(() => sets || [], [sets]);

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary" />
            Prompt Sets
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Govern complexity-driver prompts per Business Unit and Service Line. Sets are versioned and published; deals automatically use the most-specific published set for their BU + Service Line.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            New Prompt Set
          </button>
        )}
      </div>
      {readOnly && <ReadOnlyAdminBanner feature="prompt sets" />}

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-5">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">All Sets</h2>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border border-border rounded px-2 py-1 bg-background"
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center">No prompt sets match this filter.</p>
              )}
              {filtered.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedId === s.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border font-semibold ${STATUS_STYLES[s.status]}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                    <span>v{s.version}</span>
                    <span>·</span>
                    <span>{s.businessUnit || "All BUs"}</span>
                    <span>·</span>
                    <span>{s.serviceLine || "All Service Lines"}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-7">
          <fieldset disabled={readOnly} className="contents">
          {detail ? <PromptSetDetail set={detail} /> : (
            <div className="card p-12 text-center text-sm text-muted-foreground">
              Select a prompt set on the left to view{readOnly ? " it." : " and edit it."}
            </div>
          )}
          </fieldset>
        </div>
      </div>

      {showCreate && !readOnly && <CreateSetModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setSelectedId(id); }} />}
    </div>
  );
}

function CreateSetModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [serviceLine, setServiceLine] = useState("");
  const [notes, setNotes] = useState("");
  const create = useCreatePromptSet();
  const submit = async () => {
    if (!name.trim()) return;
    const r = await create.mutateAsync({ name: name.trim(), businessUnit: businessUnit || null, serviceLine: serviceLine || null, notes: notes || null });
    onCreated(r.id);
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-background rounded-xl p-6 w-[480px] shadow-xl">
        <h3 className="text-lg font-semibold mb-4">New Prompt Set</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background" placeholder="e.g. Tax-PHB Complexity Drivers" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Business Unit</label>
              <select value={businessUnit} onChange={(e) => setBusinessUnit(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background">
                {BUSINESS_UNITS.map((b) => <option key={b} value={b}>{b || "— All BUs —"}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Service Line</label>
              <select value={serviceLine} onChange={(e) => setServiceLine(e.target.value)} className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background">
                {SERVICE_LINES.map((b) => <option key={b} value={b}>{b || "— All Service Lines —"}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-border hover:bg-muted/40">Cancel</button>
          <button onClick={submit} disabled={!name.trim() || create.isPending} className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {create.isPending ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptSetDetail({ set }: { set: any }) {
  const isDraft = set.status === "draft";
  const update = useUpdatePromptSet();
  const del = useDeletePromptSet();
  const publish = usePublishPromptSet();
  const clone = useClonePromptSet();
  const archive = useArchivePromptSet();

  const [meta, setMeta] = useState({
    name: set.name,
    businessUnit: set.businessUnit || "",
    serviceLine: set.serviceLine || "",
    notes: set.notes || "",
  });

  const saveMeta = () => {
    if (!isDraft) return;
    update.mutate({ id: set.id, data: { ...meta, businessUnit: meta.businessUnit || null, serviceLine: meta.serviceLine || null, notes: meta.notes || null } });
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border font-semibold ${STATUS_STYLES[set.status]}`}>{set.status}</span>
            <span className="ml-2 text-xs text-muted-foreground">v{set.version}</span>
          </div>
          <div className="flex items-center gap-2">
            {isDraft && (
              <button onClick={() => publish.mutate(set.id)} disabled={publish.isPending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                <Send className="w-3.5 h-3.5" /> Publish
              </button>
            )}
            <button onClick={() => clone.mutate(set.id)} disabled={clone.isPending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-muted/40">
              <Copy className="w-3.5 h-3.5" /> Clone as new draft
            </button>
            {set.status === "published" && (
              <button onClick={() => archive.mutate(set.id)} disabled={archive.isPending} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-stone-700 hover:bg-muted/40">
                <Archive className="w-3.5 h-3.5" /> Archive
              </button>
            )}
            {isDraft && (
              <button onClick={() => { if (confirm("Delete this draft?")) del.mutate(set.id); }} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} onBlur={saveMeta} disabled={!isDraft}
              className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background disabled:opacity-60" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Business Unit</label>
            <select value={meta.businessUnit} onChange={(e) => { setMeta({ ...meta, businessUnit: e.target.value }); update.mutate({ id: set.id, data: { businessUnit: e.target.value || null } }); }} disabled={!isDraft}
              className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background disabled:opacity-60">
              {BUSINESS_UNITS.map((b) => <option key={b} value={b}>{b || "— All BUs —"}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Service Line</label>
            <select value={meta.serviceLine} onChange={(e) => { setMeta({ ...meta, serviceLine: e.target.value }); update.mutate({ id: set.id, data: { serviceLine: e.target.value || null } }); }} disabled={!isDraft}
              className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background disabled:opacity-60">
              {SERVICE_LINES.map((b) => <option key={b} value={b}>{b || "— All Service Lines —"}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} onBlur={saveMeta} rows={2} disabled={!isDraft}
              className="w-full mt-1 px-3 py-2 border border-border rounded text-sm bg-background disabled:opacity-60" />
          </div>
        </div>

        {!isDraft && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded p-2.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>This set is {set.status}. Click <strong>Clone as new draft</strong> to create a new editable version.</span>
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Prompts ({(set.items || []).length})</h3>
        </div>
        <div className="space-y-3">
          {(set.items || []).map((item: any) => (
            <PromptItemCard key={item.id} setId={set.id} item={item} editable={isDraft} />
          ))}
          {isDraft && <NewPromptRow setId={set.id} nextSortOrder={(set.items?.length || 0) + 1} />}
          {(!set.items || set.items.length === 0) && !isDraft && (
            <p className="text-xs text-muted-foreground py-6 text-center">This set has no prompts.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PromptItemCard({ setId, item, editable }: { setId: number; item: any; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdatePromptSetItem();
  const del = useDeletePromptSetItem();
  const [draft, setDraft] = useState({
    question: item.question,
    category: item.category || "",
    helpText: item.helpText || "",
    enabled: item.enabled !== false,
    options: (item.options as any[]).map((o) => ({ label: o.label, multiplier: String(o.multiplier) })),
  });

  const save = () => {
    update.mutate({ setId, itemId: item.id, data: { ...draft, sortOrder: item.sortOrder } }, {
      onSuccess: () => setEditing(false),
    });
  };

  if (!editing) {
    return (
      <div className={`border rounded-lg p-3 ${item.enabled === false ? "opacity-50 bg-muted/30" : "bg-background"} border-border`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">{item.question}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{item.category}{item.enabled === false ? " · disabled" : ""}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(item.options as any[]).map((o, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-muted/50 px-2 py-0.5 rounded border border-border">
                  {o.label} <span className="text-muted-foreground">×{o.multiplier}</span>
                </span>
              ))}
            </div>
          </div>
          {editable && (
            <div className="flex flex-col gap-1.5 shrink-0">
              <button onClick={() => setEditing(true)} className="p-1.5 rounded border border-border hover:bg-muted/40" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => { if (confirm("Delete this prompt?")) del.mutate({ setId, itemId: item.id }); }} className="p-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-primary rounded-lg p-3 bg-primary/5">
      <input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background mb-2" placeholder="Question" />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="px-2 py-1.5 border border-border rounded text-xs bg-background" placeholder="Category (e.g. Compliance)" />
        <label className="text-xs flex items-center gap-2 px-2"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Enabled</label>
      </div>
      <input value={draft.helpText} onChange={(e) => setDraft({ ...draft, helpText: e.target.value })} className="w-full px-2 py-1.5 border border-border rounded text-xs bg-background mb-2" placeholder="Help text (optional)" />
      <div className="space-y-1.5">
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={opt.label} onChange={(e) => { const ops = [...draft.options]; ops[i] = { ...ops[i], label: e.target.value }; setDraft({ ...draft, options: ops }); }} className="flex-1 px-2 py-1 border border-border rounded text-xs bg-background" placeholder="Option label" />
            <input value={opt.multiplier} onChange={(e) => { const ops = [...draft.options]; ops[i] = { ...ops[i], multiplier: e.target.value }; setDraft({ ...draft, options: ops }); }} className="w-20 px-2 py-1 border border-border rounded text-xs bg-background" placeholder="×1.0" />
            <button onClick={() => { const ops = draft.options.filter((_, j) => j !== i); setDraft({ ...draft, options: ops }); }} className="p-1 text-red-600 hover:bg-red-50 rounded" title="Remove"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button onClick={() => setDraft({ ...draft, options: [...draft.options, { label: "", multiplier: "1.00" }] })} className="text-xs text-primary hover:underline">+ Add option</button>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted/40">Cancel</button>
        <button onClick={save} disabled={update.isPending} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Save
        </button>
      </div>
      {update.isError && <p className="text-xs text-red-600 mt-2">{(update.error as any)?.message}</p>}
    </div>
  );
}

function NewPromptRow({ setId, nextSortOrder }: { setId: number; nextSortOrder: number }) {
  const [open, setOpen] = useState(false);
  const create = useCreatePromptSetItem();
  const [draft, setDraft] = useState({
    question: "",
    category: "",
    helpText: "",
    options: [{ label: "Low", multiplier: "0.95" }, { label: "Medium", multiplier: "1.00" }, { label: "High", multiplier: "1.15" }],
  });
  const submit = () => {
    if (!draft.question.trim()) return;
    create.mutate({ setId, data: { ...draft, sortOrder: nextSortOrder, enabled: true } }, {
      onSuccess: () => { setOpen(false); setDraft({ question: "", category: "", helpText: "", options: [{ label: "Low", multiplier: "0.95" }, { label: "Medium", multiplier: "1.00" }, { label: "High", multiplier: "1.15" }] }); },
    });
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full py-3 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary/40 hover:text-primary inline-flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add prompt
      </button>
    );
  }
  return (
    <div className="border-2 border-primary rounded-lg p-3 bg-primary/5">
      <input autoFocus value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} className="w-full px-2 py-1.5 border border-border rounded text-sm bg-background mb-2" placeholder="Question" />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="px-2 py-1.5 border border-border rounded text-xs bg-background" placeholder="Category" />
      </div>
      <div className="space-y-1.5">
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={opt.label} onChange={(e) => { const ops = [...draft.options]; ops[i] = { ...ops[i], label: e.target.value }; setDraft({ ...draft, options: ops }); }} className="flex-1 px-2 py-1 border border-border rounded text-xs bg-background" placeholder="Option label" />
            <input value={opt.multiplier} onChange={(e) => { const ops = [...draft.options]; ops[i] = { ...ops[i], multiplier: e.target.value }; setDraft({ ...draft, options: ops }); }} className="w-20 px-2 py-1 border border-border rounded text-xs bg-background" placeholder="×1.0" />
            <button onClick={() => { const ops = draft.options.filter((_, j) => j !== i); setDraft({ ...draft, options: ops }); }} className="p-1 text-red-600 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <button onClick={() => setDraft({ ...draft, options: [...draft.options, { label: "", multiplier: "1.00" }] })} className="text-xs text-primary hover:underline">+ Add option</button>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setOpen(false)} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted/40">Cancel</button>
        <button onClick={submit} disabled={create.isPending} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {create.isPending ? "Adding…" : "Add prompt"}
        </button>
      </div>
      {create.isError && <p className="text-xs text-red-600 mt-2">{(create.error as any)?.message}</p>}
    </div>
  );
}
