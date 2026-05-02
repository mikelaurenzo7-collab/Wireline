import React, { useState, useEffect } from "react";
import { Mail, CheckCircle2, AlertCircle, Plus, Trash2, Webhook, Loader2, Bot, ChevronDown, Activity, Terminal, Shield, Zap, Target, Signal, Globe, Cpu, RotateCw, Command, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";

export default function Integrations() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = async () => {
    try {
      const res = await authFetch("/api/emails/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await authFetch("/api/agents");
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchAccounts(), fetchAgents()]);
      setLoading(false);
    };
    init();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchAccounts();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectGmail = async () => {
    try {
      const res = await authFetch('/api/oauth/google/url');
      const { url } = await res.json();
      
      const authWindow = window.open(
        url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
         alert('PROTOCOL_ERROR: BLOCK_POPUP_DETECTED. PERMISSION_REENTRY_REQUIRED.');
      }
    } catch (e) {
      console.error(e);
      alert('INITIALIZATION_FAILURE. CHECK_OAUTH_HEURISTICS.');
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('TERMINATE_DATA_THREAD: ARE_YOU_SURE?')) return;
    try {
      await authFetch(`/api/emails/accounts/${id}`, { method: 'DELETE' });
      fetchAccounts();
    } catch (e) {
      console.error(e);
    }
  };

  const updateAccountAgent = async (accountId: string, agentId: string) => {
    try {
      await authFetch(`/api/emails/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId === 'none' ? null : agentId })
      });
      fetchAccounts();
    } catch (e) {
      console.error(e);
    }
  };

  const syncAll = async () => {
     try {
       await authFetch('/api/emails/sync', { method: 'POST' });
       alert("GLOBAL_FLEET_SYNC_PROTOCOL_INITIATED.");
     } catch(e) {}
  };

  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="flex flex-col space-y-12 md:space-y-20 pb-40 max-w-[1700px] mx-auto w-full p-8 md:p-12 lg:p-16">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
               <Globe className="w-3 h-3" /> RELAY_STATUS: SYNCED
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Command className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">PROTOCOL: OMNICHANNEL_v4</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
            NODAL<br />INTEGRATIONS
          </h1>
          <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed italic underline decoration-brand decoration-4 underline-offset-[-2px]">
            Bridge external data streams and carrier protocols into your tactical fleet units for unified mission command.
          </p>
        </div>
        
        <div className="flex items-center gap-6 w-full lg:w-auto">
          <button 
            onClick={syncAll} 
            className="brutal-btn flex items-center justify-center gap-4 !h-20 !px-12 bg-zinc-950 !text-brand w-full lg:w-auto uppercase tracking-[0.3em] font-black italic hover:shadow-none translate-x-[-4px] translate-y-[-4px] hover:translate-x-0 hover:translate-y-0 active:translate-x-1 active:translate-y-1 transition-all border-4"
          >
            <RotateCw className="w-6 h-6 animate-spin" style={{ animationDuration: '3s' }} />
            <span className="text-sm">GLOBAL_SYNC</span>
          </button>
        </div>
      </header>

      <div className="bg-white brutal-border border-8 !p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-700">
        <div className="p-10 md:p-14 border-b-8 border-ink flex flex-col md:flex-row justify-between items-center bg-brand gap-10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none group-hover:scale-110 transition-transform">
             <Mail className="w-48 h-48 text-zinc-950" />
          </div>
          <div className="text-center md:text-left relative z-10">
            <h2 className="text-3xl md:text-5xl font-black text-ink flex flex-col md:flex-row items-center gap-6 uppercase font-display italic leading-none">
              <Mail className="w-10 h-10 md:w-16 md:h-16 shrink-0" />
              EMAIL_CARRIER_LINK
            </h2>
            <p className="text-ink font-black text-[10px] md:text-xs uppercase tracking-[0.3em] mt-6 opacity-60 max-w-xl italic">ESTABLISH_AUTH_BRIDGE_WITH_GOOGLE_WORKSPACE_FOR_NODAL_EMAIL_EXTRACTION_AND_RELAY_INJECTION.</p>
          </div>
          <button 
            onClick={handleConnectGmail}
            className="w-full md:w-auto brutal-btn !bg-white !text-ink !px-12 !py-6 hover:!bg-zinc-950 hover:!text-brand transition-all flex items-center justify-center gap-6 hover:shadow-none border-4"
          >
            <Plus className="w-8 h-8" />
            <span className="font-black uppercase tracking-[0.3em] text-sm italic">LINK_EXTERNAL_ACCOUNT</span>
          </button>
        </div>
        
        <div className="bg-paper flex flex-col min-h-[400px]">
          {loading ? (
            <div className="p-40 flex flex-col items-center gap-8 justify-center">
              <Loader2 className="w-20 h-20 animate-spin text-brand" />
              <span className="text-[12px] font-black uppercase tracking-[0.8em] text-ink italic animate-pulse">EXTRACTING_INTEGRATION_MAP...</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="p-32 text-center flex flex-col items-center justify-center space-y-12">
              <div className="w-32 h-32 md:w-48 md:h-48 bg-white brutal-border border-8 flex items-center justify-center group hover:-rotate-6 transition-transform">
                <Shield className="w-16 h-16 md:w-24 md:h-24 text-zinc-100 group-hover:text-brand transition-colors" />
              </div>
              <div className="space-y-6">
                 <h3 className="text-4xl md:text-6xl font-black text-ink uppercase font-display italic tracking-tighter leading-none">ZERO_LINKS_DETECTED</h3>
                 <p className="max-w-md font-bold text-muted uppercase tracking-[0.4em] text-xs md:text-sm leading-loose italic mx-auto underline decoration-brand decoration-4 underline-offset-[-2px]">
                   ESTABLISH_EXTERNAL_COMMUNICATION_CHANNELS_TO_ENABLE_FLEET_UNIT_MISSION_EXECUTION.
                 </p>
              </div>
            </div>
          ) : (
            <div className="divide-y-8 divide-ink">
              {accounts.map(acc => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={acc.id} 
                  className="p-10 md:p-14 flex flex-col xl:flex-row items-center justify-between gap-12 group hover:bg-white transition-all border-b-8 border-ink last:border-b-0"
                >
                  <div className="flex items-center gap-10">
                    <div className="w-20 h-20 md:w-24 md:h-24 bg-zinc-950 brutal-border border-4 flex items-center justify-center group-hover:shadow-none transition-all shrink-0">
                       <Mail className="w-10 h-10 md:w-12 md:h-12 text-brand" />
                    </div>
                    <div className="space-y-4">
                      <div className="font-black text-ink text-3xl md:text-5xl font-display uppercase tracking-tighter italic border-b-8 border-transparent group-hover:border-brand transition-all underline decoration-zinc-100 decoration-8 underline-offset-[-4px]">{acc.email_address}</div>
                      <div className="flex flex-wrap items-center gap-6">
                        <span className="px-4 py-1 bg-ink text-brand text-[10px] font-black uppercase tracking-[0.4em] brutal-border border-2 shadow-none italic flex items-center gap-3">
                          <CheckCircle2 className="w-3.5 h-3.5" /> SYNCHRONIZED
                        </span>
                        <span className="text-[10px] text-muted font-black uppercase tracking-[0.4em] italic font-mono">WORKSPACE_TYPE_G_CORE</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-center gap-10 w-full xl:w-auto">
                     <div className="flex flex-col items-stretch lg:items-end flex-1 lg:flex-none space-y-6">
                        <label className="text-[10px] font-black text-muted uppercase tracking-[0.5em] flex items-center gap-4 italic leading-none ml-1">
                          <Bot className="w-5 h-5 text-brand fill-ink" /> INJECT_ROUTING_UNIT
                        </label>
                        <div className="relative">
                          <select 
                            value={acc.agent_id || "none"}
                            onChange={(e) => updateAccountAgent(acc.id, e.target.value)}
                            className="text-sm font-black bg-white brutal-border border-4 p-6 outline-none focus:bg-brand min-w-[350px] appearance-none cursor-pointer uppercase tracking-[0.2em] hover:shadow-none transition-all italic font-display"
                          >
                             <option value="none">UNASSIGNED_MODE</option>
                             {agents.map(agent => (
                               <option key={agent.id} value={agent.id}>{agent.name.toUpperCase()} (MISSION_READY)</option>
                             ))}
                          </select>
                          <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-ink pointer-events-none" />
                        </div>
                     </div>

                     <button
                        onClick={() => handleDisconnect(acc.id)}
                        className="w-20 h-20 brutal-border border-4 bg-white text-zinc-100 hover:text-white hover:bg-rose-500 flex items-center justify-center transition-all hover:shadow-none translate-y-[-4px] hover:translate-y-0 active:scale-95 group/del"
                        title="TERMINATE_DATA_THREAD"
                     >
                        <Trash2 className="w-8 h-8 group-hover/del:rotate-12 transition-transform" />
                     </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-10 bg-zinc-950 text-white text-center border-t-8 border-ink">
           <p className="text-[10px] font-black uppercase tracking-[1em] italic opacity-40">-- SYSTEMS INTERFACE STABLE --</p>
        </div>
      </div>
      
      {/* Hidden Technical Section */}
      <footer className="pt-24 border-t-8 border-ink border-dashed">
        <button 
          onClick={() => setShowTechnical(!showTechnical)}
          className="text-xs font-black text-muted uppercase tracking-[0.6em] hover:text-ink transition-all flex items-center gap-6 group italic"
        >
          <div className={cn("w-10 h-10 brutal-border border-4 flex items-center justify-center transition-all", showTechnical ? "bg-ink text-brand" : "bg-white text-muted group-hover:bg-brand group-hover:text-ink")}>
            {showTechnical ? <X className="w-5 h-5" /> : <ChevronDown className="w-5 h-5 group-hover:translate-y-1" />}
          </div>
          {showTechnical ? "CLOSE_OPERATIONAL_DEBUG_CONSOLE" : "OPEN_OPERATIONAL_DEBUG_CONSOLE"}
        </button>

        <AnimatePresence>
          {showTechnical && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-12 bg-zinc-950 brutal-border border-8 border-ink p-12 md:p-16 text-white relative overflow-hidden"
            >
               <div className="absolute top-0 right-0 p-16 opacity-10 pointer-events-none">
                  <Terminal className="w-64 h-64 text-brand" />
               </div>
               <div className="relative z-10 space-y-16">
                 <div className="flex items-center gap-8">
                    <div className="w-20 h-20 bg-brand/10 border-4 border-brand/20 flex items-center justify-center brutal-border shadow-none">
                      <Webhook className="w-10 h-10 text-brand" />
                    </div>
                    <div>
                       <h3 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic font-display leading-none">OAUTH_CORE</h3>
                       <p className="text-[11px] text-zinc-500 font-black uppercase tracking-[0.5em] mt-3 italic">API_CALLBACK_HEURISTICS</p>
                    </div>
                 </div>
                 
                 <div className="space-y-10">
                   <p className="text-zinc-400 text-sm font-black uppercase tracking-widest leading-loose max-w-4xl italic border-l-4 border-brand pl-8">
                      ENSURE_THIS_REDIRECT_VECTOR_IS_WHITELISTED_IN_YOUR_GOOGLE_CLOUD_IDENTITY_PLATFORM_CONSOLE_TO_ALLOW_OAUTH_FLOW_COMPLETION.
                   </p>
                   <div className="bg-white/5 p-10 brutal-border border-4 border-white/10 flex flex-col md:flex-row items-center justify-between gap-12 group hover:bg-white/10 transition-all">
                      <div className="space-y-4 flex-1 w-full">
                        <div className="text-[10px] font-black text-brand uppercase tracking-[0.5em] italic flex items-center gap-4">
                           <Signal className="w-4 h-4 animate-pulse" /> RELAY_OAUTH_REENTRY_URL
                        </div>
                        <code className="text-white font-mono text-xl md:text-2xl select-all break-all block shadow-none bg-transparent outline-none">
                          {window.location.origin}/api/oauth/google/callback
                        </code>
                      </div>
                      <div className="h-20 px-10 bg-brand text-ink text-[11px] font-black uppercase tracking-[0.4em] brutal-border border-4 shadow-none italic shrink-0 flex items-center justify-center">
                        WHITELIST_MANDATORY
                      </div>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div className="p-8 bg-white/5 brutal-border border-2 border-white/10">
                       <h4 className="text-[9px] font-black text-brand uppercase tracking-[0.4em] mb-4">TOKEN_ENCRYPTION</h4>
                       <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed">AES-256-GCM ARCHITECTURE ENFORCED ON ALL BEARER TOKENS.</p>
                    </div>
                    <div className="p-8 bg-white/5 brutal-border border-2 border-white/10">
                       <h4 className="text-[9px] font-black text-brand uppercase tracking-[0.4em] mb-4">ROTATION_POLICY</h4>
                       <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed">AUTOMATIC REFRESH TOKEN ROTATION EVERY 3600S.</p>
                    </div>
                    <div className="p-8 bg-white/5 brutal-border border-2 border-white/10">
                       <h4 className="text-[9px] font-black text-brand uppercase tracking-[0.4em] mb-4">SCOPES_GRANTED</h4>
                       <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed">GMAIL.READ, GMAIL.SEND, GMAIL.MODIFY (MINIMAL_SURFACE).</p>
                    </div>
                 </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </footer>
    </div>
  );
}
