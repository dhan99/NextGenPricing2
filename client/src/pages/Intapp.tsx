import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Shield, AlertTriangle, CheckCircle2, Loader2, Activity, Settings as SettingsIcon,
  PlayCircle, History, ShieldAlert, Search, ChevronRight, Lock, Globe, Cog,
  Inbox, Workflow, FileText, X, Check, Hourglass, Sparkles, Network,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  useIntappSettings, useUpdateIntappSettings, useIntappScreenings,
  useRunIntappScreening, useIntappEvents, useIntappDashboard, useDeals,
  useIntakeRequests, useIntakeRequest, useIntakeExtractionAction,
  useIntakeApprovalDecide, useIntakeAccept, useIntakeReject, useIntakeEvents,
  useOpenIntakeForDeal,
} from "@/hooks/use-api";

const TABS = [
  { key: "intake", label: "Intake", icon: Inbox },
  { key: "overview", label: "Conflicts overview", icon: Activity },
  { key: "screenings", label: "Screenings", icon: Search },
  { key: "events", label: "Audit log", icon: History },
  { key: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type TabKey = typeof TABS[number]["key"];

export function Intapp() {
  const [tab, setTab] = useState<TabKey>("overview");
  const { data: settings } = useIntappSettings();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      <div className="mb-5 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Intapp Intake &amp; Conflicts</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              AI request intake, federated approvals and matter acceptance — wired to conflicts, sanctions, PEP and independence screening. Running in{" "}
              <span className="font-semibold text-foreground">{settings?.mode === "live" ? "LIVE" : "SIMULATION"}</span> mode for the 4-week pilot.
            </p>
          </div>
        </div>
        {settings && (
          <div className="text-left sm:text-right text-xs flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-0 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 text-foreground font-medium">
              {settings.mode === "live" ? <Globe className="w-3.5 h-3.5" /> : <Cog className="w-3.5 h-3.5" />}
              {settings.mode === "live" ? "Live API" : "Simulated"}
            </div>
            <div className="text-muted-foreground sm:mt-1">Policy {settings.policyVersion}</div>
            {settings.pilotEndsOn && <div className="text-muted-foreground">Pilot ends {settings.pilotEndsOn}</div>}
          </div>
        )}
      </div>

      <div className="border-b border-stone-200 mb-5 sm:mb-6 -mx-4 sm:mx-0 px-4 sm:px-0">
        <nav className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === "intake" && <IntakeTab />}
      {tab === "overview" && <OverviewTab />}
      {tab === "screenings" && <ScreeningsTab />}
      {tab === "events" && <EventsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// =====================================================================
// INTAKE TAB — Intapp Intake (federated workflow peer)
// =====================================================================

const STAGE_ORDER = ["draft", "screening", "policy", "approval", "accepted"] as const;
const STAGE_LABEL: Record<string, string> = {
  draft: "Draft", screening: "Screening", policy: "Policy", approval: "Federated approval",
  accepted: "Accepted", rejected: "Rejected", on_hold: "On hold",
};

// Lifecycle interaction map — how DealPad and Intapp Intake hand off across stages.
const LIFECYCLE_MAP: { stage: string; out: string; in: string }[] = [
  { stage: "Opportunity imported", out: "open / attach request",                       in: "requestId + preliminary risk tier" },
  { stage: "Wizard step 1–3",      out: "(read) pull AI extractions",                  in: "webhook request.updated on drift" },
  { stage: "Wizard step 4–6",      out: "post pricing / scope packet on submit",       in: "approval matrix" },
  { stage: "Submitted → in-review",out: "post evidence as DealPad approvers act",      in: "webhook approval.completed for Intake-side approvers" },
  { stage: "Approved",             out: "mark deal ready for matter open",             in: "webhook request.accepted w/ matterId" },
  { stage: "Letter generated",     out: "(no Intake call — Conga handles)",            in: "Conga delivery webhook closes Intake task" },
  { stage: "Change order saved",   out: "post scope-change event",                     in: "requiresReapproval verdict" },
  { stage: "Live engagement",      out: "(none)",                                      in: "continuous-monitoring webhook on conflict / sanctions delta" },
];

function IntakeTab() {
  const { data: requests = [], isLoading } = useIntakeRequests();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const sorted = useMemo(() => [...(requests as any[])].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  ), [requests]);

  return (
    <div className="space-y-6">
      {/* ----- Net assessment for the pilot (architectural framing copy) ----- */}
      <div className="card p-5 bg-stone-50 border-stone-200">
        <div className="flex items-start gap-3">
          <Network className="w-5 h-5 text-stone-700 mt-0.5 flex-shrink-0" />
          <div className="space-y-2 text-sm leading-relaxed text-foreground">
            <h3 className="font-semibold">Net assessment for the pilot</h3>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Intake is a workflow peer, not a data source.</span>{" "}
              Treating it as a passive system we POST to on approval misses the point — it has its own approvers, policies and lifecycle.
              The right model is federated approvals with explicit handshake events.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">The Risk / Conflicts integration is a subset of Intake.</span>{" "}
              Once Intake sits in front of the funnel, the screening trigger moves into Intake and our local screenings table becomes a mirror, not a source.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Two correlation IDs do all the work:</span>{" "}
              <code className="px-1 py-0.5 rounded bg-white border border-stone-200 text-[11px] font-mono">intakeRequestId</code> (created at scoping start)
              and <code className="px-1 py-0.5 rounded bg-white border border-stone-200 text-[11px] font-mono">intakeMatterId</code> (assigned at acceptance).
              Both are persisted alongside each deal (on the intake request record) so every downstream system can be wired to either, without DealPad needing to know how Intake routed the workflow internally.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Provider pattern stays.</span>{" "}
              <code className="px-1 py-0.5 rounded bg-white border border-stone-200 text-[11px] font-mono">server/intake.ts</code>{" "}
              (simulated → live) lets the pilot run end-to-end before any live Intapp tenant is available; cutover is a config + secret change, not a refactor —
              the same playbook as Dynamics, Workday, Intapp Risk and Conga.
            </p>
          </div>
        </div>
      </div>

      {/* ----- Lifecycle interaction map (DealPad ↔ Intake handoffs) ----- */}
      <div className="card overflow-x-auto">
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <Workflow className="w-4 h-4 text-amber-700" />
          <h3 className="text-sm font-semibold text-foreground">Lifecycle handoff map · DealPad ↔ Intapp Intake</h3>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">DealPad stage</th>
              <th className="text-left px-4 py-2.5">DealPad → Intake</th>
              <th className="text-left px-4 py-2.5">Intake → DealPad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {LIFECYCLE_MAP.map((row) => (
              <tr key={row.stage} className="hover:bg-stone-50/60">
                <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">{row.stage}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.out}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.in}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ----- Live intake requests ----- */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-4">
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Open requests</h3>
            <span className="text-[11px] text-muted-foreground">{sorted.length}</span>
          </div>
          <div className="max-h-[640px] overflow-auto divide-y divide-stone-100">
            {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
            {!isLoading && sorted.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No intake requests yet.</div>
            )}
            {sorted.map((r: any) => (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className={`w-full text-left px-4 py-3 hover:bg-stone-50 transition-colors ${
                  selectedId === r.id ? "bg-amber-50/70" : ""
                }`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-foreground truncate">{r.clientName || "—"}</span>
                  <StageBadge stage={r.stage} />
                  <RiskBadge tier={r.riskTier} />
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">{r.externalRef}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate">{r.dealNumber} · {r.dealTitle}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          {selectedId ? (
            <IntakeRequestDetail id={selectedId} />
          ) : (
            <div className="card p-10 text-center text-sm text-muted-foreground">
              <Inbox className="w-8 h-8 mx-auto mb-2 text-stone-400" />
              Select an intake request on the left to inspect AI extractions, federated approvers and acceptance gates.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntakeRequestDetail({ id }: { id: number }) {
  const { data, isLoading } = useIntakeRequest(id);
  const { data: events = [] } = useIntakeEvents(id);
  const extAct = useIntakeExtractionAction();
  const apprAct = useIntakeApprovalDecide();
  const accept = useIntakeAccept();
  const reject = useIntakeReject();
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  if (isLoading || !data) return <div className="card p-6 text-sm text-muted-foreground">Loading request…</div>;

  // getRequestDetail returns the request fields flattened at the root, alongside
  // deal/client/extractions/approvals/screening/events. Use `data` directly as the
  // request, then pull related collections off named keys.
  const r: any = data;
  const extractions: any[] = data.extractions || [];
  const approvals: any[] = data.approvals || [];
  const screeningCleared = ["clear", "mitigated", "override_approved"].includes(data.screening?.result);
  const approversGreen = approvals.length > 0 && approvals.every((a) => a.status === "approved" || a.status === "waived");
  const canAccept = screeningCleared && approversGreen && r.stage !== "accepted" && r.stage !== "rejected";

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-foreground">{data.client?.name || "—"}</h3>
              <StageBadge stage={r.stage} />
              <RiskBadge tier={r.riskTier} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              <Link href={`/deals/${r.dealId}`}>
                <span className="text-primary hover:underline cursor-pointer">{data.deal?.dealNumber}</span>
              </Link>
              {" · "}{data.deal?.title}
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <Field label="intakeRequestId" value={r.externalRef} mono />
              <Field label="intakeMatterId" value={r.matterId || "— (assigned on accept)"} mono />
              <Field label="Service line" value={r.serviceLine || "—"} />
              <Field label="Jurisdiction" value={r.jurisdiction || "—"} />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => accept.mutate(id)}
              disabled={!canAccept || accept.isPending}
              title={!screeningCleared ? "Screening must be clear, mitigated or override_approved" : !approversGreen ? "All federated approvers must sign off" : ""}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-40">
              {accept.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Accept &amp; assign matter
            </button>
            <button
              onClick={() => setShowReject((v) => !v)}
              disabled={r.stage === "accepted" || r.stage === "rejected"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stone-300 text-foreground text-xs font-medium hover:bg-stone-50 disabled:opacity-40">
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
        {showReject && (
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Rejection reason (min 10 chars)</label>
              <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. Client failed AML screening, see Intapp case 884."/>
            </div>
            <button
              onClick={() => { reject.mutate({ id, reason: rejectReason }); setShowReject(false); setRejectReason(""); }}
              disabled={rejectReason.trim().length < 10}
              className="px-3 py-2 rounded-md bg-red-600 text-white text-xs font-medium disabled:opacity-40">
              Confirm reject
            </button>
          </div>
        )}

        {/* Stage rail */}
        <div className="mt-4 flex items-center gap-1 text-[11px] uppercase tracking-wider">
          {STAGE_ORDER.map((s, idx) => {
            const reached = STAGE_ORDER.indexOf(r.stage as any) >= idx || r.stage === "accepted";
            const isCurrent = r.stage === s;
            const tone = r.stage === "rejected" ? "bg-red-100 text-red-700"
              : isCurrent ? "bg-amber-200 text-amber-900 font-bold"
              : reached ? "bg-emerald-100 text-emerald-700"
              : "bg-stone-100 text-muted-foreground";
            return (
              <span key={s} className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded ${tone}`}>{STAGE_LABEL[s]}</span>
                {idx < STAGE_ORDER.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </span>
            );
          })}
        </div>

        {/* Acceptance gate */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <Gate ok={screeningCleared} label="Conflicts screening: clear / mitigated / override approved" />
          <Gate ok={approversGreen} label={`Federated approvers: ${approvals.filter(a => a.status === "approved" || a.status === "waived").length} / ${approvals.length} signed off`} />
        </div>
      </div>

      {/* AI extractions */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-amber-700" />
          <h4 className="text-sm font-semibold text-foreground">AI extractions from request packet</h4>
          <span className="text-[11px] text-muted-foreground">{extractions.length} fields</span>
        </div>
        <div className="space-y-2">
          {extractions.length === 0 && <div className="text-xs text-muted-foreground">No extractions captured yet.</div>}
          {extractions.map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-3 rounded-md border border-stone-200">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{e.fieldLabel}</span>
                  <ConfidenceBadge value={Number(e.confidence)} />
                  <ExtractionStatusBadge status={e.status} />
                </div>
                <div className="text-sm font-medium text-foreground mt-0.5">{e.value}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Source: <span className="font-mono">{e.sourceDoc}</span>{e.actedBy ? ` · ${e.status} by ${e.actedBy}` : ""}</div>
              </div>
              {e.status === "pending" && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => extAct.mutate({ id: e.id, action: "apply" })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 text-emerald-700 text-[11px] font-medium hover:bg-emerald-50">
                    <Check className="w-3 h-3" /> Apply
                  </button>
                  <button onClick={() => extAct.mutate({ id: e.id, action: "dismiss" })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-stone-300 text-foreground text-[11px] font-medium hover:bg-stone-50">
                    <X className="w-3 h-3" /> Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Federated approvals */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-amber-700" />
          <h4 className="text-sm font-semibold text-foreground">Federated approvers</h4>
          <span className="text-[11px] text-muted-foreground">Each works in their own queue inside Intapp.</span>
        </div>

        {/* Inline error banner — surfaces reviewer_role_forbidden and similar
            policy errors so PDLs/POs see why their click was rejected. */}
        {apprAct.isError && (
          <div className="mb-3 flex items-start gap-2 p-2.5 rounded-md border border-red-200 bg-red-50 text-red-800 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">Action not permitted</div>
              <div className="mt-0.5">{(apprAct.error as any)?.message || "Unable to record this decision."}</div>
              {(apprAct.error as any)?.body?.code === "reviewer_role_forbidden" && (
                <div className="mt-1 text-red-700/80">
                  Switch persona to one of the allowed reviewers (top-right) and try again, or ask that reviewer to act from their own queue.
                </div>
              )}
            </div>
            <button onClick={() => apprAct.reset()} className="text-red-700 hover:text-red-900" aria-label="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="space-y-2">
          {approvals.length === 0 && <div className="text-xs text-muted-foreground">No approvers required for this request.</div>}
          {approvals.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-3 rounded-md border border-stone-200">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{a.reviewerLabel}</span>
                  <ApprovalStatusBadge status={a.status} />
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-muted-foreground font-mono">{a.reviewerRole}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.reason}</div>
                {a.decidedBy && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {a.status} by {a.decidedBy} · {a.decidedAt ? new Date(a.decidedAt).toLocaleString() : ""}
                    {a.notes ? ` — ${a.notes}` : ""}
                  </div>
                )}
              </div>
              {a.status === "pending" && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => apprAct.mutate({ id: a.id, decision: "approved" })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700">
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button onClick={() => apprAct.mutate({ id: a.id, decision: "waived", notes: "Waived in DealPad pilot" })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-stone-300 text-foreground text-[11px] font-medium hover:bg-stone-50">
                    Waive
                  </button>
                  <button onClick={() => apprAct.mutate({ id: a.id, decision: "rejected", notes: "Rejected in DealPad pilot" })}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-300 text-red-700 text-[11px] font-medium hover:bg-red-50">
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Linked screening */}
      {data.screening && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-700" />
              <h4 className="text-sm font-semibold text-foreground">Linked Intapp Risk screening</h4>
            </div>
            <Link href="#"><span /></Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <ResultBadge result={data.screening.result} />
            <span className="text-muted-foreground">Hits: <span className="font-semibold text-foreground tabular-nums">{data.screening.hitCount}</span></span>
            <span className="text-muted-foreground">Tier: <RiskBadge tier={data.screening.riskTier} /></span>
            <span className="text-muted-foreground font-mono">{data.screening.externalRef}</span>
          </div>
        </div>
      )}

      {/* Events */}
      <div className="card p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Intake handshake events</h4>
        <div className="space-y-1.5 max-h-[280px] overflow-auto">
          {(events as any[]).length === 0 && <div className="text-xs text-muted-foreground">No events yet.</div>}
          {(events as any[]).map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-xs py-1">
              <span className="text-muted-foreground tabular-nums whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</span>
              <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-stone-100 text-muted-foreground">{e.eventType}</span>
              <span className="text-foreground flex-1">{e.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-foreground mt-0.5 truncate ${mono ? "font-mono text-[11px]" : ""}`}>{value}</div>
    </div>
  );
}

function Gate({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded border ${ok ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Hourglass className="w-3.5 h-3.5 text-amber-600" />}
      <span className={ok ? "text-emerald-800" : "text-amber-800"}>{label}</span>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const tones: Record<string, string> = {
    draft: "bg-stone-100 text-stone-700",
    screening: "bg-blue-100 text-blue-700",
    policy: "bg-violet-100 text-violet-700",
    approval: "bg-amber-100 text-amber-700",
    accepted: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    on_hold: "bg-stone-200 text-stone-700",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${tones[stage] || "bg-stone-100 text-stone-700"}`}>{STAGE_LABEL[stage] || stage}</span>;
}

function ApprovalStatusBadge({ status }: { status: string }) {
  const tones: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    waived: "bg-stone-200 text-stone-700",
    rejected: "bg-red-100 text-red-700",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${tones[status] || "bg-stone-100 text-stone-700"}`}>{status}</span>;
}

function ExtractionStatusBadge({ status }: { status: string }) {
  const tones: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    applied: "bg-emerald-100 text-emerald-700",
    dismissed: "bg-stone-200 text-stone-700",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${tones[status] || "bg-stone-100 text-stone-700"}`}>{status}</span>;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 90 ? "bg-emerald-100 text-emerald-700" : pct >= 75 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold tabular-nums ${tone}`}>{pct}% conf</span>;
}

function OverviewTab() {
  const { data: dash, isLoading } = useIntappDashboard();
  if (isLoading || !dash) return <div className="text-sm text-muted-foreground">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="card p-5 bg-amber-50/60 border-amber-200">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-700 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">QRM cockpit · {dash.mode === "live" ? "Live" : "Simulated"} mode</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              Every Draft → Submitted transition triggers an Intapp screening. Conflicts block submission until QRM mitigation or override.
              Switching to the live Intapp API after the {dash.pilotEndsOn ? `pilot (ends ${dash.pilotEndsOn})` : "pilot"} is a single configuration change.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Total screenings" value={dash.total} sub="Lifetime" />
        <Kpi label="Cleared" value={dash.byResult.clear} sub="No issues" tone="emerald" />
        <Kpi label="Review" value={dash.byResult.review} sub="Mitigations needed" tone="amber" />
        <Kpi label="Conflicts" value={dash.byResult.conflict} sub="Blocked" tone="red" />
        <Kpi label="QRM overrides" value={dash.byResult.override} sub="Audit-logged" tone="violet" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TierCard tier="low" label="Low risk" count={dash.byTier.low} />
        <TierCard tier="medium" label="Medium risk" count={dash.byTier.medium} />
        <TierCard tier="high" label="High risk" count={dash.byTier.high} />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Open conflicts requiring QRM action</h3>
          <span className="text-[11px] text-muted-foreground">{dash.openConflicts.length} open</span>
        </div>
        {dash.openConflicts.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
            No open conflicts. All screened deals are clear or mitigated.
          </div>
        ) : (
          <div className="space-y-2">
            {dash.openConflicts.map((c: any) => (
              <Link key={c.id} href={`/deals/${c.dealId}`}>
                <div className="flex items-start gap-3 p-3 rounded-md border border-red-200 bg-red-50/40 hover:bg-red-50 cursor-pointer transition-colors">
                  <AlertTriangle className="w-4.5 h-4.5 text-red-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{c.clientName || "—"}</span>
                      <span className="text-[11px] text-muted-foreground">{c.dealNumber} · {c.dealTitle}</span>
                      <RiskBadge tier={c.riskTier} />
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                        {c.hitCount} hit{c.hitCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.narrative}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Recent activity</h3>
        <div className="space-y-1.5">
          {dash.recentEvents.map((e: any) => <EventRow key={e.id} e={e} />)}
        </div>
      </div>
    </div>
  );
}

function ScreeningsTab() {
  const { data: screenings = [] } = useIntappScreenings();
  const { data: deals = [] } = useDeals();
  const { persona } = useAuth();
  const run = useRunIntappScreening();
  const [pickDeal, setPickDeal] = useState<string>("");

  const dealsById: Record<number, any> = Object.fromEntries((deals || []).map((d: any) => [d.id, d]));

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Run a new screening</label>
          <select value={pickDeal} onChange={(e) => setPickDeal(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary">
            <option value="">Select a deal to screen...</option>
            {(deals || []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.dealNumber} — {d.title} ({d.client?.name})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => pickDeal && run.mutate({ dealId: parseInt(pickDeal), userName: persona?.name })}
          disabled={!pickDeal || run.isPending}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 w-full sm:w-auto flex-shrink-0">
          {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Run screening
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5">Requested</th>
              <th className="text-left px-4 py-2.5">Deal</th>
              <th className="text-left px-4 py-2.5">Source</th>
              <th className="text-left px-4 py-2.5">Result</th>
              <th className="text-left px-4 py-2.5">Tier</th>
              <th className="text-right px-4 py-2.5">Hits</th>
              <th className="text-left px-4 py-2.5">Ext. ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {screenings.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">No screenings yet</td></tr>
            )}
            {screenings.map((s: any) => {
              const d = dealsById[s.dealId];
              return (
                <tr key={s.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(s.requestedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    {d ? (
                      <Link href={`/deals/${d.id}`}>
                        <span className="text-primary hover:underline cursor-pointer text-sm font-medium">
                          {d.dealNumber} — {d.client?.name}
                        </span>
                      </Link>
                    ) : <span className="text-xs text-muted-foreground">deal #{s.dealId}</span>}
                  </td>
                  <td className="px-4 py-2.5"><SourceBadge source={s.source} /></td>
                  <td className="px-4 py-2.5"><ResultBadge result={s.result} /></td>
                  <td className="px-4 py-2.5"><RiskBadge tier={s.riskTier} /></td>
                  <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">{s.hitCount}</td>
                  <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{s.externalRef || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventsTab() {
  const { data: events = [] } = useIntappEvents();
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Persistent audit trail</h3>
      <div className="space-y-1.5 max-h-[600px] overflow-auto">
        {events.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No events yet</div>}
        {events.map((e: any) => <EventRow key={e.id} e={e} />)}
      </div>
    </div>
  );
}

function SettingsTab() {
  const { data: settings, isLoading } = useIntappSettings();
  const update = useUpdateIntappSettings();
  const { persona } = useAuth();
  if (isLoading || !settings) return <div className="text-sm text-muted-foreground">Loading settings...</div>;
  const set = (k: string, v: any) => update.mutate({ [k]: v, userName: persona?.name });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="card p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Provider mode</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Simulated mode runs deterministic local logic. Live mode requires <code className="px-1 bg-stone-100 rounded">INTAPP_API_TOKEN</code> + a base URL.
            </p>
          </div>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold ${
            settings.mode === "live" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}>{settings.mode}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => set("mode", "simulated")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium border ${
              settings.mode === "simulated" ? "bg-primary text-white border-primary" : "bg-white border-stone-300 text-foreground hover:bg-stone-50"
            }`}>Simulated (pilot)</button>
          <button onClick={() => set("mode", "live")} disabled={!settings.hasApiToken}
            title={!settings.hasApiToken ? "Set INTAPP_API_TOKEN secret first" : ""}
            className={`px-3 py-1.5 text-xs rounded-md font-medium border disabled:opacity-50 ${
              settings.mode === "live" ? "bg-primary text-white border-primary" : "bg-white border-stone-300 text-foreground hover:bg-stone-50"
            }`}>Live API</button>
          {!settings.hasApiToken && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 basis-full sm:basis-auto">
              <Lock className="w-3 h-3 flex-shrink-0" /> Add INTAPP_API_TOKEN to enable live mode
            </span>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Workflow gating</h3>
        <ToggleRow label="Auto-screen on Draft → Submitted"
          desc="Trigger an Intapp screening every time a deal is submitted for approval."
          checked={!!settings.autoScreenOnSubmit} onChange={(v) => set("autoScreenOnSubmit", v)} />
        <ToggleRow label="Block submission on conflict"
          desc="Hard-stop approval when a high-severity (conflict) hit is detected."
          checked={!!settings.blockSubmitOnConflict} onChange={(v) => set("blockSubmitOnConflict", v)} />
        <ToggleRow label="Allow QRM override"
          desc="QRM persona may unblock a conflict-result deal after providing written justification."
          checked={!!settings.allowQrmOverride} onChange={(v) => set("allowQrmOverride", v)} />
        <ToggleRow label="Re-screen on client change"
          desc="When a client's industry, region, or relationship attributes change, re-screen all open deals attached to that client."
          checked={!!settings.autoScreenOnClientChange} onChange={(v) => set("autoScreenOnClientChange", v)} />
        <ToggleRow label="Nightly batch re-screen"
          desc="Run a nightly background re-screen of every open deal so policy changes propagate without manual action."
          checked={!!settings.nightlyRescreen} onChange={(v) => set("nightlyRescreen", v)} />
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Live API configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Tenant URL</label>
            <input type="text" defaultValue={settings.liveTenantUrl || settings.apiBaseUrl || ""}
              onBlur={(e) => set("liveTenantUrl", e.target.value)}
              placeholder="https://your-tenant.intapp.com/risk/v2"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Client ID</label>
            <input type="text" defaultValue={settings.liveClientId || ""}
              onBlur={(e) => set("liveClientId", e.target.value)}
              placeholder="armanino-prod"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">API key (write-only)</label>
            <input type="password" defaultValue=""
              onBlur={(e) => { if (e.target.value) set("liveApiKeySecret", e.target.value); }}
              placeholder={settings.liveApiKeyMasked ? "•••• stored ••••" : "Paste to set; never echoed back"}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Policy version</label>
            <input type="text" defaultValue={settings.policyVersion || ""}
              onBlur={(e) => set("policyVersion", e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Pilot end date</label>
            <input type="date" defaultValue={settings.pilotEndsOn || ""}
              onBlur={(e) => set("pilotEndsOn", e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">API token</label>
            <div className="mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm bg-stone-50 text-muted-foreground inline-flex items-center gap-2">
              {settings.hasApiToken ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Stored as secret</>
                : <><Lock className="w-3.5 h-3.5" /> Not configured</>}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">QRM conflict notifications</h3>
          <p className="text-xs text-muted-foreground mt-1">
            When a screening returns <span className="font-semibold text-red-700">CONFLICT</span>, push the deal link, hits and recommended actions to QRM so reviewers don't have to poll the cockpit.
          </p>
        </div>
        <ToggleRow label="Notify QRM on conflict"
          desc="Master switch. When off, no email or Teams message is sent — only the in-app cockpit and audit log are updated."
          checked={!!settings.qrmNotifyOnConflict} onChange={(v) => set("qrmNotifyOnConflict", v)} />
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Channel</label>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {["email", "teams", "both", "none"].map((c) => (
              <button key={c} onClick={() => set("qrmNotifyChannel", c)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium border capitalize ${
                  (settings.qrmNotifyChannel || "email") === c
                    ? "bg-primary text-white border-primary"
                    : "bg-white border-stone-300 text-foreground hover:bg-stone-50"
                }`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Recipients (comma-separated emails)</label>
            <input type="text" defaultValue={settings.qrmNotifyRecipients || ""}
              onBlur={(e) => set("qrmNotifyRecipients", e.target.value)}
              placeholder="qrm-leads@armanino.com, partner-on-call@armanino.com"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
            <div className="text-[11px] text-muted-foreground mt-1">
              Pilot mode: emails are simulated-send (recorded in the audit log; no SMTP wired). Live cutover swaps in your firm's mail relay.
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Microsoft Teams incoming-webhook URL {settings.qrmTeamsWebhookMasked && <span className="text-emerald-700 normal-case">· stored ({settings.qrmTeamsWebhookUrl})</span>}
            </label>
            <input type="password" defaultValue=""
              onBlur={(e) => { const v = e.target.value.trim(); if (v) set("qrmTeamsWebhookUrl", v); }}
              placeholder={settings.qrmTeamsWebhookMasked ? "•••• stored ••••  (paste a new URL to replace)" : "https://<tenant>.webhook.office.com/webhookb2/…"}
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary font-mono" />
            <div className="text-[11px] text-muted-foreground mt-1">
              Stored as a secret (host + last 6 chars echoed back, never the full URL). Only Microsoft webhook hosts (<code>*.webhook.office.com</code>, <code>outlook.office.com</code>, <code>*.logic.azure.com</code>) are accepted; anything else is rejected to prevent SSRF.
            </div>
            <button
              onClick={() => { if (confirm("Clear the stored Teams webhook URL?")) set("qrmTeamsWebhookUrl", ""); }}
              className="mt-1 text-[11px] text-red-700 hover:underline">
              Clear stored webhook
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">App base URL (used in deal links)</label>
            <input type="text" defaultValue={settings.appBaseUrl || ""}
              onBlur={(e) => set("appBaseUrl", e.target.value)}
              placeholder="https://dealpad.armanino.com"
              className="w-full mt-1 px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>
      </div>

      <div className="card p-5 bg-stone-50">
        <h3 className="text-sm font-semibold text-foreground mb-2">Cutover plan: simulated → live</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-5">
          <li>Provision Intapp Risk REST credentials and store as <code className="px-1 bg-white rounded border border-stone-200">INTAPP_API_TOKEN</code>.</li>
          <li>Set the Base URL above to the tenant endpoint.</li>
          <li>Replace the <code className="px-1 bg-white rounded border border-stone-200">LiveIntappProvider.screen()</code> body with an HTTP POST to <code className="px-1 bg-white rounded border border-stone-200">/risk/screen</code>; map the response 1:1 to the existing <code className="px-1 bg-white rounded border border-stone-200">IntappScreeningResponse</code> shape.</li>
          <li>Flip mode to <strong>Live API</strong> here. Existing screenings, hits, mitigations, events and routes work unchanged — the <code className="px-1 bg-white rounded border border-stone-200">source</code> column on each new record will read <code className="px-1 bg-white rounded border border-stone-200">live</code> for cutover identification.</li>
        </ol>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between">
      <div className="pr-6">
        <div className="text-sm text-foreground font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <button onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-primary" : "bg-stone-300"}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: number | string; sub: string; tone?: "emerald" | "amber" | "red" | "violet" }) {
  const toneClass = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : tone === "violet" ? "text-violet-700" : "text-foreground";
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function TierCard({ tier, label, count }: { tier: "low" | "medium" | "high"; label: string; count: number }) {
  const colors = {
    low: "bg-emerald-50 border-emerald-200 text-emerald-800",
    medium: "bg-amber-50 border-amber-200 text-amber-800",
    high: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`p-4 rounded-lg border ${colors[tier]}`}>
      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-3xl font-bold mt-1 tabular-nums">{count}</div>
    </div>
  );
}

export function RiskBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    low: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-red-100 text-red-700",
  };
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${colors[tier] || "bg-stone-100"}`}>{tier}</span>;
}

export function ResultBadge({ result }: { result: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    clear: { label: "Cleared", cls: "bg-emerald-100 text-emerald-700" },
    review: { label: "Review", cls: "bg-amber-100 text-amber-700" },
    conflict: { label: "Conflict", cls: "bg-red-100 text-red-700" },
    mitigated: { label: "Mitigated", cls: "bg-sky-100 text-sky-700" },
    override_approved: { label: "Override", cls: "bg-violet-100 text-violet-700" },
    pending: { label: "Pending", cls: "bg-stone-100 text-stone-700" },
  };
  const c = cfg[result] || cfg.pending;
  return <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${c.cls}`}>{c.label}</span>;
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold ${
      source === "live" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-700"
    }`}>
      {source === "live" ? <Globe className="w-2.5 h-2.5" /> : <Cog className="w-2.5 h-2.5" />}
      {source}
    </span>
  );
}

function EventRow({ e }: { e: any }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-md bg-stone-50 text-xs">
      <Activity className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{e.eventType.replace(/_/g, " ")}</span>
          <SourceBadge source={e.source || "simulated"} />
          {e.actorName && <span className="text-[10px] text-muted-foreground">by {e.actorName}</span>}
        </div>
        <div className="text-muted-foreground mt-0.5">{e.message}</div>
      </div>
      <div className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</div>
    </div>
  );
}
