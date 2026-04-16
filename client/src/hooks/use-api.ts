import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

async function fetchApi(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function useDashboardSummary() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => fetchApi("/api/dashboard/summary") });
}

export function useClients() {
  return useQuery({ queryKey: ["clients"], queryFn: () => fetchApi("/api/clients") });
}

export function useDeals() {
  return useQuery({ queryKey: ["deals"], queryFn: () => fetchApi("/api/deals") });
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
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ["deal", id] }); qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["deal-pricing", id] }); },
  });
}

export function useScopeCatalog() {
  return useQuery({ queryKey: ["scope-catalog"], queryFn: () => fetchApi("/api/scope-catalog") });
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

export function useDealApprovals(dealId: number) {
  return useQuery({ queryKey: ["deal-approvals", dealId], queryFn: () => fetchApi(`/api/deals/${dealId}/approvals`), enabled: !!dealId });
}

export function useSubmitApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, data }: { dealId: number; data: any }) => fetchApi(`/api/deals/${dealId}/approvals`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (_, { dealId }) => qc.invalidateQueries({ queryKey: ["deal-approvals", dealId] }),
  });
}

export function useUpdateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => fetchApi(`/api/approvals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deal-approvals"] }),
  });
}

export function useDealPrompts(dealId: number) {
  return useQuery({ queryKey: ["deal-prompts", dealId], queryFn: () => fetchApi(`/api/deals/${dealId}/prompts`), enabled: !!dealId });
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

export function useAIDealSimilarity() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/deal-similarity", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAIEffortEstimation() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/effort-estimation", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAIMarginAdvisor() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/margin-advisor", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAIScenarioRecommendation() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/scenario-recommendation", { method: "POST", body: JSON.stringify(data) }) });
}

export function useAIRiskSummary() {
  return useMutation({ mutationFn: (data: any) => fetchApi("/api/ai/risk-summary", { method: "POST", body: JSON.stringify(data) }) });
}
