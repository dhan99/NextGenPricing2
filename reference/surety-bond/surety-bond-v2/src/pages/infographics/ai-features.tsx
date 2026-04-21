export function AIFeaturesInfographic() {
  return (
    <div
      className="min-h-screen font-['Inter',sans-serif] text-white"
      style={{
        background: "linear-gradient(165deg, #0f0a1e 0%, #1a0d2e 25%, #0d1b2a 50%, #0a192f 75%, #0f0a1e 100%)",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-10 py-12">
        <div className="text-center mb-16 relative">
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.04]" style={{ fontSize: "320px", fontWeight: 900 }}>AI</div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-sm font-medium mb-6 tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            Powered by Claude Haiku 4.5
          </div>
          <h1 className="text-6xl font-black tracking-tight mb-4" style={{ background: "linear-gradient(135deg, #c084fc, #818cf8, #38bdf8, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            AI That Thinks Like<br />a Senior Underwriter
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
            9 AI-powered capabilities woven into every layer of Test Surety App — from the first form field to the final policy decision.
          </p>

          <div className="flex justify-center gap-12 mt-10">
            {[
              { value: "9", label: "AI Features", color: "#c084fc" },
              { value: "5", label: "AI Agents", color: "#818cf8" },
              { value: "<2s", label: "Risk Score", color: "#38bdf8" },
              { value: "400+", label: "Bond Forms", color: "#34d399" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-black" style={{ color: s.color }}>{s.value}</div>
                <div className="text-sm text-slate-500 uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5 mb-12">

          <div className="col-span-2 row-span-2 rounded-2xl p-8 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #312e81 0%, #1e1b4b 100%)" }}>
            <div className="absolute top-0 right-0 w-72 h-72 rounded-full blur-[100px] opacity-30" style={{ background: "#7c3aed" }} />
            <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full blur-[80px] opacity-20" style={{ background: "#3b82f6" }} />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-[14px] font-semibold tracking-widest uppercase mb-4">
                Core Engine
              </div>
              <div className="text-6xl mb-5">🧠</div>
              <h2 className="text-3xl font-black mb-3 tracking-tight">AI Underwriting<br />& Risk Assessment</h2>
              <p className="text-violet-200/70 text-base leading-relaxed max-w-md mb-6">
                Every bond application is instantly analyzed by Claude — scoring risk from 0–100, flagging concerns, and recommending decisions before a human ever sees it.
              </p>

              <div className="flex gap-4 items-start">
                <div className="bg-black/30 backdrop-blur-sm rounded-xl p-5 border border-violet-500/20 flex-1">
                  <div className="text-sm text-violet-300/60 uppercase tracking-wider mb-2">Risk Analysis</div>
                  <div className="flex items-end gap-3 mb-3">
                    <div className="text-5xl font-black text-emerald-400">23</div>
                    <div className="text-base text-emerald-400/80 pb-1.5">/100 — Low Risk</div>
                  </div>
                  <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: "23%", background: "linear-gradient(90deg, #34d399, #10b981)" }} />
                  </div>
                  <div className="flex justify-between text-[13px] text-slate-500 mt-1">
                    <span>Safe</span><span>Moderate</span><span>High</span><span>Critical</span>
                  </div>
                </div>
                <div className="bg-black/30 backdrop-blur-sm rounded-xl p-5 border border-violet-500/20 flex-1">
                  <div className="text-sm text-violet-300/60 uppercase tracking-wider mb-2">AI Decision</div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    <span className="text-lg font-bold text-emerald-400">AUTO-APPROVE</span>
                  </div>
                  <div className="text-[15px] text-slate-400 leading-relaxed">
                    Confidence: <span className="text-emerald-300 font-semibold">94%</span><br />
                    No prior claims. Clean history. Standard rate.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2640 100%)" }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-20" style={{ background: "#3b82f6" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">⚡</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">Automated Triage</h3>
              <p className="text-blue-200/60 text-sm leading-relaxed mb-4">
                Instant routing — auto-approve, manual review, or auto-decline — before any human touches it.
              </p>
              <div className="space-y-2">
                {[
                  { label: "Low Risk", action: "Auto-Approve", color: "#34d399", bg: "rgba(52,211,153,0.1)" },
                  { label: "Med Risk", action: "Manual Review", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
                  { label: "High Risk", action: "Auto-Decline", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
                ].map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-[15px]" style={{ background: t.bg }}>
                    <span style={{ color: t.color }} className="font-semibold">{t.label}</span>
                    <span className="text-slate-400">→ {t.action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}>
            <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-15" style={{ background: "#f59e0b" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">🔔</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">Smart Alerts</h3>
              <p className="text-amber-200/60 text-sm leading-relaxed mb-4">
                AI-generated contextual alerts for high-value bonds, compliance flags, and risk anomalies.
              </p>
              <div className="space-y-2">
                <div className="rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/20 text-[14px]">
                  <span className="text-red-400 font-bold">HIGH VALUE</span>
                  <span className="text-slate-400 ml-2">Bond exceeds $1M — concentration risk</span>
                </div>
                <div className="rounded-lg px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-[14px]">
                  <span className="text-amber-400 font-bold">COMPLIANCE</span>
                  <span className="text-slate-400 ml-2">CA requires e-filing for this class</span>
                </div>
                <div className="rounded-lg px-3 py-2 bg-blue-500/10 border border-blue-500/20 text-[14px]">
                  <span className="text-blue-400 font-bold">STATE</span>
                  <span className="text-slate-400 ml-2">NY special disclosure required</span>
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-3 rounded-2xl p-8 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)" }}>
            <div className="absolute top-0 left-1/2 w-96 h-96 -translate-x-1/2 rounded-full blur-[120px] opacity-15" style={{ background: "#10b981" }} />
            <div className="relative z-10 flex gap-8 items-start">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[14px] font-semibold tracking-widest uppercase mb-4">
                  Principal Portal
                </div>
                <div className="text-4xl mb-4">💬</div>
                <h2 className="text-2xl font-black mb-3 tracking-tight">Bond Assist — Conversational AI</h2>
                <p className="text-emerald-200/60 text-base leading-relaxed max-w-lg mb-4">
                  Principals submit bonds through natural conversation. No forms, no jargon — just chat. Five specialized AI agents collaborate behind the scenes.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {["🎯 Orchestrator", "📋 Intake", "⚖️ Underwriting", "📄 Issuance", "🔄 Lifecycle"].map((a, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 text-[14px] font-medium">{a}</span>
                  ))}
                </div>
              </div>

              <div className="w-[360px] bg-black/30 backdrop-blur-sm rounded-xl border border-emerald-500/20 overflow-hidden shrink-0">
                <div className="px-4 py-3 border-b border-emerald-500/10 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-medium text-emerald-300">Bond Assist is typing...</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-emerald-600/30 rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-emerald-100 max-w-[240px]">
                      I need a contractor license bond in Texas for $25,000
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-white/5 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-300 max-w-[260px] leading-relaxed">
                      Great! I found <span className="text-emerald-400 font-semibold">TX Contractor License Bond (Form CL-104)</span>. Let me gather a few details to get you a quote. What's your company name?
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-emerald-600/30 rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-emerald-100">
                      Apex Construction LLC
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-white/5 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-300 max-w-[260px] leading-relaxed">
                      Got it! Based on your clean history, your estimated premium is <span className="text-emerald-400 font-semibold">$625/yr</span>. Shall I proceed?
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #3b1764 0%, #1e0a3c 100%)" }}>
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-[60px] opacity-20" style={{ background: "#a855f7" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">✨</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">AI Form Assistant</h3>
              <p className="text-purple-200/60 text-sm leading-relaxed mb-4">
                Real-time guidance as agents fill the wizard — tips, auto-fills, and smart validation.
              </p>
              <div className="bg-black/30 rounded-lg p-3 border border-purple-500/20">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-purple-400 text-sm">💡</span>
                  <span className="text-[14px] text-purple-200/70">Based on the bond type, the standard effective period is 12 months. Auto-setting expiration date.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 text-sm">⚠️</span>
                  <span className="text-[14px] text-amber-200/70">Tax ID field is required for corporate principals.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0c1f38 100%)" }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-15" style={{ background: "#06b6d4" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">🔁</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">AI Client Pre-Fill</h3>
              <p className="text-cyan-200/60 text-sm leading-relaxed mb-4">
                Returning clients? AI pulls from prior submissions to auto-populate the entire application.
              </p>
              <div className="bg-black/30 rounded-lg p-3 border border-cyan-500/20 space-y-1.5">
                {[
                  { field: "Company", val: "Apex Construction LLC", filled: true },
                  { field: "Address", val: "1234 Main St, Houston TX", filled: true },
                  { field: "Tax ID", val: "XX-XXX4567", filled: true },
                  { field: "Bond Amt", val: "$25,000", filled: false },
                ].map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[14px]">
                    <span className="text-slate-500">{f.field}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-300">{f.val}</span>
                      {f.filled && <span className="text-emerald-400 text-[13px]">AI</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%)" }}>
            <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-15" style={{ background: "#8b5cf6" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">🔍</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">NLP Form Matching</h3>
              <p className="text-indigo-200/60 text-sm leading-relaxed mb-4">
                Describe what you need in plain English — AI matches it to the right bond from 400+ forms.
              </p>
              <div className="bg-black/30 rounded-lg p-3 border border-indigo-500/20">
                <div className="text-[14px] text-slate-400 mb-2 italic">"contractor bond california $50k"</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-indigo-400 text-sm">→</span>
                  <span className="text-[14px] text-indigo-200 font-semibold">CA-CLB-001 · Contractor License Bond</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-indigo-400 text-sm">→</span>
                  <span className="text-[14px] text-indigo-200/50">CA-PB-003 · Performance Bond (alt)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1c1917 0%, #0c0a09 100%)" }}>
            <div className="absolute top-0 left-0 w-32 h-32 rounded-full blur-[60px] opacity-15" style={{ background: "#f59e0b" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">☀️</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">AI Morning Brief</h3>
              <p className="text-amber-200/60 text-sm leading-relaxed mb-4">
                Every portal dashboard opens with an AI-curated summary of what needs attention today.
              </p>
              <div className="bg-black/30 rounded-lg p-3 border border-amber-500/20 space-y-2">
                <div className="text-[14px] text-amber-300 font-semibold">Today's Priorities</div>
                <div className="text-[14px] text-slate-400">📌 3 bonds expiring within 7 days</div>
                <div className="text-[14px] text-slate-400">⚡ 2 referrals awaiting UW decision</div>
                <div className="text-[14px] text-slate-400">💰 $45K premium pending collection</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #172554 0%, #0c1524 100%)" }}>
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-[60px] opacity-15" style={{ background: "#3b82f6" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">💡</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">AI Status Explainer</h3>
              <p className="text-blue-200/60 text-sm leading-relaxed mb-4">
                Principals get jargon-free, personalized explanations of complex bond statuses.
              </p>
              <div className="bg-black/30 rounded-lg p-3 border border-blue-500/20">
                <div className="text-[14px] text-slate-500 mb-1">Status: <span className="text-amber-400">Requires Referral</span></div>
                <div className="text-[14px] text-blue-200/70 leading-relaxed italic">
                  "Your bond is being reviewed by a senior underwriter because the amount is above $100K. This typically takes 1–2 business days. No action needed from you."
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-6 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #0f0d2e 100%)" }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-20" style={{ background: "#6366f1" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="text-lg font-bold mb-2 tracking-tight">UW Decision Support</h3>
              <p className="text-indigo-200/60 text-sm leading-relaxed mb-4">
                Underwriters see AI's full analysis and recommendation as a "second opinion" before decisioning.
              </p>
              <div className="bg-black/30 rounded-lg p-3 border border-indigo-500/20 space-y-1.5">
                <div className="flex justify-between text-[14px]">
                  <span className="text-slate-500">AI Recommendation</span>
                  <span className="text-emerald-400 font-bold">APPROVE</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-slate-500">Confidence</span>
                  <span className="text-indigo-300">91%</span>
                </div>
                <div className="flex justify-between text-[14px]">
                  <span className="text-slate-500">Premium Adj.</span>
                  <span className="text-slate-300">+0% (standard)</span>
                </div>
                <div className="w-full h-px bg-indigo-500/20 my-1" />
                <div className="text-[13px] text-slate-500 italic">Clean financials. 8yr experience. No flags.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center pt-4 pb-2 border-t border-white/5">
          <div className="text-sm text-slate-600 tracking-wider">TEST SURETY APP — AI-FIRST SURETY BOND PLATFORM — BUILT ON REPLIT</div>
        </div>
      </div>
    </div>
  );
}
