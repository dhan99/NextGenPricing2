import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type PersonaRole = "pdl" | "sll" | "po" | "fin" | "qrm" | "it";

export interface Persona {
  role: PersonaRole;
  name: string;
  fullTitle: string;
  initials: string;
  description: string;
  permissions: {
    createDeals: boolean;
    editDeals: boolean;
    viewDeals: boolean;
    approveDeals: boolean;
    manageRateCards: boolean;
    manageScopeCatalog: boolean;
    viewAdminConfig: boolean;
    viewPricing: boolean;
    editPricing: boolean;
    viewMargins: boolean;
    viewRiskSummary: boolean;
    viewArchitecture: boolean;
    viewDashboard: boolean;
    runAI: boolean;
  };
}

export const PERSONAS: Record<PersonaRole, Persona> = {
  pdl: {
    role: "pdl",
    name: "Michael Torres",
    fullTitle: "Project Delivery Lead",
    initials: "MT",
    description: "Primary deal owner. Creates, scopes, prices, and submits deals for approval. Full access to AI tools and deal wizard.",
    permissions: {
      createDeals: true,
      editDeals: true,
      viewDeals: true,
      approveDeals: false,
      manageRateCards: false,
      manageScopeCatalog: false,
      viewAdminConfig: true,
      viewPricing: true,
      editPricing: true,
      viewMargins: true,
      viewRiskSummary: true,
      viewArchitecture: true,
      viewDashboard: true,
      runAI: true,
    },
  },
  sll: {
    role: "sll",
    name: "Sarah Chen",
    fullTitle: "Service Line Leader",
    initials: "SC",
    description: "Reviews and approves deals. Views pipeline dashboards and margin reports. Cannot create or edit deal pricing directly.",
    permissions: {
      createDeals: false,
      editDeals: false,
      viewDeals: true,
      approveDeals: true,
      manageRateCards: false,
      manageScopeCatalog: false,
      viewAdminConfig: false,
      viewPricing: true,
      editPricing: false,
      viewMargins: true,
      viewRiskSummary: true,
      viewArchitecture: true,
      viewDashboard: true,
      runAI: false,
    },
  },
  po: {
    role: "po",
    name: "James Wright",
    fullTitle: "Pricing Operations",
    initials: "JW",
    description: "Manages rate cards, scope catalogs, and pricing governance. Configures templates and enforces standards across deals.",
    permissions: {
      createDeals: false,
      editDeals: false,
      viewDeals: true,
      approveDeals: false,
      manageRateCards: true,
      manageScopeCatalog: true,
      viewAdminConfig: true,
      viewPricing: true,
      editPricing: false,
      viewMargins: true,
      viewRiskSummary: false,
      viewArchitecture: true,
      viewDashboard: true,
      runAI: false,
    },
  },
  fin: {
    role: "fin",
    name: "Lisa Park",
    fullTitle: "Finance / FP&A",
    initials: "LP",
    description: "Validates margins and reviews scenario analyses. Read-only access to deals with focus on financial metrics.",
    permissions: {
      createDeals: false,
      editDeals: false,
      viewDeals: true,
      approveDeals: false,
      manageRateCards: false,
      manageScopeCatalog: false,
      viewAdminConfig: false,
      viewPricing: true,
      editPricing: false,
      viewMargins: true,
      viewRiskSummary: false,
      viewArchitecture: true,
      viewDashboard: true,
      runAI: false,
    },
  },
  qrm: {
    role: "qrm",
    name: "David Kim",
    fullTitle: "Risk / QRM",
    initials: "DK",
    description: "Oversees deal risk and compliance. Reviews AI risk summaries and audit trails. Read-only access with risk focus.",
    permissions: {
      createDeals: false,
      editDeals: false,
      viewDeals: true,
      approveDeals: false,
      manageRateCards: false,
      manageScopeCatalog: false,
      viewAdminConfig: false,
      viewPricing: true,
      editPricing: false,
      viewMargins: true,
      viewRiskSummary: true,
      viewArchitecture: true,
      viewDashboard: true,
      runAI: false,
    },
  },
  it: {
    role: "it",
    name: "Alex Rivera",
    fullTitle: "IT / Data Consumer",
    initials: "AR",
    description: "Views system architecture and integration points. Limited deal access focused on technical infrastructure.",
    permissions: {
      createDeals: false,
      editDeals: false,
      viewDeals: false,
      approveDeals: false,
      manageRateCards: false,
      manageScopeCatalog: false,
      viewAdminConfig: false,
      viewPricing: false,
      editPricing: false,
      viewMargins: false,
      viewRiskSummary: false,
      viewArchitecture: true,
      viewDashboard: true,
      runAI: false,
    },
  },
};

interface AuthContextType {
  persona: Persona | null;
  login: (role: PersonaRole) => void;
  logout: () => void;
  hasPermission: (key: keyof Persona["permissions"]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  persona: null,
  login: () => {},
  logout: () => {},
  hasPermission: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<Persona | null>(() => {
    const saved = localStorage.getItem("dealpad_persona");
    return saved ? PERSONAS[saved as PersonaRole] || null : null;
  });

  const login = useCallback((role: PersonaRole) => {
    setPersona(PERSONAS[role]);
    localStorage.setItem("dealpad_persona", role);
  }, []);

  const logout = useCallback(() => {
    setPersona(null);
    localStorage.removeItem("dealpad_persona");
  }, []);

  const hasPermission = useCallback((key: keyof Persona["permissions"]) => {
    return persona?.permissions[key] ?? false;
  }, [persona]);

  return (
    <AuthContext.Provider value={{ persona, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
