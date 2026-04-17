import {
  useScopeCatalog,
  useScopeTemplates,
  useCreateScopeItem,
  useUpdateScopeItem,
  useDeactivateScopeItem,
} from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";
import { useMemo, useState } from "react";
import { Search, BookOpen, Layers, Package, Plus, Pencil, Power, X, Check } from "lucide-react";

type FormState = {
  code: string;
  name: string;
  category: string;
  description: string;
  defaultHours: string;
  isAssembly: boolean;
  parentId: string;
  serviceLines: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  category: "",
  description: "",
  defaultHours: "",
  isAssembly: false,
  parentId: "",
  serviceLines: "",
  sortOrder: "0",
  isActive: true,
};

const SERVICE_LINE_OPTIONS = [
  "Digital Transformation",
  "Cloud Services",
  "Risk Assurance",
  "Tax Advisory",
  "Audit",
  "Consulting",
];

export function ScopeCatalogAdmin() {
  const { persona } = useAuth();
  const { data: catalog } = useScopeCatalog({ includeInactive: true });
  const { data: templates } = useScopeTemplates(null);
  const createItem = useCreateScopeItem();
  const updateItem = useUpdateScopeItem();
  const deactivateItem = useDeactivateScopeItem();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [tab, setTab] = useState<"items" | "templates">("items");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const items = (catalog || []) as any[];
  const parentCodeById = useMemo(() => {
    const m = new Map<number, string>();
    items.forEach(it => m.set(it.id, it.code));
    return m;
  }, [items]);

  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))).sort(), [items]);
  const assemblies = useMemo(() => items.filter(i => i.isAssembly && i.id !== editingId), [items, editingId]);

  const filtered = items.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesActive = showInactive || item.isActive !== false;
    return matchesSearch && matchesCategory && matchesActive;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setEditorOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingId(item.id);
    setForm({
      code: item.code || "",
      name: item.name || "",
      category: item.category || "",
      description: item.description || "",
      defaultHours: item.defaultHours != null ? String(item.defaultHours) : "",
      isAssembly: !!item.isAssembly,
      parentId: item.parentId ? String(item.parentId) : "",
      serviceLines: item.serviceLines || "",
      sortOrder: item.sortOrder != null ? String(item.sortOrder) : "0",
      isActive: item.isActive !== false,
    });
    setFormError("");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
  };

  const submitForm = async () => {
    setFormError("");
    if (!form.code.trim() || !form.name.trim() || !form.category.trim()) {
      setFormError("Code, name, and category are required.");
      return;
    }
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      description: form.description.trim() || null,
      defaultHours: form.defaultHours.trim() ? form.defaultHours.trim() : null,
      isAssembly: form.isAssembly,
      parentId: form.parentId ? parseInt(form.parentId) : null,
      serviceLines: form.serviceLines.trim() || null,
      sortOrder: form.sortOrder.trim() ? parseInt(form.sortOrder) : 0,
      isActive: form.isActive,
      userName: persona?.name,
    };
    try {
      if (editingId) {
        await updateItem.mutateAsync({ id: editingId, data: payload });
      } else {
        await createItem.mutateAsync(payload);
      }
      closeEditor();
    } catch (e: any) {
      setFormError(e?.message || "Save failed");
    }
  };

  const toggleServiceLine = (line: string) => {
    const current = form.serviceLines
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const next = current.includes(line) ? current.filter(s => s !== line) : [...current, line];
    setForm({ ...form, serviceLines: next.join(", ") });
  };

  const selectedServiceLines = form.serviceLines
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const handleDeactivate = async (item: any) => {
    if (item.isActive === false) {
      await updateItem.mutateAsync({ id: item.id, data: { isActive: true, userName: persona?.name } });
      return;
    }
    if (!confirm(`Deactivate "${item.code} — ${item.name}"?\n\nIt will be hidden from new deal scoping. Existing deals that already include this item are unaffected.`)) return;
    await deactivateItem.mutateAsync({ id: item.id, userName: persona?.name });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Scope Catalog</h1>
          <p className="text-muted-foreground text-sm mt-1">Governed scope items, assemblies, and starter templates</p>
        </div>
        {tab === "items" && (
          <button onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Scope Item
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 mb-4 w-fit">
        <button onClick={() => setTab("items")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "items" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Catalog Items ({items.length})
        </button>
        <button onClick={() => setTab("templates")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "templates" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Starter Templates ({(templates || []).length})
        </button>
      </div>

      {tab === "templates" && (
        <div className="space-y-3">
          {(templates || []).map((tpl: any) => (
            <div key={tpl.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <h3 className="text-base font-semibold text-foreground">{tpl.name}</h3>
                  </div>
                  {tpl.description && <p className="text-sm text-muted-foreground mt-1">{tpl.description}</p>}
                </div>
                {tpl.serviceLine ? (
                  <span className="badge bg-secondary text-secondary-foreground">{tpl.serviceLine}</span>
                ) : (
                  <span className="badge bg-muted text-muted-foreground">Generic</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(tpl.items || []).map((it: any) => (
                  <span key={it.scope_item_id} className="text-xs px-2 py-1 bg-muted rounded font-mono">
                    {it.code} {it.is_assembly ? "·assembly" : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {(templates || []).length === 0 && (
            <div className="card p-12 text-center text-muted-foreground text-sm">No templates configured yet.</div>
          )}
        </div>
      )}

      {tab === "items" && (
        <>
          <div className="card mb-6">
            <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search scope items..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="input-field pl-9"
                />
              </div>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input-field max-w-[200px]">
                <option value="all">All categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
                Show inactive
              </label>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Code</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Category</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Service Lines</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Hours</th>
                  <th className="text-center px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item: any) => {
                  const inactive = item.isActive === false;
                  return (
                    <tr key={item.id} className={`hover:bg-muted/30 ${inactive ? "opacity-60" : ""}`}>
                      <td className="px-6 py-3 text-sm font-mono text-muted-foreground">
                        {item.code}
                        {item.parentId && (
                          <span className="block text-[10px] text-muted-foreground/70">↳ {parentCodeById.get(item.parentId) || ""}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-foreground">
                        {item.name}
                        {inactive && <span className="ml-2 badge bg-muted text-muted-foreground">inactive</span>}
                      </td>
                      <td className="px-6 py-3"><span className="badge bg-secondary text-secondary-foreground">{item.category}</span></td>
                      <td className="px-6 py-3 text-xs text-muted-foreground">
                        {item.serviceLines
                          ? item.serviceLines.split(",").map((s: string) => (
                              <span key={s} className="inline-block px-1.5 py-0.5 mr-1 mb-0.5 bg-muted rounded">{s.trim()}</span>
                            ))
                          : <span className="italic">all practices</span>}
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-medium text-foreground">
                        {item.defaultHours != null ? `${item.defaultHours} hrs` : "—"}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {item.isAssembly ? (
                          <span className="badge bg-accent text-accent-foreground inline-flex items-center gap-1"><Layers className="w-3 h-3" />Assembly</span>
                        ) : (
                          <span className="badge bg-muted text-muted-foreground"><BookOpen className="w-3 h-3" /></span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeactivate(item)}
                            className={`p-1.5 rounded transition-colors ${inactive ? "text-success hover:bg-success/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"}`}
                            title={inactive ? "Reactivate" : "Deactivate"}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-6 py-12 text-center text-muted-foreground text-sm">No scope items match your filters.</div>
            )}
          </div>
        </>
      )}

      {editorOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeEditor}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingId ? "Edit Scope Item" : "New Scope Item"}
              </h2>
              <button onClick={closeEditor} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Code <span className="text-destructive">*</span></label>
                  <input type="text" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. IMPL-005" className="input-field font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Category <span className="text-destructive">*</span></label>
                  <input type="text" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Implementation" list="categories" className="input-field" />
                  <datalist id="categories">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Name <span className="text-destructive">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Custom Reporting Setup" className="input-field" />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="input-field" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Default Hours</label>
                  <input type="number" step="0.5" min="0" value={form.defaultHours} onChange={e => setForm({ ...form, defaultHours: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Sort Order</label>
                  <input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} className="input-field" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Service Lines</label>
                <p className="text-[11px] text-muted-foreground mb-2">Leave empty for cross-cutting items that apply to all practices.</p>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_LINE_OPTIONS.map(line => {
                    const selected = selectedServiceLines.includes(line);
                    return (
                      <button
                        key={line}
                        type="button"
                        onClick={() => toggleServiceLine(line)}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1 ${selected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground"}`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                        {line}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-border rounded-lg p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isAssembly} onChange={e => setForm({ ...form, isAssembly: e.target.checked, parentId: e.target.checked ? "" : form.parentId })} className="rounded" />
                  <span className="text-sm font-medium text-foreground">This item is an assembly</span>
                  <span className="text-xs text-muted-foreground">(adding it cascades its children to the deal)</span>
                </label>

                {!form.isAssembly && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Parent Assembly (optional)</label>
                    <select value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })} className="input-field">
                      <option value="">— None (standalone item) —</option>
                      {assemblies.map(a => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">If selected, this item is auto-added when the parent assembly is added to a deal.</p>
                  </div>
                )}
              </div>

              {editingId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
                  <span className="text-sm text-foreground">Active</span>
                  <span className="text-xs text-muted-foreground">(inactive items are hidden from deal scoping)</span>
                </label>
              )}

              {formError && (
                <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">{formError}</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted/30">
              <button onClick={closeEditor} className="btn-secondary">Cancel</button>
              <button
                onClick={submitForm}
                disabled={createItem.isPending || updateItem.isPending}
                className="btn-primary inline-flex items-center gap-2"
              >
                {(createItem.isPending || updateItem.isPending) ? "Saving..." : editingId ? "Save Changes" : "Create Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
