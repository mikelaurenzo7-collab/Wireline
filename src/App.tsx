import React, { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Phone, Users, Settings, Activity, MessageSquare, Calendar, PhoneOutgoing, ServerCog, PlugZap, History, Mail, Menu, X, LogOut, User, Terminal, ChevronRight, Zap, Target, Shield, Signal, Globe, Box, LayoutPanelLeft, Database, Command, Sparkles, Waves, Inbox, BarChart3, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import AuthPortal from "./components/AuthPortal";
import CommandBar from "./components/CommandBar";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { cn } from "./lib/utils";

// All route surfaces are code-split. Initial bundle holds only the
// app shell + auth + command bar; pages stream in on demand.
const DashboardHome   = lazy(() => import("./components/DashboardHome"));
const TriageInbox     = lazy(() => import("./components/TriageInbox"));
const ContactProfile  = lazy(() => import("./components/ContactProfile"));
const InsightsView    = lazy(() => import("./components/InsightsView"));
const AgentTraining   = lazy(() => import("./components/AgentTraining"));
const AppointmentsView = lazy(() => import("./components/Appointments"));
const FleetSettings   = lazy(() => import("./components/FleetSettings"));
const OutboundDialer  = lazy(() => import("./components/OutboundDialer"));
const AdminSettings   = lazy(() => import("./components/AdminSettings"));
const Integrations    = lazy(() => import("./components/Integrations"));
const CallLogs        = lazy(() => import("./components/CallLogs"));
const EmailInbox      = lazy(() => import("./components/EmailInbox"));

const NAV_ITEMS = [
  { group: "Operations", items: [
    { label: "Command Atlas", path: "/", icon: Activity },
    { label: "Triage Inbox", path: "/triage", icon: Inbox },
    { label: "Constellation", path: "/appointments", icon: Calendar },
  ]},
  { group: "Signal Channels", items: [
    { label: "Voice Archive", path: "/logs", icon: History },
    { label: "Inbound Email", path: "/inbox", icon: Mail },
    { label: "Outbound Dialer", path: "/outbound", icon: PhoneOutgoing },
  ]},
  { group: "Intelligence", items: [
    { label: "Insights", path: "/insights", icon: BarChart3 },
    { label: "Neural Atelier", path: "/train", icon: MessageSquare },
    { label: "Agent Topology", path: "/agents", icon: Users },
    { label: "Carrier Bridge", path: "/integrations", icon: PlugZap },
  ]},
  { group: "Root", items: [
    { label: "Core Settings", path: "/admin", icon: ServerCog },
  ]}
];

function AuroraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(125,249,255,0.22), transparent 60%)" }}
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(255,107,217,0.18), transparent 60%)" }}
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[40%] left-[40%] w-[55vw] h-[55vw] rounded-full"
        style={{ background: "radial-gradient(circle at center, rgba(197,139,255,0.18), transparent 60%)" }}
        animate={{ x: [0, 60, -20, 0], y: [0, -40, 30, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function Sidebar({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[60] lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        "fixed inset-y-0 left-0 w-80 flex flex-col h-full z-[70] transition-transform duration-700 lg:relative lg:translate-x-0 lg:z-20",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="absolute inset-0 glass-strong border-r border-white/8" />
        <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-cyan-300/40 to-transparent" />

        <div className="relative z-10 flex flex-col h-full">
          {/* Header */}
          <div className="px-8 pt-9 pb-7 border-b border-white/6 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-4 group" onClick={() => setOpen(false)}>
              <motion.div
                whileHover={{ rotate: 12, scale: 1.05 }}
                className="relative w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #7DF9FF 0%, #C58BFF 50%, #FF6BD9 100%)",
                  boxShadow: "0 8px 28px -8px rgba(125,249,255,0.6), 0 0 0 1px rgba(255,255,255,0.2) inset"
                }}
              >
                <Waves className="w-6 h-6 text-paper relative z-10" strokeWidth={2.5} />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
              </motion.div>
              <div className="flex flex-col">
                <span className="font-display italic text-3xl text-ink leading-none tracking-tight">Wireline</span>
                <span className="text-[10px] tracking-[0.4em] uppercase text-muted mt-2 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-brand indicator-glow" />
                  Aurora Relay
                </span>
              </div>
            </Link>
            <button onClick={() => setOpen(false)} className="lg:hidden w-10 h-10 rounded-full flex items-center justify-center text-ink/60 hover:text-ink hover:bg-white/5 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Card */}
          <div className="mx-6 mt-6 relative aurora-ring rounded-2xl">
            <div className="relative p-5 rounded-2xl glass overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-30 blur-2xl" style={{ background: "radial-gradient(circle, #7DF9FF, transparent)" }} />
              <div className="relative z-10 flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-paper" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF)" }}>
                    <User className="w-5 h-5" strokeWidth={2.5} />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0F0E2D] bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink truncate">{user?.email?.split('@')[0]}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] tracking-[0.25em] uppercase text-muted">Signal Active</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="mt-5 w-full py-2.5 rounded-xl text-[10px] uppercase tracking-[0.32em] text-ink/60 hover:text-rose-500 hover:bg-rose-500/8 border border-white/6 hover:border-rose-500/30 transition-all flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                End Session
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 mt-8 overflow-y-auto pb-8 scrollbar-hide space-y-8">
            {NAV_ITEMS.map((group) => (
              <div key={group.group}>
                <h3 className="px-4 text-[9px] font-medium uppercase tracking-[0.45em] text-muted/70 mb-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/15 to-white/0" />
                  {group.group}
                  <span className="h-px flex-1 bg-gradient-to-r from-white/0 via-white/15 to-white/0" />
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.label}
                        to={item.path}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-4 px-4 py-3 rounded-xl transition-all overflow-hidden",
                          active
                            ? "text-paper"
                            : "text-ink/70 hover:text-ink hover:bg-white/4"
                        )}
                      >
                        {active && (
                          <motion.div
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-xl"
                            style={{
                              background: "linear-gradient(135deg, #7DF9FF 0%, #C58BFF 60%, #FF6BD9 100%)",
                              boxShadow: "0 8px 28px -10px rgba(125,249,255,0.55), 0 0 0 1px rgba(255,255,255,0.20) inset"
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                          />
                        )}
                        <item.icon className={cn("w-[18px] h-[18px] relative z-10 transition-transform", active ? "" : "group-hover:translate-x-0.5")} strokeWidth={active ? 2.5 : 1.75} />
                        <span className={cn("text-[13px] tracking-wide relative z-10", active ? "font-medium" : "font-normal")}>
                          {item.label}
                        </span>
                        {active && <ChevronRight className="ml-auto w-4 h-4 relative z-10" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-6 py-5 border-t border-white/6 relative">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.35em] text-muted/70 mb-3">
              <span className="font-display italic text-[11px] tracking-tight not-italic-fix text-ink/70 normal-case">v∞ — Aurora</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-emerald-500 indicator-glow" />
                Stable
              </span>
            </div>
            <div className="relative h-1 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                animate={{ x: ["-100%", "100%"] }}
                transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                className="absolute inset-y-0 w-1/2 rounded-full"
                style={{ background: "linear-gradient(90deg, transparent, #7DF9FF, #C58BFF, transparent)" }}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-muted/60">
              <Sparkles className="w-3 h-3" />
              <span>⌘K  Open Command</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 text-center px-6">
      <div className="font-display italic text-aurora text-[8rem] md:text-[12rem] leading-none">404</div>
      <p className="text-[10px] uppercase tracking-[0.6em] text-muted">No signal at this coordinate</p>
      <p className="text-ink/55 max-w-md text-sm leading-relaxed">
        The page you're after doesn't exist on the relay. Use ⌘K to jump anywhere, or head back to the Atlas.
      </p>
      <Link to="/" className="brutal-btn !py-3 !px-6 !text-[11px] !tracking-[0.3em]">
        <Activity className="w-3.5 h-3.5" /> Back to Atlas <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #FF6BD9, #4DFFC4, #7DF9FF)", filter: "blur(1px)", animation: "spin 4s linear infinite" }} />
        <div className="absolute inset-1 rounded-full bg-paper" />
        <div className="absolute inset-2 rounded-full glass flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-aurora animate-spin" />
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-[0.5em] text-muted">Streaming</p>
    </div>
  );
}

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(8px)" }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
        <AuroraBackdrop />
        <div className="scanline" />

        <motion.div
          animate={{
            rotate: [0, 360],
          }}
          transition={{ repeat: Infinity, duration: 16, ease: "linear" }}
          className="relative w-44 h-44 mb-12"
        >
          <div className="absolute inset-0 rounded-full" style={{
            background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #FF6BD9, #4DFFC4, #7DF9FF)",
            filter: "blur(2px)"
          }} />
          <div className="absolute inset-2 rounded-full bg-paper" />
          <div className="absolute inset-4 rounded-full glass flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Waves className="w-16 h-16 text-aurora" strokeWidth={1.5} />
            </motion.div>
          </div>
        </motion.div>

        <div className="space-y-4 relative z-10">
          <h1 className="text-6xl md:text-8xl font-display italic text-aurora leading-[0.85] tracking-tight">
            Wireline
          </h1>
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Awakening the Aurora Relay</p>
          <div className="flex items-center justify-center gap-1.5 pt-4">
            {[0, 1, 2].map(i => (
              <motion.span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-brand"
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPortal />;
  }

  return (
    <div className="flex h-screen text-ink font-sans overflow-hidden relative">
      <AuroraBackdrop />
      <div className="scanline" />
      <CommandBar />
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />

      <main className="flex-1 overflow-hidden relative flex flex-col z-10">
         {/* Mobile Header */}
         <div className="lg:hidden p-5 flex items-center justify-between z-30 sticky top-0 glass-strong border-b border-white/8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-11 h-11 rounded-xl glass border border-white/10 flex items-center justify-center hover:border-brand/40 transition-all"
            >
              <Menu className="w-5 h-5 text-ink" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF, #FF6BD9)" }}>
                <Waves className="w-4 h-4 text-paper" strokeWidth={2.5} />
              </div>
              <span className="font-display italic text-2xl text-ink leading-none">Wireline</span>
            </div>
            <div className="w-11 h-11 rounded-xl glass border border-white/10 flex items-center justify-center">
              <User className="w-5 h-5 text-ink/70" />
            </div>
         </div>

         <div className="flex-1 relative flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto relative z-10 scrollbar-hide">
              <div className="max-w-[1920px] mx-auto min-h-full p-6 md:p-12 lg:p-16">
                <AnimatePresence mode="wait">
                  <ErrorBoundary>
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        <Route path="/" element={<PageTransition><DashboardHome /></PageTransition>} />
                        <Route path="/triage" element={<PageTransition><TriageInbox /></PageTransition>} />
                        <Route path="/insights" element={<PageTransition><InsightsView /></PageTransition>} />
                        <Route path="/contact/:number" element={<PageTransition><ContactProfile /></PageTransition>} />
                        <Route path="/logs" element={<PageTransition><CallLogs /></PageTransition>} />
                        <Route path="/inbox" element={<PageTransition><EmailInbox /></PageTransition>} />
                        <Route path="/outbound" element={<PageTransition><OutboundDialer /></PageTransition>} />
                        <Route path="/appointments" element={<PageTransition><AppointmentsView /></PageTransition>} />
                        <Route path="/train" element={<PageTransition><AgentTraining /></PageTransition>} />
                        <Route path="/agents" element={<PageTransition><FleetSettings /></PageTransition>} />
                        <Route path="/integrations" element={<PageTransition><Integrations /></PageTransition>} />
                        <Route path="/admin" element={<PageTransition><AdminSettings /></PageTransition>} />
                        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </AnimatePresence>
              </div>
            </div>
         </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
