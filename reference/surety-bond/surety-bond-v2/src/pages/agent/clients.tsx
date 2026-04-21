import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Building2, ChevronLeft, ChevronRight, RotateCcw, Plus, Users } from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import { CreateClientWizard } from "@/components/clients/create-client-wizard";

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "border-emerald-500/30 text-emerald-600 bg-emerald-500/10" },
  reserved: { label: "Reserved", className: "border-amber-500/30 text-amber-600 bg-amber-500/10" },
  inactive: { label: "Inactive", className: "border-gray-500/30 text-gray-500 bg-gray-500/10" },
};

export function ClientsPage() {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const limit = 25;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, stateFilter, statusFilter]);

  const queryParams: Record<string, string | number> = { page, limit };
  if (debouncedSearch) queryParams.search = debouncedSearch;
  if (stateFilter !== "all") queryParams.state = stateFilter;
  if (statusFilter !== "all") queryParams.status = statusFilter;

  const { data: clientsData, isLoading, refetch } = useListClients(queryParams);

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setStateFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  const hasActiveFilters = debouncedSearch || stateFilter !== "all" || statusFilter !== "all";

  if (showCreate) {
    return (
      <div className="animate-fadeUp max-w-3xl mx-auto">
          <CreateClientWizard
            onSuccess={(clientId) => {
              setShowCreate(false);
              navigate(`/agent/clients/${clientId}`);
            }}
            onCancel={() => setShowCreate(false)}
            agentId={1}
          />
      </div>
    );
  }

  return (
    <div className={isMobile ? '' : 'animate-fadeUp'}>
        <div className={`flex items-center justify-between ${isMobile ? 'mb-2 sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2' : 'mb-6 sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4'}`}>
          {!isMobile && (
            <div>
              <h1 className="text-2xl font-bold text-foreground">Clients</h1>
              <p className="text-[13.5px] text-[var(--text-muted)] mt-1">
                {clientsData ? `${clientsData.pagination.total.toLocaleString()} client accounts` : "Loading..."}
              </p>
            </div>
          )}
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by company name, DBA, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {US_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="reserved">Reserved</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button variant="outline" onClick={handleReset} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Company Name</TableHead>
                    <TableHead>DBA</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-muted rounded animate-pulse" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : clientsData?.data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-40 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Users className="h-8 w-8" />
                          <p className="font-medium">No clients found</p>
                          <p className="text-sm">Try adjusting your search or filters</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    clientsData?.data.map((client) => (
                      <TableRow
                        key={client.id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/agent/clients/${client.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                            <p className="font-medium text-sm">{client.companyName}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{client.dbaName || "—"}</span>
                        </TableCell>
                        <TableCell>
                          {client.firstName || client.lastName ? (
                            <div>
                              <p className="text-sm">{[client.firstName, client.lastName].filter(Boolean).join(" ")}</p>
                              {client.email && <p className="text-xs text-muted-foreground">{client.email}</p>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{client.city || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{client.state || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusConfig[client.accountStatus]?.className || ""}>
                            {statusConfig[client.accountStatus]?.label || client.accountStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {clientsData && clientsData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {((clientsData.pagination.page - 1) * clientsData.pagination.limit) + 1}–{Math.min(clientsData.pagination.page * clientsData.pagination.limit, clientsData.pagination.total)} of {clientsData.pagination.total.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    Page {clientsData.pagination.page} of {clientsData.pagination.totalPages}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(clientsData.pagination.totalPages, p + 1))} disabled={page === clientsData.pagination.totalPages}>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
