import React from "react";
import { useNavigate } from "react-router-dom";
import { User, Building, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useAccount } from "../../contexts/AccountContext";
import { PageMeta } from "../../lib/page-meta";

export default function OnboardingSelection() {
  const navigate = useNavigate();
  const { setAccountType } = useAccount();

  const handleSelect = (mode: "personal" | "business") => {
    setAccountType(mode);
    // Add a small flag to local storage so we don't show this again
    localStorage.setItem("wl_onboarded", "true");
    if (mode === "personal") {
      navigate("/personal-home", { replace: true });
    } else {
      navigate("/ops", { replace: true });
    }
  };

  return (
    <>
      <PageMeta title="Choose your workspace — Wireline" />
      <div className="min-h-screen bg-paper flex items-center justify-center p-6 font-sans text-ink">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl w-full"
        >
          <div className="text-center mb-12">
            <div className="mb-6 inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand/10 text-brand">
              <span className="font-display italic text-2xl font-bold">W</span>
            </div>
            <h1 className="font-display text-4xl md:text-5xl text-ink tracking-tight mb-4">
              How will you use Wireline?
            </h1>
            <p className="text-ink/60 text-lg max-w-xl mx-auto">
              Select your primary use case to tailor your workspace. You can always switch between
              modes later from the command menu.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Personal Mode */}
            <button
              onClick={() => handleSelect("personal")}
              className="text-left group relative wl-panel p-8 md:p-10 border border-ink/10 bg-paper hover:border-brand/40 hover:bg-paper-warm/30 transition-all rounded-md flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-xl hover:shadow-brand/5"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-brand/0 to-brand/[0.03] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              <div>
                <div className="w-12 h-12 rounded-md bg-ink/5 group-hover:bg-brand/10 text-ink/60 group-hover:text-brand flex items-center justify-center mb-6 transition-colors">
                  <User className="w-6 h-6" />
                </div>
                <h2 className="font-display text-2xl font-semibold mb-3 group-hover:text-brand transition-colors">
                  Personal Assistant
                </h2>
                <p className="text-ink/70 leading-relaxed text-sm">
                  A streamlined workspace focused on setting up a single AI agent for your personal
                  number. Connect to your iOS or Android app, configure Siri Shortcuts, and
                  seamlessly route calls.
                </p>
              </div>

              <div className="mt-8 flex items-center text-brand font-semibold text-sm opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                Select Personal <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </button>

            {/* Business Mode */}
            <button
              onClick={() => handleSelect("business")}
              className="text-left group relative wl-panel p-8 md:p-10 border border-ink/10 bg-paper hover:border-brand/40 hover:bg-paper-warm/30 transition-all rounded-md flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-xl hover:shadow-brand/5"
            >
              <div className="absolute inset-0 bg-gradient-to-bl from-brand/0 to-brand/[0.03] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              <div>
                <div className="w-12 h-12 rounded-md bg-ink/5 group-hover:bg-brand/10 text-ink/60 group-hover:text-brand flex items-center justify-center mb-6 transition-colors">
                  <Building className="w-6 h-6" />
                </div>
                <h2 className="font-display text-2xl font-semibold mb-3 group-hover:text-brand transition-colors">
                  Business Fleet
                </h2>
                <p className="text-ink/70 leading-relaxed text-sm">
                  The heavy-duty command center. Build complex workflows, manage multiple agent
                  roles, monitor live floor operations, and handle escalations for your business or
                  enterprise.
                </p>
              </div>

              <div className="mt-8 flex items-center text-brand font-semibold text-sm opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                Select Business <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
