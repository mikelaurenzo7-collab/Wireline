import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, SlidersHorizontal, ArrowRight, Loader2 } from "lucide-react";
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
      // One unified workspace — both modes land in the wired app shell; the
      // sidebar trims itself for personal mode via `accountSidebarItems`.
      navigate(mode === "personal" ? "/personal-home" : "/ops", { replace: true });
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
            <div className="mb-6 inline-flex items-center justify-center w-12 h-12 bg-brand/10 text-brand">
              <span className="font-display text-2xl font-bold">W</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-foreground tracking-tight mb-4">
              Choose your customizable agent profile
            </h1>
            <p className="text-foreground/70 text-lg max-w-xl mx-auto leading-relaxed">
              Select an initial focus for your digital workspace. Both settings are driven by fully
              customizable agents that you can configure to any workflow.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <motion.button
              onClick={() => handleSelect("personal")}
              disabled={creating !== null}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="text-left group relative p-8 md:p-10 border border-border bg-card hover:border-brand/40 transition-all flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-xl hover:shadow-brand/5 disabled:opacity-60"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-brand/0 to-brand/[0.03] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div>
                <div className="w-12 h-12 bg-brand/[0.03] group-hover:bg-brand/10 text-charcoal/60 group-hover:text-brand flex items-center justify-center mb-6 transition-colors">
                  <SlidersHorizontal className="w-6 h-6" />
                </div>
                <h2 className="font-display text-2xl font-semibold mb-3 group-hover:text-brand transition-colors">
                  Inbound Front Desk & Reception
                </h2>
                <p className="text-foreground/80 leading-relaxed text-sm">
                  Answer calls instantly, answer company FAQs, book and coordinate calendars, and
                  run custom reception workflows tailored to your office.
                </p>
              </div>
              <div className="mt-8 flex items-center text-brand font-semibold text-sm opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                {creating === "personal" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <>
                    Select Front Desk <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </div>
            </motion.button>

            <motion.button
              onClick={() => handleSelect("business")}
              disabled={creating !== null}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="text-left group relative p-8 md:p-10 border border-border bg-card hover:border-brand/40 transition-all flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-xl hover:shadow-brand/5 disabled:opacity-60"
            >
              <div className="absolute inset-0 bg-gradient-to-bl from-brand/0 to-brand/[0.03] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div>
                <div className="w-12 h-12 bg-brand/[0.03] group-hover:bg-brand/10 text-charcoal/60 group-hover:text-brand flex items-center justify-center mb-6 transition-colors">
                  <Bot className="w-6 h-6" />
                </div>
                <h2 className="font-display text-2xl font-semibold mb-3 group-hover:text-brand transition-colors">
                  Outbound Outreach & Campaigns
                </h2>
                <p className="text-foreground/80 leading-relaxed text-sm">
                  Run targeted voice & text outreach campaigns, qualify incoming leads
                  automatically, and synchronize contact states directly with your CRM.
                </p>
              </div>
              <div className="mt-8 flex items-center text-brand font-semibold text-sm opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                {creating === "business" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <>
                    Select Outbound & Sales <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </div>
            </motion.button>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Both profiles run on our high-performance, fully customizable AI Agent engine. You can
            change configurations anytime in Settings.
          </p>
        </motion.div>
      </div>
    </>
  );
}
