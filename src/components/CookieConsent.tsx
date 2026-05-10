import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link } from "react-router-dom";

const STORAGE_KEY = "wireline_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if not already acknowledged
    if (!localStorage.getItem(STORAGE_KEY)) {
      // Small delay so it doesn't compete with page load
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "acknowledged");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-lg px-4"
          role="dialog"
          aria-label="Cookie notice"
        >
          <div className="rounded-2xl glass-strong border border-black/8 backdrop-blur-xl shadow-2xl px-5 py-4 flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: "linear-gradient(135deg, rgba(10,200,212,0.15), rgba(155,89,245,0.15))", border: "1px solid rgba(10,200,212,0.20)" }}>
              <Cookie className="w-4 h-4 text-brand" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-ink mb-0.5">Cookies &amp; Privacy</p>
              <p className="text-[11px] text-muted/80 leading-relaxed">
                We use only essential cookies required to keep you signed in — no advertising or cross-site
                tracking.{" "}
                <Link to="/privacy" className="text-brand hover:text-brand/80 underline" onClick={dismiss}>
                  Privacy policy
                </Link>
                {" · "}
                <Link to="/terms" className="text-brand hover:text-brand/80 underline" onClick={dismiss}>
                  Terms
                </Link>
              </p>
            </div>

            <button
              onClick={dismiss}
              aria-label="Dismiss cookie notice"
              className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors text-muted hover:text-ink mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
