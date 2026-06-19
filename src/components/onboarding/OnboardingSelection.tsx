import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Building, ArrowRight, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useAccount } from "../../contexts/AccountContext";
import { PageMeta } from "../../lib/page-meta";

export default function OnboardingSelection() {
  const navigate = useNavigate();
  const { addAccount } = useAccount();
  const [creating, setCreating] = useState<"personal" | "business" | null>(null);

  const handleSelect = async (mode: "personal" | "business") => {
    setCreating(mode);
    try {
      await addAccount(mode);
      localStorage.setItem("wl_onboarded", "true");
      navigate(mode === "personal" ? "/app/personal" : "/app/business/live", { replace: true });
    } catch {
      setCreating(null);
    }
  };

  return (
    <>
      <PageMeta title="Choose your workspace — Wireline" />
      <div className="min-h-screen bg-background flex items-center justify-center p-6 font-sans text-foreground">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl w-full"
        >
          <div className="text-center mb-12">
            <div className="mb-6 inline-flex items-center justify-center w-12 h-12 bg-violet-100 text-violet-600">
              <span className="font-display text-2xl font-bold">W</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-foreground tracking-tight mb-4">
              How will you use Wireline?
            </h1>
            <p className="text-foreground/70 text-lg max-w-xl mx-auto leading-relaxed">
              Choose your primary workspace. You can always add the other later
              from your account settings.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => handleSelect("personal")}
              disabled={creating !== null}
              className="text-left group relative p-8 md:p-10 border border-border bg-card hover:border-violet-400/40 transition-all flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-xl hover:shadow-violet-500/5 disabled:opacity-60"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 to-violet-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div>
                <div className="w-12 h-12 bg-violet-50 group-hover:bg-violet-100 text-charcoal/60 group-hover:text-violet-600 flex items-center justify-center mb-6 transition-colors">
                  <User className="w-6 h-6" />
                </div>
                <h2 className="font-display text-2xl font-semibold mb-3 group-hover:text-violet-600 transition-colors">
                  Personal Assistant
                </h2>
                <p className="text-foreground/80 leading-relaxed text-sm">
                  A streamlined workspace focused on setting up a single AI agent for your personal
                  number. Connect to your iOS or Android app, configure Siri Shortcuts, and
                  seamlessly route calls.
                </p>
              </div>
              <div className="mt-8 flex items-center text-violet-600 font-semibold text-sm opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                {creating === "personal" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <>Select Personal <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </div>
            </button>

            <button
              onClick={() => handleSelect("business")}
              disabled={creating !== null}
              className="text-left group relative p-8 md:p-10 border border-border bg-card hover:border-violet-400/40 transition-all flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-xl hover:shadow-violet-500/5 disabled:opacity-60"
            >
              <div className="absolute inset-0 bg-gradient-to-bl from-violet-500/0 to-violet-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div>
                <div className="w-12 h-12 bg-violet-50 group-hover:bg-violet-100 text-charcoal/60 group-hover:text-violet-600 flex items-center justify-center mb-6 transition-colors">
                  <Building className="w-6 h-6" />
                </div>
                <h2 className="font-display text-2xl font-semibold mb-3 group-hover:text-violet-600 transition-colors">
                  Business Fleet
                </h2>
                <p className="text-foreground/80 leading-relaxed text-sm">
                  The heavy-duty command center. Build complex workflows, manage multiple agent
                  roles, monitor live floor operations, and handle escalations for your business or
                  enterprise.
                </p>
              </div>
              <div className="mt-8 flex items-center text-violet-600 font-semibold text-sm opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                {creating === "business" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <>Select Business <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </div>
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Your first workspace becomes your primary account. You can add the other account type later.
          </p>
        </motion.div>
      </div>
    </>
  );
}
