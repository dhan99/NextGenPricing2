import { useState, useRef, useEffect } from "react";
import { Layers, Network, MessageSquare, FileText, Send, Bot, User, ChevronRight, Sparkles, Database, Server, Brain, Shield, Cpu, Cloud, BarChart3, ArrowRight, ExternalLink } from "lucide-react";
import { Architecture } from "./Architecture";
import { ArchitectureInteractive } from "./ArchitectureInteractive";

type ViewMode = "overview" | "interactive" | "chat" | "document";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  relatedTopics?: string[];
  timestamp: string;
}

const SUGGESTED_QUESTIONS = [
  { icon: Cpu, text: "What tech stack does DealPad use?", topic: "stack" },
  { icon: Database, text: "How is the database schema designed?", topic: "database" },
  { icon: Brain, text: "Explain the 5 AI use cases", topic: "ai" },
  { icon: Shield, text: "What are the RBAC personas?", topic: "rbac" },
  { icon: BarChart3, text: "How does the pricing engine work?", topic: "pricing" },
  { icon: ArrowRight, text: "Describe the deal lifecycle", topic: "lifecycle" },
  { icon: Cloud, text: "What's the Azure target architecture?", topic: "azure" },
  { icon: Server, text: "List all API endpoints", topic: "api" },
];

function ConversationalAI() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { role: "user", content: text.trim(), timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/architecture-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history: messages }),
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        sources: data.sources,
        relatedTopics: data.relatedTopics,
        timestamp: data.timestamp,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const formatContent = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*|\`[^`]+\`|\n)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={i} className="bg-stone-100 px-1.5 py-0.5 rounded text-xs font-mono text-orange-700">{part.slice(1, -1)}</code>;
      }
      if (part === "\n") return <br key={i} />;
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center mb-6">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Architecture Assistant</h3>
          <p className="text-muted-foreground text-center max-w-md mb-8">
            Ask me anything about DealPad's architecture, technology stack, AI services, database schema, or production roadmap.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q.topic}
                onClick={() => sendMessage(q.text)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-primary/30 transition-all text-left group"
              >
                <q.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                <span className="text-sm text-foreground">{q.text}</span>
                <ChevronRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-primary ml-auto transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[75%] ${msg.role === "user"
                ? "bg-primary text-white rounded-2xl rounded-br-md px-4 py-3"
                : "bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3"
              }`}>
                <div className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "text-white" : "text-foreground"}`}>
                  {msg.role === "assistant" ? formatContent(msg.content) : msg.content}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-stone-100">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Sources</p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.map((s, j) => (
                        <span key={j} className="text-[11px] px-2 py-0.5 bg-stone-50 rounded-full text-muted-foreground font-mono">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {msg.relatedTopics && msg.relatedTopics.length > 0 && msg.relatedTopics[0] !== "All topics" && msg.relatedTopics[0] !== "help" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.relatedTopics.map((t, j) => (
                      <button
                        key={j}
                        onClick={() => sendMessage(`Tell me about ${t}`)}
                        className="text-[11px] px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full hover:bg-orange-100 transition-colors cursor-pointer"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className="border-t border-stone-200 px-4 py-3 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about DealPad's architecture..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 bg-stone-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-stone-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function DocumentView() {
  return (
    <div className="space-y-6 p-6">
      <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center mx-auto mb-6">
          <FileText className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold text-foreground mb-2">Architecture Document</h3>
        <p className="text-muted-foreground max-w-md mx-auto mb-8">
          Comprehensive 1,900-line architecture and technical decision record with 17 rendered diagrams covering DDD bounded contexts, ERD, AI services, RBAC, pricing engine, Azure target architecture, and 10 ADRs.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/architecture-doc"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            View with Rendered Diagrams
          </a>
          <a
            href="/architecture-doc/download-html"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-stone-200 text-foreground font-medium hover:bg-stone-50 transition-all"
          >
            <FileText className="w-4 h-4" />
            Download HTML
          </a>
          <a
            href="/architecture-doc/download-md"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-stone-200 text-foreground font-medium hover:bg-stone-50 transition-all"
          >
            <FileText className="w-4 h-4" />
            Download Markdown
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h4 className="font-semibold text-foreground mb-3">Document Sections</h4>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {[
              "Executive Summary",
              "Project Vision",
              "System Architecture",
              "Domain-Driven Design",
              "Data Architecture",
              "AI Services Layer",
              "RBAC",
              "Frontend Architecture",
              "Backend Architecture",
              "API Design",
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-500">{i+1}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h4 className="font-semibold text-foreground mb-3">More Sections</h4>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {[
              "Deal Lifecycle",
              "Pricing Engine",
              "Azure Architecture",
              "External Integrations",
              "Observability",
              "Security Architecture",
              "Deployment Architecture",
              "ADRs (10 decisions)",
              "Future Roadmap",
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-500">{i+11}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h4 className="font-semibold text-foreground mb-3">Diagram Types</h4>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {[
              "System Architecture (flowchart)",
              "Data Flow (sequence)",
              "Bounded Contexts (graph)",
              "Aggregate Design (class)",
              "Entity-Relationship (ER)",
              "AI Services Flow (graph)",
              "RBAC Architecture (graph)",
              "Component Architecture (graph)",
              "Deal Wizard (flow)",
              "State Machine (stateDiagram)",
              "Deal Creation (sequence)",
              "Pricing Engine (graph)",
              "Azure Infrastructure (graph)",
              "Integration Landscape (graph)",
              "Observability Stack (graph)",
              "Security Architecture (graph)",
              "Deployment Pipeline (graph)",
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArchitectureHub() {
  const [view, setView] = useState<ViewMode>("overview");

  const views: { id: ViewMode; label: string; icon: typeof Layers; description: string }[] = [
    { id: "overview", label: "System Overview", icon: Layers, description: "Full system diagram with AI, data, and integration layers" },
    { id: "interactive", label: "Interactive Explorer", icon: Network, description: "Click-to-explore component map with detail panels" },
    { id: "chat", label: "Architecture AI", icon: MessageSquare, description: "Ask questions about the architecture in natural language" },
    { id: "document", label: "Full Document", icon: FileText, description: "1,900-line architecture document with 17 Mermaid diagrams" },
  ];

  return (
    <div className="space-y-0">
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Architecture</h1>
            <p className="text-muted-foreground text-sm mt-1">Explore DealPad's system architecture across multiple views</p>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-primary">AI-Powered</span>
          </div>
        </div>

        <div className="flex gap-2 border-b border-stone-200 -mx-8 px-8">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px ${
                view === v.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-stone-300"
              }`}
            >
              <v.icon className="w-4 h-4" />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-stone-50 min-h-[calc(100vh-200px)] px-8 py-6">
        {view === "overview" && (
          <div className="overflow-y-auto">
            <Architecture />
          </div>
        )}
        {view === "interactive" && (
          <div className="overflow-y-auto">
            <ArchitectureInteractive />
          </div>
        )}
        {view === "chat" && (
          <div className="max-w-4xl mx-auto">
            <ConversationalAI />
          </div>
        )}
        {view === "document" && (
          <div className="max-w-4xl mx-auto">
            <DocumentView />
          </div>
        )}
      </div>
    </div>
  );
}
