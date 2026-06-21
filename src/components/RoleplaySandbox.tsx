import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { MessageSquare, User, Bot, Sparkles, Send, RefreshCw, Loader2, Award } from "lucide-react";
import { authFetch } from "../lib/api";
import { clientLog } from "../lib/client-log";
import { useToast } from "../contexts/ToastContext";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Input } from "./ui/shadcn/Input";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  coaching?: {
    score: number;
    feedback: string;
    suggestions: string[];
  };
};

type Persona = {
  id: string;
  name: string;
  emoji: string;
  modifier: string;
  description: string;
};

const PERSONAS: Persona[] = [
  {
    id: "angry_customer",
    name: "Angry Customer",
    emoji: "😠",
    modifier:
      "Angry, frustrated, and complaining about pricing or slow service. Demands quick answers.",
    description: "Tests empathy, tone control, and escalations.",
  },
  {
    id: "skeptical_buyer",
    name: "Skeptical Buyer",
    emoji: "🤨",
    modifier:
      "Highly skeptical, questioning product value, asking for proof, and looking for discounts.",
    description: "Tests value propositions and objection handling.",
  },
  {
    id: "rude_caller",
    name: "Rude Caller",
    emoji: "😤",
    modifier:
      "Interrupting, speaking bluntly, dismissive of automated responses, and testing agent boundaries.",
    description: "Tests professional boundary-setting and poise.",
  },
  {
    id: "confused_senior",
    name: "Confused Senior",
    emoji: "👴",
    modifier:
      "Speaks slowly, asks basic questions repeatedly, gets confused easily, and needs simple terms.",
    description: "Tests patience, clarity, and simplicity.",
  },
  {
    id: "impatient_exec",
    name: "Impatient Executive",
    emoji: "💼",
    modifier:
      "Extremely busy, wants bottom-line numbers immediately, and has zero tolerance for filler words.",
    description: "Tests speed, conciseness, and directness.",
  },
  {
    id: "custom",
    name: "Custom Persona",
    emoji: "⚙️",
    modifier: "",
    description: "Define your own custom customer behavior and details.",
  },
];

export default function RoleplaySandbox({ agentId }: { agentId: string }) {
  const { error: toastError } = useToast();
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]);
  const [customModifier, setCustomModifier] = useState(
    "A polite customer looking for help with HubSpot CRM integration setup instructions.",
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([]);
    setInputMessage("");
  }, [agentId, selectedPersona]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const analyzeResponse = (reply: string): Message["coaching"] => {
    const text = reply.toLowerCase();
    const suggestions: string[] = [];
    let score = 85;

    // HEARD framework check
    const hasEmpathy = /sorry|apolog|understand|hear|absolutely|completely|truly|right/i.test(text);
    if (!hasEmpathy) {
      score -= 15;
      suggestions.push(
        "Acknowledge the customer's frustration or situation with clear validation words.",
      );
    }

    // Call closing check
    const hasClose = /schedule|book|calendar|appointment|time|date|number|email|contact/i.test(
      text,
    );
    if (!hasClose) {
      score -= 10;
      suggestions.push(
        "End with a call-to-action or next step, like booking a call or confirming a detail.",
      );
    }

    // Response length check
    if (reply.length > 250) {
      score -= 10;
      suggestions.push(
        "Keep responses concise. High verbosity on calls can make the agent feel robotic or dominant.",
      );
    }

    // Positive indicators
    if (hasEmpathy && hasClose) {
      score += 10;
    }

    const finalScore = Math.max(30, Math.min(100, score));

    let feedback = "Excellent handling! Friendly, clear, and action-oriented.";
    if (finalScore < 70) {
      feedback =
        "Needs improvement. Prioritize active listening and guiding the customer to the next steps.";
    } else if (finalScore < 90) {
      feedback = "Good response, but could be tuned to be slightly more concise and clear.";
    }

    return {
      score: finalScore,
      feedback,
      suggestions: suggestions.length > 0 ? suggestions : ["No adjustments needed. Excellent job!"],
    };
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending) return;

    const userMessageContent = inputMessage.trim();
    setInputMessage("");
    setIsSending(true);

    const userMsg: Message = {
      id: Math.random().toString(),
      role: "user",
      content: userMessageContent,
    };

    setMessages((prev) => [...prev, userMsg]);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await authFetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessageContent,
          history: historyPayload,
          persona: selectedPersona.id === "custom" ? customModifier : selectedPersona.modifier,
        }),
      });

      if (!res.ok) throw new Error("Failed to get agent reply");

      const data = await res.json();
      const replyText = data.reply || "No response received.";

      const coaching = analyzeResponse(replyText);

      const botMsg: Message = {
        id: Math.random().toString(),
        role: "assistant",
        content: replyText,
        coaching,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (e) {
      clientLog.error("roleplay-sandbox:simulate", e);
      toastError("Simulation Error", "Could not connect to the agent simulator. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInputMessage("");
  };

  return (
    <div className="rounded-md wl-panel-elevated border border-border overflow-hidden flex flex-col xl:flex-row h-[600px]">
      {/* Sidebar: Persona Selector */}
      <div className="w-full xl:w-80 border-b xl:border-b-0 xl:border-r border-border p-4 flex flex-col bg-black/10 shrink-0">
        <h3 className="text-[11px] font-medium text-foreground uppercase tracking-[0.25em] mb-3">
          Select Persona
        </h3>
        <div className="space-y-2 flex-1 overflow-y-auto pr-1">
          {PERSONAS.map((p) => {
            const active = selectedPersona.id === p.id;
            return (
              <div key={p.id} className="space-y-2">
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => setSelectedPersona(p)}
                  className={`w-full text-left p-3 rounded-md border transition-all h-auto ${
                    active
                      ? "bg-brand/10 border-brand/50 text-brand"
                      : "wl-panel border-border text-foreground hover:border-brand/30 hover:bg-black/20"
                  }`}
                >
                  <div className="w-full">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{p.emoji}</span>
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        {p.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed whitespace-normal">
                      {p.description}
                    </p>
                  </div>
                </ShadButton>
                {active && p.id === "custom" && (
                  <div className="p-2 rounded bg-black/20 border border-border space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted font-medium">
                      Define Behavior:
                    </label>
                    <textarea
                      value={customModifier}
                      onChange={(e) => setCustomModifier(e.target.value)}
                      placeholder="Describe custom customer behavior..."
                      className="w-full text-[11px] p-2 bg-black/30 border border-border rounded text-foreground outline-none focus:border-brand/50 min-h-[60px] resize-none leading-relaxed"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          disableAnimations
          onClick={handleReset}
          className="mt-4 w-full h-8 rounded-md text-muted hover:text-brand"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Reset Chat
        </ShadButton>
      </div>

      {/* Main Sandbox Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-card/20">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-brand" />
            <h4 className="text-xs font-medium uppercase tracking-widest text-foreground">
              Interactive Roleplay Sandbox
            </h4>
          </div>
          <span className="text-[11px] text-muted bg-black/20 border border-border px-2 py-0.5 rounded-full">
            Active persona: <strong className="text-foreground">{selectedPersona.name}</strong>
          </span>
        </div>

        {/* Chat Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-md wl-panel border border-brand/20 flex items-center justify-center text-brand">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-foreground">Start a coaching session</h5>
                <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed mt-1">
                  Type a message below to roleplay as the{" "}
                  <strong className="text-foreground">{selectedPersona.name}</strong>. See how your
                  agent responds and receive real-time coaching suggestions.
                </p>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 max-w-[85%] ${
                  m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                {/* Avatar Icon */}
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 border mt-0.5 ${
                    m.role === "user"
                      ? "bg-brand/10 border-brand/30 text-brand"
                      : "bg-card border-border text-foreground"
                  }`}
                >
                  {m.role === "user" ? (
                    <User className="w-4.5 h-4.5" />
                  ) : (
                    <Bot className="w-4.5 h-4.5" />
                  )}
                </div>

                {/* Message Bubble + Coaching */}
                <div className="space-y-2">
                  <div
                    className={`rounded-md p-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-brand text-on-brand shadow-sm font-sans"
                        : "bg-black/40 border border-border text-foreground font-mono"
                    }`}
                  >
                    {m.role === "user" && (
                      <span className="block text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
                        {selectedPersona.name}
                      </span>
                    )}
                    {m.content}
                  </div>

                  {/* Client-side Auto Coaching Banner */}
                  {m.role === "assistant" && m.coaching && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-md bg-brand/5 border border-brand/20 p-3 text-[11px] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-brand font-medium">
                          <Award className="w-3.5 h-3.5" />
                          <span>AI Coach Analysis</span>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            m.coaching.score >= 90
                              ? "bg-brand/15 text-brand border border-brand/20"
                              : m.coaching.score >= 70
                                ? "bg-amber-500/15 text-amber-500 border border-amber-500/20"
                                : "bg-rose-500/15 text-rose-500 border border-rose-500/20"
                          }`}
                        >
                          Score: {m.coaching.score}/100
                        </span>
                      </div>
                      <p className="text-foreground/80 leading-relaxed font-sans">
                        {m.coaching.feedback}
                      </p>
                      {m.coaching.suggestions.length > 0 && (
                        <div className="space-y-1 mt-1 pl-2 border-l border-brand/30">
                          {m.coaching.suggestions.map((s, idx) => (
                            <div key={idx} className="text-muted leading-relaxed font-sans">
                              • {s}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>
            ))
          )}
          {isSending && (
            <div className="flex gap-3 max-w-[80%] mr-auto items-center">
              <div className="w-8 h-8 rounded-md bg-card border border-border flex items-center justify-center shrink-0">
                <Bot className="w-4.5 h-4.5" />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Agent is drafting reply...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-border flex gap-2">
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={`Say something as the ${selectedPersona.name}...`}
            className="flex-1 bg-black/20 border-border text-foreground text-xs h-9 rounded-md"
          />
          <ShadButton
            type="submit"
            disabled={!inputMessage.trim() || isSending}
            className="h-9 w-9 p-0 shrink-0 bg-brand text-on-brand flex items-center justify-center rounded-md"
          >
            <Send className="w-4 h-4" />
          </ShadButton>
        </form>
      </div>
    </div>
  );
}
