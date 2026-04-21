import { cn } from "@/lib/utils";
import type { BondType } from "@workspace/api-client-react";

interface BondTypeBadgeProps {
  type: BondType | string;
  className?: string;
}

export function BondTypeBadge({ type, className }: BondTypeBadgeProps) {
  const getConfig = (t: string) => {
    switch (t) {
      case 'contractor_license':
        return { label: 'Contractor License', emoji: '🏗️' };
      case 'performance':
        return { label: 'Performance', emoji: '🚛' };
      case 'payment':
        return { label: 'Payment', emoji: '💰' };
      case 'permit':
        return { label: 'Permit', emoji: '📋' };
      case 'court':
        return { label: 'Court', emoji: '⚖️' };
      case 'fidelity':
        return { label: 'Fidelity', emoji: '👥' };
      case 'customs':
        return { label: 'Customs', emoji: '🛃' };
      case 'renewable':
        return { label: 'Renewable', emoji: '🔄' };
      default:
        return { label: t.replace(/_/g, ' '), emoji: '📑' };
    }
  };

  const config = getConfig(type);

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[11px] px-[7px] py-[2px] rounded-full font-medium bg-[var(--slate-100)] text-[var(--slate-500)]",
      className
    )}>
      {config.emoji} {config.label}
    </span>
  );
}
