import { useScopeCatalog, useScopeTemplates } from "@/hooks/use-api";
import { useState } from "react";
import { Search, BookOpen, Layers, Package } from "lucide-react";

export function ScopeCatalogAdmin() {
  const { data: catalog } = useScopeCatalog();
  const { data: templates } = useScopeTemplates(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tab, setTab] = useState<"items" | "templates">("items");

  const parentCodeById = new Map<number, string>();
  for (const it of (catalog || []) as any[]) {
    parentCodeById.set(it.id, it.code);
  }

  const categories = [...new Set((catalog || []).map((item: any) => item.category))];

  const filtered = (catalog || []).filter((item: any) => {
    const matchesSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Scope Catalog</h1>
        <p className="text-muted-foreground text-sm mt-1">Governed scope items, assemblies, and starter templates</p>
      </div>

      <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 mb-4 w-fit">
        <button onClick={() => setTab("items")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "items" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Catalog Items ({(catalog || []).length})
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

      {tab === "items" && (<>
      <div className="card mb-6">
        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search scope items..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <button onClick={() => setCategoryFilter("all")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${categoryFilter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              All
            </button>
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${categoryFilter === cat ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {cat}
              </button>
            ))}
          </div>
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
              <th className="text-right px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Default Hours</th>
              <th className="text-center px-6 py-3 text-xs font-semibold text-muted-foreground uppercase">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((item: any) => (
              <tr key={item.id} className="hover:bg-muted/30">
                <td className="px-6 py-3 text-sm font-mono text-muted-foreground">
                  {item.code}
                  {item.parentId && <span className="block text-[10px] text-muted-foreground/70">↳ {parentCodeById.get(item.parentId) || ""}</span>}
                </td>
                <td className="px-6 py-3 text-sm font-medium text-foreground">{item.name}</td>
                <td className="px-6 py-3"><span className="badge bg-secondary text-secondary-foreground">{item.category}</span></td>
                <td className="px-6 py-3 text-xs text-muted-foreground">
                  {item.serviceLines
                    ? item.serviceLines.split(",").map((s: string) => <span key={s} className="inline-block px-1.5 py-0.5 mr-1 mb-0.5 bg-muted rounded">{s.trim()}</span>)
                    : <span className="italic">all practices</span>}
                </td>
                <td className="px-6 py-3 text-right text-sm font-medium text-foreground">{item.defaultHours} hrs</td>
                <td className="px-6 py-3 text-center">
                  {item.isAssembly ? (
                    <span className="badge bg-accent text-accent-foreground inline-flex items-center gap-1"><Layers className="w-3 h-3" />Assembly</span>
                  ) : (
                    <span className="badge bg-muted text-muted-foreground"><BookOpen className="w-3 h-3" /></span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-muted-foreground text-sm">No scope items match your search.</div>
        )}
      </div>
      </>)}
    </div>
  );
}
