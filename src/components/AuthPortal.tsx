import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { Phone, ShieldCheck, Mail, Lock, Loader2, ArrowRight, UserPlus, LogIn, Terminal, Shield, Zap, Globe, Target, Activity, AlertTriangle, Waves, Sparkles, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

export default function AuthPortal() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage("Check your inbox for a confirmation signal.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
          setError("Database offline — unable to reach the Supabase cluster.");
      } else {
          setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 md:p-10 relative overflow-hidden">
      {/* Animated aurora backdrop */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-[30%] -left-[20%] w-[80vw] h-[80vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(125,249,255,0.30), transparent 60%)" }}
          animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[25%] -right-[20%] w-[75vw] h-[75vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,107,217,0.28), transparent 60%)" }}
          animate={{ x: [0, -40, 0], y: [0, 30, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-[20%] right-[20%] w-[50vw] h-[50vw] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(197,139,255,0.22), transparent 60%)" }}
          animate={{ x: [0, -50, 30, 0], y: [0, 40, -20, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "80px 80px", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)" }} />
      </div>

      <div className="scanline" />

      <motion.div
        initial={{ y: 30, opacity: 0, filter: "blur(12px)" }}
        animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", damping: 26, stiffness: 90 }}
        className="w-full max-w-md md:max-w-lg relative z-10"
      >
        {/* Hero mark */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.6, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 14 }}
            className="relative inline-block mb-8"
          >
            <div className="absolute inset-0 blur-3xl opacity-60" style={{ background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #FF6BD9, #7DF9FF)" }} />
            <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center" style={{
              background: "linear-gradient(135deg, #7DF9FF 0%, #C58BFF 50%, #FF6BD9 100%)",
              boxShadow: "0 20px 60px -10px rgba(125,249,255,0.55), 0 0 0 1px rgba(255,255,255,0.2) inset"
            }}>
              <Waves className="w-12 h-12 text-paper" strokeWidth={2.2} />
            </div>
          </motion.div>

          <h1 className="font-display italic lowercase text-7xl md:text-8xl text-aurora leading-[0.85] tracking-tight mb-4">
            wireline
          </h1>
          <p className="text-[10px] md:text-xs uppercase tracking-[0.55em] text-muted">
            Aurora Relay · Omnichannel Fleet
          </p>
        </div>

        {/* Glass auth card */}
        <div className="relative aurora-ring rounded-3xl">
          <div className="relative rounded-3xl p-8 md:p-10 glass-strong overflow-hidden">
            {/* Inner glow */}
            <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #7DF9FF, transparent)" }} />
            <div className="absolute -bottom-32 -left-32 w-64 h-64 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #FF6BD9, transparent)" }} />

            {/* Tab toggle */}
            <div className="relative z-10 mb-8">
              <div className="relative flex p-1 rounded-2xl bg-black/30 border border-white/8">
                <motion.div
                  layout
                  className="absolute inset-y-1 w-[calc(50%-4px)] rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(125,249,255,0.18), rgba(197,139,255,0.18))",
                    border: "1px solid rgba(125,249,255,0.35)",
                    left: isSignUp ? "calc(50% + 2px)" : "4px",
                    boxShadow: "0 8px 24px -8px rgba(125,249,255,0.45)"
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
                <button
                  onClick={() => setIsSignUp(false)}
                  className={cn(
                    "relative z-10 flex-1 py-3 text-[11px] uppercase tracking-[0.3em] transition-colors",
                    !isSignUp ? "text-ink" : "text-muted hover:text-ink/70"
                  )}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setIsSignUp(true)}
                  className={cn(
                    "relative z-10 flex-1 py-3 text-[11px] uppercase tracking-[0.3em] transition-colors",
                    isSignUp ? "text-ink" : "text-muted hover:text-ink/70"
                  )}
                >
                  New Node
                </button>
              </div>
            </div>

            <form onSubmit={handleAuth} className="relative z-10 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.4em] text-muted flex items-center gap-2">
                  <Mail className="w-3 h-3 text-brand" /> Carrier ID
                </label>
                <div className="relative group">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-14 px-5 rounded-xl bg-black/30 border border-white/10 outline-none text-ink text-sm placeholder:text-muted/50 focus:border-brand/60 focus:bg-black/40 transition-all tracking-wide"
                    placeholder="operator@aurora.relay"
                  />
                  <div className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity" style={{ boxShadow: "0 0 0 1px rgba(125,249,255,0.4), 0 0 24px rgba(125,249,255,0.25)" }} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.4em] text-muted flex items-center gap-2">
                  <Lock className="w-3 h-3 text-brand" /> Cipher Key
                </label>
                <div className="relative group">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-14 px-5 rounded-xl bg-black/30 border border-white/10 outline-none text-ink text-sm placeholder:text-muted/50 focus:border-brand/60 focus:bg-black/40 transition-all tracking-[0.3em]"
                    placeholder="••••••••••"
                  />
                  <div className="absolute inset-0 rounded-xl pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity" style={{ boxShadow: "0 0 0 1px rgba(125,249,255,0.4), 0 0 24px rgba(125,249,255,0.25)" }} />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error}</span>
                  </motion.div>
                )}

                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -6, height: 0 }}
                    className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs"
                  >
                    <Check className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{message}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                className="brutal-btn w-full !py-4 !px-6 !text-[12px] !tracking-[0.3em] mt-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Connecting</>
                ) : (
                  <>
                    {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                    {isSignUp ? "Initialize Node" : "Enter Aurora"}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 flex flex-col items-center gap-3 text-muted/60">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-[0.45em]">RSA-4096 · End-to-End Relay</span>
          </div>
          <p className="text-[9px] uppercase tracking-[0.55em]">Powered by Claude Design</p>
        </div>
      </motion.div>
    </div>
  );
}
