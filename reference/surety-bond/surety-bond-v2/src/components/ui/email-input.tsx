import { useState } from "react";
import { Input } from "@/components/ui/input";
import { getEmailError } from "@/lib/email-validation";

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export function EmailInput({
  value,
  onChange,
  placeholder = "email@example.com",
  className = "",
  disabled = false,
  id,
}: EmailInputProps) {
  const [touched, setTouched] = useState(false);
  const error = touched ? getEmailError(value) : null;

  return (
    <div className="w-full">
      <Input
        id={id}
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        className={`${className} ${error ? "border-red-500 focus-visible:ring-red-500/30" : ""}`}
        disabled={disabled}
      />
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
