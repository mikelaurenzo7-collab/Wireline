import React from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../../lib/theme';

interface MarketingLayoutProps {
  children: React.ReactNode;
}

export function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--wl-bg)] text-[var(--wl-text)]">
      {/* Clean Marketing Top Nav */}
      <nav className="sticky top-0 z-50 border-b border-[var(--wl-border)] bg-[var(--wl-bg)]/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
          <div className="flex items-center gap-10">
            <Link to="/" className="text-2xl font-semibold tracking-tighter">
              Wireline
            </Link>
            <div className="hidden items-center gap-8 text-sm md:flex">
              <Link to="/pricing" className="nav-link">Pricing</Link>
              <Link to="/compare" className="nav-link">Compare</Link>
              <Link to="/about" className="nav-link">About</Link>
              <Link to="/blog" className="nav-link">Blog</Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              to="/login"
              className="btn btn-ghost px-5 py-2 text-sm"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="btn btn-primary px-6 py-2 text-sm"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      {/* Simple Footer */}
      <footer className="border-t border-[var(--wl-border)] py-12 text-center text-sm text-[var(--wl-text-muted)]">
        <div className="mx-auto max-w-7xl px-8">
          © {new Date().getFullYear()} Wireline. Built with precision.
        </div>
      </footer>
    </div>
  );
}