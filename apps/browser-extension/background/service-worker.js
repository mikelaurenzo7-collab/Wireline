const api = globalThis.browser ?? globalThis.chrome;

const STUDIO_URL = "https://trywireline.com/studio?create=1";
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
    id: "wireline-capture-selection",
    title: "Bring this selection into Wireline",
    contexts: ["selection"],
  });
  api.contextMenus.create({
    id: "wireline-capture-page",
    title: "Bring this page into Wireline",
    contexts: ["page"],
  });
  api.contextMenus.create({
    id: "wireline-call-number",
    title: "Have Wireline call this number",
    contexts: ["link"],
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
    .then((context) => openStudio(context, "Use this page as context for a new Wireline assistant."))
    .catch(() => undefined);
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  void capturePageContext(tab, info.selectionText || "", info.linkUrl || "")
    .then((context) => {
      if (info.menuItemId === "wireline-call-number") {
        const phone = context.link.replace(/^tel:/iu, "").trim();
        return openStudio(
          context,
          phone
            ? `Create an assistant brief that can call ${phone}. Preserve the page context and ask me to confirm any call details in Studio.`
            : "Use this linked contact as context for a Wireline call request.",
        );
      }
      return openStudio(
        context,
        info.menuItemId === "wireline-capture-selection"
          ? "Use my selected text and this page as context for a Wireline assistant."
          : "Use this page as context for a new Wireline assistant.",
      );
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
      await openStudio(context, message.request || "");
      return { opened: true };
    }
    if (message?.type === "wireline:open-workspace") {
      await api.tabs.create({ url: "https://trywireline.com/studio" });
      return { opened: true };
    }
    throw new Error("Unsupported Wireline Companion request.");
  };

  void run().then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unable to complete request." }),
  );
  return true;
});
