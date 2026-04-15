import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatPercent(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `${num.toFixed(1)}%`;
}

export function formatNumber(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US").format(num);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "draft": return "bg-muted text-muted-foreground";
    case "in_progress": return "bg-info/10 text-info";
    case "submitted": return "bg-warning/10 text-warning";
    case "approved": return "bg-success/10 text-success";
    case "rejected": return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "draft": return "Draft";
    case "in_progress": return "In Progress";
    case "submitted": return "Submitted";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "pending": return "Pending";
    default: return status;
  }
}
