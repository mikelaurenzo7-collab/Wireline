import React, { useState } from 'react';
import { LayoutGrid, RefreshCw, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { LiveMonitor } from '../components/CommandCenter/LiveMonitor';
import { ActionFeed } from '../components/CommandCenter/ActionFeed';
import PageTransition from '../components/layout/PageTransition';

export default function CommandCenter() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Mock data for demonstration - in production this would come from a real-time subscription (Supabase)
  const [calls] = useState([
    { id: '1', customer_number: '+1 (555) 012-3456', sentiment_label: 'Live · Active', urgency: 3, status: 'active' as const },
    { id: '2', customer_number: '+1 (555) 987-6543', sentiment_label: '🚨 Escalation Risk: Anger detected', urgency: 9, status: 'escalated' as const },
  ]);

  const [actions] = useState([
    { id: 'a1', type: 'send_email' as const, priority: 'high' as const, status: 'completed' as const, description: 'Follow-up proposal to +1 (555) 012-3456', created_at: new Date().toISOString() },
    { id: 'a2', type: 'schedule_calendar' as const, priority: 'medium' as const, status: 'pending' as const, description: 'Discovery call with Michael L.', created_at: new Date().toISOString() },
    { id: 'a3', type: 'update_crm_lead' as const, priority: 'low' as const, status: 'completed' as const, description: 'Sync lead status to Salesforce', created_at: new Date().toISOString() },
  ]);

  const refresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <PageTransition>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <LayoutGrid className="w-8 h-8 text-indigo-500" />
              Omnichannel Command Center
            </h1>
            <p className="text-zinc-500 mt-1">Unified real-time visibility across your entire fleet.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-400">Security: SOC 2 Compliant</span>
            </div>
            <button 
              onClick={refresh}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw className={clsx("w-5 h-5 text-zinc-400", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Monitor (2/3 width) */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm">
              <LiveMonitor calls={calls} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 mb-4">Sentiment Distribution</h3>
                <div className="h-48 flex items-center justify-center border border-dashed border-zinc-800 rounded-2xl italic text-zinc-700">
                  Sentiment analytics visualization here...
                </div>
              </div>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 mb-4">Volume Overview</h3>
                <div className="h-48 flex items-center justify-center border border-dashed border-zinc-800 rounded-2xl italic text-zinc-700">
                  Call volume chart here...
                </div>
              </div>
            </div>
          </div>

          {/* Action Sidebar (1/3 width) */}
          <div className="lg:col-span-1">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm h-full sticky top-8">
              <ActionFeed actions={actions} />
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
