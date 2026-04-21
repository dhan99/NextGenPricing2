import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, LogIn, UserPlus, ArrowRight, Zap, Lock, BarChart3 } from "lucide-react";
import { initTheme } from "@/hooks/use-dark-mode";

const TEST_ACCOUNTS = [
  { label: "Agent", email: "agent@bcai.com", password: "elevate", role: "agent" as const, color: "var(--green)" },
  { label: "Principal", email: "principal@bcai.com", password: "elevate", role: "principal" as const, color: "var(--blue)" },
  { label: "Underwriter", email: "uw@bcai.com", password: "elevate", role: "underwriter" as const, color: "var(--violet)" },
];

const STATS = [
  { value: "10,000+", label: "Bonds Issued" },
  { value: "99.9%", label: "Uptime" },
  { value: "<2min", label: "Avg. Decision" },
];

export function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"agent" | "principal" | "underwriter">("agent");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    initTheme();
    setTimeout(() => setMounted(true), 50);
  }, []);

  const apiBase = "/api";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login"
        ? { email, password }
        : { email, password, role, displayName };

      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Authentication failed");
        return;
      }

      login(data.token, data.user);

      const dest = data.user.role === "agent"
        ? "/agent/dashboard"
        : data.user.role === "principal"
        ? "/principal/dashboard"
        : "/underwriter/dashboard";
      setLocation(dest);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickLogin(account: typeof TEST_ACCOUNTS[0]) {
    setEmail(account.email);
    setPassword(account.password);
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email, password: account.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || "Login failed");
        return;
      }

      login(data.token, data.user);

      const dest = account.role === "agent"
        ? "/agent/dashboard"
        : account.role === "principal"
        ? "/principal/dashboard"
        : "/underwriter/dashboard";
      setLocation(dest);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border-color)] rounded-xl text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all";

  return (
    <div className="min-h-screen flex bg-[var(--bg)] transition-colors duration-300">
      <div className={`hidden lg:flex lg:w-[55%] relative overflow-hidden transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0" style={{
          background: `
            radial-gradient(ellipse at 20% 50%, rgba(16, 185, 129, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
            var(--bg)
          `
        }} />

        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, var(--text-muted) 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div className={`transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center gap-4 mb-2">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt="Surety Demo App"
                className="h-16 w-auto dark:brightness-0 dark:invert"
              />
            </div>
          </div>

          <div className={`max-w-lg transition-all duration-700 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <h1 className="text-4xl xl:text-5xl font-black text-[var(--slate-900)] leading-[1.1] mb-4 tracking-tight">
              Surety bonds,{" "}
              <span className="gradient-text">reimagined.</span>
            </h1>
            <p className="text-lg text-[var(--text-muted)] leading-relaxed mb-8">
              AI-powered underwriting, real-time risk scoring, and complete lifecycle management — all in one beautiful platform.
            </p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {STATS.map((stat, i) => (
                <div key={i} className="glass-card p-4 text-center">
                  <div className="text-2xl font-black text-[var(--slate-900)]">{stat.value}</div>
                  <div className="text-[11px] font-medium text-[var(--text-muted)] mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {[
                { icon: Zap, text: "AI-driven instant approvals" },
                { icon: Lock, text: "SOC 2 Type II certified" },
                { icon: BarChart3, text: "Real-time risk analytics" },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3 text-[var(--text-muted)]">
                  <div className="w-8 h-8 rounded-lg bg-[var(--accent-50)] flex items-center justify-center">
                    <Icon className="h-4 w-4 text-[var(--accent)]" />
                  </div>
                  <span className="text-sm font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={`text-[12px] text-[var(--text-muted)] transition-all duration-700 delay-600 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
            &copy; 2026 Surety Demo App. All rights reserved.
          </div>
        </div>
      </div>

      <div className={`flex-1 flex items-center justify-center p-4 sm:p-8 transition-all duration-500 delay-300 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden text-center mb-8">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt="Surety Demo App"
              className="h-16 w-auto mx-auto mb-3 dark:brightness-0 dark:invert"
            />
            <p className="text-sm text-[var(--text-muted)] mt-0.5">Surety Bond Portal</p>
          </div>

          <div className="glass-card p-6 sm:p-8">
            <h2 className="text-xl font-bold text-[var(--slate-900)] mb-1">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              {mode === "login" ? "Sign in to your portal" : "Get started with Surety Demo App"}
            </p>

            <div className="flex bg-[var(--bg)] rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all border-none cursor-pointer ${
                  mode === "login"
                    ? "bg-[var(--card)] text-[var(--slate-900)] shadow-sm"
                    : "text-[var(--text-muted)] bg-transparent"
                }`}
              >
                <LogIn className="h-3.5 w-3.5 inline mr-1.5" />
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all border-none cursor-pointer ${
                  mode === "register"
                    ? "bg-[var(--card)] text-[var(--slate-900)] shadow-sm"
                    : "text-[var(--text-muted)] bg-transparent"
                }`}
              >
                <UserPlus className="h-3.5 w-3.5 inline mr-1.5" />
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Full Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className={inputClass}
                      placeholder="John Smith"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as typeof role)}
                      className={inputClass}
                    >
                      <option value="agent">Agent</option>
                      <option value="principal">Principal</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-10`}
                    placeholder="Enter password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--slate-900)] bg-transparent border-none cursor-pointer transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-[var(--s-red)] bg-[var(--s-red-bg)] border border-[var(--s-red)]/20 rounded-xl px-4 py-2.5 animate-scaleIn">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 gradient-accent text-white text-sm font-bold rounded-xl hover:opacity-90 hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer border-none flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? "Sign In" : "Create Account"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-5 glass-card p-5">
            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[.08em] mb-3">
              Quick Access — Demo Accounts
            </div>
            <div className="space-y-2">
              {TEST_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  onClick={() => handleQuickLogin(acct)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-4 py-3 border border-[var(--border-color)] rounded-xl hover:bg-[var(--slate-100)] transition-all cursor-pointer bg-transparent text-left disabled:opacity-50 group"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: acct.color }}
                  >
                    {acct.label[0]}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-[var(--slate-900)]">{acct.label}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{acct.email}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-10">
        <Link href="/privacy-policy" className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors no-underline font-medium">Privacy Policy</Link>
        <Link href="/terms-and-conditions" className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors no-underline font-medium">Terms & Conditions</Link>
      </div>
    </div>
  );
}
