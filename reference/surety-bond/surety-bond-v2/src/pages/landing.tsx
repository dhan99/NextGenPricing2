import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/themes/theme-provider";
import { ShieldCheck, ArrowRight, Building2, User, Shield, TrendingUp, Clock, Cpu } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import React from "react";

export function LandingPage() {
  const { setRole } = useAuth();
  const { theme } = useTheme();
  const prefersReducedMotion = useReducedMotion();
  const [, setLocation] = useLocation();

  const handleSelectRole = (role: "agent" | "principal" | "underwriter") => {
    setRole(role);
    if (role === "agent") setLocation("/agent/dashboard");
    else if (role === "principal") setLocation("/principal/dashboard");
    else setLocation("/underwriter/dashboard");
  };

  const stats = [
    { stat: "< 24h", label: "Avg. approval", icon: Clock },
    { stat: "99.9%", label: "Uptime SLA", icon: TrendingUp },
    { stat: "AI-first", label: "Smart intake", icon: Cpu },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col relative overflow-hidden font-sans">

      <header className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex justify-between items-center z-10 sticky top-0 bg-[var(--glass-bg)] backdrop-blur-lg border-b border-[var(--border-color)]">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2.5"
        >
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt={theme.brandName} className="h-[52px] w-auto dark:brightness-0 dark:invert" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--s-green-bg)] border border-[var(--green)]/20">
            <div className="h-2 w-2 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-xs font-semibold text-[var(--s-green)] hidden sm:inline">System Live</span>
          </div>
        </motion.div>
      </header>

      <div className="pointer-events-none absolute top-[18%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[var(--green)] opacity-[0.07] blur-[120px] z-0" />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center z-10 py-12 sm:py-20">
        <div className="max-w-5xl w-full space-y-14">

          <div className="text-center space-y-7">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--green)]/30 bg-[var(--green-50)]"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--green)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--green)]" />
              </span>
              <span className="text-xs sm:text-sm font-bold text-[var(--green)] tracking-wide uppercase">
                {theme.features[0]}
              </span>
            </motion.div>

            <h1 className="text-5xl sm:text-7xl md:text-8xl font-black leading-[1.05] tracking-tighter text-[var(--slate-900)]">
              {theme.heroTitle.split(" ").map((word, i) => (
                <motion.span
                  key={i}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, delay: 0.1 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                  className="inline-block mr-[0.25em]"
                >
                  {word}
                </motion.span>
              ))}
              <br />
              <span className="text-[var(--green)]">
                {theme.heroHighlight.split(" ").map((word, i) => (
                  <motion.span
                    key={`h-${i}`}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.5, delay: 0.1 + (theme.heroTitle.split(" ").length + i) * 0.08, ease: [0.16, 1, 0.3, 1] }}
                    className="inline-block mr-[0.25em]"
                  >
                    {word}
                  </motion.span>
                ))}
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="text-lg sm:text-xl text-[var(--text-muted)] leading-relaxed max-w-2xl mx-auto"
            >
              {theme.heroDescription}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="pt-2 pb-1"
            >
              <button
                className="bg-gradient-to-br from-[var(--green)] to-[var(--green-dark)] text-white font-bold text-lg px-8 py-4 rounded-[var(--r-lg)] shadow-md hover:shadow-[0_0_24px_rgba(5,150,105,0.4)] transition-all duration-300 flex items-center gap-2 mx-auto cursor-pointer border-none font-[inherit]"
                onClick={() => handleSelectRole("principal")}
              >
                Start Free <ArrowRight className="h-5 w-5" />
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="flex flex-wrap justify-center gap-2.5 px-2"
            >
              {theme.features.map((f, i) => (
                <motion.span
                  key={f}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, delay: 0.45 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="px-4 py-2 rounded-full bg-card border border-[var(--border-color)] text-sm font-medium text-[var(--text-muted)] shadow-sm"
                >
                  {f}
                </motion.span>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto w-full"
          >
            <div
              className="group cursor-pointer rounded-[var(--r-lg)] p-7 sm:p-8 transition-all duration-300 hover:-translate-y-1 bg-card border border-[var(--border-color)] shadow-md hover:shadow-lg active:scale-[0.98] overflow-hidden"
              onClick={() => handleSelectRole("principal")}
            >
              <div className="flex flex-col h-full">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-[var(--r-lg)] bg-[var(--blue)] flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-105 transition-transform duration-300">
                  <User className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold mb-2 text-[var(--slate-900)] tracking-tight">Applicant Portal</h3>
                <p className="text-sm text-[var(--text-muted)] mb-6 sm:mb-8 leading-relaxed flex-grow">
                  Apply for a new bond, track your application in real time, and manage all your active coverage.
                </p>
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--blue)] group-hover:gap-4 transition-all duration-300">
                  Get Started
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </div>
              </div>
            </div>

            <div
              className="group cursor-pointer rounded-[var(--r-lg)] p-7 sm:p-8 transition-all duration-300 hover:-translate-y-1 bg-card border border-[var(--border-color)] shadow-md hover:shadow-lg active:scale-[0.98] overflow-hidden"
              onClick={() => handleSelectRole("agent")}
            >
              <div className="flex flex-col h-full">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-[var(--r-lg)] bg-[var(--green)] flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-105 transition-transform duration-300">
                  <Building2 className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold mb-2 text-[var(--slate-900)] tracking-tight">Agent Portal</h3>
                <p className="text-sm text-[var(--text-muted)] mb-6 sm:mb-8 leading-relaxed flex-grow">
                  Manage your pipeline, submit applications, and track principal relationships.
                </p>
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--green)] group-hover:gap-4 transition-all duration-300">
                  Agent Login
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </div>
              </div>
            </div>

            <div
              className="group cursor-pointer rounded-[var(--r-lg)] p-7 sm:p-8 transition-all duration-300 hover:-translate-y-1 bg-card border border-[var(--border-color)] shadow-md hover:shadow-lg active:scale-[0.98] overflow-hidden"
              onClick={() => handleSelectRole("underwriter")}
            >
              <div className="flex flex-col h-full">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-[var(--r-lg)] bg-[var(--violet)] flex items-center justify-center mb-5 sm:mb-6 group-hover:scale-105 transition-transform duration-300">
                  <ShieldCheck className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold mb-2 text-[var(--slate-900)] tracking-tight">Underwriter Portal</h3>
                <p className="text-sm text-[var(--text-muted)] mb-6 sm:mb-8 leading-relaxed flex-grow">
                  Review referrals, run credit & risk checks, approve or decline bonds across all agents.
                </p>
                <div className="flex items-center gap-2 text-sm font-bold text-[#7C3AED] group-hover:gap-4 transition-all duration-300">
                  Underwriter Login
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0 pt-4"
          >
            {stats.map(({ stat, label, icon: Icon }, i) => (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center justify-center text-center group w-48">
                  <div className="h-12 w-12 rounded-[var(--r-lg)] bg-[var(--green-50)] border border-[var(--green)]/20 flex items-center justify-center mb-3 group-hover:bg-[var(--green-light)] transition-all duration-300">
                    <Icon className="h-5 w-5 text-[var(--green)]" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-[var(--slate-900)] tracking-tighter mb-1">
                    {stat}
                  </div>
                  <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">
                    {label}
                  </div>
                </div>
                {i < stats.length - 1 && (
                  <div className="hidden md:block w-px h-20 bg-[var(--slate-200)] mx-8" />
                )}
              </React.Fragment>
            ))}
          </motion.div>
        </div>
      </main>

      <footer className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-3 z-10 border-t border-[var(--border-color)] mt-auto">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--text-muted)] font-medium">{theme.footerCopyright}</span>
          <Link href="/privacy-policy" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors no-underline font-medium">Privacy Policy</Link>
          <Link href="/terms-and-conditions" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors no-underline font-medium">Terms & Conditions</Link>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] font-medium bg-card px-4 py-2 rounded-full border border-[var(--border-color)]">
          <Shield className="h-4 w-4 text-[var(--green)]" /> {theme.certBadge}
        </div>
      </footer>
    </div>
  );
}
