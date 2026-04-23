import { useState, useEffect } from "react";
import { ServerCog, KeyRound, Loader2, ShieldCheck } from "lucide-react";

export default function AdminSettings() {
  const [settings, setSettings] = useState({ vapi_private_key: "", vapi_phone_number_id: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data) {
         setSettings({ 
             vapi_private_key: data.vapi_private_key || "", 
             vapi_phone_number_id: data.vapi_phone_number_id || "" 
         });
      }
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage("");
    try {
        await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
        });
        setSaveMessage("Platform settings saved successfully.");
        setTimeout(() => setSaveMessage(""), 3000);
    } catch (e) {
        setSaveMessage("Error saving settings.");
    }
    setIsSaving(false);
  };

  return (
    <div className="h-full overflow-y-auto p-12 bg-white flex flex-col space-y-12">
      <header className="border-b-4 border-ink pb-12">
        <div className="flex items-center gap-2 mb-4">
           <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic font-sans animate-pulse">RESTRICTED ACCESS</span>
        </div>
        <h1 className="text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none">
          Platform Settings
        </h1>
        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs mt-3">Configure API credentials for phone connection services.</p>
      </header>

      {isLoading ? (
        <div className="flex justify-center p-24 text-center"><Loader2 className="w-16 h-16 animate-spin text-brand" /></div>
      ) : (
        <div className="bg-white brutal-border p-10 max-w-3xl shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-4 text-ink mb-10 border-b-4 border-ink pb-6">
             <ShieldCheck className="w-8 h-8 text-brand" />
             <h2 className="text-2xl font-black uppercase font-display italic">Carrier Configuration</h2>
          </div>
          
          <div className="space-y-10">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 italic">API Private Key</label>
              <input 
                type="password" 
                value={settings.vapi_private_key} 
                onChange={e => setSettings({...settings, vapi_private_key: e.target.value})} 
                className="w-full p-5 brutal-border outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-xs bg-zinc-50 shadow-none font-mono" 
                placeholder="SK_..." 
              />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">Secure key for outbound calling services.</p>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 italic">Phone Number ID</label>
              <input 
                type="text" 
                value={settings.vapi_phone_number_id} 
                onChange={e => setSettings({...settings, vapi_phone_number_id: e.target.value})} 
                className="w-full p-5 brutal-border outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-xs bg-zinc-50 shadow-none font-mono" 
                placeholder="E.G. 1BD8DF4A-..." 
              />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4">Identifier used to route outbound calls.</p>
            </div>
            
            <div className="pt-8 border-t-4 border-ink flex items-center justify-between">
                <button 
                  onClick={saveSettings} 
                  disabled={isSaving}
                  className="brutal-btn !bg-ink !text-brand !py-4 !px-10 flex items-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
                  SAVE SETTINGS
                </button>
                {saveMessage && <span className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em] italic animate-bounce pr-4">{saveMessage}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
