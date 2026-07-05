const api = globalThis.browser ?? globalThis.chrome;

const STUDIO_URL = "https://trywireline.com/studio?create=1";
const ROUTES = new Map([
  ["studio", "https://trywireline.com/studio"],
  ["agents", "https://trywireline.com/agents"],
  ["training", "https://trywireline.com/training"],
  ["wire", "https://trywireline.com/actions"],
  ["billing", "https://trywireline.com/settings/billing"],
  ["settings", "https://trywireline.com/settings"],
]);
const MAX_SELECTION_LENGTH = 1600;
const MAX_DESCRIPTION_LENGTH = 320;

function truncate(value, length) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function activeTab() {
  const [tab] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("No active browser tab is available.");
  return tab;
}

async function capturePageContext(tab, suppliedSelection = "", suppliedLink = "") {
  let pageDetails = { selection: "", description: "" };

  try {
    const result = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        selection: window.getSelection?.().toString() || "",
        description:
          document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
      }),
    });
    pageDetails = result?.[0]?.result || pageDetails;
  } catch {
    // Browser-internal pages and restricted documents cannot be inspected. The tab title and URL remain useful.
  }

  return {
    version: 1,
    source: "browser-extension",
    capturedAt: new Date().toISOString(),
    title: truncate(tab.title || "Untitled page", 180),
    url: typeof tab.url === "string" ? tab.url : "",
    description: truncate(pageDetails.description, MAX_DESCRIPTION_LENGTH),
    selection: truncate(suppliedSelection || pageDetails.selection, MAX_SELECTION_LENGTH),
    link: typeof suppliedLink === "string" ? suppliedLink : "",
  };
}

function openStudio(context, request = "") {
  const fragment = encodeBase64Url({ ...context, request: truncate(request, 800) });
  return api.tabs.create({ url: `${STUDIO_URL}#browser-context=${fragment}` });
}

function requestForAction(action, context = {}) {
  const link = typeof context.link === "string" ? context.link.replace(/^tel:/iu, "").trim() : "";
  if (action === "call") {
    return link
      ? `Have a Wireline agent prepare a call to ${link}. Use this page as context, then ask me to confirm before any live call.`
      : "Have a Wireline agent prepare a call using this page as context. Ask me for the number and confirmation before any live call.";
  }
  if (action === "text") {
    return "Have a Wireline agent draft a text message using this page as context. Ask me to review before sending.";
  }
  if (action === "followup") {
    return "Have a Wireline agent create a concise follow-up from this page and selected text. Include next step, owner, and timing.";
  }
  return "Use this page and selected text as context for a Wireline agent task.";
}

async function openCompanion(tab) {
  if (api.sidePanel?.open && tab?.windowId != null) {
    await api.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (api.sidebarAction?.open) {
    await api.sidebarAction.open();
    return;
  }
  await api.tabs.create({ url: "https://trywireline.com/studio" });
}

async function registerMenus() {
  await api.contextMenus.removeAll();
  api.contextMenus.create({
    id: "wireline-agent-task",
    title: "Ask Wireline about this page",
    contexts: ["page"],
  });
  api.contextMenus.create({
    id: "wireline-capture-selection",
    title: "Send selection to Wireline",
    contexts: ["selection"],
  });
  api.contextMenus.create({
    id: "wireline-call-from-page",
    title: "Prepare a Wireline call from this page",
    contexts: ["page", "selection"],
  });
  api.contextMenus.create({
    id: "wireline-text-from-page",
    title: "Draft a Wireline text from this page",
    contexts: ["page", "selection"],
  });
  api.contextMenus.create({
    id: "wireline-followup-from-page",
    title: "Create Wireline follow-up",
    contexts: ["page", "selection"],
  });
  api.contextMenus.create({
    id: "wireline-call-number",
    title: "Prepare a Wireline call to this number",
    contexts: ["link"],
    targetUrlPatterns: ["tel:*"],
  });
}

api.runtime.onInstalled.addListener(() => {
  void registerMenus();
  void api.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
});

api.action?.onClicked.addListener((tab) => {
  void openCompanion(tab).catch(() => undefined);
});

api.commands.onCommand.addListener((command) => {
  if (command !== "capture-current-page") return;
  void activeTab()
    .then((tab) => capturePageContext(tab))
    .then((context) => openStudio(context, requestForAction("task", context)))
    .catch(() => undefined);
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  void capturePageContext(tab, info.selectionText || "", info.linkUrl || "")
    .then((context) => {
      const action =
        info.menuItemId === "wireline-call-number" || info.menuItemId === "wireline-call-from-page"
          ? "call"
          : info.menuItemId === "wireline-text-from-page"
            ? "text"
            : info.menuItemId === "wireline-followup-from-page"
              ? "followup"
              : "task";
      return openStudio(context, requestForAction(action, context));
    })
    .catch(() => undefined);
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    if (message?.type === "wireline:get-active-context") {
      const tab = await activeTab();
      return capturePageContext(tab);
    }
    if (message?.type === "wireline:open-studio") {
      const tab = await activeTab();
      const context = await capturePageContext(tab, message.selection || "");
      await openStudio(context, message.request || requestForAction(message.action || "task", context));
      return { opened: true };
    }
    if (message?.type === "wireline:open-route") {
      const url = ROUTES.get(message.route || "studio");
      if (!url) throw new Error("Unsupported Wireline route.");
      await api.tabs.create({ url });
      return { opened: true };
    }
    if (message?.type === "wireline:open-workspace") {
      const url = ROUTES.get("studio");
      await api.tabs.create({ url });
      return { opened: true };
    }
    throw new Error("Unsupported Wireline Command request.");
  };

  void run().then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to complete request." }),
  );
  return true;
});
