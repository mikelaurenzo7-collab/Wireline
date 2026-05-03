import { Calendar as CalendarIcon, Clock, User, Wrench, Loader2, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import PageShell, { Panel } from "./PageShell";

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
    <PageShell
      title="Constellation"
      eyebrow="Operations · Commitments"
      subtitle="Verified service commitments synchronized with the active fleet."
    >
      <Panel
        title="deployment schedule"
        hint="VERIFIED OPERATIONAL WINDOWS"
        icon={CalendarIcon}
        scroll
        flush
        actions={
          isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" /> : (
            <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70 tabular-nums">
              {appointments.length} scheduled
            </span>
          )
        }
      >
        <AnimatePresence mode="popLayout">
          {appointments.length === 0 && !isLoading ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-full flex flex-col items-center justify-center px-8 py-16 text-center gap-4"
            >
              <div className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center text-muted">
                <CalendarIcon className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display italic lowercase text-2xl text-ink leading-tight">no commitments yet</h3>
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70 max-w-sm">
                  Awaiting fleet sync — bookings will surface here once the relay confirms.
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="divide-y divide-white/6">
              {appointments.map((appt, idx) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={appt.id || idx}
                  className="px-4 py-3.5 flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-6 hover:bg-white/3 transition-colors group"
                >
                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-muted/70 mb-1.5">Counterparty</p>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg glass border border-white/10 flex items-center justify-center text-brand shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-display italic text-xl text-ink leading-none truncate">
                          {appt.customer_name}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-muted/70 mb-1.5">Scope</p>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-brand/30 text-ink text-xs max-w-full">
                        <Wrench className="w-3 h-3 text-brand shrink-0" />
                        <span className="truncate">{appt.service_type}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.3em] text-muted/70 mb-1">Date</p>
                      <div className="flex items-center gap-1.5 text-ink text-sm tabular-nums">
                        <CalendarIcon className="w-3 h-3 text-brand" />
                        {appt.date}
                      </div>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.3em] text-muted/70 mb-1">Window</p>
                      <div className="flex items-center gap-1.5 text-ink text-sm tabular-nums">
                        <Clock className="w-3 h-3 text-brand" />
                        {appt.time}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[9px] uppercase tracking-[0.3em]">
                    <CheckCircle2 className="w-3 h-3" />
                    {appt.status}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </Panel>
    </PageShell>
  );
}
