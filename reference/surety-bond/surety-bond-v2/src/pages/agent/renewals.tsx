import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useListRenewableBonds, useRenewBond } from "@workspace/api-client-react";
import type { BondApplication } from "@workspace/api-zod";
import { Search, Filter, RefreshCw, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BondTypeBadge } from "@/components/shared/BondTypeBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";

function formatCurrency(val: number | null | undefined) {
  if (val == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function getExpiryUrgency(expirationDate: string | null | undefined) {
  if (!expirationDate) return { label: "No Date", color: "bg-gray-100 text-gray-600" };
  const days = differenceInDays(parseISO(expirationDate), new Date());
  if (days < 0) return { label: "Expired", color: "bg-red-100 text-red-700" };
  if (days <= 30) return { label: `${days}d left`, color: "bg-red-100 text-red-700" };
  if (days <= 60) return { label: `${days}d left`, color: "bg-amber-100 text-amber-700" };
  return { label: `${days}d left`, color: "bg-green-100 text-green-700" };
}

export function RenewalsPage() {
  const [, setLocation] = useLocation();
  const [daysFilter, setDaysFilter] = useState("90");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const renewBond = useRenewBond();

  const { data: bonds, isLoading, refetch } = useListRenewableBonds(
    { daysUntilExpiry: parseInt(daysFilter) },
    { query: { queryKey: ["renewableBonds", daysFilter] } }
  );

  const filteredBonds = (bonds || []).filter((b: BondApplication) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.bondNumber?.toLowerCase().includes(q) ||
      b.obligeeName?.toLowerCase().includes(q) ||
      b.principal?.companyName?.toLowerCase().includes(q) ||
      b.principal?.firstName?.toLowerCase().includes(q) ||
      b.principal?.lastName?.toLowerCase().includes(q)
    );
  });

  const handleRenew = async (bondId: number) => {
    try {
      const result = await renewBond.mutateAsync({ id: bondId });
      toast({ title: "Renewal Created", description: `Renewal draft created from bond. Redirecting...` });
      const renewedBond = result as BondApplication;
      setLocation(`/agent/bonds/${renewedBond.id}`);
    } catch (err) {
      toast({ title: "Renewal Failed", variant: "destructive", description: "Could not create renewal." });
    }
  };

  return (
    <div className={isMobile ? '' : 'animate-fadeUp'}>
        <div className={`flex flex-col md:flex-row justify-between items-start md:items-center ${isMobile ? 'gap-0 mb-2 sticky top-0 z-30 bg-[var(--bg)] -mx-4 px-4 pt-1 pb-2' : 'gap-4 mb-6 sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4'}`}>
          {!isMobile && (
            <div>
              <h1 className="text-[22px] font-extrabold text-[var(--slate-900)]">Renewals</h1>
              <p className="text-[13.5px] text-[var(--text-muted)] mt-1">Manage bonds approaching expiration and initiate renewals.</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search bonds, principals..."
                className="pl-9 bg-card shadow-sm border-muted h-11"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={daysFilter} onValueChange={setDaysFilter}>
              <SelectTrigger className="w-full sm:w-[180px] bg-card shadow-sm border-muted h-11">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Expiry Window" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Within 30 Days</SelectItem>
                <SelectItem value="60">Within 60 Days</SelectItem>
                <SelectItem value="90">Within 90 Days</SelectItem>
                <SelectItem value="180">Within 180 Days</SelectItem>
                <SelectItem value="365">Within 1 Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredBonds.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Bonds Due for Renewal</h3>
            <p className="text-muted-foreground text-sm">
              No issued bonds are expiring within the next {daysFilter} days.
            </p>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-sm px-3 py-1">
                {filteredBonds.length} bond{filteredBonds.length !== 1 ? "s" : ""} approaching expiration
              </Badge>
            </div>

            <Card className="shadow-sm border-muted overflow-hidden hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/40 uppercase border-b">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Bond / Account</th>
                      <th className="px-6 py-4 font-semibold">Type</th>
                      <th className="px-6 py-4 font-semibold text-right">Amount</th>
                      <th className="px-6 py-4 font-semibold text-center">Effective</th>
                      <th className="px-6 py-4 font-semibold text-center">Expiration</th>
                      <th className="px-6 py-4 font-semibold text-center">Urgency</th>
                      <th className="px-6 py-4 font-semibold text-center">Status</th>
                      <th className="px-6 py-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBonds.map((bond) => {
                      const urgency = getExpiryUrgency(bond.expirationDate);
                      const principalName = bond.principal?.companyName ||
                        `${bond.principal?.firstName || ""} ${bond.principal?.lastName || ""}`.trim() || "—";
                      return (
                        <tr
                          key={bond.id}
                          className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => setLocation(`/agent/bonds/${bond.id}`)}
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-foreground">{bond.bondNumber}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{principalName}</div>
                          </td>
                          <td className="px-6 py-4">
                            <BondTypeBadge type={bond.bondType} />
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-foreground">
                            {formatCurrency(bond.bondAmount)}
                          </td>
                          <td className="px-6 py-4 text-center text-muted-foreground">
                            {bond.effectiveDate ? format(new Date(bond.effectiveDate), "MMM d, yyyy") : "—"}
                          </td>
                          <td className="px-6 py-4 text-center text-muted-foreground">
                            {bond.expirationDate ? format(new Date(bond.expirationDate), "MMM d, yyyy") : "—"}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${urgency.color}`}>
                              {urgency.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <StatusBadge status={bond.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenew(bond.id);
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5" /> Renew
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="md:hidden space-y-3">
              {filteredBonds.map((bond) => {
                const urgency = getExpiryUrgency(bond.expirationDate);
                const principalName = bond.principal?.companyName ||
                  `${bond.principal?.firstName || ""} ${bond.principal?.lastName || ""}`.trim() || "—";
                return (
                  <Card
                    key={bond.id}
                    className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setLocation(`/agent/bonds/${bond.id}`)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-semibold text-foreground">{bond.bondNumber}</div>
                        <div className="text-xs text-muted-foreground">{principalName}</div>
                      </div>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${urgency.color}`}>
                        {urgency.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-sm font-mono">{formatCurrency(bond.bondAmount)}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenew(bond.id);
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Renew
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
    </div>
  );
}
