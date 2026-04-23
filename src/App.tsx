/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Phone, Users, Settings, Activity, MessageSquare, Calendar, PhoneOutgoing, ServerCog, PlugZap, History, MessageCircle, Mail, Menu, X, LogOut, User } from "lucide-react";
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
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { cn } from "./lib/utils";

function Sidebar({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div 
          className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      
      <div className={cn(
        "fixed inset-y-0 left-0 w-72 bg-white border-r-2 border-ink flex flex-col h-full z-50 transition-transform duration-300 transform lg:relative lg:translate-x-0 lg:z-20",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 border-b-2 border-ink bg-brand flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-ink bg-white flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <Phone className="w-5 h-5 text-ink" />
            </div>
            <span className="text-ink font-black text-2xl uppercase tracking-tighter font-display">Wireline</span>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden p-2 text-ink hover:bg-ink/5 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-6 mt-10 overflow-y-auto pb-12 scrollbar-hide">
          <div className="px-4 mb-8">
             <div className="p-4 bg-slate-50 border-2 border-slate-200">
                <div className="flex items-center gap-3 mb-2">
                   <div className="w-8 h-8 rounded-full bg-ink flex items-center justify-center text-brand">
                      <User className="w-4 h-4" />
                   </div>
                   <div className="min-w-0">
                      <p className="text-[10px] font-black text-ink uppercase truncate italic leading-none">{user?.email?.split('@')[0]}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Carrier Node Active</p>
                   </div>
                </div>
                <button 
                  onClick={() => signOut()}
                  className="w-full flex items-center justify-center gap-2 py-2 mt-4 bg-white border-2 border-ink text-ink text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-colors"
                >
                  <LogOut className="w-3 h-3" /> Terminate Session
                </button>
             </div>
          </div>

          <div>
            <span className="px-4 text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3 block italic">Operations Hub</span>
            <div className="space-y-1">
              <Link to="/" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                <Activity className={cn("w-4 h-4", isActive("/") ? "text-ink" : "text-slate-400")} />
                <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/") ? "text-ink" : "text-slate-500")}>Command Center</span>
              </Link>
              <Link to="/appointments" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/appointments") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                <Calendar className={cn("w-4 h-4", isActive("/appointments") ? "text-ink" : "text-slate-400")} />
                <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/appointments") ? "text-ink" : "text-slate-500")}>Commitments</span>
              </Link>
            </div>
          </div>

          <div>
             <span className="px-4 text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3 block italic">Intelligence Feed</span>
             <div className="space-y-1">
                <Link to="/logs" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/logs") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                  <History className={cn("w-4 h-4", isActive("/logs") ? "text-ink" : "text-slate-400")} />
                  <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/logs") ? "text-ink" : "text-slate-500")}>Signal Archives</span>
                </Link>
                <Link to="/inbox" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/inbox") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                  <Mail className={cn("w-4 h-4", isActive("/inbox") ? "text-ink" : "text-slate-400")} />
                  <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/inbox") ? "text-ink" : "text-slate-500")}>Email Relay</span>
                </Link>
                <Link to="/outbound" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/outbound") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                  <PhoneOutgoing className={cn("w-4 h-4", isActive("/outbound") ? "text-ink" : "text-slate-400")} />
                  <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/outbound") ? "text-ink" : "text-slate-500")}>Signal Batch</span>
                </Link>
             </div>
          </div>

          <div>
             <span className="px-4 text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3 block italic">Engine Bay</span>
             <div className="space-y-1">
                <Link to="/train" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/train") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                  <MessageSquare className={cn("w-4 h-4", isActive("/train") ? "text-ink" : "text-slate-400")} />
                  <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/train") ? "text-ink" : "text-slate-500")}>Tactical Training</span>
                </Link>
                <Link to="/agents" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/agents") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                  <Users className={cn("w-4 h-4", isActive("/agents") ? "text-ink" : "text-slate-400")} />
                  <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/agents") ? "text-ink" : "text-slate-500")}>Fleet Manager</span>
                </Link>
                <Link to="/integrations" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/integrations") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
                  <PlugZap className={cn("w-4 h-4", isActive("/integrations") ? "text-ink" : "text-slate-400")} />
                  <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/integrations") ? "text-ink" : "text-slate-500")}>Network Links</span>
                </Link>
             </div>
          </div>
          
          <div className="pt-6 border-t font-sans">
            <Link to="/admin" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-2.5 border-2 transition-all group", isActive("/admin") ? "bg-brand border-ink shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
              <ServerCog className={cn("w-4 h-4 font-bold", isActive("/admin") ? "text-ink" : "text-slate-400")} />
              <span className={cn("font-bold text-[10px] uppercase tracking-wider", isActive("/admin") ? "text-ink" : "text-slate-500")}>System Core</span>
            </Link>
          </div>
        </nav>
        <div className="p-6 border-t-2 border-ink bg-slate-50 text-[10px] font-black text-ink uppercase tracking-widest flex justify-between">
          <span>Version 1.0</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Live</span>
        </div>
      </div>
    </>
  );
}

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center space-y-8">
        <div className="w-16 h-16 border-4 border-ink border-t-brand animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.5em] italic animate-pulse">Syncing Carrier Relay...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPortal />;
  }

  return (
    <div className="flex h-screen bg-[#FDFDFD] text-ink font-sans overflow-hidden relative">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <main className="flex-1 overflow-hidden relative bg-white flex flex-col">
         {/* Mobile Header */}
         <div className="lg:hidden p-4 border-b-2 border-ink bg-white flex items-center justify-between z-30">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 border-2 border-ink bg-brand shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
            >
              <Menu className="w-6 h-6 text-ink" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 border-2 border-ink bg-white flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Phone className="w-4 h-4 text-ink" />
              </div>
              <span className="text-ink font-black text-xl uppercase tracking-tighter font-display">Wireline</span>
            </div>
            <div className="w-10" /> {/* Spacer */}
         </div>

        <div className="flex-1 relative flex flex-col min-h-0">
            {/* Dynamic Background Element */}
            <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-brand/5 blur-[120px] rounded-full pointer-events-none z-0" />
            <div className="absolute bottom-0 left-0 w-1/4 h-1/4 bg-brand/10 blur-[100px] rounded-full pointer-events-none z-0" />

            <div className="flex-1 overflow-y-auto relative z-10 scrollbar-hide">
              <Routes>
                <Route path="/" element={<DashboardHome />} />
                <Route path="/logs" element={<CallLogs />} />
                <Route path="/inbox" element={<EmailInbox />} />
                <Route path="/outbound" element={<OutboundDialer />} />
                <Route path="/appointments" element={<AppointmentsView />} />
                <Route path="/train" element={<AgentTraining />} />
                <Route path="/agents" element={<FleetSettings />} />
                <Route path="/integrations" element={<Integrations />} />
                <Route path="/admin" element={<AdminSettings />} />
              </Routes>
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

