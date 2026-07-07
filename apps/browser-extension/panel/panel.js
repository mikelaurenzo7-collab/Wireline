const api = globalThis.browser ?? globalThis.chrome;

const title = document.querySelector("#page-title");
const host = document.querySelector("#page-host");
const selectionPreview = document.querySelector("#selection-preview");
const request = document.querySelector("#request");
const status = document.querySelector("#status");
const handoffForm = document.querySelector("#handoff-form");
const handoffButton = document.querySelector("#handoff-button");
const refreshButton = document.querySelector("#refresh-context");
const quickActions = [...document.querySelectorAll(".quick-action")];
const agentsButton = document.querySelector("#open-agents");
const wireButton = document.querySelector("#open-wire");
const trainingButton = document.querySelector("#open-training");
const billingButton = document.querySelector("#open-billing");
const studioButton = document.querySelector("#open-studio");

const actionPrompts = {
  call: "Have a Wireline agent prepare a call from this page. Ask me for the number and confirmation before any live call.",
  text: "Have a Wireline agent draft a text from this page. Ask me to review before sending.",
  followup: "Create a concise follow-up from this page with next step, owner, and timing.",
  task: "Use this page and selected text as context for a Wireline agent task.",
};

function sendMessage(message) {
  return api.runtime.sendMessage(message)
    .then((response) => {
      if (!response?.ok) {
        throw new Error(response?.error || "Wireline Command could not complete that request.");
      }
      return response.result;
    })
    .catch((error) => {
      throw error instanceof Error ? error : new Error(error?.message || String(error));
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
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function showEmptyContextState() {
  title.textContent = "Wireline Command";
  host.textContent = "Click Refresh to load this tab, or send a command below.";
  selectionPreview.hidden = true;
  status.textContent = "";
  refreshButton.disabled = false;
}

async function loadContext() {
  refreshButton.disabled = true;
  title.textContent = "Loading page context...";
  host.textContent = "Only this tab is inspected when you ask.";
  selectionPreview.hidden = true;
  status.textContent = "";

  try {
    const context = await sendMessage({ type: "wireline:get-active-context" });
    title.textContent = context.title || "Untitled page";
    host.textContent = toHost(context.url);

    if (context.selection) {
      selectionPreview.textContent = `Selected text: "${compact(context.selection, 280)}"`;
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

async function sendToStudio(action = "task") {
  handoffButton.disabled = true;
  quickActions.forEach((button) => {
    button.disabled = true;
  });
  status.textContent = "Opening Studio with this context...";

  try {
    const fallbackPrompt = actionPrompts[action] || actionPrompts.task;
    await sendMessage({
      type: "wireline:open-studio",
      action,
      request: request.value.trim() || fallbackPrompt,
    });
    status.textContent = "Studio is open with this command.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Unable to open Studio.";
  } finally {
    handoffButton.disabled = false;
    quickActions.forEach((button) => {
      button.disabled = false;
    });
  }
}

handoffForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendToStudio("task");
});

quickActions.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action || "task";
    request.value = actionPrompts[action] || actionPrompts.task;
    void sendToStudio(action);
  });
});

refreshButton.addEventListener("click", () => void loadContext());
agentsButton.addEventListener("click", () =>
  void sendMessage({ type: "wireline:open-route", route: "agents" }),
);
wireButton.addEventListener("click", () =>
  void sendMessage({ type: "wireline:open-route", route: "wire" }),
);
trainingButton.addEventListener("click", () =>
  void sendMessage({ type: "wireline:open-route", route: "training" }),
);
billingButton.addEventListener("click", () =>
  void sendMessage({ type: "wireline:open-route", route: "billing" }),
);
studioButton.addEventListener("click", () =>
  void sendMessage({ type: "wireline:open-route", route: "studio" }),
);

showEmptyContextState();
