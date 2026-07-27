import { ArrowLeft, Download, MonitorDown } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { CLIENT_SURFACE_POSTURE } from "../lib/product-copy";

const DOWNLOADS = [
  {
    id: "chromium",
    title: "Chromium (Chrome, Edge, Opera)",
    href: "/downloads/wireline-command-chromium.zip",
    steps: [
      "Unzip the package on your computer.",
      "Open chrome://extensions (or edge://extensions) and enable Developer mode.",
      "Click Load unpacked and select the unzipped folder (the one that contains manifest.json).",
      "Pin Wireline Command, then use the toolbar action, side panel, or Ctrl/Cmd+Shift+Y on any page.",
    ],
  },
  {
    id: "firefox",
    title: "Firefox",
    href: "/downloads/wireline-command-firefox.zip",
    steps: [
      "Unzip the package on your computer.",
      "Open about:debugging#/runtime/this-firefox.",
      "Click Load Temporary Add-on… and select manifest.json in the unzipped folder.",
      "Note: temporary add-ons are removed when Firefox restarts — use Chromium for day-to-day use.",
    ],
  },
] as const;

export default function BrowserCommandInstallPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard">
        <div className="mb-4">
          <Button asChild variant="link" className="px-0 text-sm text-muted-foreground">
            <Link to="/settings/apps">
              <ArrowLeft size={14} className="mr-1" /> Back to Apps
            </Link>
          </Button>
        </div>
        <WorkspacePageIntro
          title="Install Wireline Command"
          description={`${CLIENT_SURFACE_POSTURE.browser.status}. Explicit page context only — no background browsing, no token storage, no outbound from the extension.`}
        />

        <section className="mt-2 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="wl-paper wl-paper-elevated p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                <MonitorDown size={17} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-[var(--wireline-font-family-display)] text-[22px] font-normal tracking-[-0.02em]">
                  What you get
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Send the active tab (title, URL, selection, tel: links) into Studio as reference
                  context. Wireline still owns dialing, texts, Training, billing, and launch.
                </p>
              </div>
            </div>
            <ul className="mt-5 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>No host permissions and no silent page harvesting.</li>
              <li>You must be signed in to Wireline for Studio handoff to complete.</li>
              <li>Store listings stay deferred until this in-product path is the default.</li>
            </ul>
          </article>

          <article className="wl-paper border border-border/80 bg-muted/20 p-6">
            <p className="wl-overline text-primary">Privacy</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The extension reads the active page only after you click a command. Context rides in
              the Studio URL fragment, then is stripped and labeled reference-only before anything
              reaches your agent.
            </p>
          </article>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Download packages">
          {DOWNLOADS.map((pack) => (
            <article key={pack.id} className="wl-paper wl-paper-elevated flex flex-col p-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                {pack.title}
              </h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                {pack.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <Button asChild variant="editorial" size="sm" className="mt-auto w-fit pt-6">
                <a href={pack.href} download>
                  <Download size={14} className="mr-1.5" />
                  Download {pack.id === "chromium" ? "Chromium" : "Firefox"} zip
                </a>
              </Button>
            </article>
          ))}
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
