import { Eye } from "lucide-react";

export function ReadOnlyAdminBanner({ feature }: { feature?: string }) {
  return (
    <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 mb-2 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <Eye className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
      <div className="text-sm text-amber-900 leading-snug">
        <span className="font-semibold">Read-only view.</span>{" "}
        Your role can review {feature || "this configuration"} but cannot make changes.
        Switch to <span className="font-semibold">Pricing Operations</span> to edit.
      </div>
    </div>
  );
}
