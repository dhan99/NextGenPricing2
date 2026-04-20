import { useEffect, useState } from "react";
import { Sparkles, X, Send, Loader2, Lock, MessageSquare } from "lucide-react";
import { useAskDealPadAI } from "@/hooks/use-api";
import { useAuth } from "@/context/AuthContext";

export type AskAIContext = {
  screen: string;
  screenLabel: string;
  dealId?: number | null;
  deal?: any;
  totalHours?: number;
  extra?: Record<string, any>;
};

const SUGGESTED_PROMPTS: Record<string, string[]> = {
  "wizard-setup": [
    "How should I pick complexity?",
    "Why does the PDL email matter?",
    "What's the target margin?",
  ],
  "wizard-scope": [
    "Should I apply a starter template?",
    "How do assemblies cascade?",
    "Show comparable deals",
    "How are hours estimated?",
  ],
  "wizard-assumptions": [
    "How do multipliers compound?",
    "What's the SOX compliance impact?",
    "How do integrations affect effort?",
  ],
  "wizard-pricing": [
    "How is the blended rate computed?",
    "Run me through the margin advisor",
    "How can I improve role mix?",
  ],
  "wizard-scenarios": [
    "Which scenario should I recommend?",
    "Premium vs Value tradeoff?",
  ],
  "wizard-review": [
    "Did Intapp screening run?",
    "How do I link the Workday cost center?",
    "What happens when I submit?",
  ],
  "wizard-approval": [
    "Approve, reject, or request rework?",
    "What margin threshold needs justification?",
  ],
  "wizard-summary": [
    "How do I add a change order?",
    "Can I export this deal?",
  ],
  "new-deal": [
    "What's renewal fast-track?",
    "How does Dynamics linking work?",
    "Can I add a new client here?",
  ],
  "renewal-leadsheet": [
    "What's a typical uplift?",
    "Why is the PY column read-only?",
  ],
  "dashboard": [
    "What's our pipeline?",
    "Which deals have low margin?",
    "How many approvals are pending?",
  ],
};

interface Message {
  role: "user" | "ai";
  text: string;
  restricted?: boolean;
  alternatives?: string[];
}

export function AskDealPadAI({
  context,
  inline = false,
  intro,
}: {
  context: AskAIContext;
  inline?: boolean;
  intro?: string;
}) {
  const { persona } = useAuth();
  const [open, setOpen] = useState(inline);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const ask = useAskDealPadAI();

  useEffect(() => {
    if (inline) return;
    const handler = () => setOpen(true);
    window.addEventListener("dealpad:open-ask-ai", handler);
    return () => window.removeEventListener("dealpad:open-ask-ai", handler);
  }, [inline]);

  const suggestions = SUGGESTED_PROMPTS[context.screen] || [];

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    try {
      const result: any = await ask.mutateAsync({
        question,
        context: {
          screen: context.screen,
          dealId: context.dealId,
          deal: context.deal ? {
            marginPercent: context.deal.marginPercent,
            totalFee: context.deal.totalFee,
            totalHours: context.deal.totalHours,
            serviceLine: context.deal.serviceLine,
            complexity: context.deal.complexity,
            status: context.deal.status,
          } : undefined,
          totalHours: context.totalHours,
          extra: context.extra ? Object.fromEntries(
            Object.entries(context.extra).filter(([_, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
          ) : undefined,
        },
        role: persona?.role,
      });
      setMessages((m) => [...m, {
        role: "ai",
        text: result.answer || "No answer returned.",
        restricted: result.restricted,
        alternatives: result.alternatives,
      }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "ai", text: `Sorry — ${e.message || "request failed"}.` }]);
    }
  };

  if (!open) return null;

  const introText =
    intro ||
    `Ask anything about ${context.screenLabel}. Answers are tailored to your role.`;

  const containerClass = inline
    ? "card flex flex-col h-full min-h-[420px]"
    : "fixed top-1/2 -translate-y-1/2 right-6 z-40 w-[380px] max-h-[70vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl";
  const headerClass = inline
    ? "flex items-center justify-between px-4 py-3 border-b border-border bg-amber-50/50 rounded-t-xl"
    : "flex items-center justify-between px-4 py-3 border-b border-border bg-amber-50/50 rounded-t-2xl";

  return (
    <div className={containerClass}>
      <div className={headerClass}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Ask DealPad AI</p>
            <p className="text-xs text-muted-foreground truncate">
              {context.screenLabel}
              {persona ? ` · ${persona.fullTitle}` : ""}
            </p>
          </div>
        </div>
        {!inline && (
          <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50/40 border border-amber-100">
              <MessageSquare className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground leading-relaxed">{introText}</p>
            </div>
            {suggestions.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-semibold">Suggested</p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-2.5 py-1 rounded-full border border-border text-foreground hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
                  : `max-w-[90%] px-3 py-2.5 rounded-lg text-sm border ${m.restricted ? "bg-amber-50/40 border-amber-200 text-foreground" : "bg-muted/40 border-border text-foreground"}`
              }
            >
              {m.restricted && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1.5">
                  <Lock className="w-3 h-3" /> Read-only for your role
                </div>
              )}
              <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
            </div>
          </div>
        ))}

        {ask.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="p-3 border-t border-border flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this screen..."
          className="input-field text-sm flex-1"
          disabled={ask.isPending}
        />
        <button
          type="submit"
          disabled={!input.trim() || ask.isPending}
          className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
