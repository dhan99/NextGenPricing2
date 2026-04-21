import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, MapPin } from "lucide-react";

interface AddressData {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

interface ValidatedAddressData extends AddressData {
  isStandardized: boolean;
  confidence: "high" | "medium" | "low";
  suggestions: string[];
}

interface AddressValidationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: AddressData;
  standardized: ValidatedAddressData;
  onAcceptStandardized: () => void;
  onKeepOriginal: () => void;
  loading?: boolean;
}

export function AddressValidationModal({
  open,
  onOpenChange,
  original,
  standardized,
  onAcceptStandardized,
  onKeepOriginal,
  loading,
}: AddressValidationModalProps) {
  const confidenceColor = {
    high: "text-emerald-600 border-emerald-500/30",
    medium: "text-amber-600 border-amber-500/30",
    low: "text-red-600 border-red-500/30",
  };

  const formatAddress = (addr: AddressData) => {
    const parts = [addr.addressLine1];
    if (addr.addressLine2) parts.push(addr.addressLine2);
    parts.push(`${addr.city}, ${addr.state} ${addr.zipCode}`);
    if (addr.country) parts.push(addr.country);
    return parts;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Address Validation
          </DialogTitle>
          <DialogDescription>
            We've standardized the address. Is this the correct address?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-muted-foreground">Confidence:</span>
            <Badge variant="outline" className={confidenceColor[standardized.confidence]}>
              {standardized.confidence === "high" && <CheckCircle2 className="h-3 w-3 mr-1" />}
              {standardized.confidence === "medium" && <AlertTriangle className="h-3 w-3 mr-1" />}
              {standardized.confidence === "low" && <AlertTriangle className="h-3 w-3 mr-1" />}
              {standardized.confidence.charAt(0).toUpperCase() + standardized.confidence.slice(1)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Original</p>
              <div className="space-y-0.5">
                {formatAddress(original).map((line, i) => (
                  <p key={i} className="text-sm">{line}</p>
                ))}
              </div>
            </div>

            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs font-medium text-primary uppercase tracking-wider mb-2">Standardized</p>
              <div className="space-y-0.5">
                {formatAddress(standardized).map((line, i) => (
                  <p key={i} className="text-sm font-medium">{line}</p>
                ))}
              </div>
            </div>
          </div>

          {standardized.suggestions.length > 0 && (
            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">Changes Made</p>
              <ul className="space-y-0.5">
                {standardized.suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button variant="outline" onClick={onKeepOriginal} disabled={loading}>
            Keep Original
          </Button>
          <Button onClick={onAcceptStandardized} disabled={loading}>
            {loading ? "Saving..." : "Accept Standardized"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
