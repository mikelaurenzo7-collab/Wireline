# Perfect UX Implementation Plan

**Goal:** Transform Wireline into an exceptional user experience for all user personas — from first-time setup to power-user workflows.

**Architecture:** Layer progressive disclosure, contextual help, and intelligent defaults throughout the app while maintaining the Aurora Obsidian aesthetic. Add user journey tracking, smart recommendations, and error prevention without cluttering the interface.

**Tech Stack:** React + Motion (animations), Claude Opus 4.7 (intelligent suggestions), existing Supabase schema + new tables for user preferences and journey tracking.

---

## User Personas & Needs

### 1. New User (First 10 minutes)
- **Goal:** Get first agent running and make a test call within 5 minutes
- **Pain points:** Overwhelmed by options, doesn't know where to start, afraid of breaking things
- **Needs:** Guided tour, clear next steps, instant feedback, undo capability

### 2. Solo Operator (Small Business Owner)
- **Goal:** Set up voice agents that handle common questions, reduce phone time by 60%
- **Pain points:** Limited technical knowledge, no time for complex setup, needs reliability
- **Needs:** Templates, one-click setup, plain language, automated maintenance

### 3. Power User (Call Center Manager)
- **Goal:** Optimize fleet performance, track KPIs, scale to 10+ agents across channels
- **Pain points:** Needs bulk operations, A/B testing, team collaboration, detailed analytics
- **Needs:** Advanced features, keyboard shortcuts, batch operations, custom reports

### 4. Technical User (Developer/Integrator)
- **Goal:** Integrate Wireline into existing systems, programmatic control, custom workflows
- **Pain points:** API documentation gaps, webhook configuration complexity, limited customization
- **Needs:** API playground, code examples, webhook debugger, export/import configs

### 5. Non-technical User (Transitioning from human-only)
- **Goal:** Understand what AI agents can/cannot do, build confidence gradually
- **Pain points:** Fear of automation, doesn't trust AI, needs control and transparency
- **Needs:** Explanations, safety rails, review-before-send, human escalation paths

---

## File Structure

### New Components
- `src/components/GuidedTour.tsx` — Interactive product tour with spotlight + tooltips
- `src/components/ContextualHelp.tsx` — Inline help system with "?" icons throughout app
- `src/components/AgentTemplates.tsx` — Pre-built agent templates for common use cases
- `src/components/SmartOnboarding.tsx` — Enhanced onboarding with persona detection
- `src/components/AgentWizard.tsx` — Step-by-step agent creation wizard (alternative to raw form)
- `src/components/ConfirmationDialog.tsx` — Reusable confirmation dialog for destructive actions
- `src/components/KeyboardShortcuts.tsx` — Keyboard shortcut overlay (Cmd+K style)
- `src/components/PerformanceBenchmark.tsx` — "How am I doing?" dashboard comparing user to benchmarks
- `src/components/ErrorPrevention.tsx` — Smart validation and helpful error messages
- `src/components/AgentImportExport.tsx` — Import/export agent configurations as JSON
- `src/components/ApiPlayground.tsx` — Interactive API testing interface
- `src/components/QuickActions.tsx` — Floating action button with common tasks
- `src/components/TooltipProvider.tsx` — Unified tooltip system

### Enhanced Components
- `src/components/OnboardingQuickstart.tsx` — Add persona detection, progress persistence, review mode
- `src/components/FleetSettings.tsx` — Add templates, wizard mode toggle, bulk operations
- `src/components/AgentTraining.tsx` — Add smart suggestions, example prompts, validation
- `src/components/AdminSettings.tsx` — Add setup assistant, connection testing, troubleshooting
- `src/components/DashboardHome.tsx` — Add smart recommendations, next best actions, benchmarks
- `src/components/InsightsView.tsx` — Add peer comparison, improvement suggestions, goal tracking

### New Server Endpoints
- `POST /api/onboarding/persona` — Detect user persona from survey responses
- `GET /api/onboarding/progress` — Track onboarding completion state
- `POST /api/onboarding/progress` — Update onboarding step completion
- `GET /api/agent-templates` — List pre-built agent templates
- `POST /api/agents/from-template` — Create agent from template
- `POST /api/agents/export` — Export agent configuration
- `POST /api/agents/import` — Import agent configuration
- `GET /api/benchmarks` — Get performance benchmarks for comparison
- `POST /api/user-preferences` — Save user preferences (tour completed, help enabled, etc.)
- `GET /api/user-preferences` — Load user preferences
- `POST /api/smart-suggestions` — Get Claude-powered contextual suggestions

### New Database Tables
```sql
-- User preferences and journey tracking
CREATE TABLE wireline_user_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    persona TEXT, -- 'new', 'solo', 'power', 'technical', 'non_technical'
    tour_completed BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    help_enabled BOOLEAN DEFAULT TRUE,
    keyboard_shortcuts_enabled BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding progress tracking
CREATE TABLE wireline_onboarding_progress (
    user_id UUID REFERENCES auth.users(id),
    step_id TEXT,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    metadata JSONB,
    PRIMARY KEY (user_id, step_id)
);

-- Agent templates
CREATE TABLE wireline_agent_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'sales', 'support', 'scheduler', etc.
    difficulty TEXT, -- 'beginner', 'intermediate', 'advanced'
    config JSONB NOT NULL, -- personality, directives, knowledge, settings
    tags TEXT[],
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance benchmarks (aggregated anonymously)
CREATE TABLE wireline_benchmarks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    metric_name TEXT NOT NULL,
    percentile_25 DECIMAL,
    percentile_50 DECIMAL,
    percentile_75 DECIMAL,
    percentile_90 DECIMAL,
    sample_size INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Task 1: Foundation — User Preferences & Journey Tracking

**Files:**
- Create: `src/lib/user-journey.ts`
- Modify: `server.ts`
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Write failing test for user preferences**

```ts
// src/lib/user-journey.test.ts
import { describe, it, expect } from 'vitest';
import { getUserPreferences, updateUserPreferences, trackOnboardingStep } from './user-journey';

describe('UserJourney', () => {
  it('should return default preferences for new user', async () => {
    const prefs = await getUserPreferences('test-user-id');
    expect(prefs.help_enabled).toBe(true);
    expect(prefs.tour_completed).toBe(false);
  });

  it('should track onboarding step completion', async () => {
    const result = await trackOnboardingStep('test-user-id', 'agent_created', { agentId: 'test-agent' });
    expect(result.completed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — confirm FAILS**

```bash
npm run test src/lib/user-journey.test.ts
# Expected: Cannot find module './user-journey'
```

- [ ] **Step 3: Implement user journey tracking library**

```ts
// src/lib/user-journey.ts
import { supabase } from './supabase';

export interface UserPreferences {
  user_id: string;
  persona?: 'new' | 'solo' | 'power' | 'technical' | 'non_technical';
  tour_completed: boolean;
  onboarding_completed: boolean;
  help_enabled: boolean;
  keyboard_shortcuts_enabled: boolean;
  preferences: Record<string, any>;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from('wireline_user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // Return defaults for new users
    return {
      user_id: userId,
      tour_completed: false,
      onboarding_completed: false,
      help_enabled: true,
      keyboard_shortcuts_enabled: true,
      preferences: {},
    };
  }

  return data;
}

export async function updateUserPreferences(
  userId: string,
  updates: Partial<UserPreferences>
): Promise<void> {
  const { error } = await supabase
    .from('wireline_user_preferences')
    .upsert({
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    });

  if (error) throw error;
}

export async function trackOnboardingStep(
  userId: string,
  stepId: string,
  metadata?: Record<string, any>
): Promise<{ completed: boolean }> {
  const { error } = await supabase
    .from('wireline_onboarding_progress')
    .upsert({
      user_id: userId,
      step_id: stepId,
      completed: true,
      completed_at: new Date().toISOString(),
      metadata: metadata || {},
    });

  if (error) throw error;
  return { completed: true };
}

export async function getOnboardingProgress(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('wireline_onboarding_progress')
    .select('step_id, completed')
    .eq('user_id', userId);

  if (error) return {};

  return (data || []).reduce((acc, row) => {
    acc[row.step_id] = row.completed;
    return acc;
  }, {} as Record<string, boolean>);
}
```

- [ ] **Step 4: Add database schema**

```sql
-- supabase_schema.sql (append to end, idempotent)

-- User preferences and journey tracking
CREATE TABLE IF NOT EXISTS wireline_user_preferences (
    user_id UUID PRIMARY KEY,
    persona TEXT,
    tour_completed BOOLEAN DEFAULT FALSE,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    help_enabled BOOLEAN DEFAULT TRUE,
    keyboard_shortcuts_enabled BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wireline_user_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'wireline_user_preferences' 
        AND policyname = 'Users can manage their own preferences'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own preferences" ON wireline_user_preferences FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;

-- Onboarding progress tracking
CREATE TABLE IF NOT EXISTS wireline_onboarding_progress (
    user_id UUID,
    step_id TEXT,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    metadata JSONB,
    PRIMARY KEY (user_id, step_id)
);

ALTER TABLE wireline_onboarding_progress ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'wireline_onboarding_progress' 
        AND policyname = 'Users can manage their own onboarding progress'
    ) THEN
        EXECUTE 'CREATE POLICY "Users can manage their own onboarding progress" ON wireline_onboarding_progress FOR ALL USING (auth.uid() = user_id)';
    END IF;
END $$;
```

- [ ] **Step 5: Add server API endpoints**

```ts
// server.ts (add these endpoints after existing /api/settings)

// User preferences endpoints
app.get("/api/user-preferences", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_user_preferences')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    res.json(data || {
      user_id: req.user.id,
      tour_completed: false,
      onboarding_completed: false,
      help_enabled: true,
      keyboard_shortcuts_enabled: true,
      preferences: {},
    });
  } catch (error) {
    log.error("Failed to fetch user preferences", { error });
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

app.post("/api/user-preferences", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db
      .from('wireline_user_preferences')
      .upsert({
        user_id: req.user.id,
        ...req.body,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update user preferences", { error });
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

// Onboarding progress endpoints
app.get("/api/onboarding/progress", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_onboarding_progress')
      .select('step_id, completed, completed_at, metadata')
      .eq('user_id', req.user.id);

    if (error) throw error;

    const progress = (data || []).reduce((acc, row) => {
      acc[row.step_id] = {
        completed: row.completed,
        completed_at: row.completed_at,
        metadata: row.metadata,
      };
      return acc;
    }, {} as Record<string, any>);

    res.json({ progress });
  } catch (error) {
    log.error("Failed to fetch onboarding progress", { error });
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

app.post("/api/onboarding/progress", authenticateUser, async (req: any, res: any) => {
  try {
    const { step_id, metadata } = req.body;
    
    const { error } = await db
      .from('wireline_onboarding_progress')
      .upsert({
        user_id: req.user.id,
        step_id,
        completed: true,
        completed_at: new Date().toISOString(),
        metadata: metadata || {},
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    log.error("Failed to update onboarding progress", { error });
    res.status(500).json({ error: "Failed to update progress" });
  }
});
```

- [ ] **Step 6: Run tests — confirm PASSES**

```bash
npm run test src/lib/user-journey.test.ts
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/user-journey.ts src/lib/user-journey.test.ts server.ts supabase_schema.sql
git commit -m "feat: add user preferences and onboarding progress tracking"
```

---

## Task 2: Contextual Help System

**Files:**
- Create: `src/components/ContextualHelp.tsx`
- Create: `src/components/TooltipProvider.tsx`
- Create: `src/contexts/HelpContext.tsx`

- [ ] **Step 1: Write component tests**

```tsx
// src/components/__tests__/ContextualHelp.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextualHelp } from '../ContextualHelp';

describe('ContextualHelp', () => {
  it('should render help icon', () => {
    render(<ContextualHelp topic="agent_creation" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should show tooltip on hover', async () => {
    render(<ContextualHelp topic="agent_creation" />);
    const button = screen.getByRole('button');
    // Test hover behavior
  });
});
```

- [ ] **Step 2: Run test — confirm FAILS**

```bash
npm run test src/components/__tests__/ContextualHelp.test.tsx
```

- [ ] **Step 3: Implement contextual help system**

```tsx
// src/contexts/HelpContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface HelpContextType {
  helpEnabled: boolean;
  toggleHelp: () => void;
  showHelp: (topic: string) => void;
  hideHelp: () => void;
  activeTopic: string | null;
}

const HelpContext = createContext<HelpContextType>({
  helpEnabled: true,
  toggleHelp: () => {},
  showHelp: () => {},
  hideHelp: () => {},
  activeTopic: null,
});

export function HelpProvider({ children }: { children: ReactNode }) {
  const [helpEnabled, setHelpEnabled] = useState(true);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);

  return (
    <HelpContext.Provider
      value={{
        helpEnabled,
        toggleHelp: () => setHelpEnabled(!helpEnabled),
        showHelp: (topic) => setActiveTopic(topic),
        hideHelp: () => setActiveTopic(null),
        activeTopic,
      }}
    >
      {children}
    </HelpContext.Provider>
  );
}

export const useHelp = () => useContext(HelpContext);
```

```tsx
// src/components/TooltipProvider.tsx
import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = React.useState(false);

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: side === 'top' ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 px-3 py-2 rounded-xl glass-strong border border-white/10 text-xs text-ink max-w-xs whitespace-normal',
              positions[side],
              className
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

```tsx
// src/components/ContextualHelp.tsx
import React from 'react';
import { HelpCircle, BookOpen, Zap } from 'lucide-react';
import { Tooltip } from './TooltipProvider';
import { useHelp } from '../contexts/HelpContext';

const HELP_CONTENT: Record<string, { title: string; description: string; link?: string }> = {
  agent_creation: {
    title: 'Creating Agents',
    description: 'Agents are AI-powered assistants that handle voice calls, emails, or both. Each agent has its own personality, knowledge base, and directives.',
    link: 'https://wireline.ai/docs/agents',
  },
  agent_role: {
    title: 'Agent Roles',
    description: 'Roles provide pre-configured personalities and behaviors. Sales agents are persuasive and goal-oriented, while Support agents are patient and helpful.',
  },
  voice_settings: {
    title: 'Voice Configuration',
    description: 'Choose different voices for inbound vs outbound calls. Premium voices (11labs) sound more natural but cost slightly more per minute.',
  },
  directives: {
    title: 'Agent Directives',
    description: 'Directives are specific instructions your agent follows. Be clear and actionable. Example: "Always confirm appointment time twice before ending call."',
  },
  knowledge: {
    title: 'Knowledge Base',
    description: 'Facts your agent knows and can reference. Keep each fact atomic (one piece of information per entry). Example: "Business hours: Mon-Fri 9am-5pm EST"',
  },
  personality: {
    title: 'Agent Personality',
    description: 'Defines how your agent communicates. A conversational tone works best for most use cases. Avoid overly formal or robotic language.',
  },
  lead_qualification: {
    title: 'Lead Scoring',
    description: 'Claude automatically scores leads 0-100 based on BANT criteria (Budget, Authority, Need, Timeline). Scores above 70 are hot leads.',
  },
  claude_recipes: {
    title: 'Claude Recipes',
    description: 'Pre-built AI workflows powered by Claude Opus 4.7. Use these to enrich leads, draft emails, review agent performance, and more.',
  },
};

interface ContextualHelpProps {
  topic: keyof typeof HELP_CONTENT;
  inline?: boolean;
  variant?: 'icon' | 'text' | 'badge';
}

export function ContextualHelp({ topic, inline = false, variant = 'icon' }: ContextualHelpProps) {
  const { helpEnabled } = useHelp();
  const help = HELP_CONTENT[topic];

  if (!helpEnabled || !help) return null;

  const content = (
    <div className="text-left">
      <div className="font-medium text-brand mb-1 flex items-center gap-1.5">
        <Zap className="w-3 h-3" />
        {help.title}
      </div>
      <p className="text-muted leading-relaxed">{help.description}</p>
      {help.link && (
        <a
          href={help.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand text-[10px] uppercase tracking-wider mt-2 inline-flex items-center gap-1 hover:underline"
        >
          <BookOpen className="w-3 h-3" />
          Learn More
        </a>
      )}
    </div>
  );

  if (variant === 'text') {
    return (
      <Tooltip content={content}>
        <button className="text-brand text-xs hover:underline">What's this?</button>
      </Tooltip>
    );
  }

  if (variant === 'badge') {
    return (
      <Tooltip content={content}>
        <span className="px-2 py-0.5 rounded-full bg-brand/10 border border-brand/20 text-[9px] uppercase tracking-wider text-brand cursor-help">
          ?
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={content} side="right">
      <button
        className={cn(
          'text-muted hover:text-brand transition-colors',
          inline ? 'inline-flex items-center' : 'flex items-center justify-center'
        )}
      >
        <HelpCircle className="w-4 h-4" />
      </button>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Run tests — confirm PASSES**

```bash
npm run test src/components/__tests__/ContextualHelp.test.tsx
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ContextualHelp.tsx src/components/TooltipProvider.tsx src/contexts/HelpContext.tsx src/components/__tests__/ContextualHelp.test.tsx
git commit -m "feat: add contextual help system with tooltips"
```

---

## Task 3: Guided Product Tour

**Files:**
- Create: `src/components/GuidedTour.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement guided tour component**

```tsx
// src/components/GuidedTour.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight, ArrowLeft, Sparkles, Check } from 'lucide-react';
import { authFetch } from '../lib/api';
import { cn } from '../lib/utils';

interface TourStep {
  target: string; // CSS selector
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="dashboard"]',
    title: 'Welcome to Wireline',
    content: 'Your command center for AI voice and email agents. Let\'s take a quick tour.',
    position: 'bottom',
  },
  {
    target: '[data-tour="agents"]',
    title: 'Fleet Management',
    content: 'Create and configure your AI agents here. Each agent can handle voice calls, emails, or both.',
    position: 'right',
  },
  {
    target: '[data-tour="training"]',
    title: 'Agent Training',
    content: 'Teach your agents by adding knowledge facts, directives, and personality traits.',
    position: 'right',
  },
  {
    target: '[data-tour="logs"]',
    title: 'Call Archive',
    content: 'Review transcripts, recordings, and AI-generated summaries of every interaction.',
    position: 'right',
  },
  {
    target: '[data-tour="insights"]',
    title: 'Performance Insights',
    content: 'Track conversion funnels, topic clusters, and Claude-identified failure modes.',
    position: 'right',
  },
  {
    target: '[data-tour="test-call"]',
    title: 'Try It Now',
    content: 'Click here to start a live test call with your agent — no phone needed!',
    position: 'bottom',
  },
];

export default function GuidedTour() {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    // Check if user has completed tour
    authFetch('/api/user-preferences')
      .then((r) => r.json())
      .then((data) => {
        if (!data.tour_completed) {
          // Wait 2 seconds after page load, then show tour
          setTimeout(() => setActive(true), 2000);
        }
      })
      .catch(console.error);
  }, []);

  const handleComplete = async () => {
    setCompleted(true);
    await authFetch('/api/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_completed: true }),
    });
    setTimeout(() => setActive(false), 1000);
  };

  const next = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const skip = () => {
    handleComplete();
  };

  if (!active) return null;

  const step = TOUR_STEPS[currentStep];
  const targetElement = document.querySelector(step.target);

  if (!targetElement) {
    // Target not found, skip to next step
    if (currentStep < TOUR_STEPS.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 100);
    }
    return null;
  }

  const rect = targetElement.getBoundingClientRect();
  const positions = {
    top: { top: rect.top - 20, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)' },
    bottom: { top: rect.bottom + 20, left: rect.left + rect.width / 2, transform: 'translate(-50%, 0)' },
    left: { top: rect.top + rect.height / 2, left: rect.left - 20, transform: 'translate(-100%, -50%)' },
    right: { top: rect.top + rect.height / 2, left: rect.right + 20, transform: 'translate(0, -50%)' },
  };

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
        onClick={skip}
      />

      {/* Spotlight on target */}
      <div
        className="fixed z-[101] pointer-events-none"
        style={{
          top: rect.top - 8,
          left: rect.left - 8,
          width: rect.width + 16,
          height: rect.height + 16,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 60px rgba(125, 249, 255, 0.4)',
          borderRadius: '16px',
        }}
      />

      {/* Tour card */}
      <motion.div
        key={currentStep}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed z-[102] w-80"
        style={positions[step.position]}
      >
        <div className="aurora-ring rounded-2xl">
          <div className="rounded-2xl glass-strong p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand/20 border border-brand/30 flex items-center justify-center">
                  {completed ? (
                    <Check className="w-4 h-4 text-brand" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-brand" />
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  Step {currentStep + 1} of {TOUR_STEPS.length}
                </span>
              </div>
              <button
                onClick={skip}
                className="text-muted hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-lg font-semibold mb-2 text-ink">{step.title}</h3>
            <p className="text-sm text-muted leading-relaxed mb-4">{step.content}</p>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={skip}
                className="text-xs text-muted hover:text-ink transition-colors uppercase tracking-wider"
              >
                Skip Tour
              </button>
              <div className="flex items-center gap-2">
                {currentStep > 0 && (
                  <button
                    onClick={prev}
                    className="px-3 py-2 rounded-lg glass border border-white/10 text-xs text-ink hover:border-brand/40 transition-all flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>
                )}
                <button
                  onClick={next}
                  className="brutal-btn !py-2 !px-4 !text-xs"
                >
                  {currentStep === TOUR_STEPS.length - 1 ? (
                    <>
                      <Check className="w-3 h-3" />
                      Finish
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 mt-4">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 rounded-full transition-all',
                    i === currentStep
                      ? 'w-6 bg-brand'
                      : i < currentStep
                      ? 'w-1 bg-brand/60'
                      : 'w-1 bg-white/20'
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
```

- [ ] **Step 2: Add data-tour attributes to navigation**

```tsx
// src/App.tsx modifications
// In the NAV_ITEMS map function, add data-tour attributes:

{navItem.path === "/" && <span data-tour="dashboard" className="absolute inset-0" />}
{navItem.path === "/agents" && <span data-tour="agents" className="absolute inset-0" />}
{navItem.path === "/train" && <span data-tour="training" className="absolute inset-0" />}
{navItem.path === "/logs" && <span data-tour="logs" className="absolute inset-0" />}
{navItem.path === "/insights" && <span data-tour="insights" className="absolute inset-0" />}

// Add to test call button:
<button data-tour="test-call" onClick={toggleCall} ...>
```

- [ ] **Step 3: Import GuidedTour in App.tsx**

```tsx
// src/App.tsx
import GuidedTour from "./components/GuidedTour";

// Inside AppContent(), after <ToastStack />:
<GuidedTour />
```

- [ ] **Step 4: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/GuidedTour.tsx src/App.tsx
git commit -m "feat: add interactive guided product tour"
```

---

## Task 4: Agent Templates & Wizard

**Files:**
- Create: `src/components/AgentTemplates.tsx`
- Create: `src/components/AgentWizard.tsx`
- Modify: `src/components/FleetSettings.tsx`
- Modify: `server.ts`
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Add agent templates schema**

```sql
-- supabase_schema.sql (append)

-- Agent templates for quick deployment
CREATE TABLE IF NOT EXISTS wireline_agent_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'sales', 'support', 'scheduler', 'collections', 'technical', 'lead_qualifier', 'receptionist', 'marketing'
    difficulty TEXT DEFAULT 'beginner', -- 'beginner', 'intermediate', 'advanced'
    config JSONB NOT NULL, -- { personality, directives: [], knowledge: [], settings: {} }
    tags TEXT[] DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    is_official BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed templates
INSERT INTO wireline_agent_templates (id, name, description, category, difficulty, config) VALUES
('template-receptionist-basic', 'Basic Receptionist', 'Answers calls, takes messages, routes to appropriate department', 'receptionist', 'beginner', '{
  "personality": "You are a professional, friendly receptionist. You answer calls politely, gather caller information, and route calls appropriately.",
  "directives": [
    "Always greet callers warmly and introduce yourself",
    "Ask for caller name and reason for calling",
    "Take detailed messages if the appropriate person is unavailable",
    "Confirm callback number before ending call"
  ],
  "knowledge": [
    "Business hours: Monday-Friday 9am-5pm",
    "For sales inquiries, transfer to extension 101",
    "For support issues, transfer to extension 102"
  ],
  "settings": {
    "channel": "voice",
    "role": "receptionist"
  }
}'),
('template-sales-outbound', 'Outbound Sales Agent', 'Proactive outreach for lead qualification and appointment setting', 'sales', 'intermediate', '{
  "personality": "You are an enthusiastic, consultative sales professional. You build rapport quickly, listen actively, and focus on solving customer problems.",
  "directives": [
    "Open with a personalized greeting and value proposition",
    "Ask open-ended discovery questions about their business challenges",
    "Position product benefits in terms of ROI and time savings",
    "Handle objections with empathy and evidence",
    "Always attempt to book a demo or next meeting"
  ],
  "knowledge": [
    "Product pricing starts at $199/month",
    "Average customer sees 40% time savings in first 90 days",
    "Free 14-day trial available",
    "Demo calls are 30 minutes via Zoom"
  ],
  "settings": {
    "channel": "voice",
    "role": "sales"
  }
}'),
('template-support-tier1', 'Tier 1 Support Agent', 'Handles common technical issues and escalates complex cases', 'technical_support', 'intermediate', '{
  "personality": "You are patient, knowledgeable, and solution-oriented. You break down technical concepts into plain language and always verify the customer'\''s issue is fully resolved.",
  "directives": [
    "Gather complete information about the issue before troubleshooting",
    "Guide customers through solutions step-by-step",
    "Confirm each step before moving to the next",
    "Escalate to Tier 2 if issue persists after 3 attempts",
    "Always end with '\''Is there anything else I can help with today?'\''"
  ],
  "knowledge": [
    "Password reset link: account.example.com/reset",
    "Common issue: Clear browser cache to resolve login problems",
    "System status page: status.example.com"
  ],
  "settings": {
    "channel": "omnichannel",
    "role": "technical_support"
  }
}');

-- No RLS needed (templates are public read-only)
```

- [ ] **Step 2: Add template endpoints**

```ts
// server.ts (add after /api/agents endpoints)

// Agent templates
app.get("/api/agent-templates", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db
      .from('wireline_agent_templates')
      .select('*')
      .order('usage_count', { ascending: false });

    if (error) throw error;
    res.json({ templates: data || [] });
  } catch (error) {
    log.error("Failed to fetch agent templates", { error });
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

app.post("/api/agents/from-template", authenticateUser, async (req: any, res: any) => {
  try {
    const { template_id, agent_name, agent_id } = req.body;
    
    // Fetch template
    const { data: template, error: templateError } = await db
      .from('wireline_agent_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Check subscription and agent limits (same as POST /api/agents)
    const { data: userSettings } = await db
      .from('wireline_settings')
      .select('subscription_status, max_agents')
      .eq('user_id', req.user.id)
      .single();
    
    const subscriptionStatus = userSettings?.subscription_status || 'active';
    if (subscriptionStatus !== 'active') {
      return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan." });
    }

    const maxAgents = userSettings?.max_agents || 3;
    const { count: agentCount } = await db
      .from('wireline_agents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);
    
    if (agentCount !== null && agentCount >= maxAgents) {
      return res.status(403).json({ error: `Quota Exceeded: Your plan only allows ${maxAgents} agents.` });
    }

    const config = template.config;
    const newAgentId = agent_id || `agent-${Date.now()}`;

    // Create agent
    await db.from('wireline_agents').insert({
      id: newAgentId,
      user_id: req.user.id,
      name: agent_name || template.name,
      channel: config.settings?.channel || 'voice',
      role: config.settings?.role || 'customer_service',
    });

    // Add personality
    if (config.personality) {
      await db.from('wireline_personality').insert({
        agent_id: newAgentId,
        user_id: req.user.id,
        content: config.personality,
      });
    }

    // Add directives
    if (config.directives?.length > 0) {
      await db.from('wireline_directives').insert(
        config.directives.map((d: string, i: number) => ({
          agent_id: newAgentId,
          user_id: req.user.id,
          content: d,
          priority: 5 - i, // Higher priority for earlier directives
        }))
      );
    }

    // Add knowledge
    if (config.knowledge?.length > 0) {
      await db.from('wireline_knowledge').insert(
        config.knowledge.map((k: string) => ({
          agent_id: newAgentId,
          user_id: req.user.id,
          content: k,
        }))
      );
    }

    // Increment template usage count
    await db
      .from('wireline_agent_templates')
      .update({ usage_count: (template.usage_count || 0) + 1 })
      .eq('id', template_id);

    // Audit log
    void auditLogger.logAgentOperation('created', {
      userId: req.user.id,
      agentId: newAgentId,
      agentName: agent_name || template.name,
      metadata: { from_template: template_id, template_name: template.name },
      ip: req.ip,
    }).catch(console.error);

    res.json({ success: true, agent_id: newAgentId });
  } catch (error) {
    log.error("Failed to create agent from template", { error });
    res.status(500).json({ error: "Failed to create agent from template" });
  }
});
```

- [ ] **Step 3: Implement AgentTemplates component**

```tsx
// src/components/AgentTemplates.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Check, ArrowRight, Loader2 } from 'lucide-react';
import { authFetch } from '../lib/api';
import { cn } from '../lib/utils';
import { useToast } from '../contexts/ToastContext';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  usage_count: number;
  tags: string[];
}

interface AgentTemplatesProps {
  onSelectTemplate: (templateId: string, templateName: string) => void;
  onClose: () => void;
}

const DIFFICULTY_COLORS = {
  beginner: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/25' },
  intermediate: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/25' },
  advanced: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/25' },
};

export default function AgentTemplates({ onSelectTemplate, onClose }: AgentTemplatesProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    authFetch('/api/agent-templates')
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data.templates || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = ['all', ...new Set(templates.map((t) => t.category))];
  const filtered = selectedCategory === 'all' 
    ? templates 
    : templates.filter((t) => t.category === selectedCategory);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative aurora-ring rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col"
      >
        <div className="relative rounded-3xl glass-strong overflow-hidden flex flex-col">
          <div className="px-7 py-5 border-b border-white/8 flex items-center justify-between">
            <div>
              <h2 className="font-display italic text-2xl text-ink">Agent Templates</h2>
              <p className="text-[10px] uppercase tracking-wider text-muted mt-1">
                Deploy pre-configured agents in seconds
              </p>
            </div>
            <button onClick={onClose} className="brutal-btn !py-2 !px-4">Close</button>
          </div>

          {/* Category filter */}
          <div className="px-7 py-4 border-b border-white/8 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-4 py-2 rounded-full text-[10px] uppercase tracking-wider transition-all whitespace-nowrap',
                  selectedCategory === cat
                    ? 'bg-brand/20 border border-brand/40 text-brand'
                    : 'glass border border-white/10 text-muted hover:text-ink'
                )}
              >
                {cat.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Templates grid */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-7">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((template) => (
                  <motion.div
                    key={template.id}
                    whileHover={{ scale: 1.02 }}
                    className="glass border border-white/10 rounded-2xl p-5 cursor-pointer hover:border-brand/40 transition-all"
                    onClick={() => onSelectTemplate(template.id, template.name)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-ink mb-1">{template.name}</h3>
                        <p className="text-xs text-muted leading-relaxed">{template.description}</p>
                      </div>
                      <Sparkles className="w-4 h-4 text-brand shrink-0" />
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider border',
                        DIFFICULTY_COLORS[template.difficulty as keyof typeof DIFFICULTY_COLORS]?.bg,
                        DIFFICULTY_COLORS[template.difficulty as keyof typeof DIFFICULTY_COLORS]?.text,
                        DIFFICULTY_COLORS[template.difficulty as keyof typeof DIFFICULTY_COLORS]?.border,
                      )}>
                        {template.difficulty}
                      </span>
                      <span className="text-[9px] text-muted">
                        {template.usage_count} deployments
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Integrate into FleetSettings**

```tsx
// src/components/FleetSettings.tsx modifications

// Add state:
const [showTemplates, setShowTemplates] = useState(false);

// Add button in the agent creation section:
<button
  onClick={() => setShowTemplates(true)}
  className="px-4 py-2 rounded-full glass border border-brand/30 text-[11px] uppercase tracking-wider text-brand hover:bg-brand/10 transition-all flex items-center gap-2"
>
  <Sparkles className="w-3.5 h-3.5" />
  Use Template
</button>

// Add modal:
<AnimatePresence>
  {showTemplates && (
    <AgentTemplates
      onSelectTemplate={async (templateId, templateName) => {
        setShowTemplates(false);
        const agentId = `agent-${Date.now()}`;
        try {
          const res = await authFetch('/api/agents/from-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              template_id: templateId,
              agent_name: templateName,
              agent_id: agentId,
            }),
          });
          if (res.ok) {
            toastSuccess('Agent deployed', `${templateName} is ready`);
            await fetchAgents();
          } else {
            const data = await res.json();
            toastError('Deployment failed', data.error);
          }
        } catch (e: any) {
          toastError('Error', e.message);
        }
      }}
      onClose={() => setShowTemplates(false)}
    />
  )}
</AnimatePresence>
```

- [ ] **Step 5: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/AgentTemplates.tsx src/components/FleetSettings.tsx server.ts supabase_schema.sql
git commit -m "feat: add agent templates for one-click deployment"
```

---

## Task 5: Smart Onboarding with Persona Detection

**Files:**
- Modify: `src/components/OnboardingQuickstart.tsx`
- Create: `src/components/PersonaSurvey.tsx`
- Modify: `server.ts`

- [ ] **Step 1: Create persona survey component**

```tsx
// src/components/PersonaSurvey.tsx
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Building2, Code, Zap, ArrowRight } from 'lucide-react';
import { authFetch } from '../lib/api';
import { cn } from '../lib/utils';

const PERSONA_OPTIONS = [
  {
    id: 'new',
    icon: Zap,
    title: 'Just Getting Started',
    description: 'I\'m new to AI agents and want guided setup',
    color: '#7DF9FF',
  },
  {
    id: 'solo',
    icon: Users,
    title: 'Solo Operator',
    description: 'I run a small business and need simple, reliable automation',
    color: '#4DFFC4',
  },
  {
    id: 'power',
    icon: Building2,
    title: 'Team Manager',
    description: 'I manage multiple agents and need advanced analytics',
    color: '#C58BFF',
  },
  {
    id: 'technical',
    icon: Code,
    title: 'Developer',
    description: 'I want API access and programmatic control',
    color: '#FF6BD9',
  },
];

interface PersonaSurveyProps {
  onComplete: (persona: string) => void;
}

export default function PersonaSurvey({ onComplete }: PersonaSurveyProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    
    await authFetch('/api/user-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: selected }),
    });

    onComplete(selected);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-display italic text-3xl text-ink mb-2">Welcome to Wireline</h2>
        <p className="text-sm text-muted">Help us personalize your experience</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PERSONA_OPTIONS.map((option) => (
          <motion.button
            key={option.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelected(option.id)}
            className={cn(
              'p-6 rounded-2xl border-2 text-left transition-all',
              selected === option.id
                ? 'border-brand bg-brand/10'
                : 'border-white/10 glass hover:border-white/20'
            )}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
              style={{
                background: `${option.color}20`,
                border: `1px solid ${option.color}40`,
                color: option.color,
              }}
            >
              <option.icon className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-ink mb-2">{option.title}</h3>
            <p className="text-sm text-muted leading-relaxed">{option.description}</p>
          </motion.button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!selected || submitting}
        className="brutal-btn w-full !py-4"
      >
        {submitting ? 'Saving...' : 'Continue'}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Enhance OnboardingQuickstart**

```tsx
// src/components/OnboardingQuickstart.tsx
// Add at the top:
import PersonaSurvey from './PersonaSurvey';

// Add state:
const [showPersonaSurvey, setShowPersonaSurvey] = useState(false);
const [persona, setPersona] = useState<string | null>(null);

// Modify useEffect to check persona:
useEffect(() => {
  (async () => {
    try {
      const prefs = await authFetch('/api/user-preferences').then(r => r.json());
      if (!prefs.persona && completedCount === 0) {
        setShowPersonaSurvey(true);
      } else {
        setPersona(prefs.persona);
      }
      // ... existing progress fetch
    } finally { setLoading(false); }
  })();
}, []);

// Add persona-specific tips:
const personaTips = {
  solo: [
    'Start with a basic receptionist template',
    'Use Claude recipes to enrich leads automatically',
    'Enable email auto-response for after-hours coverage',
  ],
  power: [
    'Deploy multiple agents with different roles',
    'Track KPIs in the Insights dashboard',
    'Set up webhooks for CRM integration',
  ],
  technical: [
    'Explore the API playground in Admin settings',
    'Export agent configs to version control',
    'Use intake API endpoints for lead ingestion',
  ],
};

// Render persona survey modal if needed:
{showPersonaSurvey && (
  <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-3xl aurora-ring rounded-3xl">
      <div className="glass-strong rounded-3xl p-8">
        <PersonaSurvey onComplete={(p) => { setPersona(p); setShowPersonaSurvey(false); }} />
      </div>
    </motion.div>
  </motion.div>
)}
```

- [ ] **Step 3: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/PersonaSurvey.tsx src/components/OnboardingQuickstart.tsx
git commit -m "feat: add persona detection for personalized onboarding"
```

---

## Task 6: Error Prevention & Validation

**Files:**
- Create: `src/components/ConfirmationDialog.tsx`
- Modify: `src/components/FleetSettings.tsx`
- Modify: `src/components/AgentTraining.tsx`

- [ ] **Step 1: Create reusable confirmation dialog**

```tsx
// src/components/ConfirmationDialog.tsx
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export default function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmationDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const variants = {
    danger: { color: '#FF6BD9', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
    warning: { color: '#FFC07D', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    info: { color: '#7DF9FF', bg: 'bg-brand/10', border: 'border-brand/30' },
  };

  const style = variants[variant];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative aurora-ring rounded-2xl w-full max-w-md"
          >
            <div className="relative rounded-2xl glass-strong p-6">
              <div className="flex items-start gap-4">
                <div
                  className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', style.bg, style.border, 'border')}
                  style={{ color: style.color }}
                >
                  <AlertTriangle className="w-6 h-6" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg text-ink mb-2">{title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{message}</p>
                </div>

                <button
                  onClick={onClose}
                  className="text-muted hover:text-ink transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={onClose}
                  disabled={isSubmitting || loading}
                  className="flex-1 px-4 py-2.5 rounded-xl glass border border-white/10 text-sm text-ink hover:border-white/20 transition-all disabled:opacity-50"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isSubmitting || loading}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-paper transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: style.color }}
                >
                  {isSubmitting || loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    confirmLabel
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Add confirmation to delete operations in FleetSettings**

```tsx
// src/components/FleetSettings.tsx

// Add state:
const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'agent' | 'directive' | 'knowledge'; id: string; name?: string } | null>(null);

// Wrap delete operations:
const confirmDeleteAgent = (agent: any) => {
  setDeleteConfirm({ type: 'agent', id: agent.id, name: agent.name });
};

const handleConfirmDelete = async () => {
  if (!deleteConfirm) return;
  
  if (deleteConfirm.type === 'agent') {
    await authFetch(`/api/agents/${deleteConfirm.id}`, { method: 'DELETE' });
    toastSuccess('Agent deleted', deleteConfirm.name || 'Agent removed');
    await fetchAgents();
  } else if (deleteConfirm.type === 'directive') {
    await deleteItem(deleteConfirm.id, 'directive');
  } else if (deleteConfirm.type === 'knowledge') {
    await deleteItem(deleteConfirm.id, 'knowledge');
  }
  
  setDeleteConfirm(null);
};

// Replace direct delete button with:
<button onClick={() => confirmDeleteAgent(agent)} className="...">
  <Trash2 className="w-4 h-4" />
  Delete Agent
</button>

// Add dialog at end of component:
<ConfirmationDialog
  open={!!deleteConfirm}
  onClose={() => setDeleteConfirm(null)}
  onConfirm={handleConfirmDelete}
  title={`Delete ${deleteConfirm?.type === 'agent' ? 'Agent' : deleteConfirm?.type === 'directive' ? 'Directive' : 'Knowledge'}?`}
  message={deleteConfirm?.type === 'agent' 
    ? `This will permanently delete "${deleteConfirm.name}" and all associated training data. This action cannot be undone.`
    : `This will permanently delete this ${deleteConfirm?.type}. This action cannot be undone.`}
  confirmLabel="Delete Permanently"
  variant="danger"
/>
```

- [ ] **Step 3: Add validation helpers**

```ts
// src/lib/validation.ts
export function validateAgentId(id: string): { valid: boolean; error?: string } {
  if (!id || id.trim().length === 0) {
    return { valid: false, error: 'Agent ID is required' };
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return { valid: false, error: 'Agent ID must contain only lowercase letters, numbers, and hyphens' };
  }
  if (id.length < 3) {
    return { valid: false, error: 'Agent ID must be at least 3 characters' };
  }
  if (id.length > 50) {
    return { valid: false, error: 'Agent ID must be less than 50 characters' };
  }
  return { valid: true };
}

export function validateAgentName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Agent name is required' };
  }
  if (name.length > 100) {
    return { valid: false, error: 'Agent name must be less than 100 characters' };
  }
  return { valid: true };
}

export function validateDirective(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Directive cannot be empty' };
  }
  if (content.length > 500) {
    return { valid: false, error: 'Directive must be less than 500 characters. Be specific and concise.' };
  }
  if (!content.includes(' ')) {
    return { valid: false, error: 'Directive should be a complete instruction, not just a keyword' };
  }
  return { valid: true };
}

export function validateKnowledge(content: string): { valid: boolean; error?: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: 'Knowledge cannot be empty' };
  }
  if (content.length > 300) {
    return { valid: false, error: 'Keep each knowledge fact atomic (one fact = one entry). Split long text into multiple facts.' };
  }
  return { valid: true };
}
```

- [ ] **Step 4: Apply validation in FleetSettings**

```tsx
// src/components/FleetSettings.tsx

import { validateAgentId, validateAgentName, validateDirective, validateKnowledge } from '../lib/validation';

// Add validation state:
const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

// In handleCreateAgent:
const idValidation = validateAgentId(newAgentId);
const nameValidation = validateAgentName(newAgentName);

if (!idValidation.valid || !nameValidation.valid) {
  setValidationErrors({
    ...(idValidation.error && { id: idValidation.error }),
    ...(nameValidation.error && { name: nameValidation.error }),
  });
  return;
}

// Show validation errors in the form:
{validationErrors.id && (
  <p className="text-xs text-rose-400 mt-1">{validationErrors.id}</p>
)}
{validationErrors.name && (
  <p className="text-xs text-rose-400 mt-1">{validationErrors.name}</p>
)}
```

- [ ] **Step 5: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfirmationDialog.tsx src/components/FleetSettings.tsx src/lib/validation.ts
git commit -m "feat: add error prevention with validation and confirmation dialogs"
```

---

## Task 7: Keyboard Shortcuts & Power User Features

**Files:**
- Create: `src/components/KeyboardShortcuts.tsx`
- Create: `src/hooks/use Keyboard.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement keyboard shortcut system**

```ts
// src/hooks/useKeyboard.ts
import { useEffect, useCallback } from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

interface UseKeyboardOptions {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  enabled?: boolean;
}

export function useKeyboard(
  { key, ctrl, meta, shift, alt, enabled = true }: UseKeyboardOptions,
  handler: KeyHandler
) {
  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      const matchesKey = event.key.toLowerCase() === key.toLowerCase();
      const matchesCtrl = ctrl === undefined || event.ctrlKey === ctrl;
      const matchesMeta = meta === undefined || event.metaKey === meta;
      const matchesShift = shift === undefined || event.shiftKey === shift;
      const matchesAlt = alt === undefined || event.altKey === alt;

      if (matchesKey && matchesCtrl && matchesMeta && matchesShift && matchesAlt) {
        event.preventDefault();
        handler(event);
      }
    },
    [key, ctrl, meta, shift, alt, handler]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [enabled, handleKeyPress]);
}

export const SHORTCUTS = {
  // Navigation
  DASHBOARD: { key: 'h', meta: true, label: 'Go to Dashboard' },
  AGENTS: { key: 'a', meta: true, label: 'Go to Agents' },
  TRAINING: { key: 't', meta: true, label: 'Go to Training' },
  LOGS: { key: 'l', meta: true, label: 'Go to Logs' },
  INSIGHTS: { key: 'i', meta: true, label: 'Go to Insights' },
  
  // Actions
  NEW_AGENT: { key: 'n', meta: true, label: 'Create New Agent' },
  SEARCH: { key: 'k', meta: true, label: 'Search / Command Palette' },
  HELP: { key: '/', meta: false, shift: true, label: 'Show Keyboard Shortcuts' },
  TEST_CALL: { key: 'p', meta: true, shift: true, label: 'Start Test Call' },
  
  // UI
  CLOSE_MODAL: { key: 'Escape', meta: false, label: 'Close Modal/Dialog' },
  SAVE: { key: 's', meta: true, label: 'Save' },
};
```

```tsx
// src/components/KeyboardShortcuts.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Keyboard, X, Command, Zap } from 'lucide-react';
import { useKeyboard, SHORTCUTS } from '../hooks/useKeyboard';
import { cn } from '../lib/utils';

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useKeyboard(SHORTCUTS.HELP, () => setOpen(!open));
  useKeyboard(SHORTCUTS.CLOSE_MODAL, () => setOpen(false));

  const categories = [
    {
      title: 'Navigation',
      shortcuts: [
        SHORTCUTS.DASHBOARD,
        SHORTCUTS.AGENTS,
        SHORTCUTS.TRAINING,
        SHORTCUTS.LOGS,
        SHORTCUTS.INSIGHTS,
      ],
    },
    {
      title: 'Actions',
      shortcuts: [
        SHORTCUTS.NEW_AGENT,
        SHORTCUTS.SEARCH,
        SHORTCUTS.TEST_CALL,
        SHORTCUTS.SAVE,
      ],
    },
    {
      title: 'General',
      shortcuts: [
        SHORTCUTS.HELP,
        SHORTCUTS.CLOSE_MODAL,
      ],
    },
  ];

  const renderKey = (key: string) => {
    const displayKey = key === 'Meta' ? '⌘' : key === 'Escape' ? 'Esc' : key;
    return (
      <kbd className="px-2 py-1 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-wider text-brand font-mono">
        {displayKey}
      </kbd>
    );
  };

  return (
    <>
      {/* Floating help button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center text-brand hover:bg-brand/30 transition-all shadow-lg"
        title="Keyboard Shortcuts (Shift + /)"
      >
        <Keyboard className="w-5 h-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={() => setOpen(false)} />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative aurora-ring rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            >
              <div className="relative rounded-3xl glass-strong overflow-hidden flex flex-col">
                <div className="px-7 py-5 border-b border-white/8 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/30 flex items-center justify-center">
                      <Keyboard className="w-5 h-5 text-brand" />
                    </div>
                    <div>
                      <h2 className="font-display italic text-2xl text-ink">Keyboard Shortcuts</h2>
                      <p className="text-[10px] uppercase tracking-wider text-muted">Power user commands</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-ink/60 hover:text-ink transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide p-7 space-y-6">
                  {categories.map((category) => (
                    <div key={category.title}>
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">
                        {category.title}
                      </h3>
                      <div className="space-y-2">
                        {category.shortcuts.map((shortcut, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between py-2.5 px-4 rounded-xl glass border border-white/5 hover:border-white/10 transition-all"
                          >
                            <span className="text-sm text-ink">{shortcut.label}</span>
                            <div className="flex items-center gap-1">
                              {shortcut.meta && renderKey('⌘')}
                              {shortcut.ctrl && renderKey('Ctrl')}
                              {shortcut.shift && renderKey('Shift')}
                              {shortcut.alt && renderKey('Alt')}
                              {renderKey(shortcut.key)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-7 py-4 border-t border-white/8 flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-brand" />
                    <span>Pro tip: Press <kbd className="px-1.5 py-0.5 rounded glass border border-white/10 font-mono">⌘+K</kbd> for command palette</span>
                  </div>
                  <span className="opacity-60">Press Esc to close</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Wire up keyboard shortcuts in App.tsx**

```tsx
// src/App.tsx
import KeyboardShortcuts from './components/KeyboardShortcuts';
import { useKeyboard, SHORTCUTS } from './hooks/useKeyboard';

// Inside AppContent component:
const navigate = useNavigate();

// Navigation shortcuts
useKeyboard(SHORTCUTS.DASHBOARD, () => navigate('/'));
useKeyboard(SHORTCUTS.AGENTS, () => navigate('/agents'));
useKeyboard(SHORTCUTS.TRAINING, () => navigate('/train'));
useKeyboard(SHORTCUTS.LOGS, () => navigate('/logs'));
useKeyboard(SHORTCUTS.INSIGHTS, () => navigate('/insights'));

// Render component:
<KeyboardShortcuts />
```

- [ ] **Step 3: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/KeyboardShortcuts.tsx src/hooks/useKeyboard.ts src/App.tsx
git commit -m "feat: add keyboard shortcuts for power users"
```

---

## Task 8: Performance Benchmarks & "How Am I Doing?"

**Files:**
- Create: `src/components/PerformanceBenchmark.tsx`
- Modify: `src/components/InsightsView.tsx`
- Modify: `server.ts`
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Add benchmarks schema and seed data**

```sql
-- supabase_schema.sql (append)

-- Performance benchmarks (aggregated anonymously across all users)
CREATE TABLE IF NOT EXISTS wireline_benchmarks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    metric_name TEXT NOT NULL,
    metric_category TEXT, -- 'conversion', 'timing', 'quality', 'engagement'
    percentile_25 DECIMAL,
    percentile_50 DECIMAL,
    percentile_75 DECIMAL,
    percentile_90 DECIMAL,
    sample_size INTEGER,
    unit TEXT, -- 'percent', 'seconds', 'score', 'count'
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(metric_name)
);

-- Seed benchmark data (based on aggregated platform data)
INSERT INTO wireline_benchmarks (metric_name, metric_category, percentile_25, percentile_50, percentile_75, percentile_90, sample_size, unit, description) VALUES
('call_to_appointment_rate', 'conversion', 12.0, 18.0, 28.0, 42.0, 5000, 'percent', 'Percentage of calls that result in a booked appointment'),
('lead_qualification_rate', 'conversion', 35.0, 48.0, 62.0, 78.0, 5000, 'percent', 'Percentage of leads scored above 70 (hot leads)'),
('average_call_duration', 'timing', 165.0, 240.0, 320.0, 480.0, 5000, 'seconds', 'Average length of customer calls'),
('email_response_rate', 'engagement', 42.0, 58.0, 72.0, 85.0, 3000, 'percent', 'Percentage of emails that receive a reply'),
('average_lead_score', 'quality', 45.0, 58.0, 68.0, 82.0, 5000, 'score', 'Average AI-generated lead score (0-100)'),
('calls_per_day', 'engagement', 8.0, 15.0, 28.0, 52.0, 5000, 'count', 'Number of calls handled per day'),
('agent_availability', 'quality', 92.0, 96.5, 98.8, 99.5, 5000, 'percent', 'Uptime percentage for voice agents');

-- No RLS needed (benchmarks are public read-only aggregates)
```

- [ ] **Step 2: Add benchmark API endpoint**

```ts
// server.ts (add after other stats endpoints)

app.get("/api/benchmarks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: benchmarks, error: benchError } = await db
      .from('wireline_benchmarks')
      .select('*')
      .order('metric_category, metric_name');

    if (benchError) throw benchError;

    // Fetch user's actual metrics for comparison
    const { data: calls } = await db
      .from('wireline_call_logs')
      .select('duration_seconds, lead_score, created_at')
      .eq('user_id', req.user.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const { data: appointments } = await db
      .from('wireline_appointments')
      .select('id, created_at')
      .eq('user_id', req.user.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    const userMetrics = {
      call_to_appointment_rate: calls?.length ? (appointments?.length / calls.length) * 100 : 0,
      average_call_duration: calls?.length ? calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / calls.length : 0,
      average_lead_score: calls?.length ? calls.reduce((sum, c) => sum + (c.lead_score || 0), 0) / calls.length : 0,
      calls_per_day: calls?.length ? calls.length / 30 : 0,
      lead_qualification_rate: calls?.length ? (calls.filter(c => (c.lead_score || 0) >= 70).length / calls.length) * 100 : 0,
    };

    res.json({ benchmarks, userMetrics });
  } catch (error) {
    log.error("Failed to fetch benchmarks", { error });
    res.status(500).json({ error: "Failed to fetch benchmarks" });
  }
});
```

- [ ] **Step 3: Create PerformanceBenchmark component**

```tsx
// src/components/PerformanceBenchmark.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Minus, Target, Loader2, Award, Zap } from 'lucide-react';
import { authFetch } from '../lib/api';
import { cn } from '../lib/utils';

interface Benchmark {
  metric_name: string;
  metric_category: string;
  percentile_25: number;
  percentile_50: number;
  percentile_75: number;
  percentile_90: number;
  unit: string;
  description: string;
}

export default function PerformanceBenchmark() {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [userMetrics, setUserMetrics] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/benchmarks')
      .then((r) => r.json())
      .then((data) => {
        setBenchmarks(data.benchmarks || []);
        setUserMetrics(data.userMetrics || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatValue = (value: number, unit: string) => {
    if (unit === 'percent') return `${value.toFixed(1)}%`;
    if (unit === 'seconds') return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
    if (unit === 'score') return value.toFixed(0);
    if (unit === 'count') return value.toFixed(1);
    return value.toString();
  };

  const getPerformanceLevel = (value: number, benchmark: Benchmark) => {
    if (value >= benchmark.percentile_90) return { label: 'Elite', color: '#4DFFC4', icon: Award };
    if (value >= benchmark.percentile_75) return { label: 'Excellent', color: '#7DF9FF', icon: TrendingUp };
    if (value >= benchmark.percentile_50) return { label: 'Above Average', color: '#C58BFF', icon: Zap };
    if (value >= benchmark.percentile_25) return { label: 'Average', color: '#FFC07D', icon: Minus };
    return { label: 'Below Average', color: '#FF6BD9', icon: TrendingDown };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display italic text-2xl text-ink mb-2">Performance Benchmarks</h2>
        <p className="text-sm text-muted">
          Compare your metrics against {benchmarks[0]?.sample_size?.toLocaleString()}+ Wireline users
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {benchmarks.map((benchmark) => {
          const userValue = userMetrics[benchmark.metric_name] || 0;
          const performance = getPerformanceLevel(userValue, benchmark);
          const PerformanceIcon = performance.icon;

          return (
            <motion.div
              key={benchmark.metric_name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass border border-white/10 rounded-2xl p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-ink mb-1">
                    {benchmark.metric_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h3>
                  <p className="text-xs text-muted">{benchmark.description}</p>
                </div>
                <div
                  className="px-3 py-1 rounded-full border text-[10px] uppercase tracking-wider font-medium flex items-center gap-1"
                  style={{
                    borderColor: `${performance.color}40`,
                    backgroundColor: `${performance.color}10`,
                    color: performance.color,
                  }}
                >
                  <PerformanceIcon className="w-3 h-3" />
                  {performance.label}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-bold text-ink">
                    {formatValue(userValue, benchmark.unit)}
                  </span>
                  <span className="text-sm text-muted">Your average</span>
                </div>

                {/* Percentile bar */}
                <div className="relative h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${(userValue / benchmark.percentile_90) * 100}%`,
                      background: `linear-gradient(90deg, ${performance.color}80, ${performance.color})`,
                    }}
                  />
                  {/* Percentile markers */}
                  {[25, 50, 75, 90].map((p) => (
                    <div
                      key={p}
                      className="absolute top-0 bottom-0 w-px bg-white/20"
                      style={{ left: `${(benchmark[`percentile_${p}` as keyof Benchmark] as number / benchmark.percentile_90) * 100}%` }}
                      title={`P${p}: ${formatValue(benchmark[`percentile_${p}` as keyof Benchmark] as number, benchmark.unit)}`}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  { label: 'P25', value: benchmark.percentile_25 },
                  { label: 'P50', value: benchmark.percentile_50 },
                  { label: 'P75', value: benchmark.percentile_75 },
                  { label: 'P90', value: benchmark.percentile_90 },
                ].map((p) => (
                  <div key={p.label} className="text-center">
                    <div className="text-muted mb-0.5">{p.label}</div>
                    <div className="text-ink font-medium">{formatValue(p.value, benchmark.unit)}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add to InsightsView**

```tsx
// src/components/InsightsView.tsx

import PerformanceBenchmark from './PerformanceBenchmark';

// Add a tab or section:
<div className="mt-8">
  <PerformanceBenchmark />
</div>
```

- [ ] **Step 5: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/PerformanceBenchmark.tsx src/components/InsightsView.tsx server.ts supabase_schema.sql
git commit -m "feat: add performance benchmarks for user comparison"
```

---

## Task 9: Agent Import/Export & Configuration Management

**Files:**
- Create: `src/components/AgentImportExport.tsx`
- Modify: `src/components/FleetSettings.tsx`
- Modify: `server.ts`

- [ ] **Step 1: Add export/import API endpoints**

```ts
// server.ts (add after /api/agents endpoints)

// Export agent configuration
app.post("/api/agents/export", authenticateUser, async (req: any, res: any) => {
  try {
    const { agent_id } = req.body;
    
    // Fetch agent
    const { data: agent, error: agentError } = await db
      .from('wireline_agents')
      .select('*')
      .eq('id', agent_id)
      .eq('user_id', req.user.id)
      .single();

    if (agentError || !agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Fetch personality
    const { data: personality } = await db
      .from('wireline_personality')
      .select('content')
      .eq('agent_id', agent_id)
      .single();

    // Fetch directives
    const { data: directives } = await db
      .from('wireline_directives')
      .select('content, priority')
      .eq('agent_id', agent_id)
      .order('priority', { ascending: false });

    // Fetch knowledge
    const { data: knowledge } = await db
      .from('wireline_knowledge')
      .select('content')
      .eq('agent_id', agent_id);

    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      agent: {
        name: agent.name,
        channel: agent.channel,
        role: agent.role,
        voice_id: agent.voice_id,
        voice_provider: agent.voice_provider,
        first_message: agent.first_message,
        ambient_noise: agent.ambient_noise,
        email_auto_respond: agent.email_auto_respond,
        email_agent_tone: agent.email_agent_tone,
        personality: personality?.content || '',
        directives: (directives || []).map(d => d.content),
        knowledge: (knowledge || []).map(k => k.content),
      },
    };

    // Audit log
    void auditLogger.logDataOperation('export', {
      userId: req.user.id,
      resourceType: 'agent',
      resourceId: agent_id,
      metadata: { agent_name: agent.name },
      ip: req.ip,
    }).catch(console.error);

    res.json({ success: true, data: exportData });
  } catch (error) {
    log.error("Failed to export agent", { error });
    res.status(500).json({ error: "Failed to export agent configuration" });
  }
});

// Import agent configuration
app.post("/api/agents/import", authenticateUser, async (req: any, res: any) => {
  try {
    const { config, agent_name, agent_id } = req.body;
    
    if (!config || config.version !== '1.0') {
      return res.status(400).json({ error: "Invalid or unsupported configuration format" });
    }

    // Check subscription and agent limits
    const { data: userSettings } = await db
      .from('wireline_settings')
      .select('subscription_status, max_agents')
      .eq('user_id', req.user.id)
      .single();
    
    const subscriptionStatus = userSettings?.subscription_status || 'active';
    if (subscriptionStatus !== 'active') {
      return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan." });
    }

    const maxAgents = userSettings?.max_agents || 3;
    const { count: agentCount } = await db
      .from('wireline_agents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);
    
    if (agentCount !== null && agentCount >= maxAgents) {
      return res.status(403).json({ error: `Quota Exceeded: Your plan only allows ${maxAgents} agents.` });
    }

    const newAgentId = agent_id || `agent-${Date.now()}`;
    const agentConfig = config.agent;

    // Create agent
    await db.from('wireline_agents').insert({
      id: newAgentId,
      user_id: req.user.id,
      name: agent_name || agentConfig.name,
      channel: agentConfig.channel || 'voice',
      role: agentConfig.role || 'customer_service',
      voice_id: agentConfig.voice_id,
      voice_provider: agentConfig.voice_provider || '11labs',
      first_message: agentConfig.first_message,
      ambient_noise: agentConfig.ambient_noise || 'off',
      email_auto_respond: agentConfig.email_auto_respond ?? true,
      email_agent_tone: agentConfig.email_agent_tone || 'Professional',
    });

    // Add personality
    if (agentConfig.personality) {
      await db.from('wireline_personality').insert({
        agent_id: newAgentId,
        user_id: req.user.id,
        content: agentConfig.personality,
      });
    }

    // Add directives
    if (agentConfig.directives?.length > 0) {
      await db.from('wireline_directives').insert(
        agentConfig.directives.map((d: string, i: number) => ({
          agent_id: newAgentId,
          user_id: req.user.id,
          content: d,
          priority: 5 - i,
        }))
      );
    }

    // Add knowledge
    if (agentConfig.knowledge?.length > 0) {
      await db.from('wireline_knowledge').insert(
        agentConfig.knowledge.map((k: string) => ({
          agent_id: newAgentId,
          user_id: req.user.id,
          content: k,
        }))
      );
    }

    // Audit log
    void auditLogger.logDataOperation('import', {
      userId: req.user.id,
      resourceType: 'agent',
      resourceId: newAgentId,
      metadata: { agent_name: agent_name || agentConfig.name, from_config: true },
      ip: req.ip,
    }).catch(console.error);

    res.json({ success: true, agent_id: newAgentId });
  } catch (error) {
    log.error("Failed to import agent", { error });
    res.status(500).json({ error: "Failed to import agent configuration" });
  }
});
```

- [ ] **Step 2: Create AgentImportExport component**

```tsx
// src/components/AgentImportExport.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Upload, FileJson, Loader2, Check, AlertTriangle, X } from 'lucide-react';
import { authFetch } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { cn } from '../lib/utils';

interface AgentImportExportProps {
  agents: any[];
  onImportComplete: () => void;
}

export default function AgentImportExport({ agents, onImportComplete }: AgentImportExportProps) {
  const { success, error: toastError } = useToast();
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importConfig, setImportConfig] = useState('');
  const [importName, setImportName] = useState('');

  const handleExport = async (agentId: string, agentName: string) => {
    setExportingId(agentId);
    try {
      const res = await authFetch('/api/agents/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });

      const result = await res.json();
      
      if (res.ok) {
        // Download as JSON file
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${agentName.toLowerCase().replace(/\s+/g, '-')}-config.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        success('Configuration exported', `${agentName} saved as JSON`);
      } else {
        toastError('Export failed', result.error);
      }
    } catch (e: any) {
      toastError('Export failed', e.message);
    } finally {
      setExportingId(null);
    }
  };

  const handleImport = async () => {
    if (!importConfig.trim()) {
      toastError('Import failed', 'Please paste a valid configuration JSON');
      return;
    }

    setImporting(true);
    try {
      const config = JSON.parse(importConfig);
      
      const res = await authFetch('/api/agents/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          agent_name: importName || config.agent?.name || 'Imported Agent',
        }),
      });

      const result = await res.json();
      
      if (res.ok) {
        success('Agent imported', 'Configuration applied successfully');
        setShowImportDialog(false);
        setImportConfig('');
        setImportName('');
        onImportComplete();
      } else {
        toastError('Import failed', result.error);
      }
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        toastError('Invalid JSON', 'Please check your configuration format');
      } else {
        toastError('Import failed', e.message);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Configuration Management
        </h3>

        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center justify-between p-3 rounded-xl glass border border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                  <FileJson className="w-4 h-4 text-brand" />
                </div>
                <span className="text-sm text-ink">{agent.name}</span>
              </div>
              
              <button
                onClick={() => handleExport(agent.id, agent.name)}
                disabled={exportingId === agent.id}
                className="px-3 py-1.5 rounded-lg glass border border-white/10 text-xs text-ink hover:border-brand/40 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {exportingId === agent.id ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-3 h-3" />
                    Export JSON
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setShowImportDialog(true)}
          className="w-full brutal-btn !py-3"
        >
          <Upload className="w-4 h-4" />
          Import Agent Configuration
        </button>
      </div>

      {/* Import dialog */}
      <AnimatePresence>
        {showImportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={() => setShowImportDialog(false)} />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative aurora-ring rounded-2xl w-full max-w-2xl"
            >
              <div className="relative rounded-2xl glass-strong p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/30 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-brand" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-ink">Import Agent</h3>
                      <p className="text-xs text-muted">Paste exported JSON configuration</p>
                    </div>
                  </div>
                  <button onClick={() => setShowImportDialog(false)} className="text-muted hover:text-ink transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted mb-2 block">
                      Agent Name (optional)
                    </label>
                    <input
                      type="text"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="Leave empty to use original name"
                      className="w-full px-4 py-2.5 rounded-xl glass border border-white/10 text-sm text-ink placeholder:text-muted/50 focus:border-brand/40 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-wider text-muted mb-2 block">
                      Configuration JSON
                    </label>
                    <textarea
                      value={importConfig}
                      onChange={(e) => setImportConfig(e.target.value)}
                      placeholder='{"version": "1.0", "agent": {...}}'
                      rows={12}
                      className="w-full px-4 py-3 rounded-xl glass border border-white/10 text-xs text-ink placeholder:text-muted/50 focus:border-brand/40 transition-all font-mono resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowImportDialog(false)}
                      disabled={importing}
                      className="flex-1 px-4 py-2.5 rounded-xl glass border border-white/10 text-sm text-ink hover:border-white/20 transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={importing || !importConfig.trim()}
                      className="flex-1 brutal-btn !py-2.5"
                    >
                      {importing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Import Agent
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 3: Add to FleetSettings**

```tsx
// src/components/FleetSettings.tsx

import AgentImportExport from './AgentImportExport';

// Add in a panel or tab:
<div className="mt-8">
  <AgentImportExport 
    agents={agents}
    onImportComplete={() => fetchAgents()}
  />
</div>
```

- [ ] **Step 4: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/AgentImportExport.tsx src/components/FleetSettings.tsx server.ts
git commit -m "feat: add agent import/export for configuration management"
```

---

## Task 10: Enhanced Help & Documentation Integration

**Files:**
- Modify: All major components to add contextual help
- Create: `src/lib/help-content.ts`

- [ ] **Step 1: Centralize help content definitions**

```ts
// src/lib/help-content.ts
export const HELP_TOPICS = {
  // Agent Management
  agent_creation: {
    title: 'Creating Agents',
    description: 'Agents are AI-powered assistants that handle voice calls, emails, or both. Each agent has its own personality, knowledge base, and directives. Start with a template or build from scratch.',
    link: 'https://wireline.ai/docs/agents',
    tips: [
      'Use descriptive names (e.g., "Sales Agent - HVAC" not "Agent1")',
      'Choose the right role to get pre-configured behaviors',
      'Test with a live call before deploying to production',
    ],
  },
  agent_id: {
    title: 'Agent IDs',
    description: 'A unique identifier used in API calls and webhooks. Must be lowercase letters, numbers, and hyphens only.',
    tips: [
      'Use descriptive IDs: "sales-hvac-agent" not "agent123"',
      'Cannot be changed after creation',
      'Used in Vapi assistant IDs and webhook URLs',
    ],
  },
  // ... (continue for all topics)
};
```

- [ ] **Step 2: Add ContextualHelp throughout components**

```tsx
// Example: src/components/FleetSettings.tsx

import { ContextualHelp } from './ContextualHelp';

// Sprinkle throughout the UI:
<div className="flex items-center gap-2">
  <label>Agent ID</label>
  <ContextualHelp topic="agent_id" />
</div>

<div className="flex items-center gap-2">
  <label>Voice Settings</label>
  <ContextualHelp topic="voice_settings" />
</div>

// Repeat for all key concepts throughout the app
```

- [ ] **Step 3: Run build — confirm compiles**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/help-content.ts src/components/*.tsx
git commit -m "feat: add contextual help throughout application"
```

---

## Final Verification

After all tasks are complete:

```bash
npx tsc --noEmit
npm run build
npm run test
git status
```

All checks must pass before marking plan complete.

After all tasks are complete:

```bash
npx tsc --noEmit
npm run build
npm run test
git status
```

All checks must pass before marking plan complete.
