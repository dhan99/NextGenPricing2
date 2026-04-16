import { useState } from "react";
import { Monitor, Server, Brain, Database, Cloud, BarChart3, Users, Shield, Zap, ArrowRight, X, Cpu, GitBranch, Layers } from "lucide-react";

interface NodeData {
  id: string;
  title: string;
  subtitle: string;
  category: "frontend" | "backend" | "ai" | "data" | "integration" | "cloud";
  description: string;
  details: string[];
  technologies: string[];
  connections: string[];
}

const nodes: NodeData[] = [
  {
    id: "browser",
    title: "Browser / Client",
    subtitle: "Presentation Layer",
    category: "frontend",
    description: "The user-facing layer built with React 19 and Vite. Handles all UI rendering, client-side state management, and API communication. Styled with Tailwind CSS using the Armanino brand design system.",
    details: [
      "8-step Deal Wizard with progress tracking",
      "Dashboard with KPI cards and pipeline view",
      "Role-based UI element visibility (6 personas)",
      "React Query for server state + caching",
      "Wouter for lightweight client-side routing",
    ],
    technologies: ["React 19", "Vite", "TypeScript", "Tailwind CSS", "React Query", "Wouter"],
    connections: ["api"],
  },
  {
    id: "api",
    title: "Express.js API",
    subtitle: "Application Layer",
    category: "backend",
    description: "RESTful API server handling all business logic, data validation, and orchestration. Serves as the gateway between the frontend and all backend services including AI, database, and external integrations.",
    details: [
      "Deal CRUD + Dashboard summary endpoints",
      "Scope catalog and deal scope item management",
      "Pricing grid with live margin calculations",
      "Scenario generation and comparison engine",
      "Approval workflow with status transitions",
      "Clone/Renewal deal endpoints",
    ],
    technologies: ["Express.js", "TypeScript", "Drizzle ORM", "CORS", "JSON"],
    connections: ["ai", "db", "crm", "workday", "intapp", "powerbi"],
  },
  {
    id: "ai",
    title: "AI Services Layer",
    subtitle: "5 AI-Powered Agents",
    category: "ai",
    description: "Suite of AI agents that augment human decision-making across the deal lifecycle. Currently running as simulation endpoints; target production deployment uses Azure OpenAI with Semantic Kernel orchestration.",
    details: [
      "UC-1: Deal Similarity - benchmark against historical deals",
      "UC-2: Effort Estimation - AI-driven hours by role",
      "UC-3: Margin Advisor - optimize pricing for target margins",
      "UC-4: Scenario Recommendation - compare pricing alternatives",
      "UC-5: Risk Summary - pre-approval risk assessment",
    ],
    technologies: ["Simulation (PoC)", "Target: Azure OpenAI", "Semantic Kernel", "LangGraph"],
    connections: ["azure"],
  },
  {
    id: "db",
    title: "PostgreSQL Database",
    subtitle: "Data Persistence Layer",
    category: "data",
    description: "Relational database storing all deal lifecycle data with full referential integrity. Managed through Drizzle ORM with type-safe queries and automatic schema synchronization.",
    details: [
      "Clients, Deals, Scope Catalog, Deal Scope Items",
      "Roles, Rate Cards, Rate Card Entries",
      "Pricing Lines, Scenarios, Approvals",
      "Prompt Responses, Activity Log",
      "12 normalized tables with seeded sample data",
    ],
    technologies: ["PostgreSQL", "Drizzle ORM", "SQL", "Relational Queries"],
    connections: ["azure"],
  },
  {
    id: "crm",
    title: "Dynamics CRM",
    subtitle: "Client & Pipeline",
    category: "integration",
    description: "Bi-directional integration with Microsoft Dynamics CRM for client data synchronization, deal pipeline management, and opportunity tracking.",
    details: ["Client record sync", "Deal pipeline bi-directional", "Opportunity stage mapping", "Contact and account data"],
    technologies: ["Dynamics 365", "REST API", "OAuth 2.0"],
    connections: [],
  },
  {
    id: "workday",
    title: "Workday",
    subtitle: "Budget & Resources",
    category: "integration",
    description: "Integration with Workday for budget validation, resource availability, and staffing plan alignment during deal scoping.",
    details: ["Budget data retrieval", "Resource availability checks", "Staffing plan alignment", "Cost rate validation"],
    technologies: ["Workday API", "SOAP/REST"],
    connections: [],
  },
  {
    id: "intapp",
    title: "Intapp",
    subtitle: "Conflict & Independence",
    category: "integration",
    description: "Integration with Intapp for automated conflict-of-interest checks and independence verification before deal engagement.",
    details: ["Conflict-of-interest screening", "Independence verification", "Engagement acceptance", "Compliance tracking"],
    technologies: ["Intapp API", "REST"],
    connections: [],
  },
  {
    id: "powerbi",
    title: "Power BI",
    subtitle: "Dashboards & Analytics",
    category: "integration",
    description: "Integration with Power BI for advanced analytics dashboards, margin trend reporting, and pipeline health visualization.",
    details: ["Embedded dashboards", "Margin trend analytics", "Pipeline health reports", "Executive KPIs"],
    technologies: ["Power BI Embedded", "REST API", "DAX"],
    connections: [],
  },
  {
    id: "azure",
    title: "Azure Cloud",
    subtitle: "Target Infrastructure",
    category: "cloud",
    description: "Target production infrastructure on Microsoft Azure providing identity management, API gateway, event-driven architecture, and serverless compute.",
    details: [
      "Entra ID for SSO and RBAC",
      "APIM Gateway for API management",
      "Service Bus for async messaging",
      "Event Grid for event-driven patterns",
      "Container Apps for microservices",
      "Key Vault for secrets management",
    ],
    technologies: ["Azure Entra ID", "APIM", "Service Bus", "Event Grid", "Container Apps", "Key Vault"],
    connections: [],
  },
];

const categoryConfig: Record<string, { color: string; bg: string; border: string; icon: any }> = {
  frontend: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: Monitor },
  backend: { color: "text-stone-700", bg: "bg-stone-900", border: "border-stone-700", icon: Server },
  ai: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", icon: Brain },
  data: { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300", icon: Database },
  integration: { color: "text-slate-600", bg: "bg-white", border: "border-slate-200", icon: Zap },
  cloud: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", icon: Cloud },
};

const dataFlows = [
  { from: "browser", to: "api", label: "REST / JSON", type: "primary" as const },
  { from: "api", to: "ai", label: "AI Inference", type: "secondary" as const },
  { from: "api", to: "db", label: "SQL Queries", type: "secondary" as const },
  { from: "api", to: "crm", label: "Client Sync", type: "dashed" as const },
  { from: "api", to: "workday", label: "Budget Data", type: "dashed" as const },
  { from: "api", to: "intapp", label: "Conflict Checks", type: "dashed" as const },
  { from: "api", to: "powerbi", label: "Analytics", type: "dashed" as const },
  { from: "ai", to: "azure", label: "Compute", type: "dashed" as const },
  { from: "db", to: "azure", label: "Hosting", type: "dashed" as const },
];

const dddContexts = [
  { name: "Deal Context", description: "Deal lifecycle, versioning, project classification", stories: "US-01 to US-07", color: "bg-amber-500" },
  { name: "Scope Context", description: "Scope items, assemblies, prompts, validation", stories: "US-08 to US-17", color: "bg-blue-500" },
  { name: "Pricing Context", description: "Pricing grid, rates, margin, pricing models", stories: "US-18 to US-31", color: "bg-emerald-500" },
  { name: "Approval Context", description: "Tiered routing, delegation, fast-track", stories: "US-39 to US-45", color: "bg-violet-500" },
  { name: "Catalog & Config", description: "Rate tables, templates, admin governance", stories: "US-54 to US-57", color: "bg-stone-500" },
  { name: "Analytics Context", description: "Dashboards, benchmarks, reporting", stories: "US-32 to US-38", color: "bg-red-500" },
];

const targetArchitecture = [
  { icon: Cloud, label: "Azure Cloud-Native", detail: "APIM, Service Bus, Event Grid, Container Apps" },
  { icon: Cpu, label: "Azure OpenAI", detail: "Semantic Kernel + LangGraph orchestration" },
  { icon: GitBranch, label: "CI/CD Pipeline", detail: "GitHub Actions + Azure DevOps" },
  { icon: Shield, label: "Security & Compliance", detail: "Entra ID, RBAC, SOC 2 compliance" },
  { icon: Layers, label: "Domain-Driven Design", detail: "6 bounded contexts, CQRS-ready, event-driven" },
];

export function ArchitectureInteractive() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const selectedData = selectedNode ? nodes.find((n) => n.id === selectedNode) : null;

  const isConnected = (nodeId: string) => {
    if (!selectedNode) return true;
    if (nodeId === selectedNode) return true;
    const node = nodes.find((n) => n.id === selectedNode);
    if (node?.connections.includes(nodeId)) return true;
    const other = nodes.find((n) => n.id === nodeId);
    if (other?.connections.includes(selectedNode)) return true;
    return false;
  };

  const isFlowActive = (flow: typeof dataFlows[0]) => {
    if (!selectedNode) return true;
    return flow.from === selectedNode || flow.to === selectedNode;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Interactive Architecture</h1>
        <p className="text-muted-foreground mt-1">Click any component to explore its details, connections, and technology stack</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">System Components</h2>
              {selectedNode && (
                <button onClick={() => setSelectedNode(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Clear selection
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Presentation</div>
              {renderNodeCard("browser")}

              <div className="flex justify-center">
                <div className={`flex flex-col items-center transition-opacity duration-200 ${selectedNode && !isFlowActive(dataFlows[0]) ? "opacity-20" : ""}`}>
                  <div className="w-px h-4 bg-primary" />
                  <span className="text-[10px] font-medium text-primary px-2 py-0.5 rounded bg-primary/10">REST / JSON</span>
                  <div className="w-px h-4 bg-primary" />
                </div>
              </div>

              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Application</div>
              {renderNodeCard("api")}

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-px h-4 bg-stone-300 ml-6 transition-opacity duration-200 ${selectedNode && !isFlowActive(dataFlows[1]) ? "opacity-20" : ""}`} />
                  </div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">AI Services</div>
                  {renderNodeCard("ai")}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-px h-4 bg-stone-300 ml-6 transition-opacity duration-200 ${selectedNode && !isFlowActive(dataFlows[2]) ? "opacity-20" : ""}`} />
                  </div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Data</div>
                  {renderNodeCard("db")}
                </div>
              </div>

              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-4 mb-2">External Integrations</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {["crm", "workday", "intapp", "powerbi"].map((id) => <div key={id}>{renderNodeCard(id, true)}</div>)}
              </div>

              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-4 mb-2">Infrastructure</div>
              {renderNodeCard("azure")}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Data Flow Map</h2>
            <div className="space-y-2">
              {dataFlows.map((flow) => {
                const fromNode = nodes.find((n) => n.id === flow.from);
                const toNode = nodes.find((n) => n.id === flow.to);
                const active = isFlowActive(flow);
                return (
                  <div
                    key={`${flow.from}-${flow.to}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-200 cursor-pointer ${
                      active ? "border-border bg-muted/30" : "border-transparent opacity-20"
                    }`}
                    onClick={() => setSelectedNode(flow.from)}
                  >
                    <span className="text-xs font-medium text-foreground w-32 truncate">{fromNode?.title}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className={`flex-1 h-px ${flow.type === "primary" ? "bg-primary" : flow.type === "secondary" ? "bg-stone-400" : "bg-stone-300"} ${flow.type === "dashed" ? "border-t border-dashed border-stone-300 h-0" : ""}`} />
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${flow.type === "primary" ? "bg-primary/10 text-primary" : "bg-stone-100 text-stone-500"}`}>
                        {flow.label}
                      </span>
                      <ArrowRight className="w-3 h-3 text-stone-400 shrink-0" />
                    </div>
                    <span className="text-xs font-medium text-foreground w-32 truncate text-right">{toNode?.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {selectedData ? (
            <div className="card overflow-hidden sticky top-4">
              <div className={`p-5 ${categoryConfig[selectedData.category].bg} ${selectedData.category === "backend" ? "text-white" : ""}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const Icon = categoryConfig[selectedData.category].icon;
                      return (
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedData.category === "backend" ? "bg-white/10" : "bg-white"}`}>
                          <Icon className={`w-5 h-5 ${selectedData.category === "backend" ? "text-white" : categoryConfig[selectedData.category].color}`} />
                        </div>
                      );
                    })()}
                    <div>
                      <h3 className={`font-semibold ${selectedData.category === "backend" ? "text-white" : "text-foreground"}`}>{selectedData.title}</h3>
                      <p className={`text-xs ${selectedData.category === "backend" ? "text-stone-400" : "text-muted-foreground"}`}>{selectedData.subtitle}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedNode(null)} className={`p-1 rounded-lg hover:bg-black/10 transition-colors ${selectedData.category === "backend" ? "text-stone-400" : "text-muted-foreground"}`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedData.description}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Capabilities</p>
                  <div className="space-y-1.5">
                    {selectedData.details.map((d) => (
                      <div key={d} className="flex items-start gap-2 text-sm text-foreground">
                        <ArrowRight className="w-3 h-3 mt-1 shrink-0 text-primary" />
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Technology Stack</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedData.technologies.map((t) => (
                      <span key={t} className="text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">{t}</span>
                    ))}
                  </div>
                </div>

                {selectedData.connections.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Connected To</p>
                    <div className="space-y-1.5">
                      {selectedData.connections.map((c) => {
                        const target = nodes.find((n) => n.id === c);
                        if (!target) return null;
                        const flow = dataFlows.find((f) => (f.from === selectedData.id && f.to === c) || (f.to === selectedData.id && f.from === c));
                        return (
                          <button
                            key={c}
                            onClick={() => setSelectedNode(c)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-all text-left"
                          >
                            {(() => {
                              const Icon = categoryConfig[target.category].icon;
                              return <Icon className={`w-4 h-4 ${categoryConfig[target.category].color}`} />;
                            })()}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{target.title}</p>
                              {flow && <p className="text-[11px] text-muted-foreground">{flow.label}</p>}
                            </div>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {(() => {
                  const incomingConnections = nodes.filter((n) => n.connections.includes(selectedData.id));
                  if (incomingConnections.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Connected From</p>
                      <div className="space-y-1.5">
                        {incomingConnections.map((source) => {
                          const flow = dataFlows.find((f) => f.from === source.id && f.to === selectedData.id);
                          return (
                            <button
                              key={source.id}
                              onClick={() => setSelectedNode(source.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-all text-left"
                            >
                              {(() => {
                                const Icon = categoryConfig[source.category].icon;
                                return <Icon className={`w-4 h-4 ${categoryConfig[source.category].color}`} />;
                              })()}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground">{source.title}</p>
                                {flow && <p className="text-[11px] text-muted-foreground">{flow.label}</p>}
                              </div>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Explore the Architecture</h3>
                  <p className="text-xs text-muted-foreground">Click any component for details</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                This interactive view lets you explore how DealPad's components connect and communicate. Click on any system component to see its full description, technology stack, and connections.
              </p>
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Quick Stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{nodes.length}</p>
                    <p className="text-xs text-muted-foreground">Components</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-foreground">{dataFlows.length}</p>
                    <p className="text-xs text-muted-foreground">Data Flows</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-foreground">5</p>
                    <p className="text-xs text-muted-foreground">AI Agents</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-foreground">4</p>
                    <p className="text-xs text-muted-foreground">Integrations</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Layers className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Domain-Driven Design Contexts</h2>
              <p className="text-xs text-muted-foreground">Bounded contexts mapped to user stories</p>
            </div>
          </div>
          <div className="space-y-2">
            {dddContexts.map((ctx) => (
              <div key={ctx.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border">
                <div className={`w-2 h-2 rounded-full ${ctx.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{ctx.name}</p>
                  <p className="text-xs text-muted-foreground">{ctx.description}</p>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">{ctx.stories}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Target Production Architecture</h2>
              <p className="text-xs text-muted-foreground">Planned Azure cloud-native deployment</p>
            </div>
          </div>
          <div className="space-y-2">
            {targetArchitecture.map((item) => (
              <div key={item.label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border">
                <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-stone-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  function renderNodeCard(nodeId: string, compact = false) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const config = categoryConfig[node.category];
    const connected = isConnected(nodeId);
    const isSelected = selectedNode === nodeId;
    const isBackend = node.category === "backend";

    return (
      <button
        onClick={() => setSelectedNode(isSelected ? null : nodeId)}
        className={`w-full text-left rounded-xl border-2 transition-[opacity,border-color,box-shadow] duration-200 ${
          isSelected
            ? "border-primary shadow-md ring-2 ring-primary/20"
            : connected
            ? `${config.border} hover:shadow-md`
            : "border-transparent opacity-30"
        } ${config.bg} ${compact ? "p-3" : "p-4"} focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2`}
      >
        <div className="flex items-center gap-3">
          <div className={`${compact ? "w-8 h-8" : "w-9 h-9"} rounded-lg flex items-center justify-center shrink-0 ${isBackend ? "bg-white/10" : "bg-white border border-stone-200/60"}`}>
            <config.icon className={`${compact ? "w-4 h-4" : "w-4.5 h-4.5"} ${isBackend ? "text-white" : config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`${compact ? "text-xs" : "text-sm"} font-medium ${isBackend ? "text-white" : "text-foreground"}`}>{node.title}</p>
            {!compact && <p className={`text-xs ${isBackend ? "text-stone-400" : "text-muted-foreground"}`}>{node.subtitle}</p>}
          </div>
          {node.connections.length > 0 && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${isBackend ? "bg-white/10 text-stone-400" : "bg-stone-100 text-stone-500"}`}>
              {node.connections.length}
            </span>
          )}
        </div>
      </button>
    );
  }
}
