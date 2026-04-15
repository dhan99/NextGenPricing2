import { useAuth, PERSONAS, type PersonaRole } from "@/context/AuthContext";
import { ArrowRight, Brain, ShieldCheck, Zap, TrendingUp } from "lucide-react";
import { useState } from "react";

const personaList: { role: PersonaRole; avatarBg: string }[] = [
  { role: "pdl", avatarBg: "bg-orange-100 text-orange-700" },
  { role: "sll", avatarBg: "bg-blue-100 text-blue-700" },
  { role: "po", avatarBg: "bg-emerald-100 text-emerald-700" },
  { role: "fin", avatarBg: "bg-violet-100 text-violet-700" },
  { role: "qrm", avatarBg: "bg-red-100 text-red-700" },
  { role: "it", avatarBg: "bg-stone-100 text-stone-700" },
];

const features = [
  { icon: Brain, label: "AI-powered effort estimation" },
  { icon: ShieldCheck, label: "Risk scoring and compliance" },
  { icon: TrendingUp, label: "Real-time margin analytics" },
  { icon: Zap, label: "Automated scenario modeling" },
];

const stats = [
  { value: "5", label: "AI Models" },
  { value: "6", label: "Personas" },
  { value: "98%", label: "Accuracy" },
];

export function Login() {
  const { login } = useAuth();
  const [selectedPreview, setSelectedPreview] = useState<PersonaRole | null>(null);

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden" style={{ background: "linear-gradient(135deg, #fdf8f3 0%, #fef3e7 40%, #fde8d0 100%)" }}>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #DA720F 1px, transparent 0)", backgroundSize: "32px 32px" }} />

        <div className="relative z-10 flex flex-col justify-between p-12 lg:p-16 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#DA720F" }}>
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900 tracking-tight">DealPad</h1>
              <p className="text-xs text-stone-500">by Armanino LLP</p>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <h2 className="text-4xl lg:text-5xl font-bold text-stone-900 leading-tight tracking-tight">
              Deal pricing,{" "}
              <span style={{ color: "#DA720F" }}>simplified.</span>
            </h2>
            <p className="mt-5 text-stone-500 text-base leading-relaxed">
              AI-powered pricing, scoping, and margin analytics for professional services --
              replacing spreadsheets with intelligent workflows.
            </p>

            <div className="flex items-center gap-3 mt-10">
              {stats.map((s) => (
                <div key={s.label} className="flex-1 bg-white/70 backdrop-blur-sm border border-stone-200/60 rounded-xl px-5 py-4 text-center">
                  <p className="text-2xl font-bold text-stone-900">{s.value}</p>
                  <p className="text-xs text-stone-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 space-y-3.5">
              {features.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(218, 114, 15, 0.1)" }}>
                    <f.icon className="w-4 h-4" style={{ color: "#DA720F" }} />
                  </div>
                  <span className="text-sm text-stone-600">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-stone-400">
            2026 Armanino LLP. NextGenApp Pricing & Scoping 2.0
          </p>
        </div>
      </div>

      <div className="flex-1 bg-stone-50 flex flex-col">
        <div className="lg:hidden border-b border-stone-200 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#DA720F" }}>
              <span className="text-white font-bold">D</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-stone-900">DealPad</h1>
              <p className="text-xs text-stone-500">Pricing & Scoping 2.0</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-10 overflow-y-auto">
          <div className="max-w-md mx-auto w-full">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8 mb-5">
              <h3 className="text-xl font-semibold text-stone-900">Welcome to DealPad</h3>
              <p className="text-sm text-stone-500 mt-1 mb-6">Select a persona to access the platform</p>

              <div className="space-y-2">
                {personaList.map(({ role, avatarBg }) => {
                  const persona = PERSONAS[role];
                  return (
                    <div key={role} className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedPreview(selectedPreview === role ? null : role)}
                        onFocus={() => setSelectedPreview(role)}
                        aria-label={`Preview permissions for ${persona.name}`}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-all focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${avatarBg} ${selectedPreview === role ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
                      >
                        {persona.initials}
                      </button>
                      <button
                        onClick={() => login(role)}
                        onMouseEnter={() => setSelectedPreview(role)}
                        onFocus={() => setSelectedPreview(role)}
                        className="flex-1 flex items-center gap-3.5 px-4 py-3.5 rounded-xl border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-all text-left group focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">{persona.name}</p>
                          <p className="text-xs text-stone-500 truncate">{persona.fullTitle}</p>
                        </div>
                        <ArrowRight className={`w-4 h-4 text-stone-400 shrink-0 transition-all ${selectedPreview === role ? "translate-x-0.5 text-stone-600" : ""}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
              <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-3">About Personas</p>
              {selectedPreview ? (
                <div className="animate-in fade-in duration-200">
                  <p className="text-sm font-medium text-stone-900">{PERSONAS[selectedPreview].name}</p>
                  <p className="text-xs text-stone-500 mt-0.5 mb-3">{PERSONAS[selectedPreview].fullTitle}</p>
                  <p className="text-sm text-stone-600 leading-relaxed">{PERSONAS[selectedPreview].description}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {Object.entries(PERSONAS[selectedPreview].permissions)
                      .filter(([, v]) => v)
                      .map(([key]) => (
                        <span key={key} className="text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
                          {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                        </span>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-stone-500 leading-relaxed">
                  Each persona reflects a distinct role in the deal lifecycle with tailored permissions.
                  Select a persona's avatar to preview their access level.
                </p>
              )}
            </div>

            <p className="text-center text-[11px] text-stone-400 mt-6">
              PoC demonstration -- production auth via Azure Entra ID
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
