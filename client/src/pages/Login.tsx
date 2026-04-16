import { useAuth, PERSONAS, type PersonaRole } from "@/context/AuthContext";
import { ArrowRight, Brain, ShieldCheck, Zap, TrendingUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const personaList: { role: PersonaRole; avatarBg: string; ringColor: string }[] = [
  { role: "pdl", avatarBg: "bg-orange-100 text-orange-700", ringColor: "ring-orange-400" },
  { role: "sll", avatarBg: "bg-blue-100 text-blue-700", ringColor: "ring-blue-400" },
  { role: "po", avatarBg: "bg-emerald-100 text-emerald-700", ringColor: "ring-emerald-400" },
  { role: "fin", avatarBg: "bg-violet-100 text-violet-700", ringColor: "ring-violet-400" },
  { role: "qrm", avatarBg: "bg-red-100 text-red-700", ringColor: "ring-red-400" },
  { role: "it", avatarBg: "bg-stone-100 text-stone-700", ringColor: "ring-stone-400" },
];

const permissionLabels: Record<string, string> = {
  createDeals: "Create Deals",
  editDeals: "Edit Deals",
  viewDeals: "View Deals",
  approveDeals: "Approve Deals",
  editPricing: "Edit Pricing",
  manageRateCards: "Rate Cards",
  manageScopeCatalog: "Scope Catalog",
  viewMargins: "View Margins",
  viewRiskSummary: "Risk Summary",
  runAI: "AI Tools",
};

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
  const [expandedRole, setExpandedRole] = useState<PersonaRole | null>(null);
  const [, navigate] = useLocation();

  const handleLogin = (role: PersonaRole) => {
    login(role);
    navigate("/");
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden" style={{ background: "linear-gradient(135deg, #fdf8f3 0%, #fef3e7 40%, #fde8d0 100%)" }}>
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
              AI-powered pricing, scoping, and margin analytics for professional services —
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

        <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-10 overflow-y-auto">
          <div className="max-w-lg mx-auto w-full">
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-7">
              <h3 className="text-xl font-semibold text-stone-900">Welcome to DealPad</h3>
              <p className="text-sm text-stone-500 mt-1 mb-6">Select a persona to access the platform</p>

              <div className="space-y-2">
                {personaList.map(({ role, avatarBg, ringColor }) => {
                  const persona = PERSONAS[role];
                  const isExpanded = expandedRole === role;
                  const enabledPerms = Object.entries(persona.permissions)
                    .filter(([, v]) => v)
                    .map(([k]) => k);

                  return (
                    <div
                      key={role}
                      className={`rounded-xl border transition-all ${isExpanded ? "border-stone-300 bg-stone-50/50 shadow-sm" : "border-stone-200 hover:border-stone-300"}`}
                    >
                      <button
                        onClick={() => setExpandedRole(isExpanded ? null : role)}
                        onFocus={() => setExpandedRole(role)}
                        aria-expanded={isExpanded}
                        className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 rounded-xl"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarBg} ${isExpanded ? `ring-2 ${ringColor} ring-offset-1` : ""}`}>
                          {persona.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">{persona.name}</p>
                          <p className="text-xs text-stone-500">{persona.fullTitle}</p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </button>

                      <div
                        className={`grid transition-all duration-200 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-4 pb-4 pt-0.5">
                            <p className="text-sm text-stone-600 leading-relaxed mb-3">
                              {persona.description}
                            </p>

                            <div className="flex flex-wrap gap-1.5 mb-4">
                              {Object.entries(permissionLabels).map(([key, label]) => {
                                const has = enabledPerms.includes(key);
                                return (
                                  <span
                                    key={key}
                                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                      has
                                        ? "bg-stone-800 text-white"
                                        : "bg-stone-100 text-stone-400 line-through"
                                    }`}
                                  >
                                    {label}
                                  </span>
                                );
                              })}
                            </div>

                            <button
                              onClick={(e) => { e.stopPropagation(); handleLogin(role); }}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
                              style={{ backgroundColor: "#DA720F" }}
                            >
                              Sign in as {persona.name.split(" ")[0]}
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-center text-xs text-stone-400 mt-6">
              PoC demonstration — production auth via Azure Entra ID
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
