import { Phone, ShieldCheck, Mail, Lock, Loader2, UserPlus, LogIn } from "lucide-react";
import { motion } from "motion/react";
import React, { useState } from "react";

import { cn } from "../lib/utils";
import { supabase } from "../lib/supabase";

import { BrutalButton, BrutalCard, BrutalInput } from "./ui";

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
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for the confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-brand/5 blur-[120px] rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 10% 10%, #000 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="mb-12 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-brand brutal-border mb-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <Phone className="w-10 h-10 text-ink" />
          </div>
          <h1 className="text-5xl font-black text-ink uppercase tracking-tighter font-display italic leading-none mb-2">
            Wireline
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">
            Omnichannel Fleet Management
          </p>
        </div>

        <BrutalCard surface="default" size="lg" shadow="xl" className="md:p-10">
          <div className="flex bg-ink p-1 brutal-border shadow-none mb-10">
            <button
              type="button"
              onClick={() => setIsSignUp(false)}
              aria-pressed={!isSignUp}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all italic",
                !isSignUp ? "bg-brand text-ink" : "text-white/40 hover:text-white"
              )}
            >
              Command Sign-in
            </button>
            <button
              type="button"
              onClick={() => setIsSignUp(true)}
              aria-pressed={isSignUp}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all italic",
                isSignUp ? "bg-brand text-ink" : "text-white/40 hover:text-white"
              )}
            >
              Initialize Node
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <BrutalInput
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="OPERATOR@WIRELINE.AI"
              label={
                <>
                  <Mail className="w-3 h-3" /> Carrier ID (Email)
                </>
              }
            />

            <BrutalInput
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder="••••••••"
              label={
                <>
                  <Lock className="w-3 h-3" /> Security Hash
                </>
              }
            />

            {error && (
              <div
                role="alert"
                className="p-4 bg-rose-50 border-2 border-rose-500 text-rose-500 text-[10px] font-black uppercase tracking-widest italic animate-shake"
              >
                {error}
              </div>
            )}

            {message && (
              <div
                role="status"
                className="p-4 bg-emerald-50 border-2 border-emerald-500 text-emerald-500 text-[10px] font-black uppercase tracking-widest italic"
              >
                {message}
              </div>
            )}

            <BrutalButton
              type="submit"
              variant="ink"
              size="lg"
              shadow="lg"
              block
              disabled={loading}
              className="mt-8"
              leadingIcon={
                loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSignUp ? (
                  <UserPlus className="w-5 h-5" />
                ) : (
                  <LogIn className="w-5 h-5" />
                )
              }
            >
              {loading
                ? "Synchronizing..."
                : isSignUp
                  ? "Create Carrier Node"
                  : "Sync Command Hub"}
            </BrutalButton>
          </form>
        </BrutalCard>

        <div className="mt-12 text-center">
          <div className="flex items-center justify-center gap-3 text-slate-400">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[9px] font-black uppercase tracking-[0.4em] italic">
              Wireline-RSA Encryption Active
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
