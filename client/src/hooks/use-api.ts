import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export async function fetchApi(url: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options?.headers as Record<string, string>) || {}),
  };
  try {
    const personaRaw = typeof window !== "undefined" ? localStorage.getItem("dealpad_persona") : null;
    if (personaRaw) {
      const role = String(personaRaw).toLowerCase();
      const personaNames: Record<string, string> = {
        pdl: "Michael Torres", sll: "Sarah Chen", po: "James Wright",
        fin: "Lisa Park", qrm: "David Kim", it: "Alex Rivera",
      };
      headers["x-user-role"] = role;
      headers["x-user-name"] = personaNames[role] || role.toUpperCase();
    }
  } catch {}
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    // 401 means our role header was missing/invalid — clear stale persona and
    // let AuthProvider redirect to the Login screen on next render.
    if (res.status === 401 && typeof window !== "undefined") {
      try { localStorage.removeItem("dealpad_persona"); } catch {}
    }
    const msg = body?.error || `API error: ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
}

/**
 * Opens an authenticated GET endpoint that returns a document (HTML, PDF,
 * etc.) in a new tab. Plain `<a href>` cannot send the persona headers, so we
 * fetch the response, wrap it in a blob URL, and pop it open.
 */
export async function openProtectedDoc(url: string) {
  const headers: Record<string, string> = {};
  try {
    const personaRaw = typeof window !== "undefined" ? localStorage.getItem("dealpad_persona") : null;
    if (personaRaw) {
      const role = String(personaRaw).toLowerCase();
      const personaNames: Record<string, string> = {
        pdl: "Michael Torres", sll: "Sarah Chen", po: "James Wright",
        fin: "Lisa Park", qrm: "David Kim", it: "Alex Rivera",
      };
      headers["x-user-role"] = role;
      headers["x-user-name"] = personaNames[role] || role.toUpperCase();
    }
  } catch {}
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    const msg = body?.error || body?.detail || `Failed to open document (HTTP ${res.status})`;
    throw new Error(msg);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!win) {
    // Popup blocked — fall back to same-tab navigation so the user still sees it.
    window.location.href = blobUrl;
  }
  // Revoke after a delay so the new tab has time to load.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export function useDashboardSummary() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => fetchApi("/api/dashboard/summary") });
}

export function useClients() {
  return useQuery({ queryKey: ["clients"], queryFn: () => fetchApi("/api/clients") });
}

export function useDeals(opts?: { includeArchived?: boolean; onlyArchived?: boolean }) {
  const qs = opts?.onlyArchived ? "?onlyArchived=true" : opts?.includeArchived ? "?includeArchived=true" : "";
  return useQuery({ queryKey: ["deals", opts?.includeArchived || false, opts?.onlyArchived || false], queryFn: () => fetchApi(`/api/deals${qs}`) });
}

export function useArchiveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/archive`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-opps-eligible"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useRestoreDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/restore`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useDeal(id: number) {
  return useQuery({ queryKey: ["deal", id], queryFn: () => fetchApi(`/api/deals/${id}`), enabled: !!id });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => fetchApi("/api/deals", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => fetchApi(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ["deal", id] }); qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["deal-pricing", id] }); qc.invalidateQueries({ queryKey: ["deal-margin-target", id] }); },
  });
}

export function useScopeCatalog(opts?: { includeInactive?: boolean }) {
  const includeInactive = opts?.includeInactive ? "?includeInactive=1" : "";
  return useQuery({
    queryKey: ["scope-catalog", includeInactive ? "all" : "active"],
    queryFn: () => fetchApi(`/api/scope-catalog${includeInactive}`),
  });
}

export function useCreateScopeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => fetchApi("/api/scope-catalog", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scope-catalog"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useUpdateScopeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchApi(`/api/scope-catalog/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scope-catalog"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useDeactivateScopeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userName }: { id: number; userName?: string }) =>
      fetchApi(`/api/scope-catalog/${id}`, { method: "DELETE", body: JSON.stringify({ userName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scope-catalog"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useScopeTemplates(serviceLine?: string | null) {
  const qs = serviceLine ? `?serviceLine=${encodeURIComponent(serviceLine)}` : "";
  return useQuery({
    queryKey: ["scope-templates", serviceLine || "all"],
    queryFn: () => fetchApi(`/api/scope-templates${qs}`),
  });
}

export function useApplyScopeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, templateId, userName }: { dealId: number; templateId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/apply-template/${templateId}`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["deal-scope", dealId] });
      qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] });
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useErpRescale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/erp-rescale`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["deal-scope", dealId] });
      qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] });
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useDealScopeItems(dealId: number) {
  return useQuery({ queryKey: ["deal-scope", dealId], queryFn: () => fetchApi(`/api/deals/${dealId}/scope-items`), enabled: !!dealId });
}

export function useAddScopeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, data }: { dealId: number; data: any }) => fetchApi(`/api/deals/${dealId}/scope-items`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_, { dealId }) => { qc.invalidateQueries({ queryKey: ["deal-scope", dealId] }); qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] }); qc.invalidateQueries({ queryKey: ["deal", dealId] }); },
  });
}

export function useRemoveScopeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, id }: { dealId: number; id: number }) => fetchApi(`/api/deals/${dealId}/scope-items/${id}`, { method: "DELETE" }),
    onSuccess: (_, { dealId }) => { qc.invalidateQueries({ queryKey: ["deal-scope", dealId] }); qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] }); qc.invalidateQueries({ queryKey: ["deal", dealId] }); },
  });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: () => fetchApi("/api/roles") });
}

export function useRateCards() {
  return useQuery({ queryKey: ["rate-cards"], queryFn: () => fetchApi("/api/rate-cards") });
}

export function useRateCardEntries(id: number) {
  return useQuery({ queryKey: ["rate-card-entries", id], queryFn: () => fetchApi(`/api/rate-cards/${id}/entries`), enabled: !!id });
}

export function useDealPricing(dealId: number) {
  return useQuery({ queryKey: ["deal-pricing", dealId], queryFn: () => fetchApi(`/api/deals/${dealId}/pricing`), enabled: !!dealId });
}

export function useUpdatePricingLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, id, data }: { dealId: number; id: number; data: any }) => fetchApi(`/api/deals/${dealId}/pricing/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_, { dealId }) => qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] }),
  });
}

export function useDealScenarios(dealId: number) {
  return useQuery({ queryKey: ["deal-scenarios", dealId], queryFn: () => fetchApi(`/api/deals/${dealId}/scenarios`), enabled: !!dealId });
}

export function useSelectScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, scenarioId, userName }: { dealId: number; scenarioId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/scenarios/${scenarioId}/select`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["deal-scenarios", dealId] });
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useDealApprovals(dealId: number) {
  return useQuery({ queryKey: ["deal-approvals", dealId], queryFn: () => fetchApi(`/api/deals/${dealId}/approvals`), enabled: !!dealId });
}

export function useSubmitApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, data }: { dealId: number; data: any }) => fetchApi(`/api/deals/${dealId}/approvals`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["deal-approvals", dealId] });
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => fetchApi(`/api/approvals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal-approvals"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDealPrompts(dealId: number) {
  return useQuery({ queryKey: ["deal-prompts", dealId], queryFn: () => fetchApi(`/api/deals/${dealId}/prompts`), enabled: !!dealId });
}

export function useEngagementInputSpec(serviceLine?: string | null) {
  return useQuery({
    queryKey: ["engagement-input-spec", serviceLine || "_generic"],
    queryFn: () => fetchApi(`/api/engagement-input-spec/${encodeURIComponent(serviceLine || "_generic")}`),
    enabled: true,
  });
}

export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, promptId, answer, impactMultiplier }: { dealId: number; promptId: number; answer: string; impactMultiplier: string }) =>
      fetchApi(`/api/deals/${dealId}/prompts/${promptId}`, { method: "PATCH", body: JSON.stringify({ answer, impactMultiplier }) }),
    onSuccess: (_, { dealId }) => { qc.invalidateQueries({ queryKey: ["deal-prompts", dealId] }); qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] }); qc.invalidateQueries({ queryKey: ["deal", dealId] }); },
  });
}

export function useActivity() {
  return useQuery({ queryKey: ["activity"], queryFn: () => fetchApi("/api/activity") });
}

export function useCloneDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, mode, pdlName }: { dealId: number; mode: "clone" | "renewal"; pdlName?: string }) =>
      fetchApi(`/api/deals/${dealId}/clone`, { method: "POST", body: JSON.stringify({ mode, pdlName }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });
}

export function useDynamicsAccounts() {
  return useQuery({ queryKey: ["dyn-accounts"], queryFn: () => fetchApi("/api/dynamics/accounts") });
}
export function useDynamicsOpportunities() {
  return useQuery({ queryKey: ["dyn-opps"], queryFn: () => fetchApi("/api/dynamics/opportunities") });
}
export function useDynamicsPipeline() {
  return useQuery({ queryKey: ["dyn-pipeline"], queryFn: () => fetchApi("/api/dynamics/pipeline") });
}
export function useDynamicsSyncLog() {
  return useQuery({ queryKey: ["dyn-synclog"], queryFn: () => fetchApi("/api/dynamics/sync-log"), refetchInterval: 5000 });
}
export function useDynamicsSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { entity?: string; direction?: string; userName?: string }) =>
      fetchApi("/api/dynamics/sync", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-pipeline"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}
export function useImportOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userName }: { id: number; userName?: string }) =>
      fetchApi(`/api/dynamics/opportunities/${id}/import`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
export function useAgentDraftOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userName }: { id: number; userName?: string }) =>
      fetchApi(`/api/dynamics/opportunities/${id}/agent-draft`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
export function useAgentApproveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/agent-approve`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["deal", vars.dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
export function useAgentDiscardDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/agent-discard`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["deal", vars.dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
    },
  });
}
export function useAgentOpenWizard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/agent-open-wizard`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["deal", vars.dealId] });
    },
  });
}
export function useAgentResubmit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/agent-resubmit`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["deal", vars.dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}
export function usePushDealToDynamics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/dynamics/deals/${dealId}/push`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-pipeline"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}
export function useDynamicsSettings() {
  return useQuery({ queryKey: ["dyn-settings"], queryFn: () => fetchApi("/api/dynamics/settings") });
}
export function useUpdateDynamicsSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetchApi("/api/dynamics/settings", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-settings"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}
export function useUpdateDynamicsAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; [k: string]: any }) =>
      fetchApi(`/api/dynamics/accounts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}
export function useUpdateDynamicsOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; [k: string]: any }) =>
      fetchApi(`/api/dynamics/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-pipeline"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}
export function useEligibleOpportunities(clientId?: number | string | null) {
  const id = clientId ? Number(clientId) : null;
  return useQuery({
    queryKey: ["dyn-opps-eligible", id],
    queryFn: () => fetchApi(`/api/dynamics/opportunities/eligible${id ? `?clientId=${id}` : ""}`),
    enabled: clientId !== undefined,
  });
}
export function useUnlinkOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userName }: { id: number; userName?: string }) =>
      fetchApi(`/api/dynamics/opportunities/${id}/unlink`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-opps-eligible"] });
      qc.invalidateQueries({ queryKey: ["dyn-pipeline"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}
export function useSendBackOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, userName }: { id: number; reason: string; userName?: string }) =>
      fetchApi(`/api/dynamics/opportunities/${id}/send-back`, {
        method: "POST",
        body: JSON.stringify({ reason, userName }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-pipeline"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
export function useDynamicsScopeTemplates() {
  return useQuery({ queryKey: ["dyn-scope-templates"], queryFn: () => fetchApi("/api/dynamics/scope-templates") });
}
export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetchApi("/api/dynamics/opportunities", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-opps-eligible"] });
      qc.invalidateQueries({ queryKey: ["dyn-pipeline"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}
export function useNightlyBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { userName?: string }) =>
      fetchApi("/api/dynamics/nightly-batch", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dyn-accounts"] });
      qc.invalidateQueries({ queryKey: ["dyn-opps"] });
      qc.invalidateQueries({ queryKey: ["dyn-synclog"] });
    },
  });
}

export function useResetPricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/reset-pricing`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useRateAdjust() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, factor, userName }: { dealId: number; factor: number; userName?: string }) =>
      fetchApi(`/api/deals/${dealId}/rate-adjust`, { method: "POST", body: JSON.stringify({ factor, userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["deal-pricing", dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useAIDealSimilarity() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/deal-similarity", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAIEffortEstimation() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/effort-estimation", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAIMarginAdvisor() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/margin-advisor", { method: "POST", body: JSON.stringify(data) }) });
}

// ============ MARGIN TARGETS (single source of truth — Task #33) ============
export function useMarginTargets() {
  return useQuery({ queryKey: ["margin-targets"], queryFn: () => fetchApi("/api/margin-targets") });
}

export function useUpdateFirmMarginTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (percent: number) => fetchApi("/api/margin-targets/firm", { method: "PUT", body: JSON.stringify({ percent }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["margin-targets"] });
      qc.invalidateQueries({ queryKey: ["deal-margin-target"] });
    },
  });
}

export type MarginTargetPolicyFields = {
  techAdminFeePct?: number | null;
  lineItemRounding?: number | null;
  fixedFeeRounding?: number | null;
};

export function useCreateMarginTargetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { scope: "bu" | "serviceLine"; scopeKey: string; percent: number } & MarginTargetPolicyFields) =>
      fetchApi("/api/margin-targets/overrides", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["margin-targets"] });
      qc.invalidateQueries({ queryKey: ["deal-margin-target"] });
    },
  });
}

export function useUpdateMarginTargetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; percent?: number } & MarginTargetPolicyFields) => {
      const { id, ...body } = data;
      return fetchApi(`/api/margin-targets/overrides/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["margin-targets"] });
      qc.invalidateQueries({ queryKey: ["deal-margin-target"] });
    },
  });
}

export function useDeleteMarginTargetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchApi(`/api/margin-targets/overrides/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["margin-targets"] });
      qc.invalidateQueries({ queryKey: ["deal-margin-target"] });
    },
  });
}

export function useDealMarginTarget(dealId: number | null | undefined) {
  return useQuery<{ percent: number; sourceLabel: string; source: { kind: string; key?: string } }>({
    queryKey: ["deal-margin-target", dealId],
    queryFn: () => fetchApi(`/api/deals/${dealId}/margin-target`),
    enabled: !!dealId,
  });
}

export function useAIScenarioRecommendation() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/scenario-recommendation", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAIRiskSummary() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/risk-summary", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAskDealPadAI() {
  return useMutation({ mutationFn: (data: { question: string; context: any; role?: string }) => fetchApi("/api/ai/ask", { method: "POST", body: JSON.stringify(data) }) });
}

// ============ CONGA ENGAGEMENT LETTERS ============
export function useCongaTemplates() {
  return useQuery({ queryKey: ["conga-templates"], queryFn: () => fetchApi("/api/conga/templates") });
}
export function useCongaSettings() {
  return useQuery({ queryKey: ["conga-settings"], queryFn: () => fetchApi("/api/conga/settings") });
}
export function useUpdateCongaSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetchApi("/api/conga/settings", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conga-settings"] });
      qc.invalidateQueries({ queryKey: ["conga-templates"] });
    },
  });
}
export function useDealEngagementLetters(dealId: number) {
  return useQuery({
    queryKey: ["conga-letters", dealId],
    queryFn: () => fetchApi(`/api/conga/deals/${dealId}/letters`),
    enabled: !!dealId,
  });
}
export function useGenerateEngagementLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, templateId, generatedBy }: { dealId: number; templateId: number; generatedBy?: string }) =>
      fetchApi(`/api/conga/deals/${dealId}/letters`, {
        method: "POST",
        body: JSON.stringify({ templateId, generatedBy }),
      }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["conga-letters", dealId] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

// ============ INTAPP RISK & COMPLIANCE ============
export function useIntappSettings() {
  return useQuery({ queryKey: ["intapp-settings"], queryFn: () => fetchApi("/api/intapp/settings") });
}

export function useUpdateIntappSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetchApi("/api/intapp/settings", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intapp-settings"] });
      qc.invalidateQueries({ queryKey: ["intapp-events"] });
      qc.invalidateQueries({ queryKey: ["intapp-dashboard"] });
    },
  });
}

export function useIntappScreenings(dealId?: number) {
  return useQuery({
    queryKey: ["intapp-screenings", dealId || "all"],
    queryFn: () => fetchApi(`/api/intapp/screenings${dealId ? `?dealId=${dealId}` : ""}`),
  });
}

export function useDealIntappScreening(dealId: number) {
  return useQuery({
    queryKey: ["intapp-deal-screening", dealId],
    queryFn: () => fetchApi(`/api/intapp/deals/${dealId}/screening`),
    enabled: !!dealId,
    refetchInterval: 5000,
  });
}

export function useRunIntappScreening() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/intapp/deals/${dealId}/screen`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["intapp-deal-screening", dealId] });
      qc.invalidateQueries({ queryKey: ["intapp-screenings"] });
      qc.invalidateQueries({ queryKey: ["intapp-events"] });
      qc.invalidateQueries({ queryKey: ["intapp-dashboard"] });
    },
  });
}

export function useAddIntappMitigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ screeningId, dealId, ...body }: any) =>
      fetchApi(`/api/intapp/screenings/${screeningId}/mitigations`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_, vars: any) => {
      if (vars.dealId) qc.invalidateQueries({ queryKey: ["intapp-deal-screening", vars.dealId] });
      qc.invalidateQueries({ queryKey: ["intapp-events"] });
    },
  });
}

export function useUpdateIntappMitigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      fetchApi(`/api/intapp/mitigations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_, vars: any) => {
      if (vars.dealId) qc.invalidateQueries({ queryKey: ["intapp-deal-screening", vars.dealId] });
    },
  });
}

export function useIntappOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, ...body }: any) =>
      fetchApi(`/api/intapp/deals/${dealId}/override`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (_, vars: any) => {
      qc.invalidateQueries({ queryKey: ["intapp-deal-screening", vars.dealId] });
      qc.invalidateQueries({ queryKey: ["intapp-events"] });
      qc.invalidateQueries({ queryKey: ["intapp-dashboard"] });
    },
  });
}

export function useIntappEvents(dealId?: number) {
  return useQuery({
    queryKey: ["intapp-events", dealId || "all"],
    queryFn: () => fetchApi(`/api/intapp/events${dealId ? `?dealId=${dealId}` : ""}`),
    refetchInterval: 5000,
  });
}

export function useIntappDashboard() {
  return useQuery({
    queryKey: ["intapp-dashboard"],
    queryFn: () => fetchApi("/api/intapp/dashboard"),
    refetchInterval: 8000,
  });
}

// ============ WORKDAY ============
export function useWorkdaySettings() {
  return useQuery({ queryKey: ["wd-settings"], queryFn: () => fetchApi("/api/workday/settings") });
}
export function useUpdateWorkdaySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetchApi("/api/workday/settings", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wd-settings"] }); qc.invalidateQueries({ queryKey: ["wd-events"] }); },
  });
}
export function useWorkdayCostCenters() {
  return useQuery({ queryKey: ["wd-cost-centers"], queryFn: () => fetchApi("/api/workday/cost-centers") });
}
export function useUpdateWorkdayCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; [k: string]: any }) =>
      fetchApi(`/api/workday/cost-centers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wd-cost-centers"] }); qc.invalidateQueries({ queryKey: ["wd-events"] }); qc.invalidateQueries({ queryKey: ["wd-validation-latest"] }); qc.invalidateQueries({ queryKey: ["wd-dashboard"] }); },
  });
}
export function useCreateWorkdayCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetchApi("/api/workday/cost-centers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wd-cost-centers"] }); qc.invalidateQueries({ queryKey: ["wd-events"] }); },
  });
}
export function useWorkdayWorkers() {
  return useQuery({ queryKey: ["wd-workers"], queryFn: () => fetchApi("/api/workday/workers") });
}
export function useCreateWorkdayWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => fetchApi("/api/workday/workers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wd-workers"] }); qc.invalidateQueries({ queryKey: ["wd-events"] }); },
  });
}
export function useUpdateWorkdayWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; [k: string]: any }) =>
      fetchApi(`/api/workday/workers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wd-workers"] }); },
  });
}
export function useWorkdayRateCard() {
  return useQuery({ queryKey: ["wd-rate-card"], queryFn: () => fetchApi("/api/workday/rate-card") });
}
export function useUpdateWorkdayRateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; [k: string]: any }) =>
      fetchApi(`/api/workday/rate-card/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wd-rate-card"] }); qc.invalidateQueries({ queryKey: ["wd-events"] }); },
  });
}
export function useWorkdayValidations(params?: { dealId?: number; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.dealId) qs.set("dealId", String(params.dealId));
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString();
  return useQuery({ queryKey: ["wd-validations", params || {}], queryFn: () => fetchApi(`/api/workday/validations${q ? `?${q}` : ""}`) });
}
export function useWorkdayValidation(id?: number | null) {
  return useQuery({ queryKey: ["wd-validation", id], queryFn: () => fetchApi(`/api/workday/validations/${id}`), enabled: !!id });
}
export function useWorkdayLatestValidation(dealId?: number) {
  return useQuery({ queryKey: ["wd-validation-latest", dealId], queryFn: () => fetchApi(`/api/workday/deals/${dealId}/latest`), enabled: !!dealId });
}
export function useRunWorkdayValidation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, userName }: { dealId: number; userName?: string }) =>
      fetchApi(`/api/workday/deals/${dealId}/validate`, { method: "POST", body: JSON.stringify({ userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["wd-validations"] });
      qc.invalidateQueries({ queryKey: ["wd-validation-latest", dealId] });
      qc.invalidateQueries({ queryKey: ["wd-events"] });
      qc.invalidateQueries({ queryKey: ["wd-dashboard"] });
    },
  });
}
export function useLinkWorkdayCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, costCenterId, userName }: { dealId: number; costCenterId: number | null; userName?: string }) =>
      fetchApi(`/api/workday/deals/${dealId}/link`, { method: "POST", body: JSON.stringify({ costCenterId, userName }) }),
    onSuccess: (_, { dealId }) => {
      qc.invalidateQueries({ queryKey: ["wd-validation-latest", dealId] });
      qc.invalidateQueries({ queryKey: ["wd-validations"] });
      qc.invalidateQueries({ queryKey: ["wd-events"] });
      qc.invalidateQueries({ queryKey: ["wd-dashboard"] });
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
    },
  });
}
export function useOverrideWorkdayValidation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, justification, userName, role }: { id: number; justification: string; userName?: string; role?: string }) =>
      fetchApi(`/api/workday/validations/${id}/override`, { method: "POST", body: JSON.stringify({ justification, userName, role }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wd-validations"] });
      qc.invalidateQueries({ queryKey: ["wd-validation-latest"] });
      qc.invalidateQueries({ queryKey: ["wd-events"] });
      qc.invalidateQueries({ queryKey: ["wd-dashboard"] });
    },
  });
}
export function useWorkdayEvents() {
  return useQuery({ queryKey: ["wd-events"], queryFn: () => fetchApi("/api/workday/events"), refetchInterval: 8000 });
}
export function useWorkdayDashboard() {
  return useQuery({ queryKey: ["wd-dashboard"], queryFn: () => fetchApi("/api/workday/dashboard") });
}

// ============ PROMPT SETS (Pricing Operations governance) ============
export function usePromptSets(filters?: { status?: string; businessUnit?: string; serviceLine?: string }) {
  const qs = new URLSearchParams();
  if (filters?.status) qs.set("status", filters.status);
  if (filters?.businessUnit) qs.set("businessUnit", filters.businessUnit);
  if (filters?.serviceLine) qs.set("serviceLine", filters.serviceLine);
  const q = qs.toString();
  return useQuery({
    queryKey: ["prompt-sets", filters?.status || "", filters?.businessUnit || "", filters?.serviceLine || ""],
    queryFn: () => fetchApi(`/api/prompt-sets${q ? `?${q}` : ""}`),
  });
}
export function usePromptSet(id: number | null) {
  return useQuery({
    queryKey: ["prompt-set", id],
    queryFn: () => fetchApi(`/api/prompt-sets/${id}`),
    enabled: !!id,
  });
}
export function useCreatePromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; businessUnit?: string | null; serviceLine?: string | null; notes?: string | null }) =>
      fetchApi("/api/prompt-sets", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt-sets"] }),
  });
}
export function useUpdatePromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchApi(`/api/prompt-sets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["prompt-sets"] });
      qc.invalidateQueries({ queryKey: ["prompt-set", vars.id] });
    },
  });
}
export function useDeletePromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchApi(`/api/prompt-sets/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt-sets"] }),
  });
}
export function usePublishPromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchApi(`/api/prompt-sets/${id}/publish`, { method: "POST" }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["prompt-sets"] });
      qc.invalidateQueries({ queryKey: ["prompt-set", id] });
    },
  });
}
export function useClonePromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchApi(`/api/prompt-sets/${id}/clone`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt-sets"] }),
  });
}
export function useArchivePromptSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetchApi(`/api/prompt-sets/${id}/archive`, { method: "POST" }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["prompt-sets"] });
      qc.invalidateQueries({ queryKey: ["prompt-set", id] });
    },
  });
}
export function useCreatePromptSetItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, data }: { setId: number; data: any }) =>
      fetchApi(`/api/prompt-sets/${setId}/items`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["prompt-set", vars.setId] }),
  });
}
export function useUpdatePromptSetItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, itemId, data }: { setId: number; itemId: number; data: any }) =>
      fetchApi(`/api/prompt-sets/${setId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["prompt-set", vars.setId] }),
  });
}
export function useDeletePromptSetItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, itemId }: { setId: number; itemId: number }) =>
      fetchApi(`/api/prompt-sets/${setId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["prompt-set", vars.setId] }),
  });
}
