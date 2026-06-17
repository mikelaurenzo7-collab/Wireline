import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, type MotionProps } from "motion/react";
import {
  Activity,
  ArrowRight,
} from "lucide-react";
import PublicSiteHeader from "../components/marketing/PublicSiteHeader";
import IntegrationLogos from "../components/layout/IntegrationLogos";
import BrowserCallWidget from "../components/marketing/BrowserCallWidget";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import { LANDING_PUBLIC_DEMO_AGENTS } from "../data/contact-agents";

const STATS = [
  { value: "300ms", label: "Avg Latency" },
  { value: "Instant", label: "SMS Hand-off" },
  { value: "Shared", label: "Context" },
] as const;

const REVEAL: MotionProps = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
};

export default function LandingPage() {
  // Use the inbound CS demo (Jordan) instead of primary, since primary doesn't exist
  const csDemo = LANDING_PUBLIC_DEMO_AGENTS.find(a => a.name === "Jordan") || LANDING_PUBLIC_DEMO_AGENTS[0];

  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  return (
    <>
      <PageMeta
        title="Wireline | Enterprise AI Agent Platform"
        description="Deploy reasoning-native voice agents that sound human, negotiate complex workflows, and integrate flawlessly."
        image="/og-image.jpg"
      />

      <div className="marketing-launch min-h-screen bg-paper font-sans text-ink selection:bg-primary/20 selection:text-ink overflow-x-hidden">
        <PublicSiteHeader active="home" />

        {/* ─── Hero Section ─── */}
        <main id="main-content" className="relative pt-48 pb-32 px-6 md:px-12 max-w-7xl mx-auto space-y-32">
          
          <section className="flex flex-col items-center justify-center text-center relative z-10">
            <motion.div {...REVEAL} className="max-w-4xl mx-auto flex flex-col items-center gap-6">
              
              <div className="inline-flex items-center gap-2 px-3 py-1 mb-2 border border-primary/20 bg-primary/5 text-primary font-mono text-xs uppercase tracking-widest rounded-full">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                System Online
              </div>
              
              <h1 className="font-display text-[clamp(2.5rem,5vw,5rem)] leading-tight text-foreground">
                The AI agent platform for businesses that <span className="text-primary italic font-light">pick up the phone.</span>
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-2xl font-light">
                Deploy reasoning-native voice agents that sound human, negotiate complex workflows, and integrate flawlessly.
              </p>

              {/* Interactive Prompt Demo Wrapper */}
              <div className="mt-8 w-full max-w-lg relative overflow-hidden transition-all duration-500 group rounded-xl border border-border bg-card p-6 shadow-2">
                <BrowserCallWidget agentName={csDemo.name} />
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 mt-8">
                <Link
                  to="/signup"
                  className="w-full sm:w-auto inline-flex items-center justify-center font-mono text-xs uppercase tracking-widest bg-primary text-primary-foreground px-8 py-4 rounded-md hover:brightness-110 transition-all duration-300 shadow-glow"
                >
                  Start free trial
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
                <Link
                  to="/features"
                  className="w-full sm:w-auto inline-flex items-center justify-center font-mono text-xs uppercase tracking-widest text-muted-foreground border border-border px-8 py-4 rounded-md hover:text-foreground hover:bg-black/5 transition-all duration-300"
                >
                  Explore Features
                </Link>
              </div>
            </motion.div>
          </section>

          {/* ─── Bento Grid Section ─── */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-20 border-t border-border">
            
            {/* One fleet, every channel */}
            <motion.div {...REVEAL} className="md:col-span-8 bg-card border border-border rounded-xl p-8 flex flex-col justify-between min-h-[400px] relative overflow-hidden group shadow-1 hover:shadow-2 transition-shadow">
              <div className="z-10">
                <h2 className="font-display text-3xl text-foreground mb-4">One fleet, every channel</h2>
                <p className="text-lg text-muted-foreground max-w-md">Orchestrate complex customer journeys across Voice, SMS, and Email simultaneously. Agents maintain context perfectly.</p>
              </div>
              <div className="z-10 mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
                {STATS.map((stat, i) => (
                  <div key={stat.label} className="border-l-2 border-primary pl-4 py-2">
                    <div className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-1">{stat.label}</div>
                    <div className="font-sans font-bold text-xl text-foreground">{stat.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* The Moat */}
            <motion.div {...REVEAL} transition={{ delay: 0.1 }} className="md:col-span-4 bg-card border border-border rounded-xl p-8 flex flex-col justify-between min-h-[400px] relative shadow-1 hover:shadow-2 transition-shadow">
              <div className="z-10">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 bg-primary"></span>
                  <span className="font-mono text-xs text-primary uppercase tracking-widest">Architecture</span>
                </div>
                <h2 className="font-display text-3xl text-foreground mb-4">The Moat</h2>
                <p className="text-muted-foreground">Sonnet 4.6 for near-zero latency voice generation. Opus 4.8 for deep reasoning and complex tool execution in the background.</p>
              </div>
              <div className="mt-8 bg-background border border-border p-4 relative rounded-md">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-secondary rounded-l-md"></div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-border pb-2">
                    <span className="font-mono text-xs text-muted-foreground">VOICE LAYER</span>
                    <span className="font-mono text-xs font-bold text-primary">SONNET-4.6</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs text-muted-foreground">REASONING LAYER</span>
                    <span className="font-mono text-xs font-bold text-secondary-foreground">OPUS-4.8</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Live Supervisor Cockpit */}
            <motion.div {...REVEAL} transition={{ delay: 0.2 }} className="md:col-span-12 bg-card border border-border rounded-xl min-h-[500px] flex flex-col md:flex-row relative overflow-hidden shadow-1">
              <div className="p-8 md:w-1/3 flex flex-col justify-center z-10 border-r border-border">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse"></span>
                  <span className="font-mono text-xs text-destructive uppercase tracking-widest">Live Telemetry</span>
                </div>
                <h2 className="font-display text-3xl text-foreground mb-4">Live Supervisor Cockpit</h2>
                <p className="text-muted-foreground mb-8">Monitor fleet health in real-time. Jump into active calls, view the exact reasoning steps of agents, and override actions instantly.</p>
                <Link to="/features" className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-primary hover:text-primary transition-colors">
                  Explore Telemetry <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="md:w-2/3 h-64 md:h-auto relative bg-velvet flex items-center justify-center">
                 <div className="w-3/4 h-3/4 border border-primary/20 flex flex-col relative bg-card shadow-glow rounded-lg overflow-hidden">
                    <div className="p-4 border-b border-primary/20 font-mono text-xs text-primary">NODE_ID: ALPHA-09 // ACTIVE_SESSION</div>
                    <div className="p-4 flex-1 flex flex-col items-center justify-center font-mono text-sm text-muted-foreground space-y-2">
                        <Activity className="w-8 h-8 text-primary animate-pulse mb-4" />
                        <div>[Telemetry Stream Encrypted]</div>
                        <div className="text-xs opacity-50">Awaiting supervisor override...</div>
                    </div>
                 </div>
              </div>
            </motion.div>

          </section>

          {/* Social Proof */}
          <section className="py-24 text-center">
            <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mb-12">
              Trusted by Next-Generation AI Operators
            </p>
            <div className="opacity-50 hover:opacity-100 transition-opacity duration-500 filter grayscale hover:grayscale-0">
               <IntegrationLogos />
            </div>
          </section>

        </main>
        
        {/* ─── Footer ─── */}
        <footer className="border-t border-border bg-card py-12 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 font-mono text-xs text-muted-foreground">
            <div>© {new Date().getFullYear()} WIRELINE SYSTEMS INC.</div>
            <div className="flex gap-6">
              <Link className="hover:text-primary transition-colors" to="/terms">TERMS</Link>
              <Link className="hover:text-primary transition-colors" to="/privacy">PRIVACY</Link>
              <Link className="hover:text-primary transition-colors" to="#">STATUS</Link>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              ALL SYSTEMS OPERATIONAL
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
