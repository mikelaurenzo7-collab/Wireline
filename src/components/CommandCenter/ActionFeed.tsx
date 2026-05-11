import React from 'react';
import { CheckCircle2, Clock, AlertCircle, Mail, Calendar, UserPlus, ListTodo } from 'lucide-react';
import { clsx } from 'clsx';

interface ActionItem {
  id: string;
  type: 'send_email' | 'schedule_calendar' | 'update_crm_lead' | 'create_internal_task';
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'completed' | 'failed';
  description: string;
  created_at: string;
}

export function ActionFeed({ actions }: { actions: ActionItem[] }) {
  return (
    <div className="flex flex-col space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <ListTodo className="w-5 h-5 text-indigo-400" />
        Autonomous Actions
      </h3>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {actions.length === 0 ? (
          <div className="text-zinc-500 text-sm italic py-8 text-center border border-dashed border-zinc-800 rounded-xl">
            No actions detected yet...
          </div>
        ) : (
          actions.map((action) => (
            <div 
              key={action.id}
              className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "p-2 rounded-lg",
                    action.type === 'send_email' && "bg-blue-500/10 text-blue-400",
                    action.type === 'schedule_calendar' && "bg-purple-500/10 text-purple-400",
                    action.type === 'update_crm_lead' && "bg-orange-500/10 text-orange-400",
                    action.type === 'create_internal_task' && "bg-zinc-500/10 text-zinc-400"
                  )}>
                    {action.type === 'send_email' && <Mail className="w-4 h-4" />}
                    {action.type === 'schedule_calendar' && <Calendar className="w-4 h-4" />}
                    {action.type === 'update_crm_lead' && <UserPlus className="w-4 h-4" />}
                    {action.type === 'create_internal_task' && <ListTodo className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{action.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={clsx(
                        "text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
                        action.priority === 'high' ? "bg-red-500/20 text-red-400" : "bg-zinc-800 text-zinc-500"
                      )}>
                        {action.priority}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(action.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {action.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {action.status === 'pending' && <Clock className="w-4 h-4 text-amber-500 animate-pulse" />}
                  {action.status === 'failed' && <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
