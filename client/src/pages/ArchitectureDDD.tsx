import { useState } from "react";
import {
  Layers,
  MessageSquare,
  Bot,
  Sparkles,
  ChevronRight,
  Check,
  Lightbulb,
  Target,
  Network,
  ScrollText,
  ArrowRight,
} from "lucide-react";

type ContextId =
  | "deal"
  | "scope"
  | "pricing"
  | "approval"
  | "catalog"
  | "analytics"
  | "risk"
  | "resource"
  | "documents";

interface BoundedContext {
  id: ContextId;
  name: string;
  oneLiner: string;
  ubiquitousLanguage: string[];
  responsibilities: string[];
  keyEntities: string[];
  endpoints: { method: string; path: string; purpose: string }[];
  agents: { id: string; name: string; whyHere: string }[];
  color: string;
  accent: string;
  badge: string;
}

const contexts: BoundedContext[] = [
  {
    id: "deal",
    name: "Deal Context",
    oneLiner: "The deal is the business artifact everything else hangs off of — its lifecycle, identity, and ownership.",
    ubiquitousLanguage: [
      "Deal — a single quote being scoped and priced",
      "Stage — Setup → Scope → Pricing → Review → Approval",
      "PDL (Project Delivery Lead) — the person accountable for the deal",
      "Renewal / Clone — a deal derived from another deal",
    ],
    responsibilities: [
      "Owns deal identity, status, and the wizard step pointer",
      "Coordinates clone, renewal, archive, and submit transitions",
      "Publishes deal-changed events that other contexts react to",
    ],
    keyEntities: ["deals", "clients", "activity_log"],
    endpoints: [
      { method: "GET", path: "/api/deals", purpose: "List with filters" },
      { method: "POST", path: "/api/deals", purpose: "Create new deal" },
      { method: "PATCH", path: "/api/deals/:id", purpose: "Update fields / advance step" },
      { method: "POST", path: "/api/deals/:id/clone", purpose: "Clone or create renewal" },
      { method: "POST", path: "/api/deals/:id/submit", purpose: "Submit for approval" },
      { method: "POST", path: "/api/deals/:id/archive", purpose: "Soft-archive" },
      { method: "GET", path: "/api/dashboard/summary", purpose: "Pipeline KPIs" },
    ],
    agents: [
      {
        id: "UC-1",
        name: "Deal Similarity",
        whyHere: "Operates on deal-level facts (industry, size, complexity) — naturally lives in the Deal language.",
      },
    ],
    color: "bg-amber-50 border-amber-200",
    accent: "text-amber-700",
    badge: "bg-amber-500",
  },
  {
    id: "scope",
    name: "Scope Context",
    oneLiner: "What work is being sold — the catalog of services, the prompts that capture client requirements, and the assembled scope of one deal.",
    ubiquitousLanguage: [
      "Scope item — a sellable unit of work",
      "Assembly / Template — a curated bundle of scope items",
      "Prompt — a structured question that captures inputs (e.g., entity count)",
      "Coverage — whether all required prompts are answered",
    ],
    responsibilities: [
      "Manages the master scope catalog and reusable templates",
      "Captures client-specific inputs via versioned prompt sets",
      "Validates that the deal's scope is internally consistent",
    ],
    keyEntities: ["scope_catalog", "deal_scope_items", "prompt_responses", "prompt_sets"],
    endpoints: [
      { method: "GET", path: "/api/scope-catalog", purpose: "Browse master catalog" },
      { method: "GET", path: "/api/deals/:dealId/scope-items", purpose: "Read deal scope" },
      { method: "POST", path: "/api/deals/:dealId/scope-items", purpose: "Add scope item" },
      { method: "POST", path: "/api/deals/:dealId/apply-template/:templateId", purpose: "Bulk-apply assembly" },
      { method: "GET", path: "/api/deals/:dealId/prompts", purpose: "Read prompt answers" },
      { method: "PATCH", path: "/api/deals/:dealId/prompts/:id", purpose: "Save an answer" },
      { method: "GET", path: "/api/prompt-sets/active", purpose: "Active prompt-set version" },
    ],
    agents: [
      {
        id: "UC-2",
        name: "Effort Estimation",
        whyHere: "Reasons over scope items + prompt answers to suggest hours by role — entirely in the Scope language.",
      },
    ],
    color: "bg-blue-50 border-blue-200",
    accent: "text-blue-700",
    badge: "bg-blue-500",
  },
  {
    id: "pricing",
    name: "Pricing Context",
    oneLiner: "Turning hours into money — rates, the pricing grid, scenarios, and live margin.",
    ubiquitousLanguage: [
      "Pricing line — one role × hours × rate row",
      "Blended rate — fee ÷ total hours",
      "Margin — (fee − cost) ÷ fee",
      "Scenario — a what-if pricing variant (conservative / standard / aggressive)",
    ],
    responsibilities: [
      "Calculates totals, blended rate, and margin in real time",
      "Generates and ranks pricing scenarios",
      "Applies rate-card adjustments and recalculations",
    ],
    keyEntities: ["pricing_lines", "rate_cards", "rate_card_entries", "scenarios", "roles"],
    endpoints: [
      { method: "GET", path: "/api/rate-cards", purpose: "Active rate cards" },
      { method: "GET", path: "/api/deals/:dealId/pricing", purpose: "Read pricing grid" },
      { method: "POST", path: "/api/deals/:dealId/pricing", purpose: "Add pricing line" },
      { method: "PATCH", path: "/api/deals/:dealId/pricing/:id", purpose: "Edit a line" },
      { method: "POST", path: "/api/deals/:id/recalc-totals", purpose: "Recompute totals" },
      { method: "POST", path: "/api/deals/:id/rate-adjust", purpose: "Apply rate adjustment" },
      { method: "GET", path: "/api/deals/:dealId/scenarios", purpose: "List scenarios" },
      { method: "POST", path: "/api/deals/:dealId/scenarios/:id/select", purpose: "Pick a scenario" },
    ],
    agents: [
      {
        id: "UC-3",
        name: "Margin Advisor",
        whyHere: "Operates on the pricing grid and target thresholds — a pure Pricing-Context citizen.",
      },
      {
        id: "UC-4",
        name: "Scenario Recommendation",
        whyHere: "Generates scenarios using Pricing concepts only; doesn't need to understand approval rules.",
      },
    ],
    color: "bg-emerald-50 border-emerald-200",
    accent: "text-emerald-700",
    badge: "bg-emerald-500",
  },
  {
    id: "approval",
    name: "Approval Context",
    oneLiner: "Who has to say yes, in what order, and what happens when they do.",
    ubiquitousLanguage: [
      "Approval — a single review step on a deal",
      "Stage transition — pending → pending_bu_approval → approved/rejected",
      "Change order — a post-approval scope/price change",
    ],
    responsibilities: [
      "Enforces the approval state machine (no skipping, no reopening)",
      "Routes to the right approver tier (Lead vs BU)",
      "Triggers downstream pushes (Dynamics, Workday, Intapp, Conga) on finalization",
    ],
    keyEntities: ["approvals", "change_orders", "activity_log"],
    endpoints: [
      { method: "GET", path: "/api/deals/:dealId/approvals", purpose: "Read approval chain" },
      { method: "POST", path: "/api/deals/:dealId/approvals", purpose: "Submit for approval" },
      { method: "PATCH", path: "/api/approvals/:id", purpose: "Advance / approve / reject" },
      { method: "GET", path: "/api/deals/:dealId/change-orders", purpose: "List change orders" },
      { method: "POST", path: "/api/deals/:dealId/change-orders", purpose: "Create change order" },
      { method: "PATCH", path: "/api/change-orders/:id", purpose: "Update change order" },
    ],
    agents: [
      {
        id: "UC-5",
        name: "Risk Summary",
        whyHere: "Synthesizes a pre-approval risk view — naturally sits at the gate the Approval Context owns.",
      },
    ],
    color: "bg-violet-50 border-violet-200",
    accent: "text-violet-700",
    badge: "bg-violet-500",
  },
  {
    id: "risk",
    name: "Risk & Compliance Context",
    oneLiner: "Conflict checks, independence verification, and the audit trail that proves due diligence happened.",
    ubiquitousLanguage: [
      "Screening — a conflict / independence check at intake",
      "Mitigation — an action that resolves a finding (resolve / waive / reject)",
      "Outcome push — sending the final decision back to Intapp",
    ],
    responsibilities: [
      "Owns the screening lifecycle and mitigation workflow",
      "Pushes outcomes back to Intapp Risk on every approval finalization",
      "Maintains the audit trail required by QRM",
    ],
    keyEntities: ["intapp_screenings", "intapp_mitigations", "intapp_settings"],
    endpoints: [
      { method: "GET", path: "/api/intapp/deals/:dealId/screening", purpose: "Read screening for a deal" },
      { method: "POST", path: "/api/intapp/screenings/:id/push-outcome", purpose: "Push final decision to Intapp" },
      { method: "POST", path: "/api/intapp/mitigations/:id/push", purpose: "Push mitigation update" },
      { method: "GET", path: "/api/intapp/settings", purpose: "Provider mode / config" },
    ],
    agents: [],
    color: "bg-red-50 border-red-200",
    accent: "text-red-700",
    badge: "bg-red-500",
  },
  {
    id: "resource",
    name: "Resource & Budget Context",
    oneLiner: "Are the people and budget actually available to deliver what we just sold?",
    ubiquitousLanguage: [
      "Cost center — a Workday budget bucket",
      "Committed budget — the slice already promised to active projects",
      "Validation finding — a rate-variance, headroom, or staffing issue",
    ],
    responsibilities: [
      "Pulls cost centers, workers, and rate cards from Workday for validation",
      "Validates rate variance, budget headroom, and staffing alignment",
      "Pushes the project record + atomic budget reserve back on approval",
    ],
    keyEntities: [
      "workday_cost_centers",
      "workday_workers",
      "workday_rate_card",
      "workday_validations",
      "workday_events",
    ],
    endpoints: [
      { method: "GET", path: "/api/workday/cost-centers", purpose: "List cost centers" },
      { method: "GET", path: "/api/workday/workers", purpose: "List workers" },
      { method: "POST", path: "/api/workday/deals/:dealId/validate", purpose: "Run validation" },
      { method: "POST", path: "/api/workday/deals/:dealId/push", purpose: "Push project + reserve budget (atomic)" },
      { method: "GET", path: "/api/workday/settings", purpose: "Provider mode / config" },
    ],
    agents: [],
    color: "bg-cyan-50 border-cyan-200",
    accent: "text-cyan-700",
    badge: "bg-cyan-500",
  },
  {
    id: "documents",
    name: "Engagement Documents Context",
    oneLiner: "The legally-binding letter that turns an approved deal into a signed engagement.",
    ubiquitousLanguage: [
      "Template — a Conga letter template (audit, advisory, etc.)",
      "Generated letter — a rendered PDF tied to one deal",
      "Delivery — the channel-specific send (email / e-sign / portal)",
    ],
    responsibilities: [
      "Generates engagement letters from templates",
      "Pushes deliveries back through Conga's pipeline",
      "Reconciles letter status (generated → delivered)",
    ],
    keyEntities: ["engagement_letters", "conga_templates", "conga_settings"],
    endpoints: [
      { method: "GET", path: "/api/conga/templates", purpose: "List templates" },
      { method: "POST", path: "/api/conga/deals/:dealId/letters", purpose: "Generate letter" },
      { method: "POST", path: "/api/conga/letters/:id/deliver", purpose: "Push delivery (email / e-sign / portal)" },
      { method: "GET", path: "/api/conga/letters/:id/download", purpose: "Download PDF" },
    ],
    agents: [],
    color: "bg-pink-50 border-pink-200",
    accent: "text-pink-700",
    badge: "bg-pink-500",
  },
  {
    id: "catalog",
    name: "Catalog & Config Context",
    oneLiner: "The admin surface that governs the language everyone else speaks — rates, templates, prompts.",
    ubiquitousLanguage: [
      "Catalog — the master list of scope items",
      "Rate card — versioned price book by role and geo",
      "Prompt set — a published, versioned bundle of prompts",
    ],
    responsibilities: [
      "Provides admin CRUD for catalog, rate cards, and prompt sets",
      "Versions and publishes prompt sets so deals are reproducible",
      "Acts as a Shared Kernel: every other context reads from it",
    ],
    keyEntities: ["scope_catalog", "rate_cards", "prompt_sets", "roles"],
    endpoints: [
      { method: "POST", path: "/api/scope-catalog", purpose: "Create catalog item" },
      { method: "PATCH", path: "/api/scope-catalog/:id", purpose: "Update catalog item" },
      { method: "GET", path: "/api/prompt-sets", purpose: "List prompt-set versions" },
      { method: "POST", path: "/api/prompt-sets/:id/publish", purpose: "Publish a version" },
      { method: "POST", path: "/api/prompt-sets/:id/clone", purpose: "Branch a draft" },
    ],
    agents: [],
    color: "bg-stone-50 border-stone-200",
    accent: "text-stone-700",
    badge: "bg-stone-500",
  },
  {
    id: "analytics",
    name: "Analytics Context",
    oneLiner: "Reading across the herd of deals to find pipeline health, win-rate trends, and margin signals.",
    ubiquitousLanguage: [
      "Pipeline — open deals weighted by stage",
      "Win rate — approved ÷ submitted by service line",
      "Margin trend — moving average of approved-deal margins",
    ],
    responsibilities: [
      "Aggregates across deals (read-only)",
      "Powers dashboard tiles, charts, and AI dashboard insights",
      "Never mutates Deal-Context state",
    ],
    keyEntities: ["deals (aggregated)", "approvals (aggregated)", "activity_log (aggregated)"],
    endpoints: [
      { method: "GET", path: "/api/analytics/overview", purpose: "Trends, win rates, margin breakdown" },
      { method: "GET", path: "/api/dashboard/summary", purpose: "KPI tiles" },
      { method: "GET", path: "/api/ai/dashboard-insights", purpose: "AI commentary on pipeline" },
      { method: "POST", path: "/api/ai/dashboard-chat", purpose: "Chat with the dashboard" },
    ],
    agents: [],
    color: "bg-orange-50 border-orange-200",
    accent: "text-orange-700",
    badge: "bg-orange-500",
  },
];

const aiPrinciples = [
  {
    icon: Target,
    title: "One context = one ubiquitous language",
    body: "Margin Advisor only ever speaks Pricing. Effort Estimation only ever speaks Scope. Each agent has a small vocabulary it understands deeply, instead of a giant prompt that has to know everything.",
  },
  {
    icon: Network,
    title: "Context boundaries become agent boundaries",
    body: "An agent that needs to cross a boundary (e.g., Risk Summary touching pricing AND approval) does so via published, well-named endpoints — not by reaching into another team's data. That's how we keep agents composable as we add more.",
  },
  {
    icon: ScrollText,
    title: "Events at the seams = clean automation",
    body: "When the Approval Context says 'deal_approved', the Resource and Documents contexts react. AI agents subscribe to those same events instead of polling — which is how an autonomous 'engagement-letter agent' becomes possible without rewriting anything.",
  },
  {
    icon: Lightbulb,
    title: "Bounded contexts keep AI changes safe",
    body: "Replacing a simulated agent with a live LLM happens inside one context. The rest of the product doesn't notice. That's the difference between an AI roadmap that ships and one that stalls in regression testing.",
  },
];

const contextRelations = [
  { from: "Deal", to: "Scope", label: "publishes deal-created" },
  { from: "Scope", to: "Pricing", label: "scope-changed → recompute" },
  { from: "Pricing", to: "Approval", label: "submit-for-approval" },
  { from: "Approval", to: "Risk & Compliance", label: "outcome push" },
  { from: "Approval", to: "Resource & Budget", label: "project + budget reserve" },
  { from: "Approval", to: "Engagement Documents", label: "trigger letter" },
  { from: "Catalog & Config", to: "All", label: "shared kernel (read-only)" },
  { from: "All", to: "Analytics", label: "read-only aggregation" },
];

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-100 text-emerald-700",
    POST: "bg-blue-100 text-blue-700",
    PATCH: "bg-amber-100 text-amber-700",
    DELETE: "bg-red-100 text-red-700",
    PUT: "bg-violet-100 text-violet-700",
  };
  return (
    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${colors[method] || "bg-stone-100 text-stone-700"}`}>
      {method}
    </span>
  );
}

export function ArchitectureDDD() {
  const [activeId, setActiveId] = useState<ContextId>("deal");
  const active = contexts.find((c) => c.id === activeId)!;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            For Stakeholders
          </span>
          <span className="text-xs text-muted-foreground">~5 min read</span>
        </div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Domain-Driven Design at DealPad</h1>
        <p className="text-muted-foreground mt-2 max-w-3xl leading-relaxed">
          Why we drew lines where we drew them — and why those same lines are the reason we can ship AI agents safely,
          one at a time, without breaking the rest of the product.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">DDD in one paragraph</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A complex business has several distinct conversations happening at once. The people in pricing talk about
            margin and blended rates. The people in approvals talk about routing and decision tiers. The people in
            risk talk about screenings and mitigations. Domain-Driven Design says:{" "}
            <strong className="text-foreground">don't squash those conversations into one giant model.</strong> Give
            each one its own bounded space — its own language, its own data, its own rules — and let them talk to each
            other through clearly named events and APIs. That's it. That's the whole idea.
          </p>
        </div>
        <div className="card p-6 bg-gradient-to-br from-orange-50 to-amber-50 border-orange-100">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Why it matters here</h2>
          </div>
          <p className="text-sm text-stone-700 leading-relaxed">
            DealPad has 9 bounded contexts. Each maps cleanly to{" "}
            <strong>where an AI agent can plug in without re-architecting anything</strong>. That's how we get from
            5 simulated agents today to 15+ production agents over 12 months without a rewrite.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">How DDD shapes our AI agent strategy</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {aiPrinciples.map((p) => (
            <div key={p.title} className="card p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <p.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm mb-1">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">The 9 bounded contexts in DealPad</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pick one to see its language, what it owns, the real endpoints it exposes, and which AI agents naturally live there.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-2">
            {contexts.map((c) => {
              const isActive = c.id === activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left card p-4 transition-all ${
                    isActive ? "ring-2 ring-primary border-primary/40 shadow-sm" : "hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${c.badge}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground text-sm">{c.name}</h3>
                        {c.agents.length > 0 && (
                          <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                            {c.agents.length} AI
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">{c.oneLiner}</p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 text-stone-300 shrink-0 mt-0.5 transition-transform ${
                        isActive ? "text-primary translate-x-0.5" : ""
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2">
            <div className={`card overflow-hidden ${active.color}`}>
              <div className="p-5 border-b border-stone-200/60">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{active.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{active.oneLiner}</p>
                  </div>
                  <Layers className={`w-6 h-6 ${active.accent} shrink-0`} />
                </div>
              </div>

              <div className="p-5 space-y-5 bg-white">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-stone-400" />
                    <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Ubiquitous Language
                    </h4>
                  </div>
                  <ul className="space-y-1.5">
                    {active.ubiquitousLanguage.map((term) => (
                      <li key={term} className="text-sm text-foreground flex items-start gap-2">
                        <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active.accent}`} />
                        <span>{term}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                      Responsibilities
                    </h4>
                    <ul className="space-y-1.5">
                      {active.responsibilities.map((r) => (
                        <li key={r} className="text-sm text-muted-foreground flex items-start gap-2">
                          <ArrowRight className="w-3 h-3 mt-1 shrink-0 text-stone-400" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                      Key Tables
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {active.keyEntities.map((e) => (
                        <span
                          key={e}
                          className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-700"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                    Endpoints ({active.endpoints.length})
                  </h4>
                  <div className="rounded-lg border border-stone-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {active.endpoints.map((e, i) => (
                          <tr
                            key={`${e.method}-${e.path}`}
                            className={i % 2 === 0 ? "bg-stone-50/50" : "bg-white"}
                          >
                            <td className="px-3 py-2 w-16">
                              <MethodBadge method={e.method} />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-stone-700 whitespace-nowrap">
                              {e.path}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{e.purpose}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {active.agents.length > 0 ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="w-4 h-4 text-primary" />
                      <h4 className="text-[11px] uppercase tracking-wider font-semibold text-primary">
                        AI Agents that live here
                      </h4>
                    </div>
                    <div className="space-y-3">
                      {active.agents.map((a) => (
                        <div key={a.id} className="text-sm">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-mono font-bold text-primary bg-white px-1.5 py-0.5 rounded">
                              {a.id}
                            </span>
                            <strong className="text-foreground">{a.name}</strong>
                          </div>
                          <p className="text-muted-foreground leading-relaxed">{a.whyHere}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="w-4 h-4 text-amber-600" />
                      <strong className="text-foreground">Open seat for an AI agent</strong>
                    </div>
                    <p className="leading-relaxed">
                      No agent today, but this context is a natural home for one. Examples worth piloting:{" "}
                      {active.id === "risk" && "automated conflict-summary agent that reads screening hits and recommends mitigations."}
                      {active.id === "resource" && "staffing-recommendation agent that matches deal scope to available workers and headroom."}
                      {active.id === "documents" && "letter-personalization agent that drafts client-specific clauses from prior engagements."}
                      {active.id === "catalog" && "scope-catalog curator that suggests new items based on what PDLs are typing as free text."}
                      {active.id === "analytics" && "trend-explainer agent that narrates why win-rate moved this quarter (already in pilot)."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">How the contexts talk to each other</h2>
        <div className="card p-5">
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Most flows are event-driven. When something interesting happens in one context, it publishes an event;
            other contexts react. This is the seam where new AI agents (autonomous or assistive) can be added
            without changing existing code.
          </p>
          <div className="rounded-lg border border-stone-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    From
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    Event / Call
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    To
                  </th>
                </tr>
              </thead>
              <tbody>
                {contextRelations.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-stone-50/50"}>
                    <td className="px-3 py-2 text-sm font-medium text-foreground">{r.from}</td>
                    <td className="px-3 py-2 text-xs font-mono text-stone-600">{r.label}</td>
                    <td className="px-3 py-2 text-sm font-medium text-foreground">{r.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card p-6 bg-gradient-to-br from-stone-900 to-stone-800 text-white">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">The takeaway for AI investment</h3>
            <p className="text-sm text-stone-300 leading-relaxed mb-3">
              The 5 AI use cases shipping today aren't a one-off list — they're the first 5 of a much larger map.
              Each future agent we add (engagement-letter drafting, automated mitigation recommendations,
              staffing optimization, anomaly detection in pricing) already has a clear home in one of these
              9 contexts. That means:
            </p>
            <ul className="space-y-1.5 text-sm text-stone-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                <span>Predictable scope and effort estimates per agent</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                <span>Low blast radius — a new agent can fail without breaking the deal flow</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                <span>Independent rollout, A/B testing, and per-context model selection</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                <span>Clear governance: each context has one owning persona who approves AI behavior in their domain</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
