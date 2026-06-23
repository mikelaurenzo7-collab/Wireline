import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, ArrowRight, Smartphone, ShieldCheck, User } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import { markOnboardingCompleted } from "../lib/post-signup-onboarding";
import { ShadButton } from "../components/ui/shadcn/ShadButton";
import { Input } from "../components/ui/shadcn/Input";
import { useToast } from "../contexts/ToastContext";

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { success, error } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [assistantName, setAssistantName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) return;
    setLoading(true);
    // Simulate sending SMS
    await new Promise((resolve) => setTimeout(resolve, 800));
    setLoading(false);
    success("Code sent", `Sent to ${phone}`);
    setStep(2);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    // Simulate verification
    await new Promise((resolve) => setTimeout(resolve, 800));
    setLoading(false);
    setStep(3);
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assistantName.trim()) return;
    setLoading(true);
    try {
      await markOnboardingCompleted();
      success("Setup complete", `Your assistant ${assistantName} is ready.`);
      navigate("/studio", { replace: true });
    } catch (_err) {
      error("Failed to complete setup", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageMeta title="Setup your Assistant — Wireline" noIndex />
      <div className="min-h-screen bg-background paper-texture flex flex-col items-center justify-center p-6 text-foreground relative overflow-hidden">
        <div className="w-full max-w-md relative z-10">
          <div className="mb-10 flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-brand/10 text-brand rounded-full flex items-center justify-center mb-4">
              <span className="font-display text-2xl font-bold">W</span>
            </div>
            <div className="flex gap-2 items-center">
              <div
                className={`h-1.5 w-8 rounded-full transition-colors ${step >= 1 ? "bg-brand" : "bg-border"}`}
              />
              <div
                className={`h-1.5 w-8 rounded-full transition-colors ${step >= 2 ? "bg-brand" : "bg-border"}`}
              />
              <div
                className={`h-1.5 w-8 rounded-full transition-colors ${step >= 3 ? "bg-brand" : "bg-border"}`}
              />
            </div>
          </div>

          <div className="bg-card border border-border shadow-xl shadow-brand/5 rounded-2xl overflow-hidden relative">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-8 md:p-10"
                >
                  <div className="w-12 h-12 bg-brand/5 text-brand rounded-xl flex items-center justify-center mb-6">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <h1 className="font-display text-2xl font-semibold mb-2">Link your phone</h1>
                  <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                    Wireline is your personal assistant. We'll text this number when you have an
                    incoming caller or task update.
                  </p>
                  <form onSubmit={handleSendCode} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Mobile number</label>
                      <Input
                        type="tel"
                        placeholder="(555) 000-0000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoFocus
                        className="h-12"
                      />
                    </div>
                    <ShadButton
                      type="submit"
                      disabled={phone.length < 10 || loading}
                      className="w-full h-12 text-base font-semibold transition-all shadow-md hover:shadow-brand/20 hover:scale-[1.02] touch-press"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        "Send verification code"
                      )}
                    </ShadButton>
                  </form>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-8 md:p-10"
                >
                  <div className="w-12 h-12 bg-brand/5 text-brand rounded-xl flex items-center justify-center mb-6">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h1 className="font-display text-2xl font-semibold mb-2">Verify your number</h1>
                  <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                    Enter the 6-digit code we just sent to{" "}
                    <span className="font-mono text-foreground font-medium">{phone}</span>
                  </p>
                  <form onSubmit={handleVerify} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">6-digit code</label>
                      <Input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                        autoFocus
                        className="h-12 font-mono tracking-widest text-lg text-center"
                      />
                    </div>
                    <ShadButton
                      type="submit"
                      disabled={code.length !== 6 || loading}
                      className="w-full h-12 text-base font-semibold transition-all shadow-md hover:shadow-brand/20 hover:scale-[1.02] touch-press"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify code"}
                    </ShadButton>
                  </form>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="p-8 md:p-10"
                >
                  <div className="w-12 h-12 bg-brand/5 text-brand rounded-xl flex items-center justify-center mb-6">
                    <User className="w-6 h-6" />
                  </div>
                  <h1 className="font-display text-2xl font-semibold mb-2">Name your assistant</h1>
                  <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
                    Give your new personal assistant a name. You can change this later in Studio.
                  </p>
                  <form onSubmit={handleComplete} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Assistant name</label>
                      <Input
                        type="text"
                        placeholder="Casey"
                        value={assistantName}
                        onChange={(e) => setAssistantName(e.target.value)}
                        autoFocus
                        className="h-12"
                      />
                    </div>
                    <ShadButton
                      type="submit"
                      disabled={!assistantName.trim() || loading}
                      className="w-full h-12 text-base font-semibold transition-all shadow-md hover:shadow-brand/20 hover:scale-[1.02] touch-press"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          Finish setup <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </ShadButton>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
