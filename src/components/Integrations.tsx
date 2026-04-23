import React, { useState, useEffect } from "react";
import { Mail, CheckCircle2, AlertCircle, Plus, Trash2, Webhook, Loader2, Bot, ChevronDown, Activity } from "lucide-react";
import { cn } from "../lib/utils";

export default function Integrations() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/emails/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
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

    // Listen for OAuth messages from popup
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
      const res = await fetch('/api/oauth/google/url');
      const { url } = await res.json();
      
      const authWindow = window.open(
        url,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
         alert('Please allow popups to connect your Google account.');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to initiate OAuth flow. Check environment variables.');
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await fetch(`/api/emails/accounts/${id}`, { method: 'DELETE' });
      fetchAccounts();
    } catch (e) {
      console.error(e);
    }
  };

  const updateAccountAgent = async (accountId: string, agentId: string) => {
    try {
      await fetch(`/api/emails/accounts/${accountId}`, {
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
       await fetch('/api/emails/sync', { method: 'POST' });
       alert("Global Email Fleet Sync Triggered");
     } catch(e) {}
  };

  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="max-w-7xl mx-auto space-y-8 md:space-y-16 pb-32 p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b-8 border-ink pb-8 md:pb-12 gap-8">
        <div>
          <h1 className="text-4xl md:text-8xl font-black text-ink uppercase tracking-tight font-display mb-4 italic leading-none">
            Integrations
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] md:tracking-[0.4em] text-[8px] md:text-xs">Connect your communication tools and AI specialists</p>
        </div>
        <button onClick={syncAll} className="w-full md:w-auto brutal-btn !bg-zinc-950 !text-brand !py-4 !px-8 flex items-center justify-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_0px_rgba(250,204,21,1)] md:shadow-[6px_6px_0px_0px_rgba(250,204,21,1)]">
          <Activity className="w-5 h-5 animate-pulse" />
          SYNC ALL
        </button>
      </div>

      <div className="brutal-border bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="p-6 md:p-10 border-b-4 border-ink flex flex-col md:flex-row justify-between items-center bg-brand gap-8">
          <div className="text-center md:text-left">
            <h2 className="text-xl md:text-4xl font-black text-ink flex flex-col md:md:flex-row items-center gap-4 md:gap-6 uppercase font-display italic leading-none">
              <Mail className="w-8 h-8 md:w-12 md:h-12" />
              Email Connections
            </h2>
            <p className="text-ink font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.3em] mt-3 opacity-60">Connect your Google Workspace to enable AI email handling</p>
          </div>
          <button 
            onClick={handleConnectGmail}
            className="w-full md:w-auto brutal-btn !bg-white !text-ink !px-8 !py-4 hover:!bg-zinc-950 hover:!text-brand transition-all flex items-center justify-center gap-4"
          >
            <Plus className="w-5 h-5 md:w-6 md:h-6" />
            <span className="font-black uppercase tracking-widest text-xs md:text-sm">Link Account</span>
          </button>
        </div>
        
        {loading ? (
          <div className="p-32 flex justify-center text-ink/10">
            <Loader2 className="w-24 h-24 animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-32 text-center flex flex-col items-center">
            <div className="w-32 h-32 bg-zinc-50 brutal-border border-ink flex items-center justify-center mb-10 shadow-none">
              <Mail className="w-16 h-16 text-slate-200" />
            </div>
            <p className="font-black text-3xl uppercase font-display italic text-ink mb-4">No Accounts Linked</p>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest max-w-sm leading-loose">Connect a Google Workspace account to enable your AI email integrations.</p>
          </div>
        ) : (
          <div className="divide-y-4 divide-ink bg-white">
            {accounts.map(acc => (
              <div key={acc.id} className="p-12 flex flex-col lg:flex-row items-center justify-between gap-12 hover:bg-brand/5 transition-all group">
                <div className="flex items-center gap-10">
                  <div className="w-24 h-24 bg-zinc-950 brutal-border border-ink flex items-center justify-center shadow-[6px_6px_0px_0px_rgba(250,204,21,1)] shrink-0">
                     <Mail className="w-12 h-12 text-brand" />
                  </div>
                  <div>
                    <div className="font-black text-ink text-4xl font-display uppercase tracking-tighter italic border-b-4 border-transparent group-hover:border-brand transition-all">{acc.email_address}</div>
                    <div className="flex items-center gap-6 mt-4">
                      <span className="px-4 py-1 bg-ink text-brand text-[10px] font-black uppercase tracking-widest brutal-border shadow-none italic h-6 flex items-center">CONNECTED</span>
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">WORKSPACE ACCOUNT</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-10 w-full lg:w-auto">
                   <div className="flex flex-col items-start lg:items-end flex-1 lg:flex-none">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 flex items-center gap-3 italic">
                        <Bot className="w-4 h-4 text-brand" /> Assign Routing Agent
                      </label>
                      <select 
                        value={acc.agent_id || "none"}
                        onChange={(e) => updateAccountAgent(acc.id, e.target.value)}
                        className="text-xs font-black bg-zinc-50 brutal-border border-zinc-200 p-5 outline-none focus:bg-brand focus:border-ink min-w-[300px] appearance-none cursor-pointer uppercase tracking-widest shadow-none"
                      >
                         <option value="none">UNASSIGNED</option>
                         {agents.map(agent => (
                           <option key={agent.id} value={agent.id}>{agent.name.toUpperCase()} AGENT</option>
                         ))}
                      </select>
                   </div>

                   <button
                      onClick={() => handleDisconnect(acc.id)}
                      className="w-16 h-16 brutal-border bg-white text-slate-200 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-none translate-y-0 hover:translate-y-1 hover:translate-x-1"
                      title="DISCONNECT ACCOUNT"
                   >
                      <Trash2 className="w-6 h-6" />
                   </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Hidden Technical Section - Founder Only Access */}
      <div className="pt-24 border-t-4 border-ink/5">
        <button 
          onClick={() => setShowTechnical(!showTechnical)}
          className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] hover:text-ink transition-all flex items-center gap-4 group"
        >
          {showTechnical ? <span className="rotate-90">×</span> : <ChevronDown className="w-4 h-4" />}
          {showTechnical ? "CLOSE DEVELOPER SETTINGS" : "DEVELOPER SETTINGS"}
        </button>

        {showTechnical && (
          <div className="mt-10 bg-zinc-950 brutal-border border-ink p-12 text-white animate-in slide-in-from-bottom-6 transition-all overflow-hidden relative shadow-[16px_16px_0px_0px_rgba(0,0,0,1)]">
             <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 blur-[100px] rounded-full" />
             <div className="relative z-10 space-y-10">
               <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-brand/10 border-2 border-brand/20 flex items-center justify-center brutal-border shadow-none">
                    <Webhook className="w-8 h-8 text-brand" />
                  </div>
                  <div>
                     <h3 className="text-4xl font-black uppercase tracking-tight italic font-display">OAuth Settings</h3>
                     <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-2">API Callback Details</p>
                  </div>
               </div>
               
               <div className="space-y-6">
                 <p className="text-slate-400 text-sm font-bold uppercase tracking-tight leading-relaxed max-w-3xl">
                    ENSURE THIS REDIRECT URI IS CONFIGURED IN YOUR GOOGLE CLOUD CONSOLE TO ALLOW AUTHENTICATION TO SUCCEED.
                 </p>
                 <div className="bg-white/5 p-8 brutal-border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8 group">
                    <div className="space-y-2 flex-1">
                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">OAUTH_CALLBACK_REDIRECT</div>
                      <code className="text-brand font-mono text-lg select-all break-all">
                        {window.location.origin}/api/oauth/google/callback
                      </code>
                    </div>
                    <div className="px-6 py-2 bg-brand text-ink text-[10px] font-black uppercase tracking-widest brutal-border shadow-none italic shrink-0">
                      WHITELIST REQUIRED
                    </div>
                 </div>
               </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
