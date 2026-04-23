/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { Phone, Users, Settings, Activity, MessageSquare, Calendar, PhoneOutgoing, ServerCog, PlugZap, History, MessageCircle, Mail, Menu, X } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardHome from "./components/DashboardHome";
import AgentTraining from "./components/AgentTraining";
import AppointmentsView from "./components/Appointments";
import FleetSettings from "./components/FleetSettings";
import OutboundDialer from "./components/OutboundDialer";
import AdminSettings from "./components/AdminSettings";
import Integrations from "./components/Integrations";
import CallLogs from "./components/CallLogs";
import EmailInbox from "./components/EmailInbox";
import { cn } from "./lib/utils";

function Sidebar({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const location = useLocation();
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
        <nav className="flex-1 px-4 space-y-2 mt-8 overflow-y-auto">
          <Link to="/" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <Activity className={cn("w-5 h-5", isActive("/") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/") ? "text-ink" : "text-slate-500")}>Dashboard</span>
          </Link>
          <Link to="/logs" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/logs") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <History className={cn("w-5 h-5", isActive("/logs") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/logs") ? "text-ink" : "text-slate-500")}>Call Logs</span>
          </Link>
          <Link to="/inbox" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/inbox") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <Mail className={cn("w-5 h-5", isActive("/inbox") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/inbox") ? "text-ink" : "text-slate-500")}>Email Inbox</span>
          </Link>
          <Link to="/outbound" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/outbound") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <PhoneOutgoing className={cn("w-5 h-5", isActive("/outbound") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/outbound") ? "text-ink" : "text-slate-500")}>Outbound</span>
          </Link>
          <Link to="/appointments" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/appointments") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <Calendar className={cn("w-5 h-5", isActive("/appointments") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/appointments") ? "text-ink" : "text-slate-500")}>Appointments</span>
          </Link>
          <Link to="/train" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/train") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <MessageSquare className={cn("w-5 h-5", isActive("/train") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/train") ? "text-ink" : "text-slate-500")}>AI Training</span>
          </Link>
          <Link to="/agents" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/agents") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <Users className={cn("w-5 h-5", isActive("/agents") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/agents") ? "text-ink" : "text-slate-500")}>Agents</span>
          </Link>
          <Link to="/integrations" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 transition-all group", isActive("/integrations") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <PlugZap className={cn("w-5 h-5", isActive("/integrations") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/integrations") ? "text-ink" : "text-slate-500")}>Integrations</span>
          </Link>
          
          <div className="pt-8 border-t-2 border-slate-100 mt-8 px-4">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Management</span>
          </div>
          <Link to="/admin" onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 border-2 mt-4 transition-all group", isActive("/admin") ? "bg-brand border-ink shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-x-1 -translate-y-1" : "border-transparent hover:bg-slate-50")}>
            <ServerCog className={cn("w-5 h-5 font-bold", isActive("/admin") ? "text-ink" : "text-slate-400")} />
            <span className={cn("font-bold text-sm uppercase tracking-wider", isActive("/admin") ? "text-ink" : "text-slate-500")}>Settings</span>
          </Link>
        </nav>
        <div className="p-6 border-t-2 border-ink bg-slate-50 text-[10px] font-black text-ink uppercase tracking-widest flex justify-between">
          <span>Version 1.0</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Live</span>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <ErrorBoundary>
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

           <div className="flex-1 relative overflow-hidden">
              {/* Dynamic Background Element */}
              <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-brand/5 blur-[120px] rounded-full pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-1/4 h-1/4 bg-brand/10 blur-[100px] rounded-full pointer-events-none" />

              <div className="absolute inset-0 overflow-y-auto p-4 md:p-12 h-full z-10 transition-all">
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
      </ErrorBoundary>
    </BrowserRouter>
  );
}
