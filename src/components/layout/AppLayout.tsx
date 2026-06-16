import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../../lib/theme';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  const mainNav = [
    { label: 'Command Center', path: '/command', icon: '🎯' },
    { label: 'Triage', path: '/triage', icon: '⚖️' },
    { label: 'Agents', path: '/agents', icon: '🤖' },
    { label: 'Training', path: '/train', icon: '🎓' },
  ];

  const secondaryNav = [
    { label: 'Insights', path: '/insights' },
    { label: 'Integrations', path: '/integrations' },
    { label: 'Settings', path: '/settings' },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--wl-bg)] text-[var(--wl-text)]">
      {/* Refined Sidebar */}
      <aside className="sidebar hidden w-72 flex-col border-r border-[var(--wl-border)] lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-[var(--wl-border)] px-6">
          <Link to="/command" className="text-2xl font-semibold tracking-tighter">
            Wireline
          </Link>
          <div className="rounded bg-[var(--wl-surface-2)] px-2 py-0.5 text-[10px] font-mono text-[var(--wl-text-muted)]">
            v2.4
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          <div className="mb-2 px-3 text-xs font-semibold tracking-[1.5px] text-[var(--wl-text-muted)]">
            OPERATIONS
          </div>
          {mainNav.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${isActive ? 'active' : ''}`}
              >
                <span className="text-base opacity-70">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          <div className="my-4 border-t border-[var(--wl-border)]" />

          <div className="mb-2 px-3 text-xs font-semibold tracking-[1.5px] text-[var(--wl-text-muted)]">
            INSIGHTS
          </div>
          {secondaryNav.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="border-t border-[var(--wl-border)] p-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[var(--wl-cyan)]/20" />
            <div>
              <div className="text-sm font-medium">Michael Laurenzo</div>
              <div className="text-xs text-[var(--wl-text-muted)]">Founder</div>
            </div>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-[var(--wl-border)] bg-[var(--wl-bg)]/90 px-8 backdrop-blur">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm text-[var(--wl-text-secondary)]">Good evening, Michael</span>
            </div>
            <div className="rounded-full bg-[var(--wl-surface-2)] px-3 py-1 text-xs font-mono text-[var(--wl-cyan)]">
              12 agents • 3 live
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-[var(--wl-text-muted)]">Last synced just now</div>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}