export type PersonaMode = "agent" | "principal" | "underwriter";

export interface ThemeConfig {
  brandName: string;
  aiName: string;
  tagline: string;
  heroTitle: string;
  heroHighlight: string;
  heroDescription: string;
  footerCopyright: string;
  agentEmail: string;
  principalEmail: string;
  features: string[];
  certBadge: string;
}

export const themeConfig: ThemeConfig = {
  brandName: "Surety Demo App",
  aiName: "BondAssist",
  tagline: "Surety Made Simple",
  heroTitle: "Surety bonds,",
  heroHighlight: "simplified.",
  heroDescription:
    "The modern platform for agents and principals. AI-driven applications, live risk scoring, and complete lifecycle management — all in one place.",
  footerCopyright: "© 2026 Surety Demo App. All rights reserved.",
  agentEmail: "agent@bondclick.com",
  principalEmail: "applicant@company.com",
  features: [
    "BondAssist AI",
    "Real-time risk scoring",
    "Instant underwriting",
    "Full lifecycle tracking",
  ],
  certBadge: "SOC 2 Type II Certified",
};
