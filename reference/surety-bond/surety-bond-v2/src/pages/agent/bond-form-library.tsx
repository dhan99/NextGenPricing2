import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
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
import { Search, FileText, ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, XCircle, SlidersHorizontal } from "lucide-react";
import { useListBondForms, useListBondCategories } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";

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

const COUNTRIES = ["United States", "Canada"];

export function BondFormLibrary() {
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const urlSearchParam = new URLSearchParams(searchString).get("search") || "";
  const [search, setSearch] = useState(urlSearchParam);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearchParam);
  const [stateFilter, setStateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const limit = 25;

  useEffect(() => {
    if (urlSearchParam !== search) {
      setSearch(urlSearchParam);
      setDebouncedSearch(urlSearchParam);
    }
  }, [urlSearchParam]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, stateFilter, categoryFilter, subcategoryFilter, countryFilter]);

  const queryParams: Record<string, string | number> = { page, limit };
  if (debouncedSearch) queryParams.search = debouncedSearch;
  if (stateFilter !== "all") queryParams.state = stateFilter;
  if (categoryFilter !== "all") queryParams.category = categoryFilter;
  if (subcategoryFilter !== "all") queryParams.subcategory = subcategoryFilter;
  if (countryFilter !== "all") queryParams.country = countryFilter;

  const { data: formsData, isLoading } = useListBondForms(queryParams);
  const { data: categories } = useListBondCategories();

  const selectedCategory = categories?.find(c => c.name === categoryFilter);

  const handleReset = () => {
    setSearch("");
    setDebouncedSearch("");
    setStateFilter("all");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setCountryFilter("all");
    setPage(1);
  };

  const hasActiveFilters = debouncedSearch || stateFilter !== "all" || categoryFilter !== "all" || subcategoryFilter !== "all" || countryFilter !== "all";

  const activeFilterCount = [stateFilter !== "all", categoryFilter !== "all", subcategoryFilter !== "all", countryFilter !== "all"].filter(Boolean).length;

  const filterControls = (
    <>
      <Select value={countryFilter} onValueChange={setCountryFilter}>
        <SelectTrigger><SelectValue placeholder="All Countries" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Countries</SelectItem>
          {COUNTRIES.map(c => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select value={stateFilter} onValueChange={setStateFilter}>
        <SelectTrigger><SelectValue placeholder="All States" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All States</SelectItem>
          {US_STATES.map(s => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setSubcategoryFilter("all"); }}>
        <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories?.map(c => (<SelectItem key={c.slug} value={c.name}>{c.name}</SelectItem>))}
        </SelectContent>
      </Select>
      <Select value={subcategoryFilter} onValueChange={setSubcategoryFilter} disabled={!selectedCategory || selectedCategory.subcategories.length === 0}>
        <SelectTrigger><SelectValue placeholder="All Subcategories" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Subcategories</SelectItem>
          {selectedCategory?.subcategories.map(s => (<SelectItem key={s.slug} value={s.name}>{s.name}</SelectItem>))}
        </SelectContent>
      </Select>
      {hasActiveFilters && (
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
      )}
    </>
  );

  return (
    <div className={isMobile ? '' : 'animate-fadeUp'}>
        {!isMobile && (
          <div className="flex items-center justify-between mb-6 sticky top-0 z-20 bg-[var(--bg)] -mx-7 px-7 pt-2 pb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Bond Form Library</h1>
              <p className="text-[13.5px] text-[var(--text-muted)] mt-1">
                {formsData ? `${formsData.pagination.total.toLocaleString()} bond forms available` : "Loading..."}
              </p>
            </div>
          </div>
        )}

        <Card className={isMobile ? 'mb-3 sticky top-0 z-30' : 'mb-6'}>
          <CardContent className={isMobile ? 'p-3' : 'pt-6'}>
            <div className="flex flex-col gap-3">
              <div className={isMobile ? 'flex gap-2' : ''}>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search bond forms..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {isMobile && (
                  <Button
                    variant={filtersExpanded || activeFilterCount > 0 ? "default" : "outline"}
                    size="icon"
                    className="shrink-0 min-h-[36px] min-w-[36px] relative"
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center font-bold">{activeFilterCount}</span>
                    )}
                  </Button>
                )}
              </div>

              {isMobile ? (
                filtersExpanded && (
                  <div className="grid grid-cols-2 gap-2 animate-fadeUp">
                    {filterControls}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {filterControls}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <div className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="p-3 space-y-2">
                      <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                    </div>
                  ))
                ) : formsData?.data.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground py-12">
                    <FileText className="h-8 w-8" />
                    <p className="font-medium text-sm">No bond forms found</p>
                    <p className="text-xs">Try adjusting your search or filters</p>
                  </div>
                ) : (
                  formsData?.data.map((form) => (
                    <div
                      key={form.id}
                      className="px-3 py-2.5 active:bg-muted/50 cursor-pointer"
                      onClick={() => navigate(`/agent/bond-form-library/${form.id}`)}
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[13px] leading-tight">{form.name}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {form.bondType === "renewable" ? (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-emerald-500/30 text-emerald-600">Renewable</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600">Non-renewable</Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground">{form.category}</span>
                            <code className="text-[10px] bg-muted px-1 py-0 rounded font-mono">{form.classCode}</code>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[280px]">Bond Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Class Code</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Obligee</TableHead>
                      <TableHead className="text-center">E-File</TableHead>
                      <TableHead className="text-center">Auto Fills</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}>
                              <div className="h-4 bg-muted rounded animate-pulse" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : formsData?.data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-40 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <FileText className="h-8 w-8" />
                            <p className="font-medium">No bond forms found</p>
                            <p className="text-sm">Try adjusting your search or filters</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      formsData?.data.map((form) => (
                        <TableRow key={form.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/agent/bond-form-library/${form.id}`)}>
                          <TableCell>
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                              <div>
                                <p className="font-medium text-sm">{form.name}</p>
                                {form.bondType === "renewable" ? (
                                  <Badge variant="outline" className="text-[10px] mt-1 border-emerald-500/30 text-emerald-600">Renewable</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] mt-1 border-amber-500/30 text-amber-600">Non-renewable</Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm">{form.category}</p>
                              {form.subcategory && (
                                <p className="text-xs text-muted-foreground">{form.subcategory}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{form.classCode}</code>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{form.state || "National"}</span>
                          </TableCell>
                          <TableCell>
                            {form.obligees.length > 0 ? (
                              <div>
                                <p className="text-sm">{form.obligees[0].name}</p>
                                {form.obligees[0].city && form.obligees[0].state && (
                                  <p className="text-xs text-muted-foreground">{form.obligees[0].city}, {form.obligees[0].state}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {form.requiresEfile ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {form.autoFills ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {formsData && formsData.pagination.totalPages > 1 && (
              <div className={`flex items-center justify-between px-3 sm:px-4 py-2.5 border-t border-border ${isMobile ? 'gap-2' : ''}`}>
                <p className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-muted-foreground`}>
                  {isMobile
                    ? `${((formsData.pagination.page - 1) * formsData.pagination.limit) + 1}–${Math.min(formsData.pagination.page * formsData.pagination.limit, formsData.pagination.total)} of ${formsData.pagination.total}`
                    : `Showing ${((formsData.pagination.page - 1) * formsData.pagination.limit) + 1}–${Math.min(formsData.pagination.page * formsData.pagination.limit, formsData.pagination.total)} of ${formsData.pagination.total.toLocaleString()}`
                  }
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className={isMobile ? 'h-8 w-8 p-0' : ''}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {!isMobile && "Previous"}
                  </Button>
                  <span className={`${isMobile ? 'text-[11px]' : 'text-sm'} text-muted-foreground px-1`}>
                    {formsData.pagination.page}/{formsData.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className={isMobile ? 'h-8 w-8 p-0' : ''}
                    onClick={() => setPage(p => Math.min(formsData.pagination.totalPages, p + 1))}
                    disabled={page === formsData.pagination.totalPages}
                  >
                    {!isMobile && "Next"}
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
