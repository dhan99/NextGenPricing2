import {
  ShieldCheck, Workflow, Network, FileSearch, Users, GitBranch,
  AlertTriangle, CheckCircle2, Clock, Brain, Layers, Boxes, Zap, Lock,
} from "lucide-react";

// ============================================================================
// Intapp federated-integration deep dive
// Renders inside ArchitectureIntegrations.tsx when provider=intapp +
// section=federated. Self-contained: no external diagram libs, all SVG inline.
// Tone: stakeholder-grade architecture narrative. No emojis. Brand violet
// accents to distinguish Intapp from Dynamics (blue) and Workday (amber).
// ============================================================================

function SectionHeader({
  icon: Icon, eyebrow, title, blurb,
}: { icon: typeof Workflow; eyebrow: string; title: string; blurb: string }) {
  return (
    <div className="flex items-start gap-4 mb-5">
      <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-violet-700" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-violet-700 mb-1">{eyebrow}</div>
        <h3 className="text-lg font-bold text-foreground leading-tight">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl leading-relaxed">{blurb}</p>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-stone-200 rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function Pill({ tone = "stone", children }: { tone?: "stone" | "violet" | "emerald" | "amber" | "rose" | "blue"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    stone:   "bg-stone-50 text-stone-700 border-stone-200",
    violet:  "bg-violet-50 text-violet-700 border-violet-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber:   "bg-amber-50 text-amber-700 border-amber-200",
    rose:    "bg-rose-50 text-rose-700 border-rose-200",
    blue:    "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${tones[tone]}`}>
      {children}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Diagram 1 — Parallel-track non-blocking model
// DealPad timeline runs uninterrupted on top; Intapp track runs in parallel
// underneath, exchanging signals (not gates) until the final commit point.
// ----------------------------------------------------------------------------
function DiagramParallelTracks() {
  return (
    <svg viewBox="0 0 940 360" className="w-full" style={{ maxWidth: 940 }} role="img" aria-label="Federated parallel-track architecture">
      <defs>
        <marker id="ar-violet" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#7c3aed" />
        </marker>
        <marker id="ar-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#d97706" />
        </marker>
        <marker id="ar-stone" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#a8a29e" />
        </marker>
      </defs>

      {/* Lane labels */}
      <text x="14" y="50"  fontSize="11" fontWeight="700" fill="#78716c" letterSpacing="1.5">DEALPAD</text>
      <text x="14" y="225" fontSize="11" fontWeight="700" fill="#7c3aed" letterSpacing="1.5">INTAPP</text>

      {/* DealPad lane */}
      <line x1="100" y1="80" x2="900" y2="80" stroke="#e7e5e4" strokeWidth="2" />
      {[
        { x: 110, label: "Setup",     sub: "wizard step 1" },
        { x: 270, label: "Scope",     sub: "wizard step 2" },
        { x: 430, label: "Pricing",   sub: "wizard step 4" },
        { x: 590, label: "Review",    sub: "wizard step 6" },
        { x: 750, label: "Approval",  sub: "wizard step 7" },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={62} width={130} height={36} rx={8} fill="#fff7ed" stroke="#fed7aa" />
          <text x={s.x + 65} y={78} fontSize="11.5" fontWeight="700" fill="#9a3412" textAnchor="middle">{s.label}</text>
          <text x={s.x + 65} y={92} fontSize="9.5" fill="#9a3412" textAnchor="middle">{s.sub}</text>
        </g>
      ))}
      <rect x="750" y="62" width="130" height="36" rx="8" fill="#dcfce7" stroke="#86efac" />
      <text x="815" y="78" fontSize="11.5" fontWeight="700" fill="#166534" textAnchor="middle">Approval</text>
      <text x="815" y="92" fontSize="9.5" fill="#166534" textAnchor="middle">commit point</text>

      {/* Intapp lane */}
      <line x1="100" y1="255" x2="900" y2="255" stroke="#e7e5e4" strokeWidth="2" />
      {[
        { x: 110, label: "Intake opened",       sub: "POST /intake/requests" },
        { x: 270, label: "AI extract + tier",   sub: "doc parse → risk" },
        { x: 430, label: "Screening run",       sub: "conflicts / sanctions" },
        { x: 590, label: "Federated approvals", sub: "GC / AML / Pricing / …" },
        { x: 750, label: "Accept / Mitigate",   sub: "POST /intake/.../accept" },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={237} width={130} height={36} rx={8} fill="#f5f3ff" stroke="#ddd6fe" />
          <text x={s.x + 65} y={253} fontSize="11.5" fontWeight="700" fill="#5b21b6" textAnchor="middle">{s.label}</text>
          <text x={s.x + 65} y={267} fontSize="9.5" fill="#5b21b6" textAnchor="middle">{s.sub}</text>
        </g>
      ))}

      {/* Open — fired automatically when DealPad enters Setup */}
      <path d="M175,98 C 175,150 175,180 175,237" stroke="#7c3aed" strokeWidth="1.5" fill="none" markerEnd="url(#ar-violet)" strokeDasharray="4 3" />
      <text x="180" y="170" fontSize="9.5" fill="#7c3aed">auto-open</text>

      {/* Screening result is published as a non-blocking pill in the deal header */}
      <path d="M495,237 C 495,180 495,150 495,98" stroke="#a8a29e" strokeWidth="1.5" fill="none" markerEnd="url(#ar-stone)" strokeDasharray="4 3" />
      <text x="502" y="170" fontSize="9.5" fill="#78716c">status pill (5s poll)</text>

      {/* Final accept gate — the only synchronous join */}
      <path d="M815,237 L 815,98" stroke="#d97706" strokeWidth="2" fill="none" markerEnd="url(#ar-amber)" />
      <text x="820" y="170" fontSize="9.5" fontWeight="600" fill="#9a3412">JOIN: accept gate</text>

      {/* Legend */}
      <g transform="translate(20, 318)">
        <line x1="0" y1="0" x2="22" y2="0" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="28" y="3" fontSize="10" fill="#57534e">Signal (non-blocking)</text>
        <line x1="180" y1="0" x2="202" y2="0" stroke="#a8a29e" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="208" y="3" fontSize="10" fill="#57534e">Status surface (pill, 5s poll)</text>
        <line x1="400" y1="0" x2="422" y2="0" stroke="#d97706" strokeWidth="2" />
        <text x="428" y="3" fontSize="10" fill="#57534e">Synchronous join (final commit only)</text>
      </g>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Diagram 2 — Intake AI workflow (as actually implemented)
// RFP / notes → extractor proposes per-field with confidence → all proposals
// land in the side panel as "pending" → partner Apply or Dismiss each → risk
// tier (server-computed from rules) selects the federated reviewer matrix.
// No threshold-based auto-apply or auto-discard today. Confidence is
// informational, surfaced as a chip next to each extracted field.
// ----------------------------------------------------------------------------
function DiagramIntakeAI() {
  return (
    <svg viewBox="0 0 940 300" className="w-full" style={{ maxWidth: 940 }} role="img" aria-label="Intake AI workflow">
      <defs>
        <marker id="ar2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#7c3aed" />
        </marker>
      </defs>

      {/* Source documents */}
      <g>
        <rect x="20" y="70" width="150" height="84" rx="10" fill="#fafaf9" stroke="#e7e5e4" />
        <text x="95" y="92" fontSize="11.5" fontWeight="700" fill="#1c1917" textAnchor="middle">Source artifacts</text>
        <text x="95" y="112" fontSize="10" fill="#57534e" textAnchor="middle">RFP_v2.pdf</text>
        <text x="95" y="126" fontSize="10" fill="#57534e" textAnchor="middle">ScopingCall_Notes.docx</text>
        <text x="95" y="140" fontSize="10" fill="#57534e" textAnchor="middle">MutualNDA_signed.pdf</text>
      </g>

      {/* Extractor */}
      <g>
        <rect x="220" y="60" width="180" height="104" rx="12" fill="#f5f3ff" stroke="#ddd6fe" />
        <text x="310" y="84" fontSize="11.5" fontWeight="700" fill="#5b21b6" textAnchor="middle">Field Extractor</text>
        <text x="310" y="100" fontSize="9.5" fill="#5b21b6" textAnchor="middle">buildExtractions() · server/intake.ts</text>
        <text x="310" y="122" fontSize="10" fill="#5b21b6" textAnchor="middle">contact · scope_summary · service_line</text>
        <text x="310" y="136" fontSize="10" fill="#5b21b6" textAnchor="middle">start_date · risk_factor · budget_range</text>
        <text x="310" y="152" fontSize="9.5" fontStyle="italic" fill="#7c3aed" textAnchor="middle">emits per-field confidence (0.00–1.00)</text>
      </g>
      <line x1="172" y1="112" x2="218" y2="112" stroke="#7c3aed" strokeWidth="1.5" markerEnd="url(#ar2)" />

      {/* Pending review panel — every extraction lands here */}
      <g>
        <rect x="450" y="40" width="220" height="156" rx="12" fill="#fef3c7" stroke="#fde68a" />
        <text x="560" y="64" fontSize="11.5" fontWeight="700" fill="#92400e" textAnchor="middle">Side panel · all proposals pending</text>
        <text x="560" y="82" fontSize="10" fill="#92400e" textAnchor="middle">status = &quot;pending&quot; in intake_extractions</text>
        <text x="560" y="100" fontSize="10" fill="#92400e" textAnchor="middle">confidence shown as chip next to value</text>
        <line x1="470" y1="115" x2="650" y2="115" stroke="#fde68a" strokeWidth="1" />
        <text x="560" y="135" fontSize="11" fontWeight="700" fill="#92400e" textAnchor="middle">Partner acts per row:</text>
        <text x="490" y="155" fontSize="10" fill="#166534">✓ Apply</text>
        <text x="540" y="155" fontSize="10" fill="#92400e">→ status=&quot;applied&quot;, value written</text>
        <text x="490" y="175" fontSize="10" fill="#991b1b">✕ Dismiss</text>
        <text x="540" y="175" fontSize="10" fill="#92400e">→ status=&quot;dismissed&quot;, no write</text>
      </g>
      <line x1="402" y1="112" x2="448" y2="112" stroke="#7c3aed" strokeWidth="1.5" markerEnd="url(#ar2)" />

      {/* Risk tier + matrix — computed server-side from rules in computeFederatedReviewers() */}
      <g>
        <rect x="710" y="60" width="210" height="104" rx="12" fill="#f5f3ff" stroke="#ddd6fe" />
        <text x="815" y="84" fontSize="11.5" fontWeight="700" fill="#5b21b6" textAnchor="middle">Risk tier + reviewer matrix</text>
        <text x="815" y="102" fontSize="10" fill="#5b21b6" textAnchor="middle">jurisdiction · service line · audit?</text>
        <text x="815" y="116" fontSize="10" fill="#5b21b6" textAnchor="middle">relationship years · estimated fee</text>
        <text x="815" y="136" fontSize="10" fontWeight="700" fill="#5b21b6" textAnchor="middle">→ low / medium / high</text>
        <text x="815" y="152" fontSize="9.5" fontStyle="italic" fill="#7c3aed" textAnchor="middle">computeFederatedReviewers() → 1–6 gates</text>
      </g>
      <line x1="672" y1="112" x2="708" y2="112" stroke="#7c3aed" strokeWidth="1.5" markerEnd="url(#ar2)" />

      <text x="20" y="232" fontSize="10" fill="#57534e">
        <tspan fontWeight="700">Honest scope of the AI today:</tspan> the extractor proposes; the partner decides. There is no automatic apply/discard
      </text>
      <text x="20" y="248" fontSize="10" fill="#57534e">
        threshold — every proposal lands as a card with its confidence chip and an explicit Apply / Dismiss action. That keeps the
      </text>
      <text x="20" y="264" fontSize="10" fill="#57534e">
        audit trail clean (every applied value has an actor + timestamp in <tspan fontFamily="monospace" fontSize="10.5" fill="#1c1917">intake_extractions.actedBy / actedAt</tspan>)
      </text>
      <text x="20" y="280" fontSize="10" fill="#57534e">
        and is the right starting point — confidence-gated automation is a Phase-2 lever, not a Phase-1 commitment.
      </text>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// Diagram 3 — Screening hit taxonomy + result tier
// ----------------------------------------------------------------------------
function DiagramScreening() {
  // Source of truth: SimulatedIntappProvider.runScreening() in server/intapp.ts
  // (the seven hit types and their severities are reproduced exactly here).
  const hits = [
    { type: "sanctions_watchlist", desc: "OFAC / EU / UN sanctions screening — direct entity, alias, and UBO matches.", sev: "high" },
    { type: "industry_restriction", desc: "Restricted industry profile (cannabis, defense, crypto issuer) flagged by firm policy.", sev: "high" },
    { type: "pep",                 desc: "Politically Exposed Persons — direct exposure, family, or close associates.", sev: "medium" },
    { type: "independence",        desc: "Audit independence threats: long tenure, prior non-attest engagements, partner rotation.", sev: "medium" },
    { type: "conflict_of_interest", desc: "Adverse-party or competitor conflict against existing client relationships.", sev: "medium" },
    { type: "regulatory_review",   desc: "Recent regulatory action or enforcement matter referenced in screening source.", sev: "low" },
    { type: "fee_threshold",       desc: "Auto-added when estimated fee ≥ $500k — flags Pricing Committee involvement.", sev: "low" },
  ];
  const sevTone: Record<string, "rose" | "amber" | "stone"> = { high: "rose", medium: "amber", low: "stone" };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {hits.map((h) => (
          <div key={h.type} className="border border-stone-200 rounded-xl p-3 bg-white">
            <div className="flex items-center justify-between mb-1.5">
              <code className="text-[12px] font-mono text-violet-700 font-semibold">{h.type}</code>
              <Pill tone={sevTone[h.sev]}>{h.sev}</Pill>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{h.desc}</p>
          </div>
        ))}
      </div>
      <div className="bg-gradient-to-r from-stone-50 to-violet-50/40 border border-stone-200 rounded-xl p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Result tier (rolled up across hits)</div>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" /><span className="text-sm"><strong>clear</strong> · no hits — header pill green, no extra gates</span></div>
          <div className="flex items-start gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" /><span className="text-sm"><strong>review</strong> · only low / medium hits — partner sees a banner, may attach mitigations, deal still progresses</span></div>
          <div className="flex items-start gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" /><span className="text-sm"><strong>conflict</strong> · ≥1 high hit — submission gate; mitigations or QRM override required before approval</span></div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Diagram 4 — Federated reviewer matrix
// Maps the 6 reviewer gates Intake can spawn to the DealPad personas allowed
// to decide each one. Mirrors REVIEWER_ROLE_MAP in server/intake.ts exactly.
// ----------------------------------------------------------------------------
function ReviewerMatrix() {
  const rows = [
    { gate: "gc",                     label: "General Counsel",         when: "Always — mandatory client-acceptance sign-off",                         who: ["qrm"] },
    { gate: "ethics",                 label: "Ethics Reviewer",         when: "relationshipYears >= 7 AND regulated industry (independence drift)",     who: ["qrm"] },
    { gate: "independence_partner",   label: "Independence Partner",    when: "Audit / attest engagements",                                            who: ["qrm"] },
    { gate: "aml",                    label: "AML / KYC Officer",       when: "High risk_factor (sanctions / PEP / cash-intensive sector)",            who: ["qrm"] },
    { gate: "jurisdictional_counsel", label: "Jurisdictional Counsel",  when: "Cross-border or non-standard state of incorporation",                   who: ["qrm", "sll"] },
    { gate: "pricing_committee",      label: "Pricing Committee",       when: "Estimated fee crosses tier threshold OR margin %% < target",            who: ["fin", "qrm"] },
  ];
  const allRoles = ["qrm", "sll", "fin"];
  return (
    <div className="overflow-hidden border border-stone-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 border-b border-stone-200">
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Reviewer gate</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-2.5">Fires when</th>
            {allRoles.map(r => (
              <th key={r} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2.5 w-[68px]">{r.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.gate} className={i % 2 ? "bg-stone-50/40" : ""}>
              <td className="px-4 py-2.5 align-top">
                <div className="font-mono text-[12.5px] text-violet-700 font-semibold">{r.gate}</div>
                <div className="text-xs text-muted-foreground">{r.label}</div>
              </td>
              <td className="px-4 py-2.5 align-top text-muted-foreground text-[13px]">{r.when}</td>
              {allRoles.map(role => (
                <td key={role} className="px-3 py-2.5 text-center align-top">
                  {r.who.includes(role) ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                  ) : (
                    <span className="text-stone-300">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-stone-200 bg-stone-50 text-xs text-muted-foreground">
        Source: <code className="font-mono">REVIEWER_ROLE_MAP</code> in <code className="font-mono">server/intake.ts</code>.
        Both the route guard (<code className="font-mono">requirePerm("viewRiskSummary")</code>) and the in-handler check
        (<code className="font-mono">requireRoles(...)</code> + this map) must agree before a decision is recorded.
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export function IntappFederated() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-violet-700" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-violet-700 mb-1">Federated integration model</div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Risk &amp; compliance, alongside the deal — never in front of it</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-3xl leading-relaxed">
              Intapp owns client- and matter-level risk: who we&apos;re allowed to work with, who has to bless that decision,
              and what mitigations are on the record. DealPad owns the commercial deal: scope, pricing, staffing, margin.
              The two systems run on parallel tracks and exchange status signals continuously, so a partner can keep
              shaping a deal while compliance does its work. They synchronise at exactly one point — the final accept
              gate — and that is by design.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Pill tone="violet"><Workflow className="w-3 h-3" /> Bi-directional</Pill>
              <Pill tone="violet"><Zap className="w-3 h-3" /> Non-blocking signals</Pill>
              <Pill tone="violet"><Lock className="w-3 h-3" /> Defence-in-depth RBAC</Pill>
              <Pill tone="violet"><Brain className="w-3 h-3" /> AI-assisted intake</Pill>
            </div>
          </div>
        </div>
      </div>

      {/* What is Intapp Intake */}
      <Card>
        <SectionHeader
          icon={FileSearch}
          eyebrow="Module 1"
          title="Intapp Intake — onboarding the client and the matter"
          blurb="Intake is the front door for every new engagement. It captures who the client is, what work is being proposed, in what jurisdiction, and at what risk level — then it routes the request through the firm's mandatory acceptance gates (General Counsel, AML, Ethics, Independence Partner, Jurisdictional Counsel, Pricing Committee) before the engagement letter can be signed."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">In the Intapp world</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span>Workflow engine spans <strong>request → screening → policy → approval → accepted/rejected</strong></span></li>
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span>Federated reviewer matrix selected from rules: jurisdiction, service line, prior relationship, fee tier</span></li>
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span>AI-assisted document parsing pulls scope, dates, contacts, risk factors out of the RFP &amp; scoping notes</span></li>
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span>Every state change emits an immutable event with actor, role, and source — that&apos;s the audit log</span></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">In DealPad&apos;s world</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span>An <code className="font-mono text-xs">intake_requests</code> row mirrors the Intapp request 1:1 (one per deal)</span></li>
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span><code className="font-mono text-xs">intake_extractions</code> stores per-field AI output with confidence — partner can apply or dismiss without blocking the wizard</span></li>
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span><code className="font-mono text-xs">intake_approvals</code> is the federated reviewer matrix, with each gate&apos;s decider role enforced server-side</span></li>
              <li className="flex gap-2"><span className="text-violet-600 mt-1.5 w-1 h-1 rounded-full bg-violet-600 flex-shrink-0" /><span><code className="font-mono text-xs">intake_events</code> is the local append-only audit feed surfaced in the Intapp page (served by <code className="font-mono text-xs">GET /api/intake/events</code>); cross-module mirroring into <code className="font-mono text-xs">activity_log</code> is a known forward-looking gap</span></li>
            </ul>
          </div>
        </div>
      </Card>

      {/* AI workflow */}
      <Card>
        <SectionHeader
          icon={Brain}
          eyebrow="Intake AI · how field extraction actually works today"
          title="The model proposes; the partner decides — every time"
          blurb="When an intake request opens, the extractor proposes one row per high-signal field with a confidence number attached. Every proposal lands in the side panel as 'pending'. The partner Applies or Dismisses each row explicitly — there is no automatic apply or silent discard pipeline today. Confidence is informational, surfaced as a chip next to each value to inform that decision and recorded in the audit row."
        />
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-4">
          <DiagramIntakeAI />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="border border-stone-200 rounded-xl p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold mb-1">What gets extracted</div>
            <p className="text-muted-foreground text-[13px]">Six fields per request: <em>contact</em>, <em>scope_summary</em>, <em>service_line</em>, <em>start_date</em>, <em>risk_factor</em>, <em>budget_range</em>. Each carries a source document name (e.g. <code className="font-mono text-[11px]">RFP_v2.pdf</code>) so the partner can audit the trace.</p>
          </div>
          <div className="border border-stone-200 rounded-xl p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold mb-1">How decisions are recorded</div>
            <p className="text-muted-foreground text-[13px]">Apply or Dismiss flips <code className="font-mono text-[11px]">intake_extractions.status</code> from <em>pending</em> to <em>applied</em> / <em>dismissed</em> with <code className="font-mono text-[11px]">actedBy</code> + <code className="font-mono text-[11px]">actedAt</code>. Every applied value carries an actor and a timestamp.</p>
          </div>
          <div className="border border-stone-200 rounded-xl p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold mb-1">Where this evolves</div>
            <p className="text-muted-foreground text-[13px]">Confidence-gated automation (auto-apply above a threshold, suppress below another) is a Phase-2 lever — turning it on is one branch in the route handler. We deliberately ship Phase 1 with humans in every loop so the audit baseline is unambiguous.</p>
          </div>
        </div>
      </Card>

      {/* Screening */}
      <Card>
        <SectionHeader
          icon={ShieldCheck}
          eyebrow="Module 2"
          title="Intapp Screening — conflicts, sanctions, independence, adverse media"
          blurb="Screening runs the proposed client and matter against the firm's policy index: existing-client adverse-party conflicts, OFAC/PEP/sanctions watchlists, independence threats for attest engagements, and adverse-media signals. The output is a tiered result and a list of hits — each one optionally backed by a mitigation that QRM can resolve, waive, or reject."
        />
        <DiagramScreening />
      </Card>

      {/* Federated parallel-track architecture */}
      <Card>
        <SectionHeader
          icon={Network}
          eyebrow="Architecture"
          title="Federated, non-blocking, single join"
          blurb="The hard requirement was: a partner shaping a deal must never have to wait for compliance to finish. Reviewers must never have to wait for a partner to revisit pricing. Both teams own their step end-to-end and exchange signals continuously. The two tracks join exactly once — at the final accept gate — and the join is enforced server-side."
        />
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 mb-5">
          <DiagramParallelTracks />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="w-4 h-4 text-violet-700" />
              <h4 className="font-semibold text-foreground">Auto-open at deal creation</h4>
            </div>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              <code className="font-mono text-[11.5px]">POST /api/deals</code> awaits <code className="font-mono text-[11.5px]">ensureIntakeRequest()</code> server-side
              before responding. The auto-open is best-effort and wrapped in a try/catch — a simulator hiccup logs and still lets the deal land. By the time the wizard renders step 2,
              the intake row, extractions, and federated reviewer matrix are already populated; the partner never sees an empty Intake panel.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Clock className="w-4 h-4 text-violet-700" />
              <h4 className="font-semibold text-foreground">Status pill (5 s poll)</h4>
            </div>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              The deal header shows a small chip — <em>clear / review / conflict / pending</em> — that polls every 5 seconds.
              It links to the Intapp page but never blocks navigation. Polling pauses when the tab is hidden.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <GitBranch className="w-4 h-4 text-violet-700" />
              <h4 className="font-semibold text-foreground">Single synchronous join</h4>
            </div>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              The only point at which the two tracks must agree is <code className="font-mono text-[11.5px]">POST /api/intake/requests/:id/accept</code>.
              That endpoint returns <code className="font-mono text-[11.5px]">409 approvers_pending</code> if any federated gate is unsigned —
              the deal stays in <em>submitted</em>, the user sees exactly which gate is blocking, and the partner can still edit pricing.
            </p>
          </div>
        </div>
      </Card>

      {/* Reviewer matrix */}
      <Card>
        <SectionHeader
          icon={Users}
          eyebrow="Federated reviewer matrix"
          title="Six gates, three decider roles, one source of truth"
          blurb="Intake selects gates from rules; DealPad enforces who is allowed to act on each gate. The mapping is held in one place — REVIEWER_ROLE_MAP — and is checked at two layers: the Express route guard (coarse permission) and the handler (fine-grained role + reviewer-gate check). Both layers must pass before a decision is recorded."
        />
        <ReviewerMatrix />
      </Card>

      {/* Outbound + idempotency */}
      <Card>
        <SectionHeader
          icon={GitBranch}
          eyebrow="Bi-directional · outbound"
          title="What DealPad pushes back to Intapp"
          blurb="Approval is not the end of the conversation. Once a deal is approved or rejected — and whenever a screening mitigation is resolved, waived, or rejected — DealPad fires a push so the Intapp matter record can close out cleanly. In simulated mode the push is a no-op stub that returns success; the live provider implementation activates only when intake settings are switched to Live mode and a token is provisioned."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-stone-200 rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <code className="font-mono text-[12.5px] text-violet-700 font-semibold">autoPushIntappOutcome()</code>
              <Pill tone="emerald">on approval / rejection</Pill>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">
              Wired into the deal status handler in <code className="font-mono text-[11px]">server/routes.ts</code>. Looks up the latest
              screening for the deal and calls <code className="font-mono text-[11px]">runPushOutcome()</code> with the final commercial
              decision. <em>Fire-and-forget</em>: failure is caught and logged, the user&apos;s decision is not rolled back.
            </p>
          </div>
          <div className="border border-stone-200 rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <code className="font-mono text-[12.5px] text-violet-700 font-semibold">autoPushMitigation()</code>
              <Pill tone="emerald">on mitigation status change</Pill>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">
              Fires whenever a mitigation moves to <em>resolved / waived / rejected</em> via PATCH. Calls
              <code className="font-mono text-[11px]"> runPushMitigation()</code> so the Intapp matter&apos;s mitigation log stays
              in sync without manual re-entry. Same <em>fire-and-forget</em> envelope.
            </p>
          </div>
        </div>
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Recovery path:</strong> ops can re-fire either push manually via
            <code className="font-mono"> POST /api/intapp/screenings/:id/push-outcome</code> or
            <code className="font-mono"> POST /api/intapp/mitigations/:id/push</code> without touching the original deal state.
            <strong className="ml-1">Forward-looking gap:</strong> server-side idempotency (de-duplication of repeat pushes for the
            same screening + status) is a known requirement before flipping the provider to Live and is the next round of work
            in <code className="font-mono">server/intapp.ts</code>.
          </p>
        </div>
      </Card>

      {/* Building for the future */}
      <Card className="bg-gradient-to-br from-stone-50 to-violet-50/30">
        <SectionHeader
          icon={Layers}
          eyebrow="Built for what comes next"
          title="The seams that keep this evolving"
          blurb="The provider abstraction, the event log, and the federated matrix are the three places where the next round of investment lands. Each of them is independently extensible without touching DealPad's deal model."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-stone-200 rounded-xl p-4 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Boxes className="w-4 h-4 text-violet-700" />
              <h4 className="font-semibold text-foreground text-sm">Provider abstraction</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <code className="font-mono text-[11px]">IntappProvider</code> and <code className="font-mono text-[11px]">IntakeProvider</code> are
              interfaces with simulated implementations today. <code className="font-mono text-[11px]">getProvider()</code> in
              <code className="font-mono text-[11px]"> server/intapp.ts</code> + <code className="font-mono text-[11px]">server/intake.ts</code> selects
              the provider purely from <code className="font-mono text-[11px]">intapp_settings.mode</code>. The Live provider is a
              stub today — every method returns a &quot;not configured&quot; message; provisioning <code className="font-mono text-[11px]">INTAPP_API_TOKEN</code> and
              wiring the real REST client is the activation work. No call-site changes; no schema migration.
            </p>
          </div>
          <div className="border border-stone-200 rounded-xl p-4 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Workflow className="w-4 h-4 text-violet-700" />
              <h4 className="font-semibold text-foreground text-sm">Event log as backbone</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <code className="font-mono text-[11px]">intake_events</code> + <code className="font-mono text-[11px]">intapp_events</code> are append-only.
              Replay lets us derive any future projection — analytics, SLA dashboards, regulator exports — without re-instrumenting the workflow.
            </p>
          </div>
          <div className="border border-stone-200 rounded-xl p-4 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-violet-700" />
              <h4 className="font-semibold text-foreground text-sm">Reviewer matrix as data</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Adding a new gate (e.g. <em>Cyber Risk</em>, <em>ESG Review</em>) is a row in <code className="font-mono text-[11px]">REVIEWER_ROLE_MAP</code> +
              a rule in the matrix selector. No new endpoints, no new UI components — the federated approvers card renders it for free.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
