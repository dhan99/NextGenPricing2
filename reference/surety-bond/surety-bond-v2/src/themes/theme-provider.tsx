import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { themeConfig, type ThemeConfig, type PersonaMode } from "./theme-config";
import { initTheme } from "@/hooks/use-dark-mode";

const PERSONA_STORAGE_KEY = "bondclick-persona";

interface ThemeContextValue {
  theme: ThemeConfig;
  persona: PersonaMode;
  setPersona: (mode: PersonaMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredPersona(): PersonaMode {
  try {
    const stored = localStorage.getItem(PERSONA_STORAGE_KEY);
    if (stored === "agent" || stored === "principal" || stored === "underwriter") return stored;
  } catch {}
  return "agent";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState<PersonaMode>(getStoredPersona);

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove("mode-agent", "mode-principal", "mode-underwriter");
    document.documentElement.classList.add(`mode-${persona}`);
    localStorage.setItem(PERSONA_STORAGE_KEY, persona);
  }, [persona]);

  const setPersona = useCallback((mode: PersonaMode) => {
    setPersonaState(mode);
  }, []);

  const value: ThemeContextValue = {
    theme: themeConfig,
    persona,
    setPersona,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
