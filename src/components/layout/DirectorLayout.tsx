import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  DynamicFeed,
  RecordVoiceOver,
  AlternateEmail,
  Hub,
  Inventory2,
  Help,
  Terminal,
  Person,
  Sensors
} from "@mui/icons-material"; // Wait, I don't have Material Icons, I have Lucide!

import {
  FormInput,
  Mic,
  Mail,
  Network,
  Archive,
  HelpCircle,
  SquareTerminal,
  User,
  Radio,
  FileText
} from "lucide-react";

interface DirectorLayoutProps {
  children: React.ReactNode;
  title?: string;
  showArtifacts?: boolean;
}

export default function DirectorLayout({ children, title = "Director Sync // Protocol 7", showArtifacts = true }: DirectorLayoutProps) {
  const location = useLocation();

  const navItems = [
    { name: "Orchestrator", path: "/ops?tab=floor", icon: FormInput },
    { name: "Voice Core", path: "/ops?tab=intel", icon: Mic },
    { name: "Mail Logic", path: "/ops?tab=triage", icon: Mail },
    { name: "Node Map", path: "/ops?tab=analytics", icon: Network },
    { name: "Archive", path: "/archive", icon: Archive },
  ];

  const bottomItems = [
    { name: "Support", path: "/support", icon: HelpCircle },
    { name: "Logs", path: "/logs", icon: SquareTerminal },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row relative overflow-hidden dark">
      {/* SideNavBar */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-64 z-40 py-8 bg-[#15111b] border-r border-white/5 transition-all duration-300">
        <div className="px-6 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-card/50 border border-white/10 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-primary leading-none tracking-tighter">OP-ALPHA</h1>
              <p className="font-mono text-[10px] text-primary mt-1 uppercase tracking-widest">Verified Session</p>
            </div>
          </div>
          <button className="w-full mt-6 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-sans font-bold text-sm py-2 rounded-none hover:brightness-110 transition-all flex items-center justify-center gap-2 relative overflow-hidden group border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            <span className="relative z-10">Initialize Node</span>
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-1 mt-4 scrollbar-hide">
          {navItems.map((item) => {
            const isActive = location.search.includes(item.path.split("?")[1]) || location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 py-3 px-6 transition-all group ${
                  isActive
                    ? "bg-card/50 text-primary border-l-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <Icon className={`w-5 h-5 ${!isActive && "group-hover:scale-110 transition-transform"}`} />
                <span className={`font-mono text-xs uppercase tracking-wider ${isActive ? "font-bold" : ""}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto px-0 pt-4 border-t border-white/5">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.path}
                className="flex items-center gap-3 text-muted-foreground hover:text-foreground py-3 px-6 hover:bg-white/5 transition-all group"
              >
                <Icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="font-mono text-xs uppercase tracking-wider">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main Workspace Area */}
      <main className="flex-1 ml-0 md:ml-64 flex h-screen relative bg-background">
        <div className="flex-1 flex flex-col h-full bg-[#15111b] relative border-r border-white/5">
          {/* Header */}
          <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-velvet/90 backdrop-blur-md z-20 shrink-0">
            <div className="flex items-center gap-4">
              <Radio className="w-5 h-5 text-primary" />
              <h2 className="font-sans font-bold text-sm text-foreground">{title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="font-mono text-[10px] uppercase tracking-widest">Live</span>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scroll-viewport relative z-10">
            {children}
          </div>
        </div>

        {/* Artifacts Rail (Right Panel) */}
        {showArtifacts && (
          <aside className="hidden xl:flex w-80 flex-col h-full bg-velvet border-l border-white/5 shrink-0 z-20 shadow-[-10px_0_40px_rgba(0,0,0,0.2)]">
            <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 shrink-0">
              <h3 className="font-mono text-[10px] uppercase text-muted-foreground tracking-wider">Active Artifacts</h3>
              <FileText className="w-4 h-4 text-muted-foreground" />
            </header>
            <div className="flex-1 scroll-viewport p-6 flex flex-col gap-4">
              {/* Dummy Artifacts from the Premium Design */}
              <div className="bg-[#15111b] border border-white/10 p-4 rounded-none hover:border-primary/50 transition-colors cursor-pointer group shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <FileText className="w-4 h-4" />
                    <span className="font-mono text-[10px] uppercase tracking-widest">PRD-882-ALPHA</span>
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">14:05</span>
                </div>
                <h4 className="font-sans text-sm font-bold text-foreground mb-1">Voice Core Integration</h4>
                <p className="font-sans text-xs text-muted-foreground line-clamp-2">Detailed specification for wiring the new Opus 4.8 reasoning engine into the legacy telephony database via GraphQL endpoints.</p>
              </div>

              <div className="bg-[#15111b] border border-white/10 p-4 rounded-none hover:border-primary/50 transition-colors cursor-pointer group shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                    <Network className="w-4 h-4" />
                    <span className="font-mono text-[10px] uppercase tracking-widest">DB_SCHEMA_V4.JSON</span>
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground">14:03</span>
                </div>
                <div className="bg-background border border-white/5 p-2 font-mono text-[10px] text-muted-foreground line-clamp-3">
                  {`{\n  "version": "4.0",\n  "tables": [...]\n}`}
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
