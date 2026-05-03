import { Calendar as CalendarIcon, Clock, User, Wrench, Loader2, CheckCircle2, Terminal, Shield, Target, Zap, Activity, Signal, Box } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

export default function AppointmentsView() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/appointments')
      .then(res => res.json())
      .then(data => {
        setAppointments(data.appointments || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch appointments:", err);
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide flex flex-col space-y-5 md:space-y-6 max-w-[1700px] mx-auto w-full">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
               <Box className="w-3 h-3" /> ARCHIVE_ACTIVE
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Shield className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">COMMITMENT_VERIFIED: LEVEL_1</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
            TACTICAL<br />COMMITMENTS
          </h1>
          <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed italic underline decoration-brand decoration-4 underline-offset-[-2px]">
            Execution schedules and verified service commitments autonomously secured via active fleet signal operations.
          </p>
        </div>
        
        <div className="hidden lg:flex flex-col items-end gap-3 max-w-xs text-right">
           <Zap className="w-10 h-10 text-brand fill-ink mb-4" />
           <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] leading-relaxed italic">
             ALL_DATA_THREADS_ARE_REAL_TIME_SYNCED_WITH_CARRIER_LOGISTICS_NETWORK.
           </p>
        </div>
      </header>

      <div className="bg-white brutal-border border-4 !p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-700">
        <div className="p-8 md:p-12 border-b-8 border-ink flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-zinc-950 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none group-hover:scale-110 transition-transform">
             <Signal className="w-48 h-48 text-brand" />
          </div>
          <div className="flex items-center gap-6 relative z-10">
            <CalendarIcon className="w-10 h-10 text-brand" />
            <div>
               <h2 className="text-3xl font-black uppercase tracking-tighter font-display italic leading-none">DEPLOYMENT_SCHEDULE</h2>
               <p className="text-[10px] font-black text-brand uppercase tracking-[0.4em] italic mt-3">Verified Operational Windows</p>
            </div>
          </div>
          {isLoading && <Loader2 className="w-10 h-10 animate-spin text-brand relative z-10" />}
        </div>

        <div className="bg-paper flex flex-col min-h-[600px]">
          <AnimatePresence mode="popLayout">
            {appointments.length === 0 && !isLoading ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col items-center justify-center p-24 text-center space-y-10"
              >
                <div className="w-32 h-32 md:w-48 md:h-48 bg-white brutal-border border-8 flex items-center justify-center group hover:rotate-6 transition-transform">
                  <CalendarIcon className="w-16 h-16 md:w-24 md:h-24 text-zinc-100 group-hover:text-brand transition-colors" />
                </div>
                <div className="space-y-6">
                   <h3 className="text-4xl font-black text-ink uppercase tracking-tighter font-display italic leading-none">ZERO_COMMITMENTS</h3>
                   <p className="max-w-md font-bold text-muted uppercase tracking-[0.4em] text-sm leading-loose italic mx-auto underline decoration-brand decoration-4 underline-offset-[-2px]">
                      AWAITING_TACTICAL_SIGNAL_THREADS_SYNCHRONIZATION_FROM_ACTIVE_FLEET_UNITS.
                   </p>
                </div>
              </motion.div>
            ) : (
              <div className="divide-y-8 divide-ink">
                {appointments.map((appt, idx) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={appt.id || idx} 
                    className="p-4 md:p-5 hover:bg-white transition-all flex flex-col xl:flex-row items-start xl:items-center justify-between gap-12 group last:border-b-0"
                  >
                    
                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-12 w-full">
                      <div className="space-y-6">
                        <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic mb-2">COUNTERPARTY_ID</h3>
                        <div className="flex items-center gap-6 font-black text-ink text-3xl md:text-5xl font-display uppercase italic leading-[0.8] tracking-tighter truncate group-hover:translate-x-4 transition-transform">
                          <div className="w-16 h-16 brutal-border border-4 bg-white flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-ink transition-all group-hover:shadow-none translate-x-[-4px] translate-y-[-4px] group-hover:translate-x-0 group-hover:translate-y-0">
                            <User className="w-8 h-8" />
                          </div>
                          <span className="truncate">{appt.customer_name}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-6 lg:pl-10 lg:border-l-4 lg:border-ink/5">
                        <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic mb-2">OPERATIONAL_SCOPE</h3>
                        <div className="flex items-center gap-4 font-black text-ink text-xl md:text-2xl font-display uppercase italic leading-none bg-brand py-4 px-8 brutal-border border-4 w-max max-w-full">
                          <Wrench className="w-6 h-6 shrink-0" />
                          <span className="truncate">{appt.service_type}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-10 items-start md:items-center bg-zinc-950 text-white p-8 md:p-10 brutal-border border-4 shrink-0 transition-all w-full xl:w-auto relative overflow-hidden group/card shadow-none">
                      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover/card:scale-150 transition-transform">
                         <Target className="w-32 h-32 text-brand" />
                      </div>
                      <div className="border-b-4 md:border-b-0 md:border-r-4 border-white/10 pb-6 md:pb-0 md:pr-10 w-full md:w-auto">
                        <h3 className="text-[10px] font-black text-brand uppercase tracking-[0.4em] mb-4 font-display italic leading-none">DEPLOYMENT</h3>
                        <div className="flex items-center gap-4 font-black text-2xl md:text-4xl font-display italic leading-none tracking-tighter">
                          <CalendarIcon className="w-6 h-6 text-brand" />
                          {appt.date}
                        </div>
                      </div>
                      <div className="w-full md:w-auto">
                        <h3 className="text-[10px] font-black text-brand uppercase tracking-[0.4em] mb-4 font-display italic leading-none">SYNC_WINDOW</h3>
                        <div className="flex items-center gap-4 font-black text-2xl md:text-4xl font-display italic leading-none tracking-tighter">
                          <Clock className="w-6 h-6 text-brand" />
                          {appt.time}
                        </div>
                      </div>
                    </div>
                    
                    <div className="shrink-0 w-full xl:w-auto flex items-center xl:border-l-4 xl:border-ink/5 xl:pl-10">
                       <div className="flex items-center gap-4 font-black text-emerald-500 text-[10px] uppercase tracking-[0.4em] italic bg-emerald-50 p-6 brutal-border border-2 shadow-none w-full xl:w-auto justify-center">
                          <CheckCircle2 className="w-6 h-6 animate-pulse" />
                          {appt.status.toUpperCase()}_SIGNAL_VERIFIED
                       </div>
                    </div>

                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="p-10 bg-zinc-950 text-white text-center border-t-8 border-ink">
           <p className="text-[10px] font-black uppercase tracking-[1em] italic opacity-40">-- END OF DEPLOYMENT LOG --</p>
        </div>
      </div>
    </div>
  );
}
