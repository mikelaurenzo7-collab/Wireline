// app/api/director/route.ts
// Next.js API Route for Wireline Director chat (Vercel)
// This is the main endpoint your frontend calls.

import { NextRequest } from 'next/server';
import { buildDirectorPrompt, BuildDirectorPromptInput } from '@/lib/directorContext';
import { callDirectorGrok } from '@/lib/grokClient';

// Optional: Add your auth middleware here
// import { requireAuth } from '@/lib/auth';

export const runtime = 'edge'; // Best for streaming on Vercel

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      clientId, 
      message, 
      history = [],
      // You can pass pre-fetched context from frontend if needed
    } = body;

    if (!clientId || !message) {
      return new Response(JSON.stringify({ error: 'clientId and message are required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Fetch live data for THIS client only (multi-tenant safety)
    // Replace these with your actual database / service calls
    const clientData = await getClientData(clientId);
    const fleet = await getFleetForClient(clientId);
    const stats = await getRecentStats(clientId);
    const recentActivity = await getRecentActivitySummary(clientId);

    // 2. Build the full tailored prompt
    const input: BuildDirectorPromptInput = {
      clientId,
      fleet,
      stats,
      business: clientData?.businessContext,
      recentActivitySummary: recentActivity,
    };

    const fullSystemPrompt = await buildDirectorPrompt(input);

    // 3. Call Grok 4.3 with streaming
    const stream = await callDirectorGrok({
      systemPrompt: fullSystemPrompt,
      userMessage: message,
      history: history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content,
      })),
      temperature: 0.45,
      maxTokens: 6000,
    });

    // 4. Stream the response back to the frontend
    // The frontend can use Vercel AI SDK or EventSource / fetch streaming
    return new Response(stream.toReadableStream(), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Director API error:', error);
    
    // Graceful fallback message
    return new Response(
      JSON.stringify({ 
        error: 'Director is temporarily unavailable. Please try again in a moment.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// ============================================
// Placeholder data fetchers — REPLACE WITH YOUR REAL IMPLEMENTATION
// ============================================

async function getClientData(clientId: string) {
  // TODO: Replace with your DB query (Prisma, Supabase, etc.)
  // Example:
  // return await prisma.client.findUnique({ where: { id: clientId } });
  
  return {
    businessContext: {
      industry: "B2B SaaS",
      icp: "Series B-C tech companies, 50-500 employees",
      stage: "growth-stage",
      goals: ["Increase demo bookings by 40%", "Reduce SDR ramp time"],
      bottlenecks: ["Inconsistent qualification", "Slow follow-up on hot leads"],
      riskTolerance: "medium" as const,
      brandVoice: "Professional, direct, helpful",
      keyMetrics: ["Demo booking rate", "Close rate", "CAC"],
    }
  };
}

async function getFleetForClient(clientId: string) {
  // TODO: Replace with your actual fleet query
  return [
    // Example structure — match your DirectorFleetAgent interface
    // { id: "...", name: "Alex", role: "SDR", archetype: "hunter", status: "active", performanceSummary: "Strong on discovery, weaker on budget questions" }
  ];
}

async function getRecentStats(clientId: string) {
  // TODO: Replace with real metrics
  return {
    calls7d: 87,
    bookings7d: 14,
    openTasks: 3,
    conversionRate: 16.1,
  };
}

async function getRecentActivitySummary(clientId: string) {
  // TODO: Summarize last 7-14 days of calls, leads, approvals, etc.
  return "Last week: 3 new leads from outbound campaign. Rachel (Closer) closed 2 deals. One compliance flag on call #1243 (resolved).";
}
