import { useLocation } from "wouter";
import { AskDealPadAI } from "./AskDealPadAI";
import { useAuth } from "@/context/AuthContext";

type ScreenInfo = { screen: string; screenLabel: string };

function inferScreen(path: string): ScreenInfo {
  const p = path.toLowerCase();
  if (p === "/" || p === "/dashboard") return { screen: "dashboard", screenLabel: "Dashboard" };
  if (p === "/deals/new") return { screen: "new-deal", screenLabel: "New Deal" };
  if (p.startsWith("/deals/") && p.includes("/renewal")) return { screen: "renewal-leadsheet", screenLabel: "Renewal Leadsheet" };
  if (p.startsWith("/deals/")) return { screen: "wizard-setup", screenLabel: "Deal Wizard" };
  if (p === "/deals") return { screen: "deals-list", screenLabel: "Deals" };
  if (p.startsWith("/admin/rate-cards")) return { screen: "admin-rate-cards", screenLabel: "Rate Cards" };
  if (p.startsWith("/admin/scope-catalog")) return { screen: "admin-scope-catalog", screenLabel: "Scope Catalog" };
  if (p.startsWith("/admin/prompt-sets")) return { screen: "admin-prompt-sets", screenLabel: "Prompt Sets" };
  if (p.startsWith("/admin/margin-targets")) return { screen: "admin-margin-targets", screenLabel: "Margin Targets" };
  if (p.startsWith("/admin/conga-templates")) return { screen: "admin-conga", screenLabel: "Conga Templates" };
  if (p.startsWith("/admin")) return { screen: "admin", screenLabel: "Configuration" };
  if (p.startsWith("/analytics")) return { screen: "analytics", screenLabel: "Analytics" };
  if (p.startsWith("/integrations/dynamics")) return { screen: "integration-dynamics", screenLabel: "Dynamics CRM" };
  if (p.startsWith("/integrations/intapp")) return { screen: "integration-intapp", screenLabel: "Intapp Risk" };
  if (p.startsWith("/integrations/workday")) return { screen: "integration-workday", screenLabel: "Workday" };
  if (p.startsWith("/architecture")) return { screen: "architecture", screenLabel: "Architecture Hub" };
  return { screen: "global", screenLabel: "DealPad" };
}

const SCREENS_WITH_INLINE = new Set<string>([]);

export function GlobalAskAI() {
  const [location] = useLocation();
  const { hasPermission } = useAuth();
  if (!hasPermission("runAI")) return null;

  const info = inferScreen(location);
  if (SCREENS_WITH_INLINE.has(info.screen)) return null;

  return <AskDealPadAI context={info} />;
}
