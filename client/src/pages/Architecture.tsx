import { Database, Server, Monitor, Brain, Layers, ArrowRight, Shield, GitBranch, Cpu, Cloud, Lock, Unlock, Check, X, Search, Clock, TrendingUp, BarChart3, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { PERSONAS, type PersonaRole } from "@/context/AuthContext";
import { useAuth } from "@/context/AuthContext";

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
      details: ["37 tables", "Drizzle ORM", "seedAll() bootstrap", "Advisory-locked, idempotent"],
    },
    crm: {
      title: "Dynamics 365 CRM",
      details: ["Client / opportunity sync", "Outcome push on approval", "Bi-directional"],
    },
    workday: {
      title: "Workday",
      details: ["Cost-center & worker pull", "Project push on approval", "Atomic committed-budget reserve"],
    },
    intapp: {
      title: "Intapp (Intake + Screening)",
      details: [
        "Intake — federated onboarding workflow",
        "  · AI extraction from RFP / engagement notes",
        "  · Federated reviewer matrix (GC, Ethics, AML, Independence, Jurisdictional, Pricing)",
        "  · Final accept gate joins the parallel tracks",
        "Screening — conflict / independence / PEP / sanctions",
        "  · 5s status pill polled in deal header",
        "  · Mitigation lifecycle (open / resolved / waived / rejected)",
        "Outbound pushes (non-blocking)",
        "  · Outcome push fires on deal approval / rejection",
        "  · Mitigation push fires on each resolve / waive / reject event",
      ],
    },
    conga: {
      title: "Conga CLM",
      details: ["Engagement-letter generation", "Delivery push (email / e-sign / portal)", "Bi-directional"],
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
            <text x="450" y="361" textAnchor="middle" fontSize="10" fill="#047857" {...textStyle("db")}>37 Tables | Drizzle ORM | seedAll bootstrap</text>

            <line x1="640" y1="200" x2="700" y2="200" stroke="#DA720F" strokeWidth="1.5" markerEnd="url(#arrow-orange)" markerStart="url(#arrow-orange)" {...lineStyle(["api", "crm", "workday", "intapp", "conga"])} />
            <text x="648" y="192" fontSize="8" fill="#DA720F" fontWeight="500" {...lineStyle(["api", "crm", "workday", "intapp", "conga"])}>Bi-directional</text>

            <rect x="705" y="60" width="155" height="44" rx="8" filter="url(#shadow)"
              {...boxStyle("crm", "#fff")} stroke={hoveredNode === "crm" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "crm" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("crm")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="80" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917" {...textStyle("crm")}>Dynamics 365</text>
            <text x="782" y="94" textAnchor="middle" fontSize="8" fill="#78716c" {...textStyle("crm")}>Pull + outcome push</text>

            <rect x="705" y="115" width="155" height="44" rx="8" filter="url(#shadow)"
              {...boxStyle("workday", "#fff")} stroke={hoveredNode === "workday" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "workday" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("workday")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="135" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917" {...textStyle("workday")}>Workday</text>
            <text x="782" y="149" textAnchor="middle" fontSize="8" fill="#78716c" {...textStyle("workday")}>Pull + project push</text>

            <rect x="705" y="170" width="155" height="68" rx="8" filter="url(#shadow)"
              {...boxStyle("intapp", "#faf5ff")} stroke={hoveredNode === "intapp" ? "#DA720F" : "#e9d5ff"} strokeWidth={hoveredNode === "intapp" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("intapp")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="187" textAnchor="middle" fontSize="11" fontWeight="600" fill="#5b21b6" {...textStyle("intapp")}>Intapp</text>
            <line x1="717" y1="195" x2="847" y2="195" stroke="#e9d5ff" strokeWidth="0.75" {...textStyle("intapp")} />
            <text x="782" y="209" textAnchor="middle" fontSize="8" fill="#6d28d9" {...textStyle("intapp")}>Intake — federated onboarding</text>
            <text x="782" y="221" textAnchor="middle" fontSize="8" fill="#6d28d9" {...textStyle("intapp")}>Screening — conflict / independence</text>
            <text x="782" y="232" textAnchor="middle" fontSize="7.5" fill="#7c3aed" fontWeight="500" {...textStyle("intapp")}>Outcome + mitigation push</text>

            <rect x="705" y="248" width="155" height="44" rx="8" filter="url(#shadow)"
              {...boxStyle("conga", "#fff")} stroke={hoveredNode === "conga" ? "#DA720F" : "#e7e5e4"} strokeWidth={hoveredNode === "conga" ? 2 : 1}
              onMouseEnter={() => setHoveredNode("conga")} onMouseLeave={() => setHoveredNode(null)} />
            <text x="782" y="268" textAnchor="middle" fontSize="11" fontWeight="500" fill="#1c1917" {...textStyle("conga")}>Conga CLM</text>
            <text x="782" y="282" textAnchor="middle" fontSize="8" fill="#78716c" {...textStyle("conga")}>Generate + deliver push</text>

            <line x1="700" y1="82" x2="700" y2="270" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["crm", "workday", "intapp", "conga"])} />
            <line x1="700" y1="82" x2="705" y2="82" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["crm"])} />
            <line x1="700" y1="137" x2="705" y2="137" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["workday"])} />
            <line x1="700" y1="204" x2="705" y2="204" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["intapp"])} />
            <line x1="700" y1="270" x2="705" y2="270" stroke="#a8a29e" strokeWidth="1" strokeDasharray="3 3" {...lineStyle(["conga"])} />

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
      "37 normalized tables with full relational integrity",
      "Core: Clients, Deals, Scope, Pricing, Scenarios, Approvals, Activity Log",
      "Integration: Dynamics, Workday (cost centers, validations, events), Intapp (screenings, mitigations), Conga (templates, letters)",
      "seedAll() bootstrap runs before HTTP listen — pg advisory lock + per-record idempotency for safe horizontal scale-out",
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

      <AIAgentsSection />

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
                  { name: "Microsoft Dynamics 365", type: "Bi-directional (auto-push on approval)" },
                  { name: "Workday", type: "Bi-directional (project + budget reserve)" },
                  { name: "Intapp (Intake + Screening)", type: "Bi-directional (federated intake + screening + outcome push)" },
                  { name: "Conga CLM", type: "Bi-directional (letter + delivery)" },
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

      <PersonasSection />
    </div>
  );
}

const aiAgents = [
  {
    id: "UC-1",
    name: "Deal Similarity",
    icon: Search,
    color: "bg-blue-600",
    lightBg: "bg-blue-50",
    lightText: "text-blue-700",
    endpoint: "/api/ai/deal-similarity",
    description: "Finds historically similar deals based on service line, complexity, deal size, and industry. Helps the PDL benchmark new engagements against past performance.",
    inputs: ["Deal title, service line, complexity level", "Client industry and segment", "Estimated deal value range"],
    outputs: ["Top 3-5 matched deals with similarity scores", "Key metrics comparison (fee, margin, hours)", "Outcome indicators (won/lost, actual vs. estimated)"],
    consumers: ["pdl"] as PersonaRole[],
    status: "Simulation" as const,
  },
  {
    id: "UC-2",
    name: "Effort Estimation",
    icon: Clock,
    color: "bg-amber-600",
    lightBg: "bg-amber-50",
    lightText: "text-amber-700",
    endpoint: "/api/ai/effort-estimation",
    description: "Analyzes scope items and generates recommended hours by role, using patterns from comparable deals and complexity-adjusted baselines.",
    inputs: ["Selected scope items and quantities", "Deal complexity rating", "Service line and business unit"],
    outputs: ["Estimated hours per role (Partner, Manager, Senior, Staff)", "Confidence level for each estimate", "Baseline comparison against similar scopes"],
    consumers: ["pdl"] as PersonaRole[],
    status: "Simulation" as const,
  },
  {
    id: "UC-3",
    name: "Margin Advisor",
    icon: TrendingUp,
    color: "bg-emerald-600",
    lightBg: "bg-emerald-50",
    lightText: "text-emerald-700",
    endpoint: "/api/ai/margin-advisor",
    description: "Reviews the current pricing and cost structure, then flags margin risks and suggests adjustments to hit target profitability thresholds.",
    inputs: ["Current pricing grid (hours x rates)", "Cost structure and blended rates", "Target margin thresholds by service line"],
    outputs: ["Current vs. target margin analysis", "Specific adjustment recommendations", "Impact simulation of suggested changes"],
    consumers: ["pdl", "sll", "po", "fin"] as PersonaRole[],
    status: "Simulation" as const,
  },
  {
    id: "UC-4",
    name: "Scenario Recommendation",
    icon: BarChart3,
    color: "bg-violet-600",
    lightBg: "bg-violet-50",
    lightText: "text-violet-700",
    endpoint: "/api/ai/scenario-recommendation",
    description: "Generates multiple pricing scenarios (conservative, standard, aggressive) so teams can compare trade-offs in fee, margin, and win probability side by side.",
    inputs: ["Base pricing configuration", "Deal parameters and constraints", "Historical win-rate data by price point"],
    outputs: ["3 ranked pricing scenarios with trade-off analysis", "Win probability estimate per scenario", "Margin and revenue impact comparison"],
    consumers: ["pdl", "fin"] as PersonaRole[],
    status: "Simulation" as const,
  },
  {
    id: "UC-5",
    name: "Risk Summary",
    icon: AlertTriangle,
    color: "bg-red-600",
    lightBg: "bg-red-50",
    lightText: "text-red-700",
    endpoint: "/api/ai/risk-summary",
    description: "Produces an overall risk assessment covering pricing risk, scope creep potential, client history, and compliance flags. Used as a pre-approval checkpoint.",
    inputs: ["Complete deal configuration", "Client relationship history", "Scope complexity and assumptions"],
    outputs: ["Overall risk score (1-10 scale)", "Risk breakdown by category (pricing, scope, client, compliance)", "Specific risk flags with mitigation recommendations"],
    consumers: ["pdl", "sll", "qrm"] as PersonaRole[],
    status: "Simulation" as const,
  },
];

function AIAgentsSection() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">AI Agents</h2>
        <p className="text-sm text-muted-foreground mt-1">
          5 AI-powered agents that augment decision-making across the deal lifecycle. Currently running as simulation endpoints; target production uses Azure OpenAI + Semantic Kernel.
        </p>
      </div>

      <div className="space-y-3">
        {aiAgents.map((agent) => {
          const isExpanded = expandedAgent === agent.id;
          return (
            <div
              key={agent.id}
              className={`card overflow-hidden border transition-all ${isExpanded ? "border-stone-300 shadow-md" : "border-border hover:border-stone-300"}`}
            >
              <button
                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                className="w-full flex items-center gap-4 p-5 text-left focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
              >
                <div className={`w-11 h-11 rounded-xl ${agent.color} flex items-center justify-center shrink-0`}>
                  <agent.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">{agent.id}</span>
                    <h3 className="font-semibold text-foreground">{agent.name}</h3>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${agent.lightBg} ${agent.lightText}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{agent.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex -space-x-1.5">
                    {agent.consumers.map((role) => (
                      <div
                        key={role}
                        className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center border-2 border-white"
                        title={PERSONAS[role].name}
                      >
                        <span className="text-[8px] font-bold text-stone-600">{PERSONAS[role].initials}</span>
                      </div>
                    ))}
                  </div>
                  <svg className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </div>
              </button>

              <div className={`grid transition-all duration-200 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-0 border-t border-border">
                    <p className="text-sm text-muted-foreground leading-relaxed mt-4 mb-5">{agent.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Inputs</p>
                        <div className="space-y-1.5">
                          {agent.inputs.map((input) => (
                            <div key={input} className="flex items-start gap-2 text-sm text-foreground">
                              <ArrowRight className="w-3 h-3 mt-1 shrink-0 text-primary" />
                              <span>{input}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Outputs</p>
                        <div className="space-y-1.5">
                          {agent.outputs.map((output) => (
                            <div key={output} className="flex items-start gap-2 text-sm text-foreground">
                              <ArrowRight className="w-3 h-3 mt-1 shrink-0 text-emerald-600" />
                              <span>{output}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Consumers</p>
                        <div className="space-y-2">
                          {agent.consumers.map((role) => (
                            <div key={role} className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-stone-600">{PERSONAS[role].initials}</span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">{PERSONAS[role].name}</p>
                                <p className="text-[11px] text-muted-foreground">{PERSONAS[role].fullTitle}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Endpoint</p>
                          <code className="text-xs font-mono bg-stone-100 text-stone-700 px-2 py-1 rounded">{agent.endpoint}</code>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const personaUseCases: Record<PersonaRole, { useCases: string[]; keyActions: string[] }> = {
  pdl: {
    useCases: [
      "UC-1: Deal Similarity - benchmark new deals against historical data",
      "UC-2: Effort Estimation - AI-driven hours from scope & complexity prompts",
      "UC-3: Margin Advisor - optimize pricing with real-time margin guidance",
      "UC-4: Scenario Recommendation - compare pricing alternatives with AI ranking",
      "UC-5: Risk Summary - review AI risk assessment before submission",
    ],
    keyActions: [
      "Create and manage deals end-to-end",
      "Build scope using catalog items",
      "Set pricing grid hours and rates",
      "Generate and compare scenarios",
      "Submit deals for approval",
    ],
  },
  sll: {
    useCases: [
      "UC-3: Margin Advisor - validate margin meets practice targets",
      "UC-5: Risk Summary - review risk before approving deals",
    ],
    keyActions: [
      "Review pipeline and KPI dashboard",
      "Approve or reject submitted deals",
      "View pricing and margin details (read-only)",
      "Review AI risk assessments",
    ],
  },
  po: {
    useCases: [
      "UC-3: Margin Advisor - validate pricing standards compliance",
    ],
    keyActions: [
      "Manage rate cards and rate entries",
      "Maintain scope catalog items",
      "Review deal pricing for governance",
      "Enforce pricing templates and standards",
    ],
  },
  fin: {
    useCases: [
      "UC-3: Margin Advisor - validate financial viability of deals",
      "UC-4: Scenario Recommendation - review scenario financial impact",
    ],
    keyActions: [
      "Review deal margins and financial metrics",
      "Analyze scenario comparisons",
      "Monitor pipeline financial health",
      "Validate pricing against budgets",
    ],
  },
  qrm: {
    useCases: [
      "UC-5: Risk Summary - primary consumer of AI risk assessments",
    ],
    keyActions: [
      "Review AI-generated risk summaries",
      "Audit deal activity logs",
      "Monitor compliance across deals",
      "Flag high-risk engagements",
    ],
  },
  it: {
    useCases: [],
    keyActions: [
      "View system architecture and design",
      "Monitor integration health",
      "Review technical documentation",
      "Access dashboard for system metrics",
    ],
  },
};

const personaColors: Record<PersonaRole, { border: string; bg: string; badge: string }> = {
  pdl: { border: "border-orange-300", bg: "bg-orange-50", badge: "bg-orange-500" },
  sll: { border: "border-blue-300", bg: "bg-blue-50", badge: "bg-blue-500" },
  po: { border: "border-emerald-300", bg: "bg-emerald-50", badge: "bg-emerald-500" },
  fin: { border: "border-violet-300", bg: "bg-violet-50", badge: "bg-violet-500" },
  qrm: { border: "border-red-300", bg: "bg-red-50", badge: "bg-red-500" },
  it: { border: "border-stone-300", bg: "bg-stone-50", badge: "bg-stone-500" },
};

const permissionGroups = [
  { label: "Create Deals", key: "createDeals" as const },
  { label: "Edit Deals", key: "editDeals" as const },
  { label: "View Deals", key: "viewDeals" as const },
  { label: "Approve Deals", key: "approveDeals" as const },
  { label: "Edit Pricing", key: "editPricing" as const },
  { label: "Manage Rate Cards", key: "manageRateCards" as const },
  { label: "Manage Scope Catalog", key: "manageScopeCatalog" as const },
  { label: "View Margins", key: "viewMargins" as const },
  { label: "View Risk Summary", key: "viewRiskSummary" as const },
  { label: "Run AI Tools", key: "runAI" as const },
];

function PersonasSection() {
  const { persona: currentPersona } = useAuth();
  const [expandedRole, setExpandedRole] = useState<PersonaRole | null>(null);
  const roles = Object.keys(PERSONAS) as PersonaRole[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Personas & Role-Based Access</h2>
        <p className="text-sm text-muted-foreground mt-1">Each persona has specific permissions and AI use case access reflecting their responsibilities in the deal lifecycle.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold text-foreground">Permission</th>
              {roles.map((role) => (
                <th key={role} className="text-center py-3 px-2 font-semibold text-foreground">
                  <div className={`w-7 h-7 rounded-full ${personaColors[role].badge} flex items-center justify-center mx-auto mb-1`}>
                    <span className="text-white text-[10px] font-bold">{PERSONAS[role].initials}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider">{role}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissionGroups.map(({ label, key }) => (
              <tr key={key} className="border-b border-border/50 hover:bg-muted/30">
                <td className="py-2.5 px-4 text-muted-foreground">{label}</td>
                {roles.map((role) => (
                  <td key={role} className="text-center py-2.5 px-2">
                    {PERSONAS[role].permissions[key] ? (
                      <Check className="w-4 h-4 text-green-600 mx-auto" />
                    ) : (
                      <X className="w-4 h-4 text-stone-300 mx-auto" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map((role) => {
          const p = PERSONAS[role];
          const uc = personaUseCases[role];
          const colors = personaColors[role];
          const isCurrentUser = currentPersona?.role === role;
          const isExpanded = expandedRole === role;

          return (
            <div
              key={role}
              className={`card border-2 ${isCurrentUser ? "border-primary ring-2 ring-primary/20" : colors.border} overflow-hidden cursor-pointer transition-all hover:shadow-md`}
              onClick={() => setExpandedRole(isExpanded ? null : role)}
            >
              <div className={`${colors.bg} p-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${colors.badge} flex items-center justify-center`}>
                      <span className="text-white text-sm font-bold">{p.initials}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.fullTitle}</p>
                    </div>
                  </div>
                  {isCurrentUser && (
                    <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded-full font-medium">You</span>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>

                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Key Actions</p>
                  <div className="space-y-1">
                    {uc.keyActions.slice(0, isExpanded ? undefined : 3).map((action) => (
                      <div key={action} className="flex items-start gap-1.5 text-xs text-foreground">
                        <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                        <span>{action}</span>
                      </div>
                    ))}
                    {!isExpanded && uc.keyActions.length > 3 && (
                      <p className="text-[10px] text-primary font-medium">+{uc.keyActions.length - 3} more...</p>
                    )}
                  </div>
                </div>

                {isExpanded && uc.useCases.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">AI Use Cases</p>
                    <div className="space-y-1">
                      {uc.useCases.map((useCase) => (
                        <div key={useCase} className="flex items-start gap-1.5 text-xs text-foreground">
                          <Brain className="w-3 h-3 mt-0.5 shrink-0 text-amber-600" />
                          <span>{useCase}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isExpanded && uc.useCases.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">No direct AI use case access in this role.</div>
                )}

                {isExpanded && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Permissions</p>
                    <div className="flex flex-wrap gap-1">
                      {permissionGroups.map(({ label, key }) => (
                        <span
                          key={key}
                          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                            p.permissions[key]
                              ? "bg-green-100 text-green-800"
                              : "bg-stone-100 text-stone-400 line-through"
                          }`}
                        >
                          {p.permissions[key] ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
