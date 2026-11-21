import { expect, test, type Page } from "@playwright/test";

async function mockRehearsal(
  page: Page,
  failure: "no-microphone" | "peer-constructor" | "data-channel" | null = null,
) {
  const stops: string[] = [];
  const sessions: string[] = [];
  await page.addInitScript((failure) => {
    const activity = { microphones: 0, tracksStopped: 0, peersClosed: 0 };
    Object.assign(window, { rehearsalActivity: activity, rehearsalAnswers: 0 });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          activity.microphones += 1;
          if (failure === "no-microphone") throw new DOMException("No device", "NotFoundError");
          const track = {
            enabled: true,
            stop: () => {
              activity.tracksStopped += 1;
            },
          };
          return {
            getTracks: () => [track],
            getAudioTracks: () => [track],
          };
        },
      },
    });
    class Peer {
      constructor() {
        if (failure === "peer-constructor") throw new Error("Synthetic peer construction failure.");
      }
      iceGatheringState = "complete";
      connectionState = "new";
      localDescription: { sdp: string } | null = null;
      onconnectionstatechange: (() => void) | null = null;
      events = {
        readyState: "connecting",
        onopen: null as (() => void) | null,
        onmessage: null as ((message: { data: string }) => void) | null,
        send: () => undefined,
        close: () => {
          this.events.readyState = "closed";
        },
        addEventListener: () => undefined,
      };
      createDataChannel() {
        if (failure === "data-channel") throw new Error("Synthetic data channel failure.");
        Object.assign(window, {
          sendRehearsalEvent: (event: Record<string, unknown>) =>
            this.events.onmessage?.({ data: JSON.stringify(event) }),
        });
        return this.events;
      }
      addTrack() {}
      async createOffer() {
        return { sdp: `v=0\r\n${"a=synthetic-offer\r\n".repeat(8)}` };
      }
      async setLocalDescription(description: { sdp: string }) {
        this.localDescription = description;
      }
      async setRemoteDescription() {
        const counters = window as unknown as { rehearsalAnswers: number };
        counters.rehearsalAnswers += 1;
        this.connectionState = "connected";
        this.events.readyState = "open";
        this.onconnectionstatechange?.();
        this.events.onopen?.();
      }
      close() {
        this.connectionState = "closed";
        activity.peersClosed += 1;
      }
    }
    Object.assign(window, { RTCPeerConnection: Peer });
  }, failure);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/voice/live/session") {
      sessions.push(route.request().postDataJSON().agentId);
      await route.fulfill({
        json: { sdp: "v=0\r\n", cleanupToken: `token-${sessions.length}`, maxDurationSeconds: 60 },
      });
      return;
    }
    if (path === "/api/voice/live/session/stop") {
      stops.push(route.request().postDataJSON().cleanupToken);
      await route.fulfill({ json: { stopped: true } });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/auth/session"
          ? { user: { id: "rehearsal-owner", email: "owner@example.test" } }
          : path === "/api/agents"
            ? {
                agents: [
                  {
                    id: "bot-front-desk",
                    name: "Front Desk",
                    role: "receptionist",
                    phone_number: "+13125550123",
                  },
                  { id: "bot-sales", name: "Sales Bot", role: "sales" },
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
              : path.startsWith("/api/agent-config/")
                ? {
                    personality: "Clear",
                    voice: { voiceId: "marin", provider: "openai" },
                    directives: [],
                  }
                : { messages: [], accounts: [], numbers: [], integrations: [], data: [] },
    });
  });
  return { stops, sessions };
}

async function microphoneCount(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          rehearsalActivity: { microphones: number; tracksStopped: number; peersClosed: number };
        }
      ).rehearsalActivity,
  );
}

for (const width of [1440, 390]) {
  test(`voice-only rehearsal waits for Start and releases the microphone at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { stops, sessions } = await mockRehearsal(page);
    await page.goto("/studio?agent=bot-front-desk&workroom=test");
    await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Typed", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
    expect((await microphoneCount(page)).microphones).toBe(0);
    expect(sessions).toEqual([]);
    await expect(page.locator('[aria-label="Rehearsal Transcript"]')).toHaveCount(0);
    await expect(page.getByText("Ready for a Voice Rehearsal", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Call Your Live Bot", { exact: true })).toBeVisible();
    await expect(page.getByText("Actions Enabled", { exact: true })).toBeVisible();
    // Desktop browsers get the number with a copy button instead of a tel: link.
    const testCall = page.getByTestId("test-call-desktop");
    await expect(testCall).toBeVisible();
    await expect(testCall.getByRole("button", { name: /^Copy / })).toBeVisible();
    await page.getByRole("button", { name: "Start Rehearsal", exact: true }).click();
    await expect(page.getByText("Listening", { exact: true })).toBeVisible();
    expect(sessions).toEqual(["bot-front-desk"]);
    await page.getByRole("button", { name: "End Rehearsal", exact: true }).click();
    await expect.poll(() => stops).toEqual(["token-1"]);
    expect(await microphoneCount(page)).toEqual({
      microphones: 1,
      tracksStopped: 1,
      peersClosed: 1,
    });
    await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
    expect((await microphoneCount(page)).microphones).toBe(1);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`studio-voice-${width}.png`),
      fullPage: true,
    });
    await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
  });
}

test("compact voice reveals real transcript lines and keeps them after ending rehearsal", async ({
  page,
}) => {
  await mockRehearsal(page);
  await page.goto("/studio?agent=bot-front-desk&workroom=test");
  const transcript = page.locator('[aria-label="Rehearsal Transcript"]');
  await expect(transcript).toHaveCount(0);
  await page.getByRole("button", { name: "Start Rehearsal", exact: true }).click();
  await expect(page.getByText("Listening", { exact: true })).toBeVisible();
  await expect(transcript).toHaveCount(0);
  await page.evaluate(() => {
    const events = window as unknown as {
      sendRehearsalEvent: (event: Record<string, unknown>) => void;
    };
    events.sendRehearsalEvent({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "customer-one",
      transcript: "What time do you open?",
    });
    events.sendRehearsalEvent({
      type: "response.output_audio_transcript.delta",
      delta: "We open at nine.",
    });
    events.sendRehearsalEvent({ type: "response.done" });
  });
  await expect(transcript.getByText("What time do you open?", { exact: true })).toBeVisible();
  await expect(transcript.getByText("We open at nine.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "End Rehearsal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(transcript.getByText("What time do you open?", { exact: true })).toBeVisible();
  await expect(transcript.getByText("We open at nine.", { exact: true })).toBeVisible();
  await expect(transcript.locator('article[data-channel="voice"]')).toHaveCount(2);
});

test("a typed rehearsal clears a microphone warning and keeps a failed draft available", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { sessions } = await mockRehearsal(page, "no-microphone");
  let attempts = 0;
  await page.route("**/api/agents/bot-front-desk/test/stream", async (route) => {
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({
      content: "When do you open?",
      history: [],
    });
    if (attempts === 1) {
      await route.fulfill({ status: 503, body: "Unavailable" });
    } else {
      await route.fulfill({
        contentType: "text/event-stream",
        body: 'data: {"reply":"We open at nine."}\n\n',
      });
    }
  });
  await page.goto("/studio?agent=bot-front-desk&workroom=test");
  const start = page.getByRole("button", { name: "Start Rehearsal", exact: true });
  await start.click();
  await expect(page.getByText("Live Voice Needs Attention")).toBeVisible();
  await expect(page.getByText(/No microphone was found/)).toBeVisible();

  const draft = page.getByRole("textbox", { name: "Type a test", exact: true });
  const send = page.getByRole("button", { name: "Send test", exact: true });
  await draft.fill("When do you open?");
  await send.click();
  await expect(page.getByText("Text Test Could Not Finish")).toBeVisible();
  await expect(page.getByText("Live Voice Needs Attention")).toHaveCount(0);
  await expect(page.getByText(/No microphone was found/)).toHaveCount(0);
  await expect(draft).toHaveValue("When do you open?");

  await send.click();
  const transcript = page.locator('[aria-label="Rehearsal Transcript"]');
  const messages = transcript.locator('article[data-channel="text"]');
  await expect(messages).toHaveCount(2);
  await expect(messages.first()).toContainText("When do you open?");
  await expect(messages.last()).toContainText("We open at nine.");
  await expect(transcript.getByText("voice message", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Text Test Could Not Finish")).toHaveCount(0);
  expect(sessions).toEqual([]);
  expect((await microphoneCount(page)).microphones).toBe(1);
});

test("completed typed rehearsal turns survive reload on their Bot and can be cleared", async ({
  page,
}) => {
  const { sessions } = await mockRehearsal(page, "no-microphone");
  const frontDesk = "/studio?agent=bot-front-desk&workroom=test";
  const histories: unknown[] = [];
  await page.route("**/api/agents/bot-front-desk/test/stream", async (route) => {
    histories.push(route.request().postDataJSON().history);
    await route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ reply: "Diagnostic visits cost $89." })}\n\n`,
    });
  });

  await page.goto(frontDesk);
  const transcript = page.locator('[aria-label="Rehearsal Transcript"]');
  const draft = page.getByRole("textbox", { name: "Type a test", exact: true });
  const send = page.getByRole("button", { name: "Send test", exact: true });
  await draft.fill("What does a visit cost?");
  await send.click();
  await expect(transcript.getByText("Diagnostic visits cost $89.")).toBeVisible();

  await page.reload();
  await expect(transcript.getByText("What does a visit cost?")).toBeVisible();
  await expect(transcript.getByText("Diagnostic visits cost $89.")).toBeVisible();
  await expect(page.getByText("Private Rehearsal", { exact: true })).toBeVisible();
  expect(histories).toEqual([[]]);
  const start = page.getByRole("button", { name: "Start Rehearsal", exact: true });
  await start.click();
  await expect(page.getByText(/No microphone was found/)).toBeVisible();
  await expect(transcript.getByText("Diagnostic visits cost $89.")).toBeVisible();

  await draft.fill("Is that the diagnostic fee?");
  await send.click();
  await expect(transcript.locator("article")).toHaveCount(4);
  expect(histories).toEqual([
    [],
    [
      { role: "customer", content: "What does a visit cost?" },
      { role: "employee", content: "Diagnostic visits cost $89." },
    ],
  ]);
  expect(sessions).toEqual([]);

  await page.goto("/studio?agent=bot-sales&workroom=test");
  await expect(page.getByRole("heading", { name: "Speak With Sales Bot" })).toBeVisible();
  await expect(transcript).toHaveCount(0);
  await page.goto(frontDesk);
  await expect(transcript.locator("article")).toHaveCount(4);
  await page.getByRole("button", { name: "Clear transcript", exact: true }).click();
  await expect(transcript).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Speak With Front Desk" })).toBeVisible();
  await expect(transcript).toHaveCount(0);

  await draft.fill("Is there a trip fee?");
  await send.click();
  await expect(transcript.locator("article")).toHaveCount(2);
  let owner = "second-owner";
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ json: { user: { id: owner, email: "owner@example.test" } } });
  });
  for (const account of ["second-owner", "rehearsal-owner"]) {
    owner = account;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Speak With Front Desk" })).toBeVisible();
    await expect(transcript).toHaveCount(0);
  }
});

test("idle voice rehearsal fits 320px with enlarged text without starting a microphone", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const { sessions } = await mockRehearsal(page);
  await page.goto("/studio?agent=bot-front-desk&workroom=test");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("font-size", "32px", "important");
  });
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe("32px");
  const rehearsal = page.getByRole("region", {
    name: "Front Desk voice rehearsal",
    exact: true,
  });
  await expect(rehearsal).toBeVisible();
  await expect
    .poll(() =>
      rehearsal.locator("*").evaluateAll((elements) =>
        elements
          .filter((element) => {
            const style = getComputedStyle(element);
            return (
              element.clientWidth > 1 &&
              element.getBoundingClientRect().height > 1 &&
              style.overflowX !== "auto" &&
              style.overflowX !== "scroll" &&
              style.textOverflow !== "ellipsis"
            );
          })
          .filter((element) => element.scrollWidth > element.clientWidth + 2)
          .map((element) => `${element.tagName}: ${element.textContent?.trim().slice(0, 70)}`),
      ),
    )
    .toEqual([]);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  const start = page.getByRole("button", { name: "Start Rehearsal", exact: true });
  await start.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("studio-voice-320px-start.png"),
    fullPage: true,
  });
  await expect(start).toBeInViewport();
  const phone = page.getByTestId("test-call-desktop");
  await phone.scrollIntoViewIfNeeded();
  await expect(phone).toBeInViewport();
  expect((await microphoneCount(page)).microphones).toBe(0);
  expect(sessions).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("studio-voice-320px-enlarged.png"),
    fullPage: true,
  });
});

test("leaving while a voice session is accepted closes its late provider session", async ({
  page,
}) => {
  const { stops } = await mockRehearsal(page);
  let signalAccepted!: () => void;
  const accepted = new Promise<void>((resolve) => {
    signalAccepted = resolve;
  });
  let releaseAnswer!: () => void;
  const answer = new Promise<void>((resolve) => {
    releaseAnswer = resolve;
  });
  await page.route("**/api/voice/live/session", async (route) => {
    signalAccepted();
    await answer;
    await route.fulfill({ json: { sdp: "v=0\r\n", cleanupToken: "late-accepted-call" } });
  });
  await page.goto("/studio?agent=bot-front-desk&workroom=test");
  await page.getByRole("button", { name: "Start Rehearsal", exact: true }).click();
  await accepted;
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  releaseAnswer();
  await expect.poll(() => stops).toEqual(["late-accepted-call"]);
  expect(await microphoneCount(page)).toEqual({ microphones: 1, tracksStopped: 1, peersClosed: 1 });
  await page.getByRole("link", { name: "Open Front Desk conversation", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message Front Desk", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "End Rehearsal", exact: true })).toHaveCount(0);
});

test("switching Bots closes the previous rehearsal without starting the next Bot", async ({
  page,
}) => {
  const { stops, sessions } = await mockRehearsal(page);
  await page.goto("/studio?agent=bot-front-desk&workroom=test");
  await page.getByRole("button", { name: "Start Rehearsal", exact: true }).click();
  await expect(page.getByText("Listening", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Switch Bot" }).selectOption("bot-sales");
  await expect(page.getByText("Speak With Sales Bot", { exact: true })).toBeVisible();
  await expect.poll(() => stops).toEqual(["token-1"]);
  expect(sessions).toEqual(["bot-front-desk"]);
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Call connected line/ })).toHaveCount(0);
});

test("legacy customer commands stay in voice rehearsal without editing the Bot or starting audio", async ({
  page,
}) => {
  const { sessions } = await mockRehearsal(page);
  const writes: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      /^\/api\/(agents|agent-config|computer\/tasks)(\/|$)/.test(path)
    )
      writes.push(path);
  });
  await page.goto(
    "/studio?agent=bot-front-desk&workroom=test&command=Can%20I%20book%20tomorrow%3F&commandNonce=one",
  );
  await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Typed", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: /^Customer message for/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Type a test", exact: true })).toHaveValue("");
  expect((await microphoneCount(page)).microphones).toBe(0);
  expect(sessions).toEqual([]);
  await page.getByRole("button", { name: "Back to chat", exact: true }).click();
  await expect(page).not.toHaveURL(/command(?:Nonce)?=/);
  await page.getByRole("button", { name: "Use browser", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Task for Front Desk", exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("button", { name: /message instead$/i }).click();
  await expect(page.getByRole("textbox", { name: "Message Front Desk", exact: true })).toHaveValue(
    "",
  );
  expect(writes).toEqual([]);
  expect(sessions).toEqual([]);
  expect((await microphoneCount(page)).microphones).toBe(0);
});

test("opening mobile settings stops the hidden microphone rehearsal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { stops, sessions } = await mockRehearsal(page);
  await page.goto("/studio?agent=bot-front-desk&workroom=test");
  await page.getByRole("button", { name: "Start Rehearsal", exact: true }).click();
  await expect(page.getByText("Listening", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Set Up Bot", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Opening Greeting", exact: true })).toBeVisible();
  await expect.poll(() => stops).toEqual(["token-1"]);
  expect(await microphoneCount(page)).toEqual({ microphones: 1, tracksStopped: 1, peersClosed: 1 });
  expect(sessions).toEqual(["bot-front-desk"]);
});

for (const [label, token] of [
  ["missing", undefined],
  ["object", { token: "unusable" }],
  ["blank", ""],
  ["padded", " token "],
  ["oversized", "x".repeat(2_049)],
] as const) {
  test(`a ${label} cleanup capability never attaches the accepted voice answer`, async ({
    page,
  }) => {
    const { stops } = await mockRehearsal(page);
    await page.route("**/api/voice/live/session", (route) =>
      route.fulfill({ json: { sdp: "v=0\r\n", cleanupToken: token } }),
    );
    await page.goto("/studio?agent=bot-front-desk&workroom=test");
    await page.getByRole("button", { name: "Start Rehearsal", exact: true }).click();
    await expect(
      page.getByText("Voice rehearsal could not be controlled safely. Try again.", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { rehearsalAnswers: number }).rehearsalAnswers,
      ),
    ).toBe(0);
    expect(await microphoneCount(page)).toEqual({
      microphones: 1,
      tracksStopped: 1,
      peersClosed: 1,
    });
    expect(stops).toEqual([]);
    await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  });
}

for (const failure of ["peer-constructor", "data-channel"] as const) {
  test(`a ${failure} failure releases the acquired microphone before any provider request`, async ({
    page,
  }) => {
    const { stops, sessions } = await mockRehearsal(page, failure);
    await page.goto("/studio?agent=bot-front-desk&workroom=test");
    await page.getByRole("button", { name: "Start Rehearsal", exact: true }).click();
    await expect(
      page.getByText(
        failure === "peer-constructor"
          ? "Synthetic peer construction failure."
          : "Synthetic data channel failure.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(await microphoneCount(page)).toEqual({
      microphones: 1,
      tracksStopped: 1,
      peersClosed: failure === "data-channel" ? 1 : 0,
    });
    expect(sessions).toEqual([]);
    expect(stops).toEqual([]);
    await expect(page.getByRole("button", { name: "Start Rehearsal", exact: true })).toBeVisible();
  });
}
