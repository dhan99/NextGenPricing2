import { useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { 
  BondConversationType, 
  BondRiskProfile,
  BondConversation
} from '@workspace/api-client-react';

function getAuthHeaders(): Record<string, string> {
  try {
    const stored = localStorage.getItem("surety-auth-storage");
    if (stored) {
      const parsed = JSON.parse(stored);
      const token = parsed?.state?.token;
      if (token) return { Authorization: `Bearer ${token}` };
    }
  } catch {}
  return {};
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  agentName?: string;
  agentDisplayName?: string;
  isAgentSwitch?: boolean;
  isToolCall?: boolean;
  toolName?: string;
  createdAt?: string;
}

export interface ActiveAgentInfo {
  name: string;
  displayName: string;
}

export function useBondAiChat() {
  const queryClient = useQueryClient();
  const [conversation, setConversation] = useState<BondConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [riskProfile, setRiskProfile] = useState<BondRiskProfile | null>(null);
  const [extractedData, setExtractedData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<ActiveAgentInfo>({ name: 'orchestrator', displayName: 'BondAssist' });
  const [isProcessingTool, setIsProcessingTool] = useState(false);
  const [currentToolName, setCurrentToolName] = useState<string | null>(null);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [issuedBondId, setIssuedBondId] = useState<number | null>(null);
  const [issuedBondNumber, setIssuedBondNumber] = useState<string | null>(null);

  const conversationIdRef = useRef<number | null>(null);
  const messageIdCounter = useRef(1000);

  const startConversation = async (type: BondConversationType, principalId?: number) => {
    try {
      setIsTyping(true);
      setReadyToSubmit(false);
      setIssuedBondId(null);
      setIssuedBondNumber(null);

      const res = await fetch('/api/bond-ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ 
          conversationType: type,
          ...(principalId ? { principalId } : {})
        })
      });
      
      if (!res.ok) throw new Error("Failed to start conversation");
      
      const data = await res.json() as BondConversation & {
        openingMessage?: string;
        activeAgent?: string;
        activeAgentDisplayName?: string;
      };
      setConversation(data);
      conversationIdRef.current = data.id;
      setRiskProfile(null);
      setExtractedData({});
      
      if (data.activeAgent) {
        setActiveAgent({
          name: data.activeAgent,
          displayName: data.activeAgentDisplayName || 'BondAssist',
        });
      }
      
      if (data.openingMessage) {
        const openingId = ++messageIdCounter.current;
        setMessages([{
          id: openingId,
          role: 'assistant',
          content: data.openingMessage,
          agentName: data.activeAgent,
          agentDisplayName: data.activeAgentDisplayName,
        }]);
      } else {
        setMessages([]);
      }
      
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start conversation");
    } finally {
      setIsTyping(false);
    }
  };

  const sendMessage = useCallback(async (content: string) => {
    const convId = conversationIdRef.current;
    if (!convId) return;

    const userMsgId = ++messageIdCounter.current;
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content }]);
    
    setIsTyping(true);
    const aiMsgId = ++messageIdCounter.current;
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', isStreaming: true }]);

    try {
      const response = await fetch(`/api/bond-ai/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ content })
      });

      if (!response.ok) throw new Error("Failed to send message");
      if (!response.body) throw new Error("No response stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        sseBuffer += decoder.decode(value, { stream: true });
        const eventBlocks = sseBuffer.split('\n\n');
        sseBuffer = eventBlocks.pop() || '';
        
        for (const block of eventBlocks) {
          const lines = block.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            
            try {
              const data: {
                activeAgent?: string;
                activeAgentDisplayName?: string;
                agentSwitch?: boolean;
                content?: string;
                toolCall?: boolean;
                toolName?: string;
                agent?: string;
                extractedData?: Record<string, unknown>;
                readyToSubmit?: boolean;
                bondId?: number;
                bondNumber?: string;
                riskProfile?: { score: number; level: string; flags: string[]; summary?: string };
                done?: boolean;
              } = JSON.parse(dataStr);
              
              if (data.activeAgent && !data.agentSwitch) {
                setActiveAgent({
                  name: data.activeAgent,
                  displayName: data.activeAgentDisplayName || 'BondAssist',
                });
                setMessages(prev => prev.map(m =>
                  m.id === aiMsgId ? {
                    ...m,
                    agentName: data.activeAgent,
                    agentDisplayName: data.activeAgentDisplayName,
                  } : m
                ));
              }
              
              if (data.content) {
                streamedContent += data.content;
                setMessages(prev => prev.map(m => 
                  m.id === aiMsgId ? { ...m, content: streamedContent } : m
                ));
              }

              if (data.agentSwitch && data.activeAgent) {
                setActiveAgent({
                  name: data.activeAgent,
                  displayName: data.activeAgentDisplayName || 'BondAssist',
                });
                const switchMsgId = ++messageIdCounter.current;
                setMessages(prev => [
                  ...prev,
                  {
                    id: switchMsgId,
                    role: 'system' as const,
                    content: `${data.activeAgentDisplayName} is now handling your request.`,
                    isAgentSwitch: true,
                    agentName: data.activeAgent,
                    agentDisplayName: data.activeAgentDisplayName,
                  }
                ]);
              }

              if (data.toolCall) {
                setIsProcessingTool(true);
                setCurrentToolName(data.toolName ?? null);
              }

              if (data.extractedData) {
                setExtractedData(prev => ({ ...prev, ...data.extractedData }));
                setIsProcessingTool(false);
                setCurrentToolName(null);

                if (data.readyToSubmit) {
                  setReadyToSubmit(true);
                }
                if (data.bondId) {
                  setIssuedBondId(data.bondId);
                }
                if (data.bondNumber) {
                  setIssuedBondNumber(data.bondNumber);
                }
              }
              
              if (data.riskProfile) {
                setRiskProfile({
                  score: data.riskProfile.score,
                  level: data.riskProfile.level as "low" | "medium" | "high" | "very_high",
                  flags: data.riskProfile.flags,
                  summary: data.riskProfile.summary ?? `Risk score: ${data.riskProfile.score}/100`,
                });
                setIsProcessingTool(false);
                setCurrentToolName(null);
              }

              if (data.done) {
                setMessages(prev => prev.map(m => 
                  m.id === aiMsgId ? { ...m, isStreaming: false } : m
                ));
                setIsProcessingTool(false);
                setCurrentToolName(null);
              }
            } catch (e) {
              console.error("Error parsing SSE chunk:", e, dataStr);
            }
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      setMessages(prev => prev.map(m => 
        m.id === aiMsgId ? { ...m, content: "Sorry, I encountered an error. Please try again.", isStreaming: false } : m
      ));
    } finally {
      setIsTyping(false);
      setIsProcessingTool(false);
      setCurrentToolName(null);
    }
  }, []);

  const finalizeConversation = async () => {
    const convId = conversationIdRef.current;
    if (!convId) return null;
    
    try {
      const res = await fetch(`/api/bond-ai/conversations/${convId}/finalize`, {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error("Failed to finalize application");
      
      const data = await res.json();
      
      queryClient.invalidateQueries({ queryKey: ['/api/bonds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bond-ai/conversations'] });
      
      return data;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to finalize");
      return null;
    }
  };

  return {
    conversation,
    messages,
    isTyping,
    riskProfile,
    extractedData,
    error,
    activeAgent,
    isProcessingTool,
    currentToolName,
    readyToSubmit,
    issuedBondId,
    issuedBondNumber,
    startConversation,
    sendMessage,
    finalizeConversation
  };
}
