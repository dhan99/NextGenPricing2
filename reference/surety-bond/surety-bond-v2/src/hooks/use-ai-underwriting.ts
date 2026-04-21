import { useState, useCallback, useRef } from "react";
import { useAuth } from "./use-auth";

const API_BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = useAuth.getState().token;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export interface AIRiskAssessment {
  overallRisk: "low" | "medium" | "high" | "critical";
  confidence: number;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  redFlags: string[];
  mitigatingFactors: string[];
}

export interface AIUnderwritingRecommendation {
  decision: "approve" | "approve_with_conditions" | "decline" | "request_info";
  confidence: number;
  reasoning: string;
  conditions: string[];
  riskFactors: { factor: string; severity: "low" | "medium" | "high"; detail: string }[];
  suggestedPremiumAdjustment: number | null;
  additionalInfoNeeded: string[];
}

export interface AIFormAssistance {
  suggestions: { field: string; message: string; type: "tip" | "warning" | "error" | "auto_fill"; value?: string }[];
  completenessScore: number;
  overallTip: string;
}

export interface AISmartAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  actionLabel?: string;
  category: "risk" | "compliance" | "opportunity" | "deadline";
}

export function useAIRiskAssessment() {
  const [data, setData] = useState<AIRiskAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assess = useCallback(async (bondData: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/risk-assessment`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(bondData),
      });
      if (!res.ok) throw new Error("Failed to get AI assessment");
      const result = await res.json();
      setData(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI assessment failed");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, assess };
}

export function useAIRecommendation() {
  const [data, setData] = useState<AIUnderwritingRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRecommendation = useCallback(async (bondId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/recommendation/${bondId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to get AI recommendation");
      const result = await res.json();
      setData(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI recommendation failed");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, getRecommendation };
}

export function useAIFormAssistance() {
  const [data, setData] = useState<AIFormAssistance | null>(null);
  const [loading, setLoading] = useState(false);

  const getAssistance = useCallback(async (formData: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/form-assistance`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to get AI assistance");
      const result = await res.json();
      setData(result);
      return result;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, getAssistance };
}

export interface AIClientPreFill {
  principalCompanyName: string;
  principalFirstName: string;
  principalLastName: string;
  principalEmail: string;
  principalPhone: string;
  principalAddress: string;
  principalCity: string;
  principalState: string;
  principalZip: string;
  obligeeName: string;
  obligeeAddress: string;
  obligeeCity: string;
  obligeeState: string;
  obligeeZip: string;
  bondAmount: string;
  bondDescription: string;
  billingType: string;
  confidence: number;
  fieldsFromHistory: string[];
  message: string;
}

export interface AIRiskPreScreen {
  signal: "green" | "yellow" | "red";
  confidence: number;
  summary: string;
  keyFactors: string[];
  estimatedApprovalChance: string;
  suggestedActions: string[];
}

export interface ClientBondHistory {
  bonds: {
    id: number;
    bondType: string;
    classCode: string | null;
    obligeeName: string;
    bondAmount: string;
    premium: string | null;
    status: string;
    riskScore: number | null;
    riskLevel: string | null;
    billingType: string | null;
    description: string | null;
    effectiveDate: string | null;
    expirationDate: string | null;
  }[];
  principal: {
    firstName: string;
    lastName: string;
    companyName: string | null;
    email: string;
    phone: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
  totalBonds: number;
}

export function useClientPreFill() {
  const [history, setHistory] = useState<ClientBondHistory | null>(null);
  const [preFill, setPreFill] = useState<AIClientPreFill | null>(null);
  const [loading, setLoading] = useState(false);
  const [preFillLoading, setPreFillLoading] = useState(false);

  const fetchHistory = useCallback(async (clientId: number) => {
    setLoading(true);
    setPreFill(null);
    try {
      const res = await fetch(`${API_BASE}/clients/${clientId}/bond-history`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch history");
      const result = await res.json();
      setHistory(result);
      return result as ClientBondHistory;
    } catch {
      setHistory(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const generatePreFill = useCallback(async (data: Record<string, unknown>) => {
    setPreFillLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/client-prefill`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to generate pre-fill");
      const result = await res.json();
      setPreFill(result);
      return result as AIClientPreFill;
    } catch {
      return null;
    } finally {
      setPreFillLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setHistory(null);
    setPreFill(null);
  }, []);

  return { history, preFill, loading, preFillLoading, fetchHistory, generatePreFill, reset };
}

export function useRiskPreScreen() {
  const [data, setData] = useState<AIRiskPreScreen | null>(null);
  const [loading, setLoading] = useState(false);

  const preScreen = useCallback(async (screenData: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/pre-screen`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(screenData),
      });
      if (!res.ok) throw new Error("Failed to pre-screen");
      const result = await res.json();
      setData(result);
      return result as AIRiskPreScreen;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);

  return { data, loading, preScreen, reset };
}

export interface AIBondFormMatch {
  matches: {
    id: number;
    name: string;
    classCode: string;
    category: string;
    state: string | null;
    relevanceScore: number;
    reason: string;
  }[];
  interpretation: string;
}

export function useBondFormMatcher() {
  const [data, setData] = useState<AIBondFormMatch | null>(null);
  const [loading, setLoading] = useState(false);

  const matchForms = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setData(null);
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/bond-form-match`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error("Failed to match forms");
      const result = await res.json();
      setData(result);
      return result as AIBondFormMatch;
    } catch {
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);

  return { data, loading, matchForms, reset };
}

export interface AIDocumentChecklist {
  documents: {
    name: string;
    description: string;
    priority: "required" | "recommended" | "optional";
    category: string;
  }[];
  summary: string;
}

export function useDocumentChecklist() {
  const [data, setData] = useState<AIDocumentChecklist | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchChecklist = useCallback(async (params: {
    bondType: string;
    bondFormName: string;
    bondAmount: number;
    state: string;
    riskLevel: string | null;
    companyName: string;
    hasHistory: boolean;
  }) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/document-checklist`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Failed to get checklist");
      const result = await res.json();
      setData(result);
      return result as AIDocumentChecklist;
    } catch {
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);

  return { data, loading, fetchChecklist, reset };
}

export interface ObligeeSearchResult {
  id: number;
  name: string;
  addressLine1: string | null;
  city: string | null;
  score?: number;
  state: string | null;
  zipCode: string | null;
}

export function useObligeeSearch() {
  const [results, setResults] = useState<ObligeeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const searchObligees = useCallback(async (query: string) => {
    if (query.trim().length < 1) {
      setResults([]);
      return [];
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/obligees/search?q=${encodeURIComponent(query.trim())}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to search obligees");
      const result = await res.json();
      setResults(result);
      return result as ObligeeSearchResult[];
    } catch {
      setResults([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setResults([]), []);

  return { results, loading, searchObligees, reset };
}

export interface BatchTriageItem {
  id: number;
  priority: number;
  urgency: "critical" | "high" | "medium" | "low";
  rationale: string;
}

export interface BatchTriageResult {
  items: BatchTriageItem[];
  summary: string;
}

export function useBatchTriage() {
  const [data, setData] = useState<BatchTriageResult | null>(null);
  const [loading, setLoading] = useState(false);

  const triage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/batch-triage`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to triage");
      const result = await res.json();
      setData(result);
      return result as BatchTriageResult;
    } catch {
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);
  return { data, loading, triage, reset };
}

export interface ComparableBond {
  id: number;
  bondNumber: string;
  bondType: string;
  bondAmount: number;
  riskLevel: string | null;
  riskScore: number | null;
  status: string;
  obligeeName: string;
  principalName: string;
  premium: number | null;
  similarity: number;
  relevantFactors: string[];
}

export interface ComparableBondsResult {
  comparables: ComparableBond[];
  insight: string;
}

export function useComparableBonds() {
  const [data, setData] = useState<ComparableBondsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const findComparables = useCallback(async (bondId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/comparable-bonds`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ bondId }),
      });
      if (!res.ok) throw new Error("Failed to find comparables");
      const result = await res.json();
      setData(result);
      return result as ComparableBondsResult;
    } catch {
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);
  return { data, loading, findComparables, reset };
}

export interface DecisionSummaryResult {
  notes: string;
  keyPoints: string[];
}

export function useDecisionSummary() {
  const [data, setData] = useState<DecisionSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);

  const generateSummary = useCallback(async (bondId: number, decision: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/decision-summary`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ bondId, decision }),
      });
      if (!res.ok) throw new Error("Failed to generate summary");
      const result = await res.json();
      setData(result);
      return result as DecisionSummaryResult;
    } catch {
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);
  return { data, loading, generateSummary, reset };
}

export interface StatusExplainerResult {
  explanation: string;
  nextSteps: string;
  estimatedTimeline: string | null;
}

export function useStatusExplainer() {
  const [data, setData] = useState<StatusExplainerResult | null>(null);
  const [loading, setLoading] = useState(false);

  const explain = useCallback(async (status: string, bondType: string, bondAmount: number) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/status-explainer`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ status, bondType, bondAmount }),
      });
      if (!res.ok) throw new Error("Failed to explain status");
      const result = await res.json();
      setData(result);
      return result as StatusExplainerResult;
    } catch {
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);
  return { data, loading, explain, reset };
}

export interface AISearchResult {
  bonds: {
    id: number;
    bondNumber: string;
    bondType: string;
    bondAmount: string;
    status: string;
    obligeeName: string;
    principalName: string;
    relevance: string;
  }[];
  clients: {
    id: number;
    companyName: string;
    city: string | null;
    state: string | null;
    relevance: string;
  }[];
  bondForms: {
    id: number;
    name: string;
    classCode: string;
    category: string;
    state: string | null;
    relevance: string;
  }[];
  interpretation: string;
}

export function useAISearch() {
  const [data, setData] = useState<AISearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    if (abortRef.current) abortRef.current.abort();
    if (query.trim().length < 2) {
      setData(null);
      return null;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/ai-search`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to perform AI search");
      const result = await res.json();
      if (!controller.signal.aborted) {
        setData(result);
        return result as AISearchResult;
      }
      return null;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      setData(null);
      return null;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setData(null);
  }, []);
  return { data, loading, search, reset };
}

export interface PremiumEstimateResult {
  lowEstimate: number;
  highEstimate: number;
  confidence: "low" | "medium" | "high";
  factors: string[];
  disclaimer: string;
}

export function usePremiumEstimate() {
  const [data, setData] = useState<PremiumEstimateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const estimate = useCallback(async (params: {
    bondType: string;
    bondAmount: number;
    state: string | null;
    classCode: string | null;
    riskLevel: string | null;
  }) => {
    if (params.bondAmount <= 0) {
      setData(null);
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/premium-estimate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Failed to estimate premium");
      const result = await res.json();
      setData(result);
      return result as PremiumEstimateResult;
    } catch {
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setData(null), []);
  return { data, loading, estimate, reset };
}

export function useSmartAlerts() {
  const [alerts, setAlerts] = useState<AISmartAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = useCallback(async (context: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ai-underwriting/smart-alerts`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(context),
      });
      if (!res.ok) throw new Error("Failed to get alerts");
      const result = await res.json();
      setAlerts(result);
      return result;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  return { alerts, loading, fetchAlerts, dismissAlert };
}
