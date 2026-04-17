import { useState } from "react";
import { useCongaTemplates, useCongaSettings, useUpdateCongaSettings } from "@/hooks/use-api";
import { FileText, Settings, Database, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function CongaTemplatesAdmin() {
  const { data: tmplResp, isLoading } = useCongaTemplates();
  const { data: settings } = useCongaSettings();
  const update = useUpdateCongaSettings();
  const [expanded, setExpanded] = useState<number | null>(null);
  const templates: any[] = tmplResp?.templates || [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          Engagement Letter Templates
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conga Composer templates registered for engagement letter automation. Field map and clauses determine
          how DealPad data is merged into the generated PDF.
        </p>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Provider Configuration</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Mode</label>
            <select
              value={settings?.mode || "simulated"}
              onChange={(e) => update.mutate({ mode: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="simulated">Simulated (default)</option>
              <option value="live">Live (Conga Composer REST)</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Default Template Key</label>
            <input
              defaultValue={settings?.defaultTemplateKey || ""}
              onBlur={(e) => update.mutate({ defaultTemplateKey: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              placeholder="e.g. audit-fy26"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Live Base URL</label>
            <input
              defaultValue={settings?.liveBaseUrl || ""}
              onBlur={(e) => update.mutate({ liveBaseUrl: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              placeholder="https://composer.congacloud.com"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Live Tenant ID</label>
            <input
              defaultValue={settings?.liveTenantId || ""}
              onBlur={(e) => update.mutate({ liveTenantId: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-border rounded-lg text-sm"
              placeholder="armanino-prod"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Live mode is a stub. Set <code className="px-1 py-0.5 bg-muted rounded">CONGA_API_KEY</code> as an environment secret,
          configure URL + tenant above, switch mode to <strong>Live</strong>, and the same generation flow will call the real
          Conga Composer REST API. No code change required.
        </p>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Registered Templates ({templates.length})</h2>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground uppercase">
            source: {tmplResp?.source || "—"}
          </span>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No templates registered.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => {
              const isOpen = expanded === t.id;
              return (
                <div key={t.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : t.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-all text-left"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 mt-1 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 mt-1 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono">{t.key}</span> · {t.practice || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border bg-muted/20 p-4 space-y-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Field Map</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                            <thead className="bg-muted/60">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">Merge Field</th>
                                <th className="px-3 py-2 text-left font-semibold">DealPad Source</th>
                                <th className="px-3 py-2 text-left font-semibold">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(t.fieldMap) ? t.fieldMap : []).map((f: any, i: number) => (
                                <tr key={i} className={cn(i % 2 === 1 && "bg-white/40")}>
                                  <td className="px-3 py-2 font-mono">{f.field}</td>
                                  <td className="px-3 py-2 font-mono text-muted-foreground">{f.source}</td>
                                  <td className="px-3 py-2">{f.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Standard Clauses</p>
                        <div className="space-y-2">
                          {(Array.isArray(t.clauses) ? t.clauses : []).map((c: any, i: number) => (
                            <div key={i} className="p-3 bg-white border border-border rounded-lg">
                              <p className="text-xs font-bold uppercase tracking-wider text-primary">{c.heading}</p>
                              <p className="text-xs text-foreground mt-1 leading-relaxed">{c.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
