import { Database, Server, Monitor, Brain, Layers, ArrowRight, Shield, GitBranch, Cpu, Cloud } from "lucide-react";
import { useState } from "react";

function SystemDiagram() {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const nodeInfo: Record<string, { title: string; details: string[] }> = {
    browser: {
      title: "Browser / Client",
      details: ["React 19 + Vite", "Tailwind CSS", "React Query", "Wouter routing"],
    },
    api: {
      title: "Express API Server",
      details: ["REST endpoints", "CORS middleware", "Request validation", "Port 3001"],
    },
    ai: {
      title: "AI Services",
      details: ["Deal Similarity", "Effort Estimation", "Margin Advisor", "Scenario Rec.", "Risk Summary"],
    },
    db: {
      title: "PostgreSQL Database",
      details: ["12 tables", "Drizzle ORM", "Relational queries", "Seeded data"],
    },
    crm: {
      title: "Dynamics CRM",
      details: ["Client sync", "Deal pipeline", "Bi-directional"],
    },
    workday: {
      title: "Workday",
      details: ["Budget data", "Resource planning"],
    },
    intapp: {
      title: "Intapp",
      details: ["Conflict checks", "Independence"],
    },
    powerbi: {
      title: "Power BI",
      details: ["Dashboards", "Analytics", "Reporting"],
    },
    azure: {
      title: "Azure Cloud",
      details: ["APIM Gateway", "Service Bus", "Event Grid", "Entra ID"],
    },
  };

  const boxStyle = (id: string, fill: string) => ({
    fill: hoveredNode === id ? fill : fill,
    opacity: hoveredNode && hoveredNode !== id ? 0.4 : 1,
    cursor: "pointer",
    transition: "all 0.2s ease",
  });

  const textStyle = (id: string) => ({
    opacity: hoveredNode && hoveredNode !== id ? 0.4 : 1,
    transition: "opacity 0.2s ease",
  });

  const lineStyle = (ids: string[]) => ({
    opacity: hoveredNode && !ids.includes(hoveredNode) ? 0.15 : 1,
    transition: "opacity 0.2s ease",
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">System Diagram</h2>
      <div className="card p-6 overflow-x-auto">
        <div className="flex gap-6 items-start">
          <svg viewBox="0 0 900 520" className="w-full min-w-[700px]" style={{ maxWidth: 900 }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <polygon points="0 0, 10 3.5, 0 7" fill="#a8a29e" />
              </marker>
              <marker id="arrow-orange" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <polygon points="0 0, 10 3.5, 0 7" fill="#DA720F" />
              </marker>
              <filter id="shadow" x="-4%" y="-4%" width="108%" height="116%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
              </filter>
            </defs>

            <rect x="20" y="10" width="860" height="500" rx="16" fill="#fafaf9" stroke="#e7e5e4" strokeWidth="1" />
            <text x="40" y="38" fontSize="11" fill="#a8a29e" fontWeight="500" letterSpacing="1.5">DEALPAD SYSTEM ARCHITECTURE</text>

            <rect x="310" y="55" width="280" height="64" rx="12" filter="url(#shadow)"
              {...boxStyle("browser", "#fff")} stroke={hoveredNode === "browser" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "browser" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("browser")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="450" y="82" textAnchor="middle" fontSize="13" fontWeight="600" fill="#1c1917" {...textStyle("browser")}>Browser / Client</text>
            <text x="450" y="100" textAnchor="middle" fontSize="10" fill="#78716c" {...textStyle("browser")}>React 19 + Vite + Tailwind + React Query</text>

            <line x1="450" y1="119" x2="450" y2="160" stroke="#DA720F" strokeWidth="2" markerEnd="url(#arrow-orange)" {...lineStyle(["browser", "api"])} />
            <text x="462" y="143" fontSize="9" fill="#DA720F" {...lineStyle(["browser", "api"])}>REST / JSON</text>

            <rect x="260" y="165" width="380" height="70" rx="12" filter="url(#shadow)"
              {...boxStyle("api", "#292524")} stroke={hoveredNode === "api" ? "#DA720F" : "#44403c"} strokeWidth={hoveredNode === "api" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("api")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="450" y="195" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fafaf9" {...textStyle("api")}>Express.js API Layer</text>
            <text x="450" y="215" textAnchor="middle" fontSize="10" fill="#a8a29e" {...textStyle("api")}>Deals | Scope | Pricing | Scenarios | Approvals | Dashboard</text>

            <line x1="360" y1="235" x2="250" y2="290" stroke="#a8a29e" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrow)" {...lineStyle(["api", "ai"])} />
            <line x1="450" y1="235" x2="450" y2="310" stroke="#a8a29e" strokeWidth="1.5" markerEnd="url(#arrow)" {...lineStyle(["api", "db"])} />

            <rect x="60" y="280" width="260" height="100" rx="12" filter="url(#shadow)"
              {...boxStyle("ai", "#fff7ed")} stroke={hoveredNode === "ai" ? "#DA720F" : "#fed7aa"} strokeWidth={hoveredNode === "ai" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("ai")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="190" y="306" textAnchor="middle" fontSize="13" fontWeight="600" fill="#9a3412" {...textStyle("ai")}>AI Services Layer</text>
            <text x="190" y="325" textAnchor="middle" fontSize="9" fill="#c2410c" {...textStyle("ai")}>UC-1: Deal Similarity</text>
            <text x="190" y="339" textAnchor="middle" fontSize="9" fill="#c2410c" {...textStyle("ai")}>UC-2: Effort Estimation | UC-3: Margin Advisor</text>
            <text x="190" y="353" textAnchor="middle" fontSize="9" fill="#c2410c" {...textStyle("ai")}>UC-4: Scenario Rec. | UC-5: Risk Summary</text>
            <text x="190" y="370" textAnchor="middle" fontSize="8" fill="#ea580c" fontWeight="500" {...textStyle("ai")}>Target: Azure OpenAI + Semantic Kernel</text>

            <rect x="350" y="315" width="200" height="64" rx="12" filter="url(#shadow)"
              {...boxStyle("db", "#ecfdf5")} stroke={hoveredNode === "db" ? "#DA720F" : "#a7f3d0"} strokeWidth={hoveredNode === "db" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("db")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="450" y="343" textAnchor="middle" fontSize="13" fontWeight="600" fill="#065f46" {...textStyle("db")}>PostgreSQL</text>
            <text x="450" y="361" textAnchor="middle" fontSize="10" fill="#047857" {...textStyle("db")}>12 Tables | Drizzle ORM</text>

            <line x1="640" y1="200" x2="700" y2="200" stroke="#a8a29e" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrow)" {...lineStyle(["api", "crm", "workday", "intapp", "powerbi"])} />

            <rect x="705" y="60" width="155" height="44" rx="8" filter="url(#shadow)"
              {...boxStyle("crm", "#fff")} stroke={hoveredNode === "crm" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "crm" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("crm")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="80" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917" {...textStyle("crm")}>Dynamics CRM</text>
            <text x="782" y="94" textAnchor="middle" fontSize="8" fill="#78716c" {...textStyle("crm")}>Bi-directional sync</text>

            <rect x="705" y="115" width="155" height="44" rx="8" filter="url(#shadow)"
              {...boxStyle("workday", "#fff")} stroke={hoveredNode === "workday" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "workday" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("workday")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="135" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917" {...textStyle("workday")}>Workday</text>
            <text x="782" y="149" textAnchor="middle" fontSize="8" fill="#78716c" {...textStyle("workday")}>Budget / Resource</text>

            <rect x="705" y="170" width="155" height="44" rx="8" filter="url(#shadow)"
              {...boxStyle("intapp", "#fff")} stroke={hoveredNode === "intapp" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "intapp" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("intapp")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="190" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917" {...textStyle("intapp")}>Intapp</text>
            <text x="782" y="204" textAnchor="middle" fontSize="8" fill="#78716c" {...textStyle("intapp")}>Conflict / Independence</text>

            <rect x="705" y="225" width="155" height="44" rx="8" filter="url(#shadow)"
              {...boxStyle("powerbi", "#fff")} stroke={hoveredNode === "powerbi" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "powerbi" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("powerbi")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="245" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917" {...textStyle("powerbi")}>Power BI</text>
            <text x="782" y="259" textAnchor="middle" fontSize="8" fill="#78716c" {...textStyle("powerbi")}>Dashboards / Analytics</text>

            <line x1="700" y1="200" x2="700" y2="82" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["crm"])} />
            <line x1="700" y1="82" x2="705" y2="82" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["crm"])} />
            <line x1="700" y1="137" x2="705" y2="137" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["workday"])} />
            <line x1="700" y1="192" x2="705" y2="192" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["intapp"])} />
            <line x1="700" y1="247" x2="705" y2="247" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["powerbi"])} />

            <rect x="600" y="400" width="260" height="90" rx="12" filter="url(#shadow)"
              {...boxStyle("azure", "#eff6ff")} stroke={hoveredNode === "azure" ? "#DA720F" : "#bfdbfe"} strokeWidth={hoveredNode === "azure" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("azure")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="730" y="427" textAnchor="middle" fontSize="13" fontWeight="600" fill="#1e3a5f" {...textStyle("azure")}>Azure Cloud (Target)</text>
            <text x="730" y="446" textAnchor="middle" fontSize="9" fill="#2563eb" {...textStyle("azure")}>APIM Gateway | Service Bus | Event Grid</text>
            <text x="730" y="462" textAnchor="middle" fontSize="9" fill="#2563eb" {...textStyle("azure")}>Entra ID (SSO) | RBAC | Key Vault</text>
            <text x="730" y="478" textAnchor="middle" fontSize="9" fill="#2563eb" {...textStyle("azure")}>Container Apps | Azure Functions</text>

            <line x1="550" y1="379" x2="600" y2="420" stroke="#a8a29e" strokeWidth="1" strokeDasharray="4 3" {...lineStyle(["db", "azure"])} />
            <line x1="320" y1="380" x2="600" y2="440" stroke="#a8a29e" strokeWidth="1" strokeDasharray="4 3" {...lineStyle(["ai", "azure"])} />

            <text x="60" y="470" fontSize="9" fill="#a8a29e">
              <tspan fontWeight="600">Legend:</tspan>
            </text>
            <line x1="60" y1="485" x2="90" y2="485" stroke="#DA720F" strokeWidth="2" />
            <text x="95" y="489" fontSize="9" fill="#78716c">Live data flow</text>
            <line x1="160" y1="485" x2="190" y2="485" stroke="#a8a29e" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x="195" y="489" fontSize="9" fill="#78716c">Service connection</text>
            <rect x="280" y="479" width="12" height="12" rx="2" fill="#fff7ed" stroke="#fed7aa" strokeWidth="1" />
            <text x="298" y="489" fontSize="9" fill="#78716c">AI layer</text>
            <rect x="350" y="479" width="12" height="12" rx="2" fill="#ecfdf5" stroke="#a7f3d0" strokeWidth="1" />
            <text x="368" y="489" fontSize="9" fill="#78716c">Data layer</text>
          </svg>

          {hoveredNode && nodeInfo[hoveredNode] && (
            <div className="w-56 shrink-0 card p-4 animate-in fade-in duration-200">
              <h4 className="font-semibold text-foreground text-sm mb-2">{nodeInfo[hoveredNode].title}</h4>
              <ul className="space-y-1">
                {nodeInfo[hoveredNode].details.map((d) => (
                  <li key={d} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

      <SystemDiagram />

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
