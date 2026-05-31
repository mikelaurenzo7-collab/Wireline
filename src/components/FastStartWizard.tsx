/**
 * FastStartWizard — Streamlined agent creation for <8min time-to-first-call
 *
 * Combines agent creation + knowledge ingestion + phone number setup
 * into a single guided flow. No context switching, no separate pages.
 *
 * Design principles:
 *   - One question at a time (reduces cognitive load)
 *   - Smart defaults ( AI generates the rest)
 *   - Inline validation with human-readable errors
 *   - Progress feels fast (skippable steps marked clearly)
 */
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Building2,
  Phone,
  Globe,
  Wand2,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  AlertCircle,
  Mic,
  PartyPopper,
  X,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { PREMIUM_VOICES, DEFAULT_VOICE_BY_GENDER } from "./FleetSettings";
import { Input } from "./ui/shadcn/Input";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FastStartWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (result: FastStartResult) => void;
  estimatedTimeText?: string;
}

export interface FastStartResult {
  agentId: string;
  agentName: string;
  phoneNumber: string;
  knowledgeItems: number;
  timeToCompleteMs: number;
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  skippable?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-Readable Error Messages
// ─────────────────────────────────────────────────────────────────────────────

export const ONBOARDING_ERROR_MESSAGES: Record<string, string> = {
  AGENT_CREATE_FAILED:
    "We couldn't create your agent right now. This usually means our AI service is temporarily busy. Try again in 10 seconds — it'll work.",
  KNOWLEDGE_FETCH_FAILED:
    "We had trouble reading your website. Check that the URL is correct and starts with https://, then try again. If it still doesn't work, you can skip this and add details later.",
  PHONE_PROVISION_FAILED:
    "We're temporarily out of phone numbers in your area. Try a different area code, or skip this step and add a number later — your agent will work with a browser test call.",
  INVALID_URL:
    "That doesn't look like a valid website URL. It should start with https:// like https://yourbusiness.com",
  NETWORK_ERROR: "Connection trouble — check your internet and try again.",
  UNKNOWN_ERROR:
    "Something unexpected happened. Our team has been notified. Try refreshing the page.",
};

function getHumanReadableError(error: unknown, context: string): string {
  const message = error instanceof Error ? error.message : String(error);

  // Map technical errors to friendly messages
  if (message.includes("URL") || message.includes("404") || message.includes("ENOTFOUND")) {
    return ONBOARDING_ERROR_MESSAGES.KNOWLEDGE_FETCH_FAILED;
  }
  if (message.includes("phone") || message.includes("number") || message.includes("Twilio")) {
    return ONBOARDING_ERROR_MESSAGES.PHONE_PROVISION_FAILED;
  }
  if (message.includes("agent") || message.includes("create")) {
    return ONBOARDING_ERROR_MESSAGES.AGENT_CREATE_FAILED;
  }
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("ECONNREFUSED")
  ) {
    return ONBOARDING_ERROR_MESSAGES.NETWORK_ERROR;
  }

  // Default to context-specific or generic message
  return ONBOARDING_ERROR_MESSAGES[context] || ONBOARDING_ERROR_MESSAGES.UNKNOWN_ERROR;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Configuration
// ─────────────────────────────────────────────────────────────────────────────

const WIZARD_STEPS: WizardStep[] = [
  {
    id: "business",
    title: "What does your business do?",
    description: "One sentence is enough — our AI will handle the rest.",
    icon: Building2,
  },
  {
    id: "website",
    title: "Add your website",
    description: "We'll pull in your services, hours, and policies automatically.",
    icon: Globe,
    skippable: true,
  },
  {
    id: "voice",
    title: "Choose a voice",
    description: "Pick the personality that fits your brand.",
    icon: Mic,
  },
  {
    id: "phone",
    title: "Get a phone number",
    description: "Your dedicated line — included with your plan.",
    icon: Phone,
    skippable: true,
  },
  {
    id: "review",
    title: "You're almost live",
    description: "Review your setup and launch your agent.",
    icon: PartyPopper,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FastStartWizard({
  isOpen,
  onClose,
  onComplete,
  estimatedTimeText = "~3 minutes",
}: FastStartWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(() => Date.now());

  // Form state
  const [businessDescription, setBusinessDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(DEFAULT_VOICE_BY_GENDER.female);
  const [areaCode, setAreaCode] = useState("");

  const { success: toastSuccess, error: toastError } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);

  const currentStep = WIZARD_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === WIZARD_STEPS.length - 1;
  const isFirstStep = currentStepIndex === 0;

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      setError(null);
      setIsSubmitting(false);
      setBusinessDescription("");
      setWebsiteUrl("");
      setSelectedVoiceId(DEFAULT_VOICE_BY_GENDER.female);
      setAreaCode("");
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  const validateStep = (): boolean => {
    setError(null);

    switch (currentStep.id) {
      case "business":
        if (!businessDescription.trim() || businessDescription.length < 10) {
          setError("Tell us a bit more — at least 10 characters so we understand what you do.");
          return false;
        }
        break;
      case "website":
        if (websiteUrl.trim() && !/^https?:\/\/.+\..+/.test(websiteUrl)) {
          setError(ONBOARDING_ERROR_MESSAGES.INVALID_URL);
          return false;
        }
        break;
      case "phone":
        if (areaCode.trim() && !/^\d{3}$/.test(areaCode)) {
          setError("Area code should be 3 digits, like 212 or 415.");
          return false;
        }
        break;
    }

    return true;
  };

  const handleNext = async () => {
    if (!validateStep()) return;

    // On review step, submit everything
    if (isLastStep) {
      await handleSubmit();
      return;
    }

    setCurrentStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const handleBack = () => {
    setError(null);
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleSkip = () => {
    if (!currentStep.skippable) return;
    setError(null);
    setCurrentStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Create agent
      const agentResponse = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${extractBusinessName(businessDescription)} Receptionist`,
          description: businessDescription,
          voiceId: selectedVoiceId,
          archetype: "Receptionist",
          role: "customer_service",
          autoGenerate: true,
        }),
      });

      if (!agentResponse.ok) {
        throw new Error("AGENT_CREATE_FAILED");
      }

      const agent = await agentResponse.json();

      // Step 2: Add knowledge if provided
      let knowledgeCount = 0;
      if (websiteUrl.trim()) {
        try {
          const knowledgeResponse = await authFetch("/api/knowledge/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: websiteUrl,
              agentId: agent.id,
            }),
          });

          if (knowledgeResponse.ok) {
            const knowledge = await knowledgeResponse.json();
            knowledgeCount = knowledge.items?.length ?? 0;
          }
        } catch (knowledgeError) {
          // Knowledge failure is non-blocking
          console.error("Knowledge fetch failed:", knowledgeError);
        }
      }

      // Step 3: Provision phone number if area code provided
      let phoneNumber: string | null = null;
      if (areaCode.trim()) {
        try {
          const phoneResponse = await authFetch("/api/phone-numbers/provision", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              areaCode: areaCode.trim(),
              agentId: agent.id,
            }),
          });

          if (phoneResponse.ok) {
            const phone = await phoneResponse.json();
            phoneNumber = phone.number;
          }
        } catch (phoneError) {
          // Phone failure is non-blocking
          console.error("Phone provision failed:", phoneError);
        }
      }

      const result: FastStartResult = {
        agentId: agent.id,
        agentName: agent.name,
        phoneNumber: phoneNumber ?? "Browser test only",
        knowledgeItems: knowledgeCount,
        timeToCompleteMs: Date.now() - startTime,
      };

      toastSuccess(
        "Agent live! 🎉",
        `Your AI receptionist is ready in ${Math.round(result.timeToCompleteMs / 1000)} seconds.`,
      );

      onComplete(result);
      onClose();
    } catch (err) {
      const friendlyError = getHumanReadableError(err, "AGENT_CREATE_FAILED");
      setError(friendlyError);
      toastError("Could not complete setup", friendlyError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((currentStepIndex + 1) / WIZARD_STEPS.length) * 100;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!isSubmitting ? onClose : undefined}
      />

      {/* Modal */}
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl glass-strong border border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="relative px-6 py-4 border-b border-white/8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8B3FD6] to-[#8B3FD6] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-display italic text-xl text-ink">Fast Start</h2>
                <p className="text-[10px] text-muted">{estimatedTimeText} to your first AI agent</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 rounded-full hover:bg-black/5 text-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-1 bg-black/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#8B3FD6] to-[#8B3FD6] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[60vh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step icon and title */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#8B3FD6]/20 to-[#8B3FD6]/5 border border-[#8B3FD6]/20 flex items-center justify-center">
                  <currentStep.icon className="w-6 h-6 text-[#8B3FD6]" />
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-[0.4em] text-brand">
                    Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
                  </p>
                  <h3 className="font-display italic text-2xl text-ink">{currentStep.title}</h3>
                </div>
              </div>

              <p className="text-sm text-muted mb-6">{currentStep.description}</p>

              {/* Error display */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-800">{error}</p>
                    {currentStep.skippable && (
                      <button
                        onClick={handleSkip}
                        className="mt-2 text-xs text-amber-700 underline hover:text-amber-900"
                      >
                        Skip this step for now →
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Step content */}
              <div className="space-y-4">
                {currentStep.id === "business" && (
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-medium text-ink mb-1.5 block">
                        Describe your business
                      </span>
                      <textarea
                        value={businessDescription}
                        onChange={(e) => setBusinessDescription(e.target.value)}
                        placeholder="e.g., We're a family-owned plumbing company in Chicago that handles emergency repairs, drain cleaning, and bathroom remodels..."
                        className="w-full h-32 p-4 rounded-xl bg-white/50 border border-black/10 focus:border-brand/50 focus:ring-2 focus:ring-brand/10 outline-none resize-none text-sm placeholder:text-muted/50"
                        autoFocus
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-muted">Examples:</span>
                      {[
                        "Dental practice",
                        "Real estate agency",
                        "Law firm",
                        "Home services",
                        "SaaS startup",
                      ].map((example) => (
                        <button
                          key={example}
                          onClick={() => setBusinessDescription(`I'm a ${example} that...`)}
                          className="text-[10px] px-2 py-1 rounded-full bg-black/5 hover:bg-black/10 text-muted transition-colors"
                        >
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep.id === "website" && (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-medium text-ink mb-1.5 block">
                        Your website URL
                      </span>
                      <Input
                        type="url"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://yourbusiness.com"
                        className="w-full p-4 rounded-xl bg-white/50 border border-black/10 focus:border-brand/50 focus:ring-2 focus:ring-brand/10 outline-none text-sm placeholder:text-muted/50"
                        autoFocus
                      />
                    </label>
                    <div className="flex items-center gap-2 text-xs text-emerald-600">
                      <Wand2 className="w-4 h-4" />
                      <span>We'll auto-extract: services, hours, pricing, policies</span>
                    </div>
                  </div>
                )}

                {currentStep.id === "voice" && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted mb-3">
                      Choose the voice your callers will hear:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PREMIUM_VOICES.slice(0, 4).map((voice) => (
                        <button
                          key={voice.id}
                          onClick={() => setSelectedVoiceId(voice.id)}
                          className={`p-4 rounded-xl border text-left transition-all ${
                            selectedVoiceId === voice.id
                              ? "border-brand bg-brand/5"
                              : "border-black/10 hover:border-black/20"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-ink">{voice.name}</span>
                            {selectedVoiceId === voice.id && (
                              <Check className="w-4 h-4 text-brand" />
                            )}
                          </div>
                          <p className="text-xs text-muted capitalize">{voice.gender}</p>
                          <p className="text-[10px] text-brand mt-2">{voice.provider}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentStep.id === "phone" && (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-medium text-ink mb-1.5 block">
                        Preferred area code (optional)
                      </span>
                      <Input
                        type="text"
                        value={areaCode}
                        onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                        placeholder="212"
                        className="w-32 p-4 rounded-xl bg-white/50 border border-black/10 focus:border-brand/50 focus:ring-2 focus:ring-brand/10 outline-none text-sm placeholder:text-muted/50 text-center tracking-widest"
                        autoFocus
                      />
                    </label>
                    <div className="p-4 rounded-xl bg-brand/5 border border-brand/20">
                      <p className="text-xs text-ink/80">
                        <strong>Don't worry if we can't get this exact area code.</strong> You'll
                        get a working number regardless, and you can always port in your existing
                        business line later.
                      </p>
                    </div>
                  </div>
                )}

                {currentStep.id === "review" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/50 border border-black/10 space-y-3">
                      <div className="flex items-start gap-3">
                        <Building2 className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted">Business</p>
                          <p className="text-sm text-ink line-clamp-2">{businessDescription}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Globe className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted">Website</p>
                          <p className="text-sm text-ink">{websiteUrl || "Skipped — add later"}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Mic className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted">Voice</p>
                          <p className="text-sm text-ink">
                            {PREMIUM_VOICES.find((v) => v.id === selectedVoiceId)?.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Phone className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-muted">Phone</p>
                          <p className="text-sm text-ink">
                            {areaCode
                              ? `Area code ${areaCode}`
                              : "Browser test only — add number later"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-emerald-600">
                      <Sparkles className="w-4 h-4" />
                      <span>Our AI will generate: name, personality, and conversation script</span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 bg-white/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  onClick={handleBack}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-full glass border border-black/10 text-[11px] uppercase tracking-[0.24em] text-ink hover:bg-black/5 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              {currentStep.skippable && (
                <button
                  onClick={handleSkip}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-full text-[11px] uppercase tracking-[0.24em] text-muted hover:text-ink transition-colors disabled:opacity-50"
                >
                  Skip
                </button>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-brand text-white text-[11px] uppercase tracking-[0.24em] hover:bg-brand/90 transition-all disabled:opacity-70 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating your agent...
                </>
              ) : isLastStep ? (
                <>
                  <PartyPopper className="w-4 h-4" />
                  Launch Agent
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function extractBusinessName(description: string): string {
  // Simple extraction: first few words or capitalize first word
  const words = description.trim().split(/\s+/);
  if (words.length === 0) return "My";
  const firstWord = words[0].replace(/[^a-zA-Z]/g, "");
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}
