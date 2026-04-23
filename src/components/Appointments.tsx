import { Calendar as CalendarIcon, Clock, User, Wrench, Loader2, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

export default function AppointmentsView() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/appointments')
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
    <div className="flex flex-col min-h-full bg-white space-y-6 md:space-y-8 pb-32 max-w-7xl mx-auto w-full p-4 md:p-8 lg:p-10">
      <header className="border-b-8 border-ink pb-6 md:pb-8 relative flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
             <span className="bg-brand text-ink text-[8px] md:text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic font-display">Logistics Archive</span>
             <div className="flex items-center gap-1.5 px-2 py-0.5 bg-ink text-brand brutal-border shadow-none">
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span className="text-[8px] font-black uppercase tracking-tighter italic">Verified Signals</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none block">
            Confirmed Commitments
          </h1>
        </div>
        <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[9px] md:text-[10px] max-w-xs leading-relaxed lg:text-right">
           Execution schedules and verified service commitments secured via autonomous fleet operations.
        </p>
      </header>

      <div className="bg-white brutal-border !p-0 overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="p-4 md:p-6 border-b-4 border-ink flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-950 text-white">
          <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-4 font-display italic">
            <CalendarIcon className="w-5 h-5 text-brand" />
            Execution Schedule
          </h2>
          {isLoading && <Loader2 className="w-5 h-5 animate-spin text-brand" />}
        </div>

        {appointments.length === 0 && !isLoading ? (
          <div className="p-16 md:p-24 text-center text-slate-400">
            <div className="w-20 h-20 bg-brand brutal-border flex items-center justify-center mx-auto mb-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <CalendarIcon className="w-10 h-10 text-ink" />
            </div>
            <h3 className="text-xl font-black text-ink uppercase font-display italic">No commitments identified</h3>
            <p className="mt-4 font-bold uppercase tracking-widest text-[9px]">Awaiting tactical fleet signal synchronization.</p>
          </div>
        ) : (
          <div className="divide-y-4 divide-ink">
            {appointments.map((appt, idx) => (
              <div key={idx} className="p-6 md:p-8 hover:bg-brand/5 transition-all flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 md:gap-8 group">
                
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10 w-full">
                  <div>
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Counterparty Identity</h3>
                    <div className="flex items-center gap-3 font-black text-ink text-xl md:text-2xl font-display uppercase italic leading-none truncate overflow-hidden max-w-full">
                      <div className="w-8 h-8 brutal-border bg-white flex items-center justify-center shrink-0 group-hover:bg-brand transition-colors">
                        <User className="w-4 h-4 text-ink" />
                      </div>
                      <span className="truncate">{appt.customer_name}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">Tactical Scope</h3>
                    <div className="flex items-center gap-2 font-black text-ink text-xs md:text-lg font-display uppercase italic leading-none bg-brand py-2.5 px-4 brutal-border shadow-none w-max max-w-full">
                      <Wrench className="w-4 h-4 shrink-0" />
                      <span className="truncate">{appt.service_type}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-8 items-start md:items-center bg-zinc-950 text-white px-6 py-5 brutal-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] shrink-0 group-hover:bg-ink transition-all w-full xl:w-auto">
                  <div className="border-b-2 md:border-b-0 md:border-r-2 border-white/20 pb-2 md:pb-0 md:pr-8 w-full md:w-auto">
                    <h3 className="text-[8px] font-black text-brand uppercase tracking-[0.2em] mb-1 font-sans italic">DEPLOYMENT DATE</h3>
                    <div className="flex items-center gap-2 font-black text-lg md:text-xl font-display italic leading-none">
                      <CalendarIcon className="w-4 h-4 text-brand" />
                      {appt.date}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[8px] font-black text-brand uppercase tracking-[0.2em] mb-1 font-sans italic">SYNC WINDOW</h3>
                    <div className="flex items-center gap-2 font-black text-lg md:text-xl font-display italic leading-none">
                      <Clock className="w-4 h-4 text-brand" />
                      {appt.time}
                    </div>
                  </div>
                </div>
                
                <div className="shrink-0 w-full xl:w-auto flex items-center pr-0 xl:pr-4">
                   <div className="flex items-center gap-2 font-black text-emerald-500 text-[9px] uppercase tracking-widest bg-emerald-50 px-4 py-2 brutal-border shadow-none">
                      <CheckCircle2 className="w-4 h-4 animate-pulse" />
                      {appt.status.toUpperCase()} SIGNAL VERIFIED
                   </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
