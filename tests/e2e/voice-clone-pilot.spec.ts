import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const CONSENT_VERSION = "voice-reference-self-speaker-v1-2026-10-17";
const QUALITY_VERSION = "voice-reference-quality-v1-2026-10-17";
const ASSET_ID = "12345678-1234-1234-1234-123456789012";
const RESERVED_USD = 0.002;
type Asset = {
  id: string;
  name: string;
  status: "pending_review" | "approved" | "deleted";
  version: number;
  sourceSha256: string;
  durationSeconds: number;
  sampleRateHz: number;
  createdAt: string;
  reviewedAt: string | null;
  revokedAt: string | null;
};

/** Synthetic six-second PCM fixture. It contains no person's voice or biometric data. */
function syntheticWav(): Buffer {
  const frames = 6 * 24_000;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24_000, 24);
  bytes.writeUInt32LE(48_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 2, 40);
  for (let index = 0; index < frames; index++)
    bytes.writeInt16LE(
      Math.round(Math.sin((index / 24_000) * 440 * Math.PI * 2) * 2_000),
      44 + index * 2,
    );
  return bytes;
}
function reference(name = "Founder voice"): Asset {
  return {
    id: ASSET_ID,
    name,
    status: "pending_review",
    version: 1,
    sourceSha256: "a".repeat(64),
    durationSeconds: 6,
    sampleRateHz: 24_000,
    createdAt: "2026-10-17T15:00:00.000Z",
    reviewedAt: null,
    revokedAt: null,
  };
}

async function mockPilot(
  page: Page,
  { available = true, saved = [] }: { available?: boolean; saved?: Asset[] } = {},
) {
  const state = {
    assets: saved.map((asset) => ({ ...asset })),
    listReads: 0,
    creates: 0,
    reviews: 0,
    previews: 0,
    deletes: 0,
    callingVoiceChanges: 0,
  };
  await page.addInitScript(() => {
    Object.assign(window, { voicePilotMicrophones: 0 });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const counters = window as unknown as { voicePilotMicrophones: number };
          counters.voicePilotMicrophones += 1;
          throw new Error("This upload-only UI fixture must never request a microphone.");
        },
      },
    });
  });
  // Every API request is intercepted: no real account, database, billing,
  // inference worker, voice provider, or carrier participates in these tests.
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/voice/assets/capabilities") {
      await route.fulfill({
        json: available
          ? {
              available: true,
              scope: "private_preview",
              engineReady: true,
              consentVersion: CONSENT_VERSION,
              qualityCheckVersion: QUALITY_VERSION,
              maxReferenceBytes: 2_000_000,
              minReferenceSeconds: 6,
              maxReferenceSeconds: 20,
              previewReserveUsd: RESERVED_USD,
            }
          : { available: false },
      });
      return;
    }
    if (path === "/api/voice/assets" && method === "GET") {
      state.listReads += 1;
      await route.fulfill({ json: { assets: state.assets } });
      return;
    }
    if (path === "/api/voice/assets" && method === "POST") {
      const input = request.postDataJSON() as Record<string, unknown>;
      expect(input.consentVersion).toBe(CONSENT_VERSION);
      expect(input.consentAccepted).toBe(true);
      expect(typeof input.name).toBe("string");
      expect(typeof input.referenceAudioBase64).toBe("string");
      expect(Buffer.from(String(input.referenceAudioBase64), "base64").equals(syntheticWav())).toBe(
        true,
      );
      state.creates += 1;
      const asset = reference(String(input.name));
      state.assets.unshift(asset);
      await route.fulfill({ status: 201, json: { asset } });
      return;
    }
    if (path === `/api/voice/assets/${ASSET_ID}/review`) {
      const asset = state.assets[0];
      expect(method).toBe("POST");
      expect(request.postDataJSON()).toEqual({
        expectedVersion: asset.version,
        sourceSha256: asset.sourceSha256,
        qualityCheckVersion: QUALITY_VERSION,
      });
      state.reviews += 1;
      const approved: Asset = {
        ...asset,
        status: "approved",
        version: asset.version + 1,
        reviewedAt: "2026-10-17T15:01:00.000Z",
      };
      state.assets = [approved];
      await route.fulfill({ json: { asset: approved } });
      return;
    }
    if (path === `/api/voice/assets/${ASSET_ID}/preview`) {
      expect(method).toBe("POST");
      expect(request.postDataJSON()).toEqual({
        expectedVersion: state.assets[0].version,
        expectedReserveUsd: RESERVED_USD,
      });
      state.previews += 1;
      await route.fulfill({
        contentType: "audio/wav",
        body: syntheticWav(),
        headers: { "X-Voice-Preview-Reserve-Usd": String(RESERVED_USD) },
      });
      return;
    }
    if (path === `/api/voice/assets/${ASSET_ID}` && method === "DELETE") {
      const asset = state.assets[0];
      expect(request.postDataJSON()).toEqual({ expectedVersion: asset.version });
      state.deletes += 1;
      state.assets = [];
      await route.fulfill({
        json: {
          asset: {
            ...asset,
            status: "deleted",
            version: asset.version + 1,
            revokedAt: "2026-10-17T15:02:00.000Z",
          },
        },
      });
      return;
    }
    if (path.endsWith("/voice") && method === "PATCH") state.callingVoiceChanges += 1;
    if (path.startsWith("/api/voice/live/")) {
      await route.fulfill({
        status: 503,
        json: { error: "Live voice is outside this isolated fixture." },
      });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "00000000-0000-0000-0000-000000000001", email: "owner@example.test" } }
          : path === "/api/agents"
            ? {
                agents: [
                  {
                    id: "voice-pilot-bot",
                    name: "Front Desk",
                    role: "receptionist",
                    phone_number: "+13125550123",
                    mark_key: "spark-rose",
                  },
                ],
              }
            : path === "/api/billing/status"
              ? {
                  channel_entitlements: {
                    plan_id: "omnichannel",
                    subscription_status: "active",
                    channels: ["voice", "email", "sms"],
                  },
                }
              : path === "/api/agent-config/voice-pilot-bot/business"
                ? {
                    businessProfile: {
                      business_hours: null,
                      timezone: "America/Chicago",
                      escalation_phone: null,
                      escalation_email: null,
                      escalation_handoff_enabled: false,
                      escalation_keywords: [],
                      transfer_phone: null,
                    },
                  }
                : path.startsWith("/api/agent-config/")
                  ? {
                      personality: "Clear",
                      voice: { voiceId: "marin", provider: "openai" },
                      directives: [],
                      mark_key: "spark-rose",
                    }
                  : { messages: [], accounts: [], numbers: [], integrations: [], data: [] },
    });
  });
  return state;
}

async function openVoice(page: Page) {
  await page.goto("/studio?agent=voice-pilot-bot&section=setup");
  const voice = page.getByRole("region", { name: "Phone Voice", exact: true });
  await expect(voice).toBeVisible();
  await expect(voice.locator("summary")).toContainText("Marin");
  return voice;
}

async function capture(page: Page, info: TestInfo, name: string) {
  const directory =
    process.env.BOTBOUND_VOICE_PROOF_DIR ||
    join(process.cwd(), "output", "proofs", "voice-clone-pilot");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
  await info.attach(`${name}-scope`, {
    body: "Mocked local UI proof. Synthetic WAV only; no live account, microphone, inference, carrier, or production readiness evidence.",
    contentType: "text/plain",
  });
}

async function noNestedOverflow(root: Locator) {
  await expect
    .poll(() =>
      root.evaluate((element) =>
        [element, ...element.querySelectorAll<HTMLElement>("*")]
          .filter((item) => {
            const style = getComputedStyle(item);
            return (
              item.clientWidth > 1 &&
              item.getBoundingClientRect().height > 1 &&
              // A native single-line text field scrolls its value by design.
              // Check its box separately; do not mistake its editable content
              // for overflowing layout at enlarged text sizes.
              !(item instanceof HTMLInputElement && item.type === "text") &&
              style.overflowX !== "auto" &&
              style.overflowX !== "scroll" &&
              style.textOverflow !== "ellipsis"
            );
          })
          .filter((item) => item.scrollWidth > item.clientWidth + 2)
          .map((item) => ({
            tag: item.tagName,
            text: item.textContent?.trim().slice(0, 70),
            width: item.clientWidth,
            scroll: item.scrollWidth,
          })),
      ),
    )
    .toEqual([]);
  await expect
    .poll(() =>
      root.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll<HTMLInputElement>("input")]
          .filter((input) => input.type === "text" && input.getBoundingClientRect().height > 1)
          .filter((input) => {
            const field = input.getBoundingClientRect();
            return field.left < bounds.left - 1 || field.right > bounds.right + 1;
          })
          .map((input) => input.id);
      }),
    )
    .toEqual([]);
}
async function microphones(page: Page) {
  return page.evaluate(
    () => (window as unknown as { voicePilotMicrophones: number }).voicePilotMicrophones,
  );
}

test("closed custom-voice pilot stays hidden while all ten OpenAI calling voices remain", async ({
  page,
}) => {
  const state = await mockPilot(page, { available: false });
  const voice = await openVoice(page);
  await expect(voice.getByRole("region", { name: "Private custom voice previews" })).toHaveCount(0);
  await voice.locator("summary").click();
  await expect(voice.getByText("10 Built-In Voices", { exact: true })).toBeVisible();
  await expect(voice.locator("button[aria-pressed]")).toHaveCount(10);
  await expect(voice.getByRole("button", { name: "Marin Selected", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(state.listReads).toBe(0);
  expect(state.previews).toBe(0);
  expect(state.callingVoiceChanges).toBe(0);
  expect(await microphones(page)).toBe(0);
});

test("native voice pilot uploads, reviews, previews, and deletes without changing the calling voice", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => localStorage.setItem("wireline-theme", "light"));
  const state = await mockPilot(page);
  const voice = await openVoice(page);
  const panel = voice.getByRole("region", { name: "Private custom voice previews", exact: true });
  await expect(panel.getByText("No voice recordings saved.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Add voice", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create Your Voice", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: "Save voice", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Voice name", exact: true }).fill("Founder voice");
  await dialog
    .getByLabel("Upload voice recording", { exact: true })
    .setInputFiles({ name: "founder-voice.wav", mimeType: "audio/wav", buffer: syntheticWav() });
  await expect(dialog.getByText("founder-voice.wav · 6.0s", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save voice", exact: true })).toBeDisabled();
  await noNestedOverflow(dialog);
  await capture(page, info, "voice-clone-desktop-dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Save voice", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByText("Founder voice", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Approve private preview", exact: true }),
  ).toBeDisabled();
  expect(state.previews).toBe(0);
  await panel.getByRole("checkbox", { name: "I have reviewed my recording.", exact: true }).check();
  await panel.getByRole("button", { name: "Approve private preview", exact: true }).click();
  await expect(
    panel.getByText("Preview reserves $0.002 of AI allowance.", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("6.0s · Ready to preview", { exact: true })).toBeVisible();
  expect(state.previews).toBe(0);
  await panel.getByRole("button", { name: "Preview Founder voice", exact: true }).click();
  const player = panel.locator('audio[aria-label="Generated preview of Founder voice"]');
  await expect(player).toBeVisible();
  await expect(player).not.toHaveAttribute("autoplay");
  expect(await player.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  expect(state.previews).toBe(1);
  await panel.scrollIntoViewIfNeeded();
  await noNestedOverflow(panel);
  await capture(page, info, "voice-clone-desktop-asset-list");
  await panel.getByRole("button", { name: "Delete Founder voice", exact: true }).click();
  expect(state.deletes).toBe(0);
  await panel.getByRole("button", { name: "Keep voice", exact: true }).click();
  expect(state.deletes).toBe(0);
  await panel.getByRole("button", { name: "Delete Founder voice", exact: true }).click();
  await panel.getByRole("button", { name: "Confirm delete Founder voice", exact: true }).click();
  await expect(panel.getByText("No voice recordings saved.", { exact: true })).toBeVisible();
  await expect(player).toHaveCount(0);
  expect({
    creates: state.creates,
    reviews: state.reviews,
    previews: state.previews,
    deletes: state.deletes,
  }).toEqual({ creates: 1, reviews: 1, previews: 1, deletes: 1 });
  expect(state.callingVoiceChanges).toBe(0);
  expect(await microphones(page)).toBe(0);
  await expect(voice.locator("summary")).toContainText("Marin");
});

for (const enlarged of [false, true]) {
  test(`private voice controls and dialog fit 320px${enlarged ? " at 200% text" : ""} in dark mode`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem("wireline-theme", "dark"));
    const state = await mockPilot(page, { saved: [reference("Founder voice")] });
    const voice = await openVoice(page);
    const panel = voice.getByRole("region", { name: "Private custom voice previews", exact: true });
    await expect(panel).toBeVisible();
    if (enlarged) {
      await page.evaluate(() =>
        document.documentElement.style.setProperty("font-size", "32px", "important"),
      );
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
        .toBe("32px");
    }
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await noNestedOverflow(panel);
    await panel.getByRole("button", { name: "Review Founder voice", exact: true }).click();
    await expect(
      panel.getByRole("checkbox", { name: "I have reviewed my recording.", exact: true }),
    ).toBeVisible();
    await noNestedOverflow(panel);
    await panel.scrollIntoViewIfNeeded();
    await capture(page, info, `voice-clone-320${enlarged ? "-200pct" : ""}-dark-assets`);
    const add = panel.getByRole("button", { name: "Add voice", exact: true });
    await add.click();
    const dialog = page.getByRole("dialog", { name: "Create Your Voice", exact: true });
    await expect(dialog).toBeVisible();
    const title = dialog.getByRole("heading", { name: "Create Your Voice", exact: true });
    expect(
      await title.evaluate((element) => {
        const text = element.firstChild;
        if (!text || text.nodeType !== Node.TEXT_NODE) return false;
        return [...(text.textContent ?? "").matchAll(/\S+/g)].every((word) => {
          const range = document.createRange();
          range.setStart(text, word.index!);
          range.setEnd(text, word.index! + word[0].length);
          return range.getClientRects().length === 1;
        });
      }),
    ).toBe(true);
    const voiceName = dialog.getByRole("textbox", { name: "Voice name", exact: true });
    await expect(voiceName).toBeFocused();
    await voiceName.fill("My voice");
    await expect(voiceName).toHaveValue("My voice");
    await noNestedOverflow(dialog);
    await capture(page, info, `voice-clone-320${enlarged ? "-200pct" : ""}-dark-dialog-top`);
    await dialog
      .getByLabel("Upload voice recording", { exact: true })
      .setInputFiles({ name: "my-voice.wav", mimeType: "audio/wav", buffer: syntheticWav() });
    await dialog.getByRole("checkbox").check();
    const save = dialog.getByRole("button", { name: "Save voice", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await expect(save).toBeEnabled();
    await noNestedOverflow(dialog);
    await capture(page, info, `voice-clone-320${enlarged ? "-200pct" : ""}-dark-dialog-bottom`);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(add).toBeFocused();
    expect(state.creates).toBe(0);
    expect(state.previews).toBe(0);
    expect(state.callingVoiceChanges).toBe(0);
    expect(await microphones(page)).toBe(0);
  });
}
