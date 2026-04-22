import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  activeKey: K | null;
  direction: SortDir;
  onToggle: (key: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}

export function SortableTH<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onToggle,
  align = "left",
  className = "",
}: SortableHeaderProps<K>) {
  const active = activeKey === sortKey;
  const Arrow = active ? (direction === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const flexAlignCls =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 ${alignCls} text-xs font-semibold uppercase tracking-wider text-muted-foreground ${className}`}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={`Sort by ${label}${active ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${flexAlignCls} ${
          active ? "text-foreground" : ""
        }`}
      >
        <span className="truncate">{label}</span>
        <Arrow className={`w-3 h-3 flex-shrink-0 ${active ? "text-primary" : "text-stone-400"}`} />
      </button>
    </th>
  );
}

export type SortAccessor<T, K extends string> = (row: T, key: K) => string | number | null | undefined;

export function useTableSort<T, K extends string>(
  rows: T[] | undefined | null,
  defaultKey: K,
  defaultDir: SortDir,
  accessor: SortAccessor<T, K>,
  numericKeys: readonly K[] = [],
) {
  const [sortBy, setSortBy] = useState<K>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = useCallback(
    (key: K) => {
      if (key === sortBy) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(key);
        setSortDir(numericKeys.includes(key) ? "desc" : "asc");
      }
    },
    [sortBy, numericKeys],
  );

  const sorted = useMemo(() => {
    const list = rows ? [...rows] : [];
    list.sort((a, b) => {
      const av = accessor(a, sortBy);
      const bv = accessor(b, sortBy);
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return list;
  }, [rows, sortBy, sortDir, accessor]);

  return { sortBy, sortDir, toggleSort, sorted };
}
