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
    <div className="h-full overflow-y-auto p-12 bg-white flex flex-col space-y-12 pb-24">
      <header className="border-b-4 border-ink pb-12">
        <div className="flex items-center gap-2 mb-4">
           <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic">Execution Log</span>
        </div>
        <h1 className="text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none">
          Operational Slate
        </h1>
        <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-xs mt-3">Scheduled deployment protocol for autonomous service commitments.</p>
      </header>

      <div className="bg-white brutal-border !p-0 overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="p-8 border-b-4 border-ink flex justify-between items-center bg-zinc-950 text-white">
          <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-4 font-display italic">
            <CalendarIcon className="w-6 h-6 text-brand" />
            Confirmed Deployments
          </h2>
          {isLoading && <Loader2 className="w-6 h-6 animate-spin text-brand" />}
        </div>

        {appointments.length === 0 && !isLoading ? (
          <div className="p-32 text-center text-slate-400">
            <div className="w-24 h-24 bg-brand brutal-border flex items-center justify-center mx-auto mb-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <CalendarIcon className="w-12 h-12 text-ink" />
            </div>
            <h3 className="text-2xl font-black text-ink uppercase font-display italic">No Deployments Scheduled</h3>
            <p className="mt-4 font-bold uppercase tracking-widest text-[10px]">When a Specialist secures a booking, it will manifest here.</p>
          </div>
        ) : (
          <div className="divide-y-4 divide-ink">
            {appointments.map((appt, idx) => (
              <div key={idx} className="p-10 hover:bg-brand/5 transition-all flex flex-col xl:flex-row items-center justify-between gap-12 group">
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-10 w-full">
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Target Identity</h3>
                    <div className="flex items-center gap-4 font-black text-ink text-3xl font-display uppercase italic italic leading-none">
                      <div className="w-10 h-10 brutal-border bg-white flex items-center justify-center group-hover:bg-brand transition-colors">
                        <User className="w-5 h-5 text-ink" />
                      </div>
                      {appt.customer_name}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Service Protocol</h3>
                    <div className="flex items-center gap-3 font-black text-ink text-xl font-display uppercase italic leading-none bg-brand py-4 px-6 brutal-border shadow-none w-max">
                      <Wrench className="w-5 h-5" />
                      {appt.service_type}
                    </div>
                  </div>
                </div>

                <div className="flex gap-12 items-center bg-zinc-950 text-white px-10 py-8 brutal-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] shrink-0 group-hover:bg-ink group-hover:shadow-[6px_6px_0px_0px_rgba(250,204,21,1)] transition-all">
                  <div className="border-r-2 border-white/20 pr-12">
                    <h3 className="text-[9px] font-black text-brand uppercase tracking-[0.2em] mb-2 font-sans italic">DEPLOY DATE</h3>
                    <div className="flex items-center gap-3 font-black text-2xl font-display italic leading-none">
                      <CalendarIcon className="w-5 h-5 text-brand" />
                      {appt.date}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[9px] font-black text-brand uppercase tracking-[0.2em] mb-2 font-sans italic">INITIATE TIME</h3>
                    <div className="flex items-center gap-3 font-black text-2xl font-display italic leading-none">
                      <Clock className="w-5 h-5 text-brand" />
                      {appt.time}
                    </div>
                  </div>
                </div>
                
                <div className="shrink-0 flex items-center pr-4">
                   <div className="flex items-center gap-3 font-black text-emerald-500 text-xs uppercase tracking-widest bg-emerald-50 px-6 py-3 brutal-border shadow-none">
                      <CheckCircle2 className="w-5 h-5 animate-pulse" />
                      VERIFIED {appt.status}
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
