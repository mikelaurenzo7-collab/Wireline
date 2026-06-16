import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../../lib/theme';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  const navItems = [
    { label: 'Command Center', path: '/command' },
    { label: 'Triage', path: '/triage' },
    { label: 'Agents', path: '/agents' },
    { label: 'Training', path: '/train' },
    { label: 'Insights', path: '/insights' },
    { label: 'Integrations', path: '/integrations' },
  ];

  return (
    <div className="flex min-h-screen bg-[var(--wl-bg)] text-[var(--wl-text)]">
      {/* Sidebar */}
      <aside className="sidebar hidden w-72 flex-col border-r border-[var(--wl-border)] lg:flex">
        <div className="flex h-16 items-center border-b border-[var(--wl-border)] px-6">
          <Link to="/command" className="text-xl font-semibold tracking-tighter">
            Wireline
          </Link>
        </div>

        <div className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
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
          <div className="flex items-center justify-between">
            <div className="text-sm text-[var(--wl-text-secondary)]">Michael Laurenzo</div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col">
        {/* Top Bar */}
        <header className="flex h-16 items-center justify-between border-b border-[var(--wl-border)] bg-[var(--wl-bg)]/80 px-8 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="text-sm text-[var(--wl-text-secondary)]">
              Good evening
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-[var(--wl-surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--wl-text-muted)]">
              12 agents active
            </div>
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