import React from 'react';
import { Activity, ShieldAlert, Zap, Phone } from 'lucide-react';
import { clsx } from 'clsx';

interface LiveCall {
  id: string;
  customer_number: string;
  sentiment_label: string;
  urgency: number; // 0-10
  status: 'active' | 'escalated';
}

export function LiveMonitor({ calls }: { calls: LiveCall[] }) {
  return (
    <div className="flex flex-col space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Activity className="w-5 h-5 text-emerald-400" />
        Live Monitor
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {calls.length === 0 ? (
          <div className="col-span-full py-12 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
            <Zap className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-zinc-600 text-sm">No active calls right now.</p>
          </div>
        ) : (
          calls.map((call) => (
            <div 
              key={call.id}
              className={clsx(
                "relative overflow-hidden p-5 rounded-2xl border transition-all duration-500",
                call.status === 'escalated' 
                  ? "bg-red-500/5 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]" 
                  : "bg-zinc-900/50 border-zinc-800"
              )}
            >
              {/* Pulse effect for escalated calls */}
              {call.status === 'escalated' && (
                <div className="absolute top-0 right-0 p-2">
                  <ShieldAlert className="w-5 h-5 text-red-500 animate-bounce" />
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  call.status === 'escalated' ? "bg-red-500/20" : "bg-emerald-500/20"
                )}>
                  <Phone className={clsx("w-5 h-5", call.status === 'escalated' ? "text-red-400" : "text-emerald-400")} />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-100">{call.customer_number}</p>
                  <p className={clsx(
                    "text-xs font-medium",
                    call.status === 'escalated' ? "text-red-400" : "text-zinc-500"
                  )}>
                    {call.sentiment_label}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] uppercase text-zinc-500 font-bold">Stress Level</span>
                  <span className={clsx(
                    "text-xs font-bold",
                    call.urgency > 7 ? "text-red-400" : "text-zinc-400"
                  )}>
                    {call.urgency}/10
                  </span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className={clsx(
                      "h-full transition-all duration-1000",
                      call.urgency > 7 ? "bg-red-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${call.urgency * 10}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
