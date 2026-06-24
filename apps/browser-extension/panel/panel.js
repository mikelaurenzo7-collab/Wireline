const api = globalThis.browser ?? globalThis.chrome;

const title = document.querySelector("#page-context-title");
const host = document.querySelector("#page-host");
const selectionPreview = document.querySelector("#selection-preview");
const request = document.querySelector("#request");
const status = document.querySelector("#status");
const handoffForm = document.querySelector("#handoff-form");
const handoffButton = document.querySelector("#handoff-button");
const refreshButton = document.querySelector("#refresh-context");
const workspaceButton = document.querySelector("#open-workspace");

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    api.runtime.sendMessage(message, (response) => {
      const runtimeError = api.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Wireline Companion could not complete that request."));
        return;
      }
      resolve(response.result);
    });
  });
}

function toHost(value) {
  try {
    return new URL(value).host || "Current browser tab";
  } catch {
    return "Current browser tab";
  }
}

function compact(value, length) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

async function loadContext() {
  refreshButton.disabled = true;
  title.textContent = "Loading page context…";
  host.textContent = "Only this tab is inspected when you ask.";
  selectionPreview.hidden = true;
  status.textContent = "";

  try {
    const context = await sendMessage({ type: "wireline:get-active-context" });
    title.textContent = context.title || "Untitled page";
    host.textContent = toHost(context.url);

    if (context.selection) {
      selectionPreview.textContent = `Selected text: “${compact(context.selection, 280)}”`;
      selectionPreview.hidden = false;
    }
  } catch (error) {
    title.textContent = "This page cannot be read";
    host.textContent = "You can still open Wireline Studio and continue there.";
    status.textContent = error instanceof Error ? error.message : "Unable to load the active tab.";
  } finally {
    refreshButton.disabled = false;
  }
}

handoffForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  handoffButton.disabled = true;
  status.textContent = "Opening Studio with this context…";

  try {
    await sendMessage({ type: "wireline:open-studio", request: request.value });
    status.textContent = "Studio is open in a new tab.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Unable to open Studio.";
  } finally {
    handoffButton.disabled = false;
  }
});

refreshButton.addEventListener("click", () => void loadContext());
workspaceButton.addEventListener("click", async () => {
  workspaceButton.disabled = true;
  try {
    await sendMessage({ type: "wireline:open-workspace" });
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Unable to open the Wireline workspace.";
  } finally {
    workspaceButton.disabled = false;
  }
});

void loadContext();
