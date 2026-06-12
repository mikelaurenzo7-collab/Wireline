/**
 * GET /api/carplay/session-context
 * 
 * Returns lightweight context for CarPlay widget and voice mode.
 * Optimized for quick loads on cellular.
 * 
 * Integrates with existing agent and pipeline data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

import type { CarPlaySession, CarPlayWidgetContext } from '@/packages/shared/src/carplay/types';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // TODO: Fetch real data from DB / agent service
    const context: CarPlayWidgetContext = {
      connectedAgents: 3,
      quickActions: [
        { id: 'talk-sdr', label: 'Talk to SDR Agent', voiceCommand: 'Talk to my SDR agent' },
        { id: 'pipeline', label: 'Check Pipeline', voiceCommand: 'What\'s in my pipeline' },
        { id: 'schedule', label: 'Schedule Demo', voiceCommand: 'Schedule a demo call' },
      ],
    };

    return NextResponse.json(context);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load context' }, { status: 500 });
    }
}
