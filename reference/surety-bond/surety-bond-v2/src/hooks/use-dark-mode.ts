import { create } from "zustand";
import { persist } from "zustand/middleware";

type ThemeMode = "light" | "dark" | "system";

interface DarkModeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: () => boolean;
}

function getSystemPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useDarkMode = create<DarkModeState>()(
  persist(
    (set, get) => ({
      mode: "system" as ThemeMode,
      setMode: (mode: ThemeMode) => {
        set({ mode });
        applyTheme(mode);
      },
      isDark: () => {
        const { mode } = get();
        if (mode === "system") return getSystemPreference();
        return mode === "dark";
      },
    }),
    { name: "v2-dark-mode" }
  )
);

export function applyTheme(mode: ThemeMode) {
  const isDark = mode === "dark" || (mode === "system" && getSystemPreference());
  document.documentElement.classList.toggle("dark", isDark);
}

export function initTheme() {
  const stored = localStorage.getItem("v2-dark-mode");
  let mode: ThemeMode = "system";
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      mode = parsed?.state?.mode || "system";
    } catch {}
  }
  applyTheme(mode);

  if (mode === "system") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      applyTheme("system");
    });
  }
}
