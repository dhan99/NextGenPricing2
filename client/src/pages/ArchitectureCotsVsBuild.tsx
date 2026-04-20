import { Scale, Download, FileText, ExternalLink, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

const COTS_ALTERNATIVES = [
  { name: "Salesforce Revenue Cloud (CPQ + CLM)", offers: "Configure-Price-Quote rules engine, approval workflows, quote document generation; Einstein for forecasting and next-best-action.", reject: "Built around products and SKUs, not a 7-tier role hierarchy with complexity multipliers; service-hour assemblies and scenarios must be hand-built in CPQ rules / Apex; introduces a second CRM stack alongside Dynamics; per-user licensing scales with every contributor." },
  { name: "Conga CPQ", offers: "Standalone CPQ with quote configuration, pricing rules, approval routing; pairs with Conga CLM (already integrated for letter assembly).", reject: "Same product/SKU model bias as Salesforce CPQ; cannot natively express role-loaded service-hour pricing or Standard/Premium/Value scenario generation; vendor AI is generic." },
  { name: "Deltek Vantagepoint / Maconomy", offers: "ERP + PSA built for project-based professional-services firms: opportunity, project setup, role-based pricing, resourcing, billing, revenue recognition.", reject: "Closest single-vendor alternative, but the scoping module is template-based, not a calibrated AI engine; ERP-class implementation; firm-specific catalog and multipliers still require heavy customisation; no per-tenant ISO 42001 AIMS evidence; high lock-in." },
  { name: "Kantata (Kimble + Mavenlink)", offers: "PSA covering deal/opportunity, resource planning, project margin forecasting, time/expense, billing.", reject: "Generic across services verticals; no firm-specific role hierarchy or complexity multiplier IP; AI is vendor-owned and shared across tenants; overlaps with Workday Financials, creating a second source of truth." },
  { name: "Certinia PSA (FinancialForce)", offers: "Salesforce-native PSA: services CRM, project pricing, resource management, project accounting.", reject: "Inherits Salesforce CPQ's product-centric pricing; firm-specific role-loaded pricing built on top; AI is Einstein/Salesforce-owned; assumes Salesforce as the CRM (Armanino's CRM is Dynamics)." },
  { name: "PROS Smart CPQ", offers: "AI-driven pricing optimisation, dynamic discounting, win-probability modelling on top of CPQ.", reject: "Calibrated for high-volume transactional B2B (manufacturing, distribution, travel), not low-volume professional-services engagements; opaque vendor AI; no native scenario/RBAC/approval workflow for service-hour scoping." },
];

const BUILD_PILLARS = [
  { title: "Scoped pricing assemblies", body: "7-tier role hierarchy, complexity multipliers (0.8×–1.5×), scope catalog, automatic margin/fee/cost recalculation when scope changes. Not modelled by any product/SKU CPQ." },
  { title: "AI intelligence layer", body: "Five calibrated use cases — deal similarity, effort estimation, margin advisor, scenario recommendation, risk summary — grounded in Armanino's own historical data, not a generic vendor model." },
  { title: "Scenario engine", body: "Auto-generated Standard / Premium / Value scenarios with AI reasoning attached, side-by-side comparable. Absent from the COTS set for service-hour pricing." },
  { title: "Multi-persona RBAC + approval workflow", body: "Six personas (PDL, SLL, PO, FIN, QRM, IT) with per-feature permissions, status state-machine, AI-narrative-attached approvals, per-deal audit trail." },
  { title: "Integration backbone", body: "Provider-pattern abstraction (simulated → live by configuration) for Dynamics, Workday, Intapp, Conga, Power BI; auto-push on approval transitions; per-integration audit log." },
  { title: "ISO/IEC 42001 AIMS as a moat", body: "Owned AI Management System with per-tenant evidence (model purpose, dataset lineage, monitoring, override capture). Horizontal SaaS vendors carry a vendor-scoped AIMS, not a firm-specific one." },
];

const DECISIONS = [
  { area: "Account & opportunity CRM", decision: "Buy + Integrate", system: "Dynamics 365", kind: "buy" as const },
  { area: "Cost centers, workers, standard cost rates", decision: "Buy + Integrate", system: "Workday", kind: "buy" as const },
  { area: "Conflicts, independence, engagement acceptance", decision: "Buy + Integrate", system: "Intapp Risk", kind: "buy" as const },
  { area: "Engagement-letter document assembly & e-sign", decision: "Buy + Integrate", system: "Conga Composer / CLM", kind: "buy" as const },
  { area: "Pipeline & forecast analytics", decision: "Buy + Integrate", system: "Dynamics + Power BI", kind: "buy" as const },
  { area: "Scope-to-fee engine, role pricing, complexity multipliers", decision: "Build", system: "DealPad", kind: "build" as const },
  { area: "Scenario generation & comparison (Standard / Premium / Value)", decision: "Build", system: "DealPad", kind: "build" as const },
  { area: "AI use cases (similarity, effort, margin, scenario, risk)", decision: "Build", system: "DealPad", kind: "build" as const },
  { area: "Multi-persona RBAC & approval workflow", decision: "Build", system: "DealPad", kind: "build" as const },
  { area: "AI Management System (ISO/IEC 42001)", decision: "Build", system: "DealPad", kind: "build" as const },
  { area: "End-to-end CPQ replacement (Salesforce / Conga CPQ)", decision: "Reject", system: "—", kind: "reject" as const },
  { area: "Single-vendor PSA replacement (Deltek / Kantata / Certinia)", decision: "Reject", system: "—", kind: "reject" as const },
];

export function ArchitectureCotsVsBuild() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-2">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-white shadow-sm border border-stone-200 flex items-center justify-center flex-shrink-0">
            <Scale className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Strategy · One-pager</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Internal / Confidential</span>
            </div>
            <h2 className="text-xl font-bold text-foreground">COTS vs Build — Scoping &amp; Pricing Engine</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Why DealPad is built (not bought) for the scope-to-fee engine, while the surrounding systems (Dynamics 365, Workday, Intapp, Conga, Power BI) are <strong>Buy + Integrate</strong>. Compares six COTS replacement candidates against an ISO 42001 moat.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-shrink-0">
          <a
            href="/strategy/cots-vs-build/view"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
            data-testid="link-view-cots-onepager"
          >
            <ExternalLink className="w-4 h-4" />
            Open PDF in new tab
          </a>
          <a
            href="/strategy/cots-vs-build/download-pdf"
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-stone-200 bg-white text-foreground text-sm font-medium hover:bg-stone-50 transition-all"
            data-testid="link-download-cots-pdf"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
          <a
            href="/strategy/cots-vs-build/download-md"
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-stone-200 bg-white text-foreground text-sm font-medium hover:bg-stone-50 transition-all"
            data-testid="link-download-cots-md"
          >
            <FileText className="w-4 h-4" />
            Markdown source
          </a>
        </div>
      </div>

      {/* Three-pillar framework */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { num: "1", title: "Buy to accelerate", body: "Adopt COTS where the market has already solved a generic problem (CRM, HCM, contract assembly, financials, BI). All five are already integrated." },
          { num: "2", title: "Build to differentiate", body: "Own the scoping & pricing engine and intelligence layer that codifies Armanino's IP — role hierarchy, complexity multipliers, scope catalog, scenarios, AI calibration." },
          { num: "3", title: "ISO 42001 as a moat", body: "An owned AI Management System (AIMS) embedded in the build is materially harder for any horizontal SaaS vendor to replicate per tenant." },
        ].map((p) => (
          <div key={p.num} className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{p.num}</span>
              <h3 className="font-semibold text-foreground text-sm">{p.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>

      {/* Embedded PDF */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 bg-stone-50">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">One-pager · Embedded preview</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">If the preview is blocked by your browser, use the buttons above to open or download.</span>
        </div>
        <iframe
          src="/strategy/cots-vs-build/view"
          title="COTS vs Build one-pager"
          className="w-full"
          style={{ height: "70vh", border: "none" }}
          data-testid="iframe-cots-pdf"
        />
      </div>

      {/* COTS alternatives */}
      <div>
        <h3 className="text-base font-bold text-foreground mb-3">COTS alternatives surveyed</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {COTS_ALTERNATIVES.map((c, i) => (
            <div key={i} className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-start gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <h4 className="font-semibold text-foreground text-sm leading-snug">{c.name}</h4>
              </div>
              <div className="space-y-2.5 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">What it offers</p>
                  <p className="text-foreground leading-relaxed">{c.offers}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold mb-1">Why it doesn't replace DealPad</p>
                  <p className="text-foreground leading-relaxed">{c.reject}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Why DealPad build wins */}
      <div>
        <h3 className="text-base font-bold text-foreground mb-3">Why DealPad build wins for scope &amp; pricing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {BUILD_PILLARS.map((p, i) => (
            <div key={i} className="bg-gradient-to-br from-orange-50/40 via-white to-white border border-orange-100 rounded-xl p-4">
              <div className="flex items-start gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <h4 className="font-semibold text-foreground text-sm">{p.title}</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Decision summary table */}
      <div>
        <h3 className="text-base font-bold text-foreground mb-3">Recommendation — Buy / Build / Reject</h3>
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Capability area</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold w-44">Decision</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold w-56">System</th>
              </tr>
            </thead>
            <tbody>
              {DECISIONS.map((d, i) => (
                <tr key={i} className="border-b border-stone-100 last:border-b-0">
                  <td className="px-4 py-2.5 text-foreground">{d.area}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      d.kind === "build" ? "bg-orange-50 text-orange-700 border border-orange-200" :
                      d.kind === "buy"   ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                           "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}>
                      {d.kind === "reject" ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      {d.decision}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{d.system}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom downloads */}
      <div className="border border-stone-200 rounded-2xl bg-stone-50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Want to circulate this with executive sponsors? Download the standalone PDF or markdown source.
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/strategy/cots-vs-build/download-pdf"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </a>
          <a
            href="/strategy/cots-vs-build/download-md"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-stone-200 bg-white text-foreground text-sm font-medium hover:bg-stone-50 transition-all"
          >
            <FileText className="w-4 h-4" />
            Download Markdown
          </a>
        </div>
      </div>
    </div>
  );
}
