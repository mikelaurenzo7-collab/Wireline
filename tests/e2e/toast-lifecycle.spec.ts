import { expect, test } from "@playwright/test";
import { build } from "esbuild";

let fixture: string;

test.beforeAll(async () => {
  // Exercise the real provider with React's development-only effect replay,
  // independent of the production app build and without provider/API traffic.
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
        import React, { StrictMode, useEffect, useRef } from "react";
        import { createRoot } from "react-dom/client";
        import { ToastProvider, useToast } from "./src/contexts/ToastContext";
        function Notices() {
          const { toast, toasts } = useToast();
          const consumed = useRef(false);
          useEffect(() => {
            if (consumed.current) return;
            consumed.current = true;
            toast({ type: "warning", title: "One-shot warning", duration: 1000 });
            toast({ type: "info", title: "Persistent notice", duration: 0 });
          }, [toast]);
          return toasts.map(item => <p key={item.id} role="status">{item.title}</p>);
        }
        createRoot(document.getElementById("root")).render(
          <StrictMode><ToastProvider><Notices /></ToastProvider></StrictMode>
        );
      `,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  fixture = bundle.outputFiles[0].text;
});

test("Strict Mode keeps one-shot notification expiry and persistent notices", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-20T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-20T00:00:01Z"));
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: fixture });
  const warning = page.getByRole("status").filter({ hasText: "One-shot warning" });
  const persistent = page.getByRole("status").filter({ hasText: "Persistent notice" });
  await expect(warning).toBeVisible();
  await expect(persistent).toBeVisible();
  await page.clock.fastForward(999);
  await expect(warning).toBeVisible();
  await page.clock.fastForward(1);
  await expect(warning).toBeHidden();
  await page.clock.fastForward(60_000);
  await expect(persistent).toBeVisible();
});
