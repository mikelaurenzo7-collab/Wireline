import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { Phone, ShieldCheck, Mail, Lock, Loader2, ArrowRight, UserPlus, LogIn, Terminal, Shield, Zap, Globe, Target, Activity, AlertTriangle } from "lucide-react";
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
        setMessage("CHECK_EMAIL_FOR_CONFIRMATION_SIGNAL.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
          setError("DATABASE_OFFLINE: UNABLE_TO_ESTABLISH_CONNECTION_WITH_SUPABASE_CLUSTER.");
      } else {
          setError(`AUTH_FAILURE: ${err.message.toUpperCase()}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8 relative overflow-hidden">
      {/* Dynamic Grid Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(#000 1.5px, transparent 1.5px), linear-gradient(90deg, #000 1.5px, transparent 1.5px)", backgroundSize: "60px 60px" }} />
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-brand/10 blur-[180px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-zinc-950/5 blur-[150px] rounded-full" />
        
        {/* Decorative Elements */}
        <div className="absolute top-10 left-10 flex gap-4 rotate-12 opacity-10">
           <Terminal className="w-20 h-20" />
           <Shield className="w-20 h-20" />
        </div>
        <div className="absolute bottom-10 right-10 flex gap-4 -rotate-12 opacity-10">
           <Zap className="w-20 h-20" />
           <Target className="w-20 h-20" />
        </div>
      </div>

      <motion.div 
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 25, stiffness: 100 }}
        className="w-full max-w-xl relative z-10"
      >
        <div className="text-center mb-16">
          <div className="relative inline-block group">
            <div className="absolute -inset-4 bg-brand blur-2xl opacity-20 group-hover:opacity-40 transition-opacity" />
            <div className="w-32 h-32 bg-zinc-950 border-8 border-ink flex items-center justify-center mb-10 shadow-[16px_16px_0px_0px_rgba(212,255,77,1)] relative z-10 group-hover:-translate-x-2 group-hover:-translate-y-2 transition-transform">
               <Phone className="w-16 h-16 text-brand" />
            </div>
          </div>
          <h1 className="text-6xl md:text-[6rem] font-black text-ink uppercase tracking-tighter font-display italic leading-[0.75] mb-6">WIRELINE</h1>
          <p className="text-muted font-bold uppercase tracking-[0.6em] text-[10px] md:text-xs italic underline decoration-brand decoration-4 underline-offset-[-2px]">OMNICHANNEL_FLEET_MANAGEMENT_v4.0</p>
        </div>

        <div className="bg-white brutal-border border-8 p-12 md:p-16 shadow-[24px_24px_0px_0px_rgba(10,10,10,1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <Globe className="w-48 h-48 animate-spin" style={{ animationDuration: '20s' }} />
          </div>
          
          <div className="flex bg-zinc-950 p-2 brutal-border border-4 border-ink shadow-none mb-12 relative z-10">
            <button 
              onClick={() => setIsSignUp(false)}
              className={cn(
                "flex-1 py-5 text-[11px] font-black uppercase tracking-[0.3em] transition-all italic",
                !isSignUp ? "bg-brand text-ink" : "text-white/30 hover:text-white"
              )}
            >
              COMMAND_SYNC
            </button>
            <button 
              onClick={() => setIsSignUp(true)}
              className={cn(
                "flex-1 py-5 text-[11px] font-black uppercase tracking-[0.3em] transition-all italic",
                isSignUp ? "bg-brand text-ink" : "text-white/30 hover:text-white"
              )}
            >
              INIT_NODE
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-10 relative z-10">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-muted uppercase tracking-[0.5em] italic flex items-center gap-4 ml-1">
                <Mail className="w-4 h-4 text-brand fill-ink" /> CARRIER_ID_MAP
              </label>
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-20 p-8 brutal-border border-4 outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-lg bg-zinc-50 transition-all font-display italic"
                placeholder="OPERATOR@SYSTEM.AI"
              />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-black text-muted uppercase tracking-[0.5em] italic flex items-center gap-4 ml-1">
                <Lock className="w-4 h-4 text-brand fill-ink" /> SECURITY_HASH
              </label>
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-20 p-8 brutal-border border-4 outline-none focus:bg-brand font-black text-ink uppercase tracking-[0.5em] text-lg bg-zinc-50 transition-all font-display"
                placeholder="********"
              />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 bg-rose-500 text-white text-[10px] font-black uppercase tracking-[0.3em] italic brutal-border border-4 shadow-none flex items-center gap-6"
                >
                  <AlertTriangle className="w-6 h-6 shrink-0" />
                  {error}
                </motion.div>
              )}

              {message && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-8 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-[0.3em] italic brutal-border border-4 shadow-none flex items-center gap-6"
                >
                  <Activity className="w-6 h-6 shrink-0" />
                  {message}
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              type="submit"
              disabled={loading}
              className="w-full h-24 bg-zinc-950 text-brand brutal-border border-4 text-sm font-black flex items-center justify-center gap-6 shadow-[12px_12px_0px_0px_rgba(212,255,77,1)] hover:shadow-none hover:bg-black uppercase tracking-[0.5em] italic transition-all active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50 mt-4"
            >
              {loading ? (
                <><Loader2 className="w-8 h-8 animate-spin" /> ESTABLISHING_SIGNAL...</>
              ) : (
                <>
                  {isSignUp ? <UserPlus className="w-8 h-8" /> : <LogIn className="w-8 h-8" />}
                  {isSignUp ? "INITIALIZE_RELAY_NODE" : "SYNC_COMMAND_HUB"}
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-16 flex flex-col items-center gap-6 opacity-30">
          <div className="flex items-center gap-6">
             <ShieldCheck className="w-6 h-6 text-ink" />
             <span className="text-[10px] font-black uppercase tracking-[0.6em] italic">WIRELINE_RSA_ENCRYPTION_v4_ACTIVE</span>
          </div>
          <p className="text-[8px] font-black uppercase tracking-[0.8em] italic">-- ALL_SIGNALS_ARE_ENCRYPTED_AND_LOGGED --</p>
        </div>
      </motion.div>
    </div>
  );
}
