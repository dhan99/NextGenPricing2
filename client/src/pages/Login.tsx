import { useAuth, PERSONAS, type PersonaRole } from "@/context/AuthContext";
import { Shield, ArrowRight, Lock, Unlock } from "lucide-react";

const personaCards: { role: PersonaRole; color: string; bgColor: string }[] = [
  { role: "pdl", color: "border-orange-400", bgColor: "bg-orange-50" },
  { role: "sll", color: "border-blue-400", bgColor: "bg-blue-50" },
  { role: "po", color: "border-emerald-400", bgColor: "bg-emerald-50" },
  { role: "fin", color: "border-violet-400", bgColor: "bg-violet-50" },
  { role: "qrm", color: "border-red-400", bgColor: "bg-red-50" },
  { role: "it", color: "border-stone-400", bgColor: "bg-stone-50" },
];

const permissionLabels: { key: string; label: string }[] = [
  { key: "createDeals", label: "Create Deals" },
  { key: "editDeals", label: "Edit Deals" },
  { key: "viewDeals", label: "View Deals" },
  { key: "approveDeals", label: "Approve Deals" },
  { key: "editPricing", label: "Edit Pricing" },
  { key: "manageRateCards", label: "Rate Cards" },
  { key: "manageScopeCatalog", label: "Scope Catalog" },
  { key: "viewMargins", label: "View Margins" },
  { key: "viewRiskSummary", label: "Risk Summary" },
  { key: "runAI", label: "AI Tools" },
];

export function Login() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-8 py-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-lg">D</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">DealPad</h1>
            <p className="text-sm text-muted-foreground">Pricing & Scoping 2.0</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Shield className="w-4 h-4" />
              Role-Based Access Control
            </div>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">Select Your Persona</h2>
            <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
              Each persona has different permissions reflecting their role in the deal lifecycle.
              Choose a persona to explore DealPad from their perspective.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {personaCards.map(({ role, color, bgColor }) => {
              const persona = PERSONAS[role];
              return (
                <button
                  key={role}
                  onClick={() => login(role)}
                  className={`text-left border-2 ${color} rounded-2xl p-5 hover:shadow-lg transition-all hover:-translate-y-0.5 ${bgColor} group`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${color} bg-white flex items-center justify-center border`}>
                        <span className="text-sm font-bold text-foreground">{persona.initials}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{persona.name}</p>
                        <p className="text-xs text-muted-foreground">{persona.fullTitle}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">{persona.description}</p>

                  <div className="flex flex-wrap gap-1.5">
                    {permissionLabels.map(({ key, label }) => {
                      const has = persona.permissions[key as keyof typeof persona.permissions];
                      return (
                        <span
                          key={key}
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            has
                              ? "bg-white/80 text-foreground border border-border"
                              : "bg-black/5 text-muted-foreground/50 line-through"
                          }`}
                        >
                          {has ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-8">
            This is a PoC demonstration of role-based access. In production, authentication flows through Azure Entra ID with RBAC policies.
          </p>
        </div>
      </div>
    </div>
  );
}
