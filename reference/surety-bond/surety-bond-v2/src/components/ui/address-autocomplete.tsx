import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface AddressSuggestion {
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export type { AddressSuggestion };

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address...",
  className = "",
  disabled = false,
}: AddressAutocompleteProps) {
  const { token } = useAuth();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(
        `/api/address-suggestions?q=${encodeURIComponent(query)}`,
        { signal: controller.signal, headers }
      );
      if (controller.signal.aborted) return;
      if (res.ok) {
        const data: AddressSuggestion[] = await res.json();
        setSuggestions(data);
        setIsOpen(data.length > 0);
        setHighlightedIndex(-1);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(val);
    }, 300);
  };

  const handleSelect = (suggestion: AddressSuggestion) => {
    onChange(suggestion.address);
    onSelect(suggestion);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          className={`h-10 pr-8 ${className}`}
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          disabled={disabled}
          autoComplete="off"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={`${s.address}-${s.city}-${s.zip}`}
              type="button"
              className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                i === highlightedIndex
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-muted/50 text-foreground"
              } ${i > 0 ? "border-t border-border/50" : ""}`}
              onClick={() => handleSelect(s)}
              onMouseEnter={() => setHighlightedIndex(i)}
            >
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.address}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {s.city}, {s.state} {s.zip}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
