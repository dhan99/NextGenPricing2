import { cn } from "@/lib/utils";
import type { BondStatus } from "@workspace/api-client-react";

interface StatusBadgeProps {
  status: BondStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getStatusConfig = (s: string) => {
    switch (s.toLowerCase()) {
      case 'draft':
        return { label: 'Draft', chipClass: 'chip-gray' };
      case 'open':
        return { label: 'Open', chipClass: 'chip-amber' };
      case 'quoted':
        return { label: 'Quoted', chipClass: 'chip-green' };
      case 'submitted':
        return { label: 'Submitted', chipClass: 'chip-blue' };
      case 'requires_referral':
        return { label: 'Requires Referral', chipClass: 'chip-purple' };
      case 'referral_approved':
        return { label: 'Referral Approved', chipClass: 'chip-green' };
      case 'referred':
        return { label: 'Referred', chipClass: 'chip-purple' };
      case 'indemnity_in_review':
        return { label: 'In Review', chipClass: 'chip-blue' };
      case 'pending_information':
        return { label: 'Pending', chipClass: 'chip-amber' };
      case 'pending_payment':
        return { label: 'Pending Payment', chipClass: 'chip-amber' };
      case 'payment_approved':
        return { label: 'Payment Approved', chipClass: 'chip-green' };
      case 'pending_issue':
        return { label: 'Pending Issue', chipClass: 'chip-amber' };
      case 'under_review':
        return { label: 'Under Review', chipClass: 'chip-amber' };
      case 'approved':
        return { label: 'Approved', chipClass: 'chip-green' };
      case 'issued':
        return { label: 'Active', chipClass: 'chip-green' };
      case 'declined':
        return { label: 'Declined', chipClass: 'chip-red' };
      case 'cancelled':
        return { label: 'Cancelled', chipClass: 'chip-gray' };
      case 'bound':
        return { label: 'Bound', chipClass: 'chip-green' };
      case 'active':
        return { label: 'Active', chipClass: 'chip-green' };
      case 'expired':
        return { label: 'Expired', chipClass: 'chip-gray' };
      case 'renewed':
        return { label: 'Renewed', chipClass: 'chip-green' };
      default:
        return { label: s.replace(/_/g, ' '), chipClass: 'chip-gray' };
    }
  };

  const config = getStatusConfig(status);

  return (
    <span className={cn("chip", config.chipClass, className)}>
      {config.label}
    </span>
  );
}
