import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export interface PaginatedBondsParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function usePaginatedBonds(params: PaginatedBondsParams = {}) {
  const token = useAuth((s) => s.token);

  return useQuery({
    queryKey: ["paginatedBonds", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("paginated", "true");
      if (params.page) qs.set("page", String(params.page));
      if (params.limit) qs.set("limit", String(params.limit));
      if (params.status && params.status !== "all") qs.set("status", params.status);
      if (params.search) qs.set("search", params.search);
      if (params.sortBy) qs.set("sortBy", params.sortBy);
      if (params.sortDir) qs.set("sortDir", params.sortDir);

      const res = await fetch(`/api/bonds?${qs.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch bonds");
      return res.json() as Promise<{ data: any[]; pagination: PaginationMeta }>;
    },
    staleTime: 0,
    refetchOnMount: true,
  });
}
