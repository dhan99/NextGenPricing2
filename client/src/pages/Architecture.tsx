import { Database, Server, Monitor, Brain, Layers, ArrowRight, Shield, GitBranch, Cpu, Cloud } from "lucide-react";

const layers = [
  {
    title: "Presentation Layer",
    subtitle: "React 19 + Vite + TypeScript",
    icon: Monitor,
    color: "bg-orange-500",
    items: [
      "Dashboard with KPI cards & pipeline view",
      "8-step Deal Wizard (Setup, Scope, Assumptions, Pricing, Scenarios, Review, Approval, Summary)",
      "Deals List with search, filter, table/card toggle",
      "Admin: Rate Cards & Scope Catalog management",
      "Responsive layout with Armanino brand design system",
    ],
  },
  {
    title: "API Layer",
    subtitle: "Express.js REST API",
    icon: Server,
    color: "bg-stone-700",
    items: [
      "Deal CRUD + Dashboard summary endpoints",
      "Scope catalog & deal scope items",
      "Pricing grid with live margin calculations",
      "Scenario generation & comparison",
      "Approval workflow with status tracking",
    ],
  },
  {
    title: "AI Services Layer",
    subtitle: "5 AI-Powered Use Cases",
    icon: Brain,
    color: "bg-amber-600",
    items: [
      "UC-1: Deal Similarity — matches similar past deals for benchmarking",
      "UC-2: Effort Estimation — AI-driven hours/complexity from scope prompts",
      "UC-3: Margin Advisor — real-time margin analysis with optimization tips",
      "UC-4: Scenario Recommendation — compares pricing scenarios with AI ranking",
      "UC-5: Risk Summary — one-click AI risk assessment before approval",
    ],
  },
  {
    title: "Data Layer",
    subtitle: "PostgreSQL + Drizzle ORM",
    icon: Database,
    color: "bg-emerald-700",
    items: [
      "12 normalized tables with full relational integrity",
      "Clients, Deals, Scope Catalog, Deal Scope Items",
      "Roles, Rate Cards, Rate Card Entries, Pricing Lines",
      "Scenarios, Approvals, Prompt Responses, Activity Log",
    ],
  },
];

const dddContexts = [
  { name: "Deal Context", description: "Deal lifecycle, versioning, project classification", stories: "US-01 to US-07" },
  { name: "Scope Context", description: "Scope items, assemblies, prompts, validation", stories: "US-08 to US-17" },
  { name: "Pricing Context", description: "Pricing grid, rates, margin, pricing models", stories: "US-18 to US-31" },
  { name: "Approval Context", description: "Tiered routing, delegation, fast-track", stories: "US-39 to US-45" },
  { name: "Catalog & Config", description: "Rate tables, templates, admin governance", stories: "US-54 to US-57" },
  { name: "Analytics Context", description: "Dashboards, benchmarks, reporting", stories: "US-32 to US-38" },
];

const targetArchitecture = [
  { icon: Cloud, label: "Azure Cloud-Native", detail: "APIM, Service Bus, Event Grid" },
  { icon: Cpu, label: "Azure OpenAI", detail: "Semantic Kernel + LangGraph" },
  { icon: GitBranch, label: "CI/CD", detail: "GitHub Actions + Azure DevOps" },
  { icon: Shield, label: "Security", detail: "Entra ID, RBAC, SOC 2 compliance" },
];

export function Architecture() {
  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">System Architecture</h1>
        <p className="text-muted-foreground mt-1">DealPad NextGenApp — Pricing & Scoping 2.0 technical overview</p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Application Stack</h2>
        <div className="space-y-3">
          {layers.map((layer, i) => (
            <div key={layer.title} className="card overflow-hidden">
              <div className="flex">
                <div className={`${layer.color} w-1.5 shrink-0`} />
                <div className="flex-1 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`${layer.color} w-9 h-9 rounded-lg flex items-center justify-center`}>
                      <layer.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{layer.title}</h3>
                      <p className="text-xs text-muted-foreground">{layer.subtitle}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5">
                    {layer.items.map((item) => (
                      <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {i < layers.length - 1 && (
                <div className="flex justify-center -mb-3 relative z-10">
                  <div className="w-px h-3 bg-border" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Domain-Driven Design Contexts</h2>
          <div className="space-y-2">
            {dddContexts.map((ctx) => (
              <div key={ctx.name} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">{ctx.name}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{ctx.description}</p>
                  </div>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{ctx.stories}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Target Production Architecture</h2>
          <div className="space-y-2">
            {targetArchitecture.map((item) => (
              <div key={item.label} className="card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                  <item.icon className="w-5 h-5 text-stone-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground text-sm">{item.label}</h4>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 mt-6">
            <h2 className="text-xl font-semibold text-foreground">External Integrations</h2>
            <div className="card p-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { name: "Microsoft Dynamics CRM", type: "Bi-directional" },
                  { name: "Workday", type: "Budget/Resource" },
                  { name: "Intapp", type: "Conflict/Independence" },
                  { name: "Power BI", type: "Dashboards" },
                ].map((integration) => (
                  <div key={integration.name} className="border border-border rounded-lg p-3 text-center">
                    <p className="text-sm font-medium text-foreground">{integration.name}</p>
                    <p className="text-xs text-muted-foreground">{integration.type}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-semibold text-foreground mb-3">Personas</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { role: "Project Delivery Lead", abbr: "PDL" },
            { role: "Service Line Leadership", abbr: "SLL" },
            { role: "Pricing Operations", abbr: "PO" },
            { role: "Finance / FP&A", abbr: "FIN" },
            { role: "Risk / QRM", abbr: "QRM" },
            { role: "IT / Data Consumers", abbr: "IT" },
          ].map((p) => (
            <div key={p.abbr} className="text-center border border-border rounded-lg p-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1.5">
                <span className="text-primary text-xs font-bold">{p.abbr}</span>
              </div>
              <p className="text-xs text-foreground font-medium">{p.role}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
