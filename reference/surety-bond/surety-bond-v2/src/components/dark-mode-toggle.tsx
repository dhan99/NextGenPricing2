import { useState, useRef, useCallback } from "react";
import { useDarkMode } from "@/hooks/use-dark-mode";

export function DarkModeToggle() {
  const { mode, setMode } = useDarkMode();
  const isDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [isAnimating, setIsAnimating] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const toggleDarkMode = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  const handleToggle = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);

    const btn = toggleRef.current;
    const overlay = overlayRef.current;
    if (!btn || !overlay) {
      toggleDarkMode();
      setIsAnimating(false);
      return;
    }

    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy)
    );

    overlay.style.setProperty("--wipe-cx", `${cx}px`);
    overlay.style.setProperty("--wipe-cy", `${cy}px`);
    overlay.style.setProperty("--wipe-max-r", `${maxR}px`);
    overlay.classList.remove("hidden");
    overlay.classList.add("circle-wipe-active");

    setTimeout(() => {
      toggleDarkMode();
    }, 300);

    setTimeout(() => {
      overlay.classList.remove("circle-wipe-active");
      overlay.classList.add("hidden");
      setIsAnimating(false);
    }, 600);
  }, [isAnimating, toggleDarkMode]);

  return (
    <>
      <style>{`
        .circle-wipe-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          pointer-events: none;
          background: hsl(var(--background));
          clip-path: circle(0% at var(--wipe-cx) var(--wipe-cy));
          transition: none;
        }
        .circle-wipe-active {
          animation: circle-wipe 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes circle-wipe {
          0% { clip-path: circle(0% at var(--wipe-cx) var(--wipe-cy)); opacity: 1; }
          50% { clip-path: circle(var(--wipe-max-r) at var(--wipe-cx) var(--wipe-cy)); opacity: 1; }
          100% { clip-path: circle(var(--wipe-max-r) at var(--wipe-cx) var(--wipe-cy)); opacity: 0; }
        }

        .sun-moon-toggle {
          position: relative;
          width: 2.25rem;
          height: 2.25rem;
        }
        .sun-moon-toggle .icon-sun,
        .sun-moon-toggle .icon-moon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
        }
        .sun-moon-toggle.is-dark .icon-sun {
          transform: rotate(-90deg) scale(0);
          opacity: 0;
        }
        .sun-moon-toggle.is-dark .icon-moon {
          transform: rotate(0deg) scale(1);
          opacity: 1;
        }
        .sun-moon-toggle:not(.is-dark) .icon-sun {
          transform: rotate(0deg) scale(1);
          opacity: 1;
        }
        .sun-moon-toggle:not(.is-dark) .icon-moon {
          transform: rotate(90deg) scale(0);
          opacity: 0;
        }
      `}</style>

      <div
        ref={overlayRef}
        className="circle-wipe-overlay hidden"
      />

      <button
        ref={toggleRef}
        onClick={handleToggle}
        className={`sun-moon-toggle ${isDark ? "is-dark" : ""} rounded-full cursor-pointer transition-all duration-300 hover:scale-110 border border-border/60 bg-card/50 backdrop-blur-md`}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        <div className="icon-sun">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(45, 93%, 47%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        </div>
        <div className="icon-moon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="hsl(var(--primary))" />
          </svg>
        </div>
      </button>
    </>
  );
}
