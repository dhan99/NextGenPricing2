export function BusinessFeaturesInfographic() {
  return (
    <div
      className="min-h-screen font-['Inter',sans-serif] text-white"
      style={{
        background: "linear-gradient(165deg, #0f0a1e 0%, #1a0d2e 25%, #0d1b2a 50%, #0a192f 75%, #0f0a1e 100%)",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-10 py-12">
        <div className="text-center mb-14 relative">
          <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-lg font-medium mb-5 tracking-[0.2em] uppercase">
            <span className="w-3 h-3 rounded-full bg-cyan-400" />
            Full Platform Capabilities
          </div>
          <h1 className="text-[72px] font-black tracking-tight leading-none mb-4" style={{ background: "linear-gradient(135deg, #c084fc 0%, #818cf8 25%, #38bdf8 50%, #34d399 75%, #fbbf24 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Test Surety App
          </h1>
          <p className="text-3xl text-slate-400 font-light">The AI-First Surety Bond Platform</p>
          <p className="text-xl text-slate-500 mt-2 max-w-4xl mx-auto">15 major business capabilities across 3 role-based portals — from bond submission to issuance, renewals to cancellations, all powered by AI.</p>

          <div className="flex justify-center gap-14 mt-10">
            {[
              { value: "15+", label: "Capabilities", color: "#c084fc" },
              { value: "3", label: "User Portals", color: "#818cf8" },
              { value: "9", label: "AI Features", color: "#38bdf8" },
              { value: "400+", label: "Bond Forms", color: "#34d399" },
              { value: "6", label: "Integrations", color: "#fbbf24" },
              { value: "15", label: "DB Tables", color: "#fb7185" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-black" style={{ color: s.color }}>{s.value}</div>
                <div className="text-base text-slate-500 uppercase tracking-[0.15em] mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5 mb-8">
          {[
            { icon: "🏢", name: "Agent Portal", desc: "Manage book of business, submit applications, track renewals", color: "#22c55e", bg: "#052e16" },
            { icon: "👤", name: "Principal Portal", desc: "Self-serve bond management, AI chat, payments", color: "#3b82f6", bg: "#172554" },
            { icon: "⚖️", name: "Underwriter Portal", desc: "Risk assessment, decisioning, portfolio oversight", color: "#8b5cf6", bg: "#1e1b4b" },
          ].map((p, i) => (
            <div key={i} className="rounded-2xl p-7 relative overflow-hidden" style={{ background: p.bg, border: `2px solid ${p.color}30` }}>
              <div className="absolute top-0 right-0 w-36 h-36 rounded-full blur-[50px] opacity-20" style={{ background: p.color }} />
              <div className="relative z-10 flex items-center gap-5">
                <div className="text-4xl">{p.icon}</div>
                <div>
                  <div className="text-2xl font-bold" style={{ color: p.color }}>{p.name}</div>
                  <div className="text-base text-slate-400">{p.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-5 mb-5">
          <div className="col-span-2 rounded-2xl p-8 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #0f2640 100%)" }}>
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] opacity-20" style={{ background: "#3b82f6" }} />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-semibold tracking-[0.15em] uppercase mb-3" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>Core Workflow</div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">📋</span>
                <h2 className="text-3xl font-black tracking-tight">Bond Application & Issuance</h2>
              </div>
              <p className="text-lg text-blue-200/60 mb-5">6-step guided wizard from bond form selection to payment — with AI assistance at every step.</p>
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                {["Bond Form", "Account", "Applicant", "Bond Info", "Review", "Payment"].map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: `${["#3b82f6","#6366f1","#8b5cf6","#a855f7","#c084fc","#34d399"][i]}20` }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: ["#3b82f6","#6366f1","#8b5cf6","#a855f7","#c084fc","#34d399"][i] }}>{i+1}</div>
                      <span className="text-sm font-semibold" style={{ color: ["#3b82f6","#6366f1","#8b5cf6","#a855f7","#c084fc","#34d399"][i] }}>{s}</span>
                    </div>
                    {i < 5 && <span className="text-slate-600 text-lg">→</span>}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {["AI Form Matching — plain English → correct form", "Client Pre-Fill — auto-populate returning clients", "Premium Calculation — real-time rate computation", "Bond Number Generation — unique IDs on creation"].map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-base text-slate-300 bg-black/20 rounded-xl px-4 py-3">
                    <span className="text-blue-400 mt-0.5">✦</span><span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #312e81 0%, #1e1b4b 100%)" }}>
            <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full blur-[50px] opacity-25" style={{ background: "#7c3aed" }} />
            <div className="relative z-10">
              <div className="text-4xl mb-2">🧠</div>
              <h3 className="text-2xl font-bold mb-2">AI Underwriting</h3>
              <p className="text-base text-violet-200/60 leading-relaxed mb-4">Instant risk scoring (0–100), automated triage, and AI-powered decision recommendations.</p>
              <div className="bg-black/30 rounded-xl p-4 border border-violet-500/20 mb-3">
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-5xl font-black text-emerald-400">23</span>
                  <span className="text-base text-emerald-400/80 pb-2">/100 Low Risk</span>
                </div>
                <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: "23%", background: "linear-gradient(90deg, #34d399, #10b981)" }} />
                </div>
              </div>
              <div className="space-y-2">
                {[{l:"Low Risk",a:"Auto-Approve",c:"#34d399"},{l:"Med Risk",a:"Manual Review",c:"#fbbf24"},{l:"High Risk",a:"Auto-Decline",c:"#f87171"}].map((t,i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-base" style={{ background: `${t.c}10` }}>
                    <span style={{ color: t.c }} className="font-semibold">{t.l}</span>
                    <span className="text-slate-400">→ {t.a}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-5 mb-5">
          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1c1917 0%, #0c0a09 100%)" }}>
            <div className="absolute top-0 left-0 w-32 h-32 rounded-full blur-[50px] opacity-15" style={{ background: "#f59e0b" }} />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">🔄</span>
                <h3 className="text-xl font-bold">Bond Lifecycle</h3>
              </div>
              <p className="text-base text-amber-200/60 leading-relaxed mb-4">Full state machine from Draft to Issued with branches for decline, referral, and cancellation.</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {[{s:"Draft",c:"#94a3b8"},{s:"Submitted",c:"#94a3b8"},{s:"Quoted",c:"#94a3b8"},{s:"Approved",c:"#38bdf8"},{s:"Issued",c:"#34d399"},{s:"Declined",c:"#fb7185"},{s:"Referred",c:"#fbbf24"},{s:"Cancelled",c:"#fb7185"}].map((st,i) => (
                  <span key={i} className="px-2 py-1 rounded-lg text-sm font-medium" style={{ background: `${st.c}15`, color: st.c }}>{st.s}</span>
                ))}
              </div>
            </div>
          </div>

          {[
            { emoji: "📅", title: "Renewals", desc: "90-day window detection. One-click renewal drafts from existing bond data.", col: "#34d399", bg: "#0c2a1e" },
            { emoji: "🚫", title: "Non-Renew", desc: "Primary origin marks bonds non-renew with reason. Reversible. Excluded from queues.", col: "#fbbf24", bg: "#1a1520" },
            { emoji: "📝", title: "Endorsements", desc: "Name, address, amount changes — routed to UW with auto premium delta calc.", col: "#818cf8", bg: "#0f1a2e" },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl p-6 relative overflow-hidden" style={{ background: item.bg }}>
              <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl" style={{ background: item.col }} />
              <div className="text-3xl mb-2">{item.emoji}</div>
              <h3 className="text-xl font-bold mb-2" style={{ color: item.col }}>{item.title}</h3>
              <p className="text-base text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-5 mb-5">
          {[
            { emoji: "💳", title: "Payment Processing", desc: "Secure tokenized payment links with OTP verification before card processing.", items: ["Secure payment link generation", "OTP via Email + SMS (Twilio)", "Card type & last-4 tracking", "Auto-expiring payment tokens", "Agent notified on completion"], col: "#34d399", bg: "linear-gradient(135deg, #064e3b, #022c22)" },
            { emoji: "🔒", title: "Access Control", desc: "Primary Origin system — only the bond creator can perform lifecycle ops.", items: ["Primary origin tracking per bond", "Gated cancel / endorse / non-renew", "Underwriter bypass for all ops", "Auto-backfill on server startup", "Role-based portfolio visibility"], col: "#8b5cf6", bg: "linear-gradient(135deg, #1e1b4b, #0f0d2e)" },
            { emoji: "📧", title: "Notifications", desc: "Branded emails via Resend + SMS via Twilio at every critical workflow point.", items: ["Payment request emails", "OTP verification (email + SMS)", "UW decision notifications", "Payment completion alerts", "Branded Test Surety App templates"], col: "#60a5fa", bg: "linear-gradient(135deg, #1e3a5f, #0f2640)" },
          ].map((item, i) => (
            <div key={i} className="rounded-2xl p-7 relative overflow-hidden" style={{ background: item.bg }}>
              <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl" style={{ background: item.col }} />
              <div className="text-3xl mb-2">{item.emoji}</div>
              <h3 className="text-xl font-bold mb-1.5" style={{ color: item.col }}>{item.title}</h3>
              <p className="text-base text-slate-400 leading-relaxed mb-3">{item.desc}</p>
              <div className="space-y-1.5">
                {item.items.map((f, j) => (
                  <div key={j} className="flex items-center gap-2 text-base text-slate-300">
                    <span style={{ color: item.col }}>✓</span>{f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-5 mb-5">
          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "#0f1520" }}>
            <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl bg-cyan-400" />
            <div className="text-3xl mb-2">📚</div>
            <h3 className="text-xl font-bold mb-1.5 text-cyan-300">Bond Form Library</h3>
            <p className="text-base text-cyan-200/50 leading-relaxed mb-3">Searchable catalog of 400+ bond types across categories with state-specific requirements and rates.</p>
            <div className="grid grid-cols-3 gap-2">
              {["Court Bonds", "License & Permit", "Performance", "Contractor", "Fidelity", "Miscellaneous"].map((c, i) => (
                <div key={i} className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-sm text-cyan-300 text-center font-medium">{c}</div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "#101520" }}>
            <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl bg-blue-400" />
            <div className="text-3xl mb-2">👥</div>
            <h3 className="text-xl font-bold mb-1.5 text-blue-300">Client Management</h3>
            <p className="text-base text-blue-200/50 leading-relaxed mb-3">Full CRM with company info, DBA names, tax IDs, validated addresses, and bond history.</p>
            <div className="space-y-1.5">
              {["Client profiles + bond linking", "Principal self-service portal", "Agent → Client association", "Returning client auto-detection"].map((f, i) => (
                <div key={i} className="text-base text-slate-300 flex items-center gap-2"><span className="text-blue-400">›</span>{f}</div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "#15100a" }}>
            <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl bg-amber-400" />
            <div className="text-3xl mb-2">📄</div>
            <h3 className="text-xl font-bold mb-1.5 text-amber-300">Documents & PDF</h3>
            <p className="text-base text-amber-200/50 leading-relaxed mb-3">Upload, store, and generate bond documents, invoices, and applications from templates.</p>
            <div className="space-y-1.5">
              {["PDF generation from templates", "Document upload + tracking", "Completed bond attachments", "Per-bond document history"].map((f, i) => (
                <div key={i} className="text-base text-slate-300 flex items-center gap-2"><span className="text-amber-400">›</span>{f}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5 mb-5">
          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "#0a0f1e" }}>
            <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl bg-indigo-400" />
            <div className="text-3xl mb-2">🔎</div>
            <h3 className="text-xl font-bold mb-1.5 text-indigo-300">Search & Navigation</h3>
            <p className="text-base text-indigo-200/50 leading-relaxed mb-3">Global search, command palette, advanced filtering, sortable columns, and server-side pagination.</p>
          </div>

          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "#0f0a18" }}>
            <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl bg-violet-400" />
            <div className="text-3xl mb-2">💬</div>
            <h3 className="text-xl font-bold mb-1.5 text-violet-300">Comments & Notes</h3>
            <p className="text-base text-violet-200/50 leading-relaxed mb-3">Thread-based comments with role attribution. Internal underwriter-only notes.</p>
          </div>

          <div className="rounded-2xl p-7 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #1a0d2e, #0f0a1e)" }}>
            <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl" style={{ background: "linear-gradient(90deg, #c084fc, #38bdf8)" }} />
            <div className="relative z-10">
              <div className="text-3xl mb-2">✨</div>
              <h3 className="text-xl font-bold mb-1.5" style={{ background: "linear-gradient(135deg, #c084fc, #38bdf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Gen-Z UX Design</h3>
              <p className="text-base text-purple-200/50 leading-relaxed mb-3">Modern design with Tailwind 4, Radix UI, dark mode, and persona colors.</p>
              <div className="flex gap-3">
                {[{label:"Agent",color:"#22c55e"},{label:"Principal",color:"#3b82f6"},{label:"UW",color:"#8b5cf6"}].map((c,i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5">
                    <div className="w-4 h-4 rounded-full" style={{ background: c.color }} />
                    <span className="text-base text-slate-400">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-6 border border-white/5 mb-5" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="text-base text-slate-500 uppercase tracking-[0.2em] mb-4 text-center font-medium">Technology Stack & Infrastructure</div>
          <div className="flex justify-center gap-3 flex-wrap">
            {[
              { label: "React + Vite", icon: "⚛️" },{ label: "Express.js", icon: "🚀" },{ label: "PostgreSQL", icon: "🗄️" },{ label: "Drizzle ORM", icon: "💧" },{ label: "Tailwind 4", icon: "🎨" },{ label: "Claude AI", icon: "🧠" },{ label: "Resend", icon: "📧" },{ label: "Twilio", icon: "📱" },{ label: "Replit Cloud", icon: "☁️" },{ label: "TypeScript", icon: "📘" },{ label: "pnpm Monorepo", icon: "📦" },{ label: "OpenAPI", icon: "🔗" },
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <span className="text-lg">{t.icon}</span>
                <span className="text-base text-slate-400">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center pt-5 pb-2">
          <div className="text-base text-slate-600 tracking-[0.15em] uppercase">Test Surety App — AI-First Surety Bond Platform</div>
        </div>
      </div>
    </div>
  );
}
