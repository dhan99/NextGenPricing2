import type { Request, Response, NextFunction } from "express";

export type PersonaRole = "pdl" | "sll" | "po" | "fin" | "qrm" | "it";

export type PermissionKey =
  | "createDeals"
  | "editDeals"
  | "viewDeals"
  | "approveDeals"
  | "manageRateCards"
  | "manageScopeCatalog"
  | "viewPricing"
  | "editPricing"
  | "viewMargins"
  | "viewRiskSummary"
  | "viewArchitecture"
  | "viewDashboard"
  | "runAI";

export const PERMISSIONS_BY_ROLE: Record<PersonaRole, Record<PermissionKey, boolean>> = {
  pdl: {
    createDeals: true, editDeals: true, viewDeals: true, approveDeals: false,
    manageRateCards: false, manageScopeCatalog: false,
    viewPricing: true, editPricing: true,
    viewMargins: true, viewRiskSummary: true,
    viewArchitecture: true, viewDashboard: true, runAI: true,
  },
  sll: {
    createDeals: false, editDeals: false, viewDeals: true, approveDeals: true,
    manageRateCards: false, manageScopeCatalog: false,
    viewPricing: true, editPricing: false,
    viewMargins: true, viewRiskSummary: true,
    viewArchitecture: true, viewDashboard: true, runAI: false,
  },
  po: {
    createDeals: false, editDeals: false, viewDeals: true, approveDeals: false,
    manageRateCards: true, manageScopeCatalog: true,
    viewPricing: true, editPricing: false,
    viewMargins: true, viewRiskSummary: false,
    viewArchitecture: true, viewDashboard: true, runAI: false,
  },
  fin: {
    createDeals: false, editDeals: false, viewDeals: true, approveDeals: false,
    manageRateCards: false, manageScopeCatalog: false,
    viewPricing: true, editPricing: false,
    viewMargins: true, viewRiskSummary: false,
    viewArchitecture: true, viewDashboard: true, runAI: false,
  },
  qrm: {
    createDeals: false, editDeals: false, viewDeals: true, approveDeals: false,
    manageRateCards: false, manageScopeCatalog: false,
    viewPricing: true, editPricing: false,
    viewMargins: true, viewRiskSummary: true,
    viewArchitecture: true, viewDashboard: true, runAI: false,
  },
  it: {
    createDeals: false, editDeals: false, viewDeals: false, approveDeals: false,
    manageRateCards: false, manageScopeCatalog: false,
    viewPricing: false, editPricing: false,
    viewMargins: false, viewRiskSummary: false,
    viewArchitecture: true, viewDashboard: true, runAI: false,
  },
};

const VALID_ROLES = new Set<PersonaRole>(["pdl", "sll", "po", "fin", "qrm", "it"]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userRole?: PersonaRole;
      userName?: string;
    }
  }
}

/**
 * Reads x-user-role / x-user-name headers and attaches to req.
 * Does NOT block — pairs with `requirePerm` for actual gating.
 */
export function attachRole(req: Request, _res: Response, next: NextFunction) {
  const raw = String(req.header("x-user-role") || "").toLowerCase().trim();
  if (raw && VALID_ROLES.has(raw as PersonaRole)) {
    req.userRole = raw as PersonaRole;
  }
  const name = String(req.header("x-user-name") || "").trim();
  if (name) req.userName = name;
  next();
}

export function hasAnyPermission(role: PersonaRole | undefined, keys: PermissionKey[]): boolean {
  if (!role) return false;
  const perms = PERMISSIONS_BY_ROLE[role];
  if (!perms) return false;
  return keys.some((k) => perms[k] === true);
}

/**
 * Express middleware factory. Requires the caller's role to grant ALL of the
 * supplied permission keys. Returns 401 if no role is attached, 403 otherwise.
 *
 * Usage:
 *   app.post("/api/deals", requirePerm("createDeals"), handler);
 *   app.patch("/api/approvals/:id", requirePerm("approveDeals"), handler);
 */
export function requirePerm(...keys: PermissionKey[]) {
  if (keys.length === 0) {
    throw new Error("requirePerm() called with no permission keys — this would silently grant access to anyone.");
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(401).json({
        error: "Authentication required",
        detail: "Missing x-user-role header. Sign in to continue.",
      });
    }
    const perms = PERMISSIONS_BY_ROLE[req.userRole];
    const missing = keys.filter((k) => !perms?.[k]);
    if (missing.length > 0) {
      return res.status(403).json({
        error: "Forbidden",
        detail: `Your role (${req.userRole.toUpperCase()}) does not permit this action. Required: ${missing.join(", ")}.`,
        requiredPermissions: missing,
        role: req.userRole,
      });
    }
    next();
  };
}

/**
 * Like requirePerm but grants access if the role has ANY of the supplied keys.
 * Useful for routes shared between read modes (e.g., view/edit).
 */
export function requireAnyPerm(...keys: PermissionKey[]) {
  if (keys.length === 0) {
    throw new Error("requireAnyPerm() called with no permission keys — this would silently grant access to anyone.");
  }
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!hasAnyPermission(req.userRole, keys)) {
      return res.status(403).json({
        error: "Forbidden",
        detail: `Your role (${req.userRole.toUpperCase()}) does not permit this action.`,
        requiredAnyOf: keys,
        role: req.userRole,
      });
    }
    next();
  };
}
