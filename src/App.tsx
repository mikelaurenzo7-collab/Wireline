import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Phone, Users, Settings, Activity, MessageSquare, Calendar, PhoneOutgoing, ServerCog, PlugZap, History, Mail, Menu, X, LogOut, User, Terminal, ChevronRight, Zap, Target, Shield, Signal, Globe, Box, LayoutPanelLeft, Database, Command } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import DashboardHome from "./components/DashboardHome";
import AgentTraining from "./components/AgentTraining";
import AppointmentsView from "./components/Appointments";
import FleetSettings from "./components/FleetSettings";
import OutboundDialer from "./components/OutboundDialer";
import AdminSettings from "./components/AdminSettings";
import Integrations from "./components/Integrations";
import CallLogs from "./components/CallLogs";
import EmailInbox from "./components/EmailInbox";
import AuthPortal from "./components/AuthPortal";
import CommandBar from "./components/CommandBar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { cn } from "./lib/utils";

const NAV_ITEMS = [
  { group: "COMMAND_OPERATIONS", items: [
    { label: "TACTICAL_DASHBOARD", path: "/", icon: Activity },
    { label: "NODAL_COMMITMENTS", path: "/appointments", icon: Calendar },
  ]},
  { group: "INTELLIGENCE_RELAY", items: [
    { label: "VOICE_ARCHIVE", path: "/logs", icon: History },
    { label: "EMAIL_INJECT", path: "/inbox", icon: Mail },
    { label: "DIRECT_DISPATCH", path: "/outbound", icon: PhoneOutgoing },
  ]},
  { group: "ENG_SYSTEMS", items: [
    { label: "NEURAL_TRAINING", path: "/train", icon: MessageSquare },
    { label: "FLEET_TOPOLOGY", path: "/agents", icon: Users },
    { label: "CARRIER_BRIDGE", path: "/integrations", icon: PlugZap },
  ]},
  { group: "ROOT_ACCESS", items: [
    { label: "SYSTEM_CORE", path: "/admin", icon: ServerCog },
  ]}
];

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
            className="fixed inset-0 bg-ink/80 backdrop-blur-xl z-[60] lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
      
      <div className={cn(
        "fixed inset-y-0 left-0 w-72 bg-paper border-r-8 border-ink flex flex-col h-full z-[70] transition-transform duration-700 cubic-bezier(0.85, 0, 0.15, 1) transform lg:relative lg:translate-x-0 lg:z-20",
        open ? "translate-x-0 shadow-[40px_0_80px_rgba(0,0,0,0.4)]" : "-translate-x-full"
      )}>
        {/* Header */}
        <div className="p-10 border-b-8 border-ink bg-brand flex items-center justify-between group overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 group-hover:rotate-45 transition-transform duration-1000">
             <Command className="w-32 h-32 text-ink" />
          </div>
          <div className="flex items-center gap-6 relative z-10">
            <motion.div 
              whileHover={{ rotate: 90, scale: 1.1 }}
              whileActive={{ scale: 0.95 }}
              className="w-14 h-14 brutal-border border-4 bg-white flex items-center justify-center shadow-[6px_6px_0px_0px_rgba(10,10,10,1)] hover:shadow-none transition-all"
            >
              <Zap className="w-8 h-8 text-ink fill-ink" />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-ink font-black text-3xl uppercase tracking-tighter leading-none font-display italic">WIRELINE</span>
              <span className="text-[10px] font-black text-ink/40 uppercase tracking-[0.4em] mt-2 italic flex items-center gap-2">
                 <div className="w-2 h-2 bg-ink/20 rounded-full" /> TACTICAL_OS_v4
              </span>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden p-3 text-ink bg-white/20 brutal-border border-2 hover:bg-white transition-all shadow-none">
            <X className="w-8 h-8" />
          </button>
        </div>

        {/* User Card */}
        <div className="mx-8 mt-10 p-8 bg-zinc-950 border-8 border-ink relative overflow-hidden group shadow-[12px_12px_0px_0px_rgba(212,255,77,1)] group-hover:shadow-none transition-all">
           <div className="absolute top-0 right-0 w-32 h-32 bg-brand opacity-10 blur-3xl group-hover:opacity-40 transition-opacity" />
           <div className="flex items-start gap-6 mb-8 relative z-10">
              <div className="w-16 h-16 brutal-border border-4 bg-brand flex items-center justify-center text-ink shadow-[4px_4px_0px_0px_rgba(212,255,77,1)]">
                 <User className="w-8 h-8" />
              </div>
              <div className="min-w-0 pt-1">
                 <p className="text-[12px] font-black text-brand uppercase truncate italic leading-none tracking-widest">{user?.email?.split('@')[0].toUpperCase()}</p>
                 <div className="flex items-center gap-3 mt-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.5em] leading-none italic">NODE_ONLINE</p>
                 </div>
              </div>
           </div>
           <button 
             onClick={() => signOut()}
             className="w-full py-4 bg-zinc-900 border-4 border-brand/20 text-brand text-[10px] font-black uppercase tracking-[0.6em] hover:bg-rose-500 hover:text-white hover:border-rose-600 transition-all active:scale-95 italic relative z-10"
           >
             TERMINATE_SESSION
           </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-6 space-y-12 mt-12 overflow-y-auto pb-16 scrollbar-hide text-ink group/nav">
          {NAV_ITEMS.map((group) => (
            <div key={group.group}>
              <h3 className="px-6 text-[10px] font-black text-zinc-400 uppercase tracking-[0.6em] mb-6 flex items-center gap-4 italic font-display opacity-60">
                 {group.group}
              </h3>
              <div className="space-y-3">
                {group.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <Link 
                      key={item.label}
                      to={item.path} 
                      onClick={() => setOpen(false)} 
                      className={cn(
                        "flex items-center justify-between px-6 py-5 border-4 transition-all group relative overflow-hidden",
                        active 
                          ? "bg-brand border-ink translate-x-2 -translate-y-2 shadow-[8px_8px_0px_0px_rgba(10,10,10,1)]" 
                          : "border-transparent hover:bg-zinc-50 hover:border-zinc-200"
                      )}
                    >
                      <div className="flex items-center gap-6 relative z-10">
                        <item.icon className={cn("w-5 h-5 transition-transform duration-500", active ? "text-ink scale-110" : "text-zinc-300 group-hover:text-ink group-hover:rotate-6")} />
                        <span className={cn("font-black text-[11px] uppercase tracking-[0.2em] italic", active ? "text-ink" : "text-zinc-500 group-hover:text-ink")}>
                          {item.label}
                        </span>
                      </div>
                      {active && (
                        <motion.div layoutId="nav-glow" className="absolute inset-0 bg-white/10 pointer-events-none" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-10 border-t-8 border-ink bg-zinc-50 flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
             <Signal className="w-20 h-20 text-ink" />
          </div>
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.4em] text-ink/40 italic relative z-10">
            <span>WIRELINE OS v4.0.0</span>
            <span className="flex items-center gap-3"><Terminal className="w-4 h-4" /> STATUS_STABLE</span>
          </div>
          <div className="w-full h-2 bg-ink/5 overflow-hidden brutal-border border-2 shadow-none relative z-10">
            <motion.div 
              animate={{ x: ["-100%", "100%"] }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
              className="w-1/2 h-full bg-brand"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.02, y: -10 }}
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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
        <div className="scanline" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(#000 2px, transparent 2px), linear-gradient(90deg, #000 2px, transparent 2px)", backgroundSize: "40px 40px" }} />
        
        <motion.div 
          animate={{ 
            rotate: [0, 90, 180, 270, 360],
            scale: [1, 1.1, 1],
            borderRadius: ["0%", "20%", "0%"]
          }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="w-40 h-40 brutal-border border-8 bg-zinc-950 flex items-center justify-center mb-16 shadow-[24px_24px_0px_0px_rgba(212,255,77,1)]"
        >
          <Zap className="w-20 h-20 text-brand fill-brand" />
        </motion.div>
        
        <div className="space-y-8 relative z-10">
          <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter uppercase text-ink font-display leading-none">BOOTING_CORE</h1>
          <div className="flex flex-col items-center gap-4">
             <div className="flex items-center gap-6">
                <div className="w-3 h-3 bg-brand animate-ping" />
                <p className="text-[12px] font-black uppercase tracking-[1em] text-zinc-500 italic">ESTABLISHING_RELAY_BRIDGE</p>
             </div>
             <div className="w-64 h-2 bg-zinc-100 brutal-border border-2 overflow-hidden shadow-none">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="h-full bg-ink" 
                />
             </div>
          </div>
        </div>
        
        <div className="absolute top-10 left-10 w-32 h-32 border-t-8 border-l-8 border-ink opacity-10" />
        <div className="absolute bottom-10 right-10 w-32 h-32 border-b-8 border-r-8 border-ink opacity-10" />
      </div>
    );
  }

  if (!user) {
    return <AuthPortal />;
  }

  return (
    <div className="flex h-screen bg-white text-ink font-sans overflow-hidden relative">
      <div className="scanline" />
      <CommandBar />
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <main className="flex-1 overflow-hidden relative bg-white flex flex-col">
         {/* Mobile Header */}
         <div className="lg:hidden p-6 border-b-8 border-ink bg-white flex items-center justify-between z-30 sticky top-0">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="w-16 h-16 brutal-border border-4 bg-brand shadow-[8px_8px_0px_0px_rgba(10,10,10,1)] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center group"
            >
              <Menu className="w-8 h-8 text-ink group-hover:scale-110 transition-transform" />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 brutal-border border-4 bg-white flex items-center justify-center shadow-none">
                <Zap className="w-6 h-6 text-ink fill-ink" />
              </div>
              <span className="text-ink font-black text-3xl uppercase tracking-tighter font-display italic leading-none">WIRELINE</span>
            </div>
            <div className="w-16 h-16 brutal-border border-4 bg-zinc-950 flex items-center justify-center text-brand">
               <User className="w-8 h-8" />
            </div>
         </div>

         <div className="flex-1 relative flex flex-col min-h-0 bg-paper">
            {/* Dynamic Background Element */}
            <div className="absolute top-0 right-0 w-[50rem] h-[50rem] bg-brand/5 blur-[200px] rounded-full pointer-events-none z-0 animate-pulse" />
            <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-ink/5 blur-[180px] rounded-full pointer-events-none z-0" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-[0.02] pointer-events-none z-0" style={{ backgroundImage: "radial-gradient(circle at 10% 10%, #000 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

            <div className="flex-1 overflow-y-auto relative z-10 scrollbar-hide">
              <div className="max-w-[1920px] mx-auto min-h-full p-6 md:p-12 lg:p-20">
                <AnimatePresence mode="wait">
                  <Routes>
                    <Route path="/" element={<PageTransition><DashboardHome /></PageTransition>} />
                    <Route path="/logs" element={<PageTransition><CallLogs /></PageTransition>} />
                    <Route path="/inbox" element={<PageTransition><EmailInbox /></PageTransition>} />
                    <Route path="/outbound" element={<PageTransition><OutboundDialer /></PageTransition>} />
                    <Route path="/appointments" element={<PageTransition><AppointmentsView /></PageTransition>} />
                    <Route path="/train" element={<PageTransition><AgentTraining /></PageTransition>} />
                    <Route path="/agents" element={<PageTransition><FleetSettings /></PageTransition>} />
                    <Route path="/integrations" element={<PageTransition><Integrations /></PageTransition>} />
                    <Route path="/admin" element={<PageTransition><AdminSettings /></PageTransition>} />
                  </Routes>
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
