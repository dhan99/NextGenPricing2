import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBondAiChat, type ChatMessage } from "@/hooks/use-bond-ai-chat";
import { BondConversationType } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { 
  Send, Sparkles, ShieldCheck, UserPlus, RefreshCw, Edit3, 
  FileText, ArrowRight, Loader2, Info, ChevronDown, ChevronUp,
  Bot, Brain, ClipboardCheck, Stamp, RotateCcw, ArrowRightLeft,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/themes/theme-provider";
import { downloadTranscript } from "@/utils/export-transcript";

const AGENT_META: Record<string, { icon: typeof Bot; colorVar: string; gradient: string }> = {
  orchestrator: { icon: Brain, colorVar: "var(--s-purple)", gradient: "from-violet-500 to-purple-600" },
  intake: { icon: ClipboardCheck, colorVar: "var(--primary)", gradient: "from-blue-500 to-cyan-600" },
  underwriting: { icon: ShieldCheck, colorVar: "var(--s-amber)", gradient: "from-amber-500 to-orange-600" },
  issuance: { icon: Stamp, colorVar: "var(--s-green)", gradient: "from-emerald-500 to-teal-600" },
  lifecycle: { icon: RotateCcw, colorVar: "var(--s-purple)", gradient: "from-purple-500 to-fuchsia-600" },
};

function getAgentMeta(agentName?: string) {
  return AGENT_META[agentName || "orchestrator"] || AGENT_META.orchestrator;
}

function TypingIndicator({ agentName, toolName }: { agentName?: string; toolName?: string }) {
  const meta = getAgentMeta(agentName);
  return (
    <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-2xl rounded-tl-none w-fit border shadow-sm">
      {toolName ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: meta.colorVar }} />
          <span className="text-xs text-muted-foreground font-medium">
            {toolName.replace(/_/g, " ")}...
          </span>
        </>
      ) : (
        <>
          <div className="w-2 h-2 rounded-full bg-primary/40 typing-dot" />
          <div className="w-2 h-2 rounded-full bg-primary/40 typing-dot" />
          <div className="w-2 h-2 rounded-full bg-primary/40 typing-dot" />
        </>
      )}
    </div>
  );
}

function AgentSwitchBanner({ msg }: { msg: ChatMessage }) {
  const meta = getAgentMeta(msg.agentName);
  const AgentIcon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex justify-center my-2"
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/60 border border-border/50 rounded-full text-xs font-medium text-muted-foreground backdrop-blur-sm">
        <ArrowRightLeft className="h-3 w-3" />
        <div className={cn("h-4 w-4 rounded-full bg-gradient-to-br flex items-center justify-center", meta.gradient)}>
          <AgentIcon className="h-2.5 w-2.5 text-white" />
        </div>
        <span>{msg.agentDisplayName || "BondAssist"}</span>
      </div>
    </motion.div>
  );
}

function ActiveAgentBadge({ name, displayName }: { name: string; displayName: string }) {
  const meta = getAgentMeta(name);
  const AgentIcon = meta.icon;
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-5 w-5 rounded-full bg-gradient-to-br flex items-center justify-center shadow-sm", meta.gradient)}>
        <AgentIcon className="h-3 w-3 text-white" />
      </div>
      <span className="text-xs font-semibold text-foreground/80 truncate max-w-[120px]">{displayName}</span>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--s-green)' }} />
    </div>
  );
}

function ContextSidebar({ extractedData, riskProfile, hasEnoughData, isReferral, isFinalizing, handleFinalize, readyToSubmit, issuedBondNumber }: {
  extractedData: Record<string, unknown>;
  riskProfile: { level: string; score: number; flags: string[]; summary?: string } | null;
  hasEnoughData: boolean;
  isReferral: boolean;
  isFinalizing: boolean;
  handleFinalize: () => void;
  readyToSubmit: boolean;
  issuedBondNumber: string | null;
}) {
  const displayKeys = ["bondType", "bondAmount", "obligeeName", "premium", "riskLevel", "riskScore"];

  return (
    <>
      <Card className="shadow-lg border-border bg-card">
        <CardHeader className="pb-3 border-b border-border bg-muted/30">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            Live Context
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 flex flex-col gap-5">
          
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Risk Assessment</div>
            {riskProfile ? (
              <div className="space-y-3">
                <RiskBadge level={riskProfile.level} score={riskProfile.score} showScore className="w-full justify-center py-1.5" />
                {riskProfile.flags.length > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-950/40 p-3 rounded-lg border border-orange-100 dark:border-orange-800/40">
                    <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 mb-1">Attention Areas:</p>
                    <ul className="text-xs text-orange-700 dark:text-orange-400 list-disc pl-4 space-y-1">
                      {riskProfile.flags.map((f: string, i: number) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg border border-dashed">
                <Loader2 className="h-4 w-4 animate-spin opacity-50" />
                Analyzing responses...
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Application Data</div>
            <div className="space-y-2">
              {Object.keys(extractedData).length === 0 ? (
                <p className="text-sm text-muted-foreground italic bg-muted/30 p-3 rounded-lg">Waiting for details...</p>
              ) : (
                Object.entries(extractedData)
                  .filter(([key]) => displayKeys.includes(key) || typeof extractedData[key] === "string" || typeof extractedData[key] === "number")
                  .filter(([, val]) => val !== null && val !== undefined && typeof val !== "object")
                  .slice(0, 12)
                  .map(([key, val]) => (
                    <div key={key} className="flex justify-between items-start py-2 border-b border-border/50 last:border-0 group">
                      <span className="text-sm text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="text-sm font-medium text-right max-w-[60%] truncate group-hover:text-clip group-hover:whitespace-normal transition-all" title={String(val)}>
                        {typeof val === "number" && key.toLowerCase().includes("amount") ? `$${val.toLocaleString()}` : String(val)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>

          {issuedBondNumber && (
            <div className="p-3 rounded-lg" style={{ background: 'var(--s-green-bg)', border: '1px solid var(--s-green)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--s-green)' }}>Bond Issued</p>
              <p className="text-sm font-bold mt-1">{issuedBondNumber}</p>
            </div>
          )}

        </CardContent>
      </Card>

      <AnimatePresence>
        {readyToSubmit && !issuedBondNumber && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="bg-primary text-primary-foreground shadow-xl border-none">
              <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
                <div>
                  <h3 className="font-semibold text-base sm:text-lg">
                    {isReferral ? "Ready for Underwriting" : "Ready to Submit"}
                  </h3>
                  <p className="text-primary-foreground/80 text-sm mt-1">
                    {isReferral
                      ? "This application will be sent to underwriting for due diligence and risk review. The team will contact the client directly."
                      : "We have gathered enough information to formalize this application."}
                  </p>
                </div>
                <Button 
                  variant="secondary" 
                  className="w-full font-semibold shadow-sm hover:shadow-md transition-all min-h-[44px]"
                  onClick={handleFinalize}
                  disabled={isFinalizing}
                >
                  {isFinalizing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {!isFinalizing && (isReferral ? "Send to Underwriting" : "Finalize Application")}
                  {!isFinalizing && <ArrowRight className="h-4 w-4 ml-2" />}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function PrincipalChat() {
  const [, setLocation] = useLocation();
  const { principalId } = useAuth();
  const { theme } = useTheme();
  const [inputMsg, setInputMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextOpen, setContextOpen] = useState(false);
  
  const { 
    conversation, 
    messages, 
    isTyping, 
    extractedData, 
    riskProfile, 
    activeAgent,
    isProcessingTool,
    currentToolName,
    readyToSubmit,
    issuedBondId,
    issuedBondNumber,
    startConversation, 
    sendMessage,
    finalizeConversation
  } = useBondAiChat();

  const [isFinalizing, setIsFinalizing] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (conversation && !isTyping) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [conversation, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || isTyping) return;
    sendMessage(inputMsg);
    setInputMsg("");
  };

  const isReferral = conversation?.conversationType === BondConversationType.referral;

  const handleFinalize = async () => {
    setIsFinalizing(true);
    const res = await finalizeConversation();
    setIsFinalizing(false);
    if (res?.bond?.id) {
      setLocation(isReferral ? `/agent/bonds/${res.bond.id}` : `/principal/bonds/${res.bond.id}`);
    } else {
      setLocation(isReferral ? '/agent/conversations' : '/principal/dashboard');
    }
  };

  const hasEnoughData = !!(extractedData && (
    isReferral
      ? (extractedData.bondType && extractedData.bondAmount && extractedData.obligeeName && extractedData.referralName)
      : (extractedData.bondType && extractedData.bondAmount && extractedData.obligeeName)
  ));

  const workflowCards = [
    {
      type: BondConversationType.new_application,
      icon: FileText,
      label: "New Application",
      sublabel: "Apply for a brand new bond",
      gradient: "from-blue-400 to-indigo-600",
      glow: "shadow-blue-500/20",
    },
    {
      type: BondConversationType.renewal,
      icon: RefreshCw,
      label: "Renew a Bond",
      sublabel: "Update terms on an active bond",
      gradient: "from-emerald-400 to-teal-600",
      glow: "shadow-emerald-500/20",
    },
    {
      type: BondConversationType.endorsement,
      icon: Edit3,
      label: "Endorse/Amend",
      sublabel: "Make mid-term changes",
      gradient: "from-amber-400 to-orange-500",
      glow: "shadow-amber-500/20",
    },
    {
      type: BondConversationType.referral,
      icon: UserPlus,
      label: "Refer a Client",
      sublabel: "Submit to underwriting for review",
      gradient: "from-purple-500 to-fuchsia-700",
      glow: "shadow-purple-500/20",
    },
  ];

  const contextSidebarProps = {
    extractedData,
    riskProfile,
    hasEnoughData,
    isReferral,
    isFinalizing,
    handleFinalize,
    readyToSubmit,
    issuedBondNumber,
  };

  return (
    <div className="flex flex-col relative overflow-hidden" style={{ height: 'calc(100dvh - 56px)' }}>
      <main className="flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6 relative z-10 overflow-hidden">

        <Card className="flex-1 flex flex-col shadow-xl shadow-black/5 border-border bg-card backdrop-blur-xl overflow-hidden rounded-2xl min-h-0">
          {!conversation ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 text-center overflow-y-auto">
              <div className="relative mb-6 sm:mb-8">
                <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-[16px] bg-[var(--accent)] flex items-center justify-center shadow-lg">
                  <Sparkles className="h-7 w-7 sm:h-9 sm:w-9 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-white flex items-center justify-center" style={{ background: 'var(--s-green)' }}>
                  <span className="text-white text-[8px] font-bold">AI</span>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--slate-900)] mb-2">
                Welcome to <span className="text-[var(--accent)]">{theme.aiName}</span>
              </h1>
              <p className="text-muted-foreground mb-8 sm:mb-10 max-w-md text-sm leading-relaxed px-2">
                I'm your AI surety agent. How can I help you today? I'll guide you through the process conversationally.
              </p>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl">
                {workflowCards.map(({ type, icon: Icon, label, sublabel, gradient, glow }) => (
                  <button
                    key={type}
                    className="group relative text-left rounded-2xl border border-border bg-card hover:border-primary/25 hover:shadow-xl hover:shadow-primary/8 hover:-translate-y-1 transition-all duration-300 overflow-hidden p-4 sm:p-6 min-h-[44px] active:scale-[0.98]"
                    onClick={() => startConversation(type, principalId!)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/2 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className={`h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 sm:mb-4 shadow-lg ${glow} group-hover:scale-105 transition-transform duration-300`}>
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                    <div className="font-bold text-[var(--slate-900)] mb-0.5 text-sm sm:text-base">{label}</div>
                    <div className="text-xs text-muted-foreground hidden sm:block">{sublabel}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 sm:p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 bg-[var(--accent)] rounded-[var(--r)] flex items-center justify-center shadow-sm">
                    <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm">{theme.aiName} AI</h2>
                    <ActiveAgentBadge name={activeAgent.name} displayName={activeAgent.displayName} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {messages.filter(m => m.content && !m.isAgentSwitch).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] text-xs"
                      onClick={() => downloadTranscript({
                        brandName: theme.brandName,
                        aiName: theme.aiName,
                        conversationType: conversation.conversationType,
                        messages,
                        extractedData,
                        riskProfile,
                        issuedBondNumber,
                      })}
                      title="Download conversation transcript"
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      <span className="hidden sm:inline">Save</span>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="lg:hidden min-h-[44px] text-xs"
                    onClick={() => setContextOpen(!contextOpen)}
                  >
                    <Info className="h-3.5 w-3.5 mr-1.5" />
                    Context
                    {contextOpen ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
                  </Button>
                </div>
              </div>

              {contextOpen && (
                <div className="lg:hidden border-b border-border/60 p-3 sm:p-4 bg-[var(--glass-bg)] backdrop-blur-lg max-h-[40vh] overflow-y-auto">
                  <ContextSidebar {...contextSidebarProps} />
                </div>
              )}

              <ScrollArea className="flex-1 p-3 sm:p-6" ref={scrollRef}>
                <div className="flex flex-col gap-4 sm:gap-5 max-w-3xl mx-auto pb-4">
                  <AnimatePresence initial={false}>
                    {messages.filter(m => m.content).map((msg, idx) => {
                      if (msg.isAgentSwitch) {
                        return <AgentSwitchBanner key={msg.id || idx} msg={msg} />;
                      }

                      const agentMeta = getAgentMeta(msg.agentName);

                      return (
                        <motion.div
                          key={msg.id || idx}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className={cn(
                            "flex max-w-[92%] sm:max-w-[88%]",
                            msg.role === 'user' ? "ml-auto" : "mr-auto"
                          )}
                        >
                          {msg.role === 'assistant' && (
                            <div className={cn(
                              "h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-gradient-to-br flex items-center justify-center mr-2 sm:mr-3 mt-1 shrink-0 shadow-md",
                              agentMeta.gradient
                            )}>
                              {(() => { const Icon = agentMeta.icon; return <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />; })()}
                            </div>
                          )}

                          <div className={cn(
                            "px-4 sm:px-5 py-3 sm:py-3.5 leading-relaxed text-sm",
                            msg.role === 'user'
                              ? "bg-[var(--accent)] text-white rounded-2xl rounded-tr-sm shadow-sm font-medium"
                              : "bg-card text-foreground rounded-2xl rounded-tl-sm border border-border/60 shadow-sm"
                          )}>
                            {msg.content}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {isTyping && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex max-w-[85%] mr-auto">
                      {(() => {
                        const meta = getAgentMeta(activeAgent.name);
                        const Icon = meta.icon;
                        return (
                          <div className={cn("h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-gradient-to-br flex items-center justify-center mr-2 sm:mr-3 shrink-0 shadow-md", meta.gradient)}>
                            <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
                          </div>
                        );
                      })()}
                      <TypingIndicator agentName={activeAgent.name} toolName={isProcessingTool ? (currentToolName || undefined) : undefined} />
                    </motion.div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-3 sm:p-4 bg-card border-t border-border">
                <form onSubmit={handleSend} className="flex gap-2 sm:gap-3 max-w-3xl mx-auto relative">
                  <Input
                    ref={inputRef}
                    placeholder="Type your response here..."
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    disabled={isTyping}
                    className="flex-1 rounded-full bg-muted/50 border-border/60 focus-visible:ring-primary/30 px-4 sm:px-6 pr-14 sm:pr-16 h-12 shadow-sm text-base"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputMsg.trim() || isTyping}
                    className="rounded-full h-10 w-10 shrink-0 shadow-md absolute right-1 top-1 bg-[var(--accent)] hover:opacity-90 border-0"
                  >
                    <Send className="h-4 w-4 text-white ml-0.5" />
                  </Button>
                </form>
                <p className="text-center text-[10px] text-muted-foreground mt-2 sm:mt-2.5 font-medium opacity-50">
                  {theme.aiName} is an AI and may occasionally require human verification.
                </p>
              </div>
            </>
          )}
        </Card>

        {conversation && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }} 
            animate={{ opacity: 1, x: 0 }}
            className="hidden lg:flex w-80 flex-col gap-4"
          >
            <ContextSidebar {...contextSidebarProps} />
          </motion.div>
        )}

      </main>
    </div>
  );
}
