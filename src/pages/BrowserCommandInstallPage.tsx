import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Link } from "react-router";

import { Badge, Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import SettingsTabs from "../components/settings/SettingsTabs";
import { CLIENT_SURFACE_POSTURE } from "../lib/product-copy";

const DOWNLOADS = [
  {
    id: "chromium",
    title: "Chrome, Edge & Opera",
    href: "/downloads/botbound-command-chromium.zip",
    steps: [
      "Download and unzip the package.",
      "Open chrome://extensions (or edge://extensions) and enable Developer mode.",
      "Choose Load unpacked, then the folder containing manifest.json.",
      "Pin BotBound Command. Open it from the toolbar, side panel, or Ctrl/Cmd+Shift+Y.",
    ],
  },
  {
    id: "firefox",
    title: "Firefox",
    href: "/downloads/botbound-command-firefox.zip",
    steps: [
      "Download and unzip the package.",
      "Open about:debugging#/runtime/this-firefox.",
      "Choose Load Temporary Add-on… and select manifest.json in the unzipped folder.",
    ],
  },
] as const;

export default function BrowserCommandInstallPage() {
  const [browser, setBrowser] = useState<"chromium" | "firefox">("chromium");
  const pack = DOWNLOADS.find((item) => item.id === browser)!;

  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame>
        <SettingsTabs />
        <Button asChild variant="link" className="w-fit px-0 text-sm text-muted-foreground">
          <Link to="/settings/apps">
            <ArrowLeft size={14} />
            Back to Apps
          </Link>
        </Button>
        <WorkspacePageIntro
          title="Install BotBound Command"
          description="Send page details, selected text, and phone links to Studio."
          action={
            <div>
              <Badge variant="info">{CLIENT_SURFACE_POSTURE.browser.status}</Badge>
            </div>
          }
        />

        <section className="space-y-5" aria-label="Download packages">
          <div role="group" aria-label="Browser" className="flex flex-wrap gap-2">
            {DOWNLOADS.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={browser === item.id ? "secondary" : "ghost"}
                aria-pressed={browser === item.id}
                onClick={() => setBrowser(item.id)}
              >
                {item.title}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-lg font-semibold text-foreground">Install in {pack.title}</h2>
            <Button asChild variant="editorial" size="sm">
              <a href={pack.href} download>
                <Download size={14} />
                Download {pack.id === "chromium" ? "Chromium" : "Firefox"} ZIP
              </a>
            </Button>
          </div>
          {browser === "firefox" ? (
            <p role="note" className="text-sm text-muted-foreground">
              Temporary install: Firefox removes it on restart. Use Chromium for daily use.
            </p>
          ) : null}
          <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed text-foreground marker:text-muted-foreground">
            {pack.steps.map((step) => (
              <li key={step} className="pl-2">
                {step}
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Sign in to BotBound to continue in Studio.
          </p>
        </section>

        <details className="border-t border-border/60 py-3">
          <summary className="cursor-pointer py-2 text-sm font-semibold text-foreground wl-focus-ring-halo">
            Privacy
          </summary>
          <p className="max-w-prose py-3 text-sm leading-relaxed text-muted-foreground">
            Reads pages only when you ask. No background browsing, account-token storage, or live
            calls. Shared content is treated as reference material.
          </p>
        </details>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
