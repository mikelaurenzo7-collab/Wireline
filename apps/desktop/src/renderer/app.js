/** @param {Document} document @param {import('../contracts').DesktopBridge} bridge */
export function mountDesktop(document, bridge) {
  const el = (id) => document.getElementById(id);
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  let state = null;
  let stateRevision = 0;
  let localError = "";
  let lastTaskId = null;
  let lastReviewContext = null;
  const pending = new Set();
  const catalogChoices = new Map();
  const taskServers = new Set();
  const terminal = new Set(["completed", "stopped", "unknown", "failed"]);
  const active = () => (state?.task && !terminal.has(state.task.status)) || pending.has("reply");
  const needsOutcomeReview = () =>
    Boolean(
      state?.task &&
      !state.task.unknownOutcomeReviewed &&
      (state.task.status === "unknown" ||
        state.task.receipts.some((receipt) => receipt.status === "unknown")),
    );
  const actionLabels = {
    planning: "Planning",
    approval: "Your approval",
    executing: "Working",
    needs_input: "Your input",
    review_result: "Review result",
    completed: "Complete",
    stopped: "Stopped",
    unknown: "Result unconfirmed",
    failed: "Needs attention",
  };

  function error(message) {
    localError = message;
    renderError();
  }
  function renderError() {
    const message = localError || state?.error || "";
    el("error").textContent = message;
    el("error").hidden = !message;
  }
  async function run(key, operation) {
    if (pending.has(key)) return false;
    pending.add(key);
    localError = "";
    render();
    try {
      await operation();
      return true;
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "That action could not finish. Try again.");
      return false;
    } finally {
      pending.delete(key);
      render();
    }
  }
  function replaceOptions(select, options, placeholder) {
    const previous = select.value;
    select.replaceChildren();
    const empty = node("option", placeholder);
    empty.value = "";
    select.append(empty);
    for (const item of options) {
      const option = node("option", item.label);
      option.value = item.id;
      select.append(option);
    }
    if (options.some((item) => item.id === previous)) select.value = previous;
  }
  function button(label, action, disabled = false) {
    const item = node("button", label, "secondary");
    item.type = "button";
    item.disabled = disabled;
    item.addEventListener("click", action);
    return item;
  }
  function renderServers() {
    const container = el("servers");
    const taskTools = el("task-tools");
    container.replaceChildren();
    taskTools.replaceChildren();
    for (const server of state.servers) {
      const key = `${server.id}:${server.catalogDigest}`;
      if (!catalogChoices.has(key))
        catalogChoices.set(
          key,
          new Set(server.approvedDigest === server.catalogDigest ? server.selectedTools : []),
        );
      const chosen = catalogChoices.get(key);
      const busy = active() || pending.has(`server:${server.id}`);
      const card = node("section", undefined, "server");
      card.append(node("h3", server.label), node("p", server.url, "muted small"));
      card.append(
        node(
          "p",
          server.approvedDigest === server.catalogDigest
            ? `${server.selectedTools.length} tools approved`
            : "Review this tool catalog before using it.",
          "muted small",
        ),
      );
      for (const tool of server.tools) {
        const row = node("div", undefined, "tool");
        const label = node("label", undefined, "check-row");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = chosen.has(tool.name);
        checkbox.disabled = Boolean(busy);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) chosen.add(tool.name);
          else chosen.delete(tool.name);
        });
        label.append(checkbox, node("span", tool.name));
        row.append(label, node("p", tool.description, "muted small"));
        const details = node("details");
        details.append(
          node("summary", "Tool parameters"),
          node("pre", JSON.stringify(tool.inputSchema, null, 2)),
        );
        row.append(details);
        card.append(row);
      }
      const buttons = node("div", undefined, "actions");
      buttons.append(
        button(
          "Approve catalog",
          () =>
            run(`server:${server.id}`, () =>
              bridge.approveCatalog({
                id: server.id,
                digest: server.catalogDigest,
                names: [...chosen],
              }),
            ),
          busy,
        ),
        button(
          "Refresh tools",
          () => run(`server:${server.id}`, () => bridge.refreshServer(server.id)),
          busy,
        ),
        button(
          "Remove",
          () => run(`server:${server.id}`, () => bridge.removeServer(server.id)),
          busy,
        ),
      );
      card.append(buttons);
      container.append(card);
      if (server.approvedDigest === server.catalogDigest && server.selectedTools.length) {
        const label = node("label", undefined, "check-row");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = taskServers.has(server.id);
        checkbox.disabled = Boolean(active() || pending.has("start"));
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) taskServers.add(server.id);
          else taskServers.delete(server.id);
        });
        label.append(
          checkbox,
          node("span", `Use ${server.label} (${server.selectedTools.length} tools)`),
        );
        taskTools.append(label);
      }
    }
    taskTools.hidden = !taskTools.children.length;
    el("add-server").disabled = Boolean(active() || pending.has("add-server"));
    for (const id of ["server-label", "server-url", "server-token"])
      el(id).disabled = Boolean(active() || pending.has("add-server"));
  }
  function renderTask() {
    const task = state.task;
    el("current-task").hidden = !task;
    el("setup").hidden = Boolean(active() || needsOutcomeReview());
    if (!task) return;
    if (lastTaskId !== task.id) {
      lastTaskId = task.id;
      el("reply").value = "";
      el("reviewed").checked = false;
      el("share").checked = false;
    }
    const unknownReview = needsOutcomeReview();
    const reviewContext = `${task.id}:${unknownReview ? "unknown" : task.status}`;
    if (lastReviewContext !== reviewContext) {
      lastReviewContext = reviewContext;
      el("reviewed").checked = false;
    }
    el("task-status").textContent = actionLabels[task.status] || task.status;
    el("task-goal").textContent = task.goal;
    // The engine counts accepted plans before publishing their proposal/result.
    // Only planning is describing the next step, not the already-counted one.
    const displayStep = Math.max(1, task.step + (task.status === "planning" ? 1 : 0));
    el("task-target").textContent =
      `${task.bot.name} · ${task.window ? `${task.window.appName}: ${task.window.title}` : "Selected MCP tools"} · Step ${displayStep}`;
    el("task-message").textContent = task.message;
    const preview =
      typeof task.preview === "string" &&
      /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(task.preview) &&
      task.preview.length < 3_000_000
        ? task.preview
        : "";
    el("preview-box").hidden = !preview;
    if (preview) el("preview").src = preview;
    else el("preview").removeAttribute("src");
    const proposal = task.status === "approval" && task.proposal?.action ? task.proposal : null;
    el("proposal").hidden = !proposal;
    if (proposal) {
      el("proposal-summary").textContent = proposal.summary;
      const action = proposal.action;
      const server =
        action.type === "mcp_call"
          ? state.servers.find((item) => item.id === action.serverId)
          : null;
      el("proposal-destination").textContent = server
        ? `Destination: ${server.label} · ${server.url} · ${action.name}`
        : `Destination: ${task.window?.appName || "Shared window"} · ${task.window?.title || ""}`;
      el("proposal-arguments").textContent = JSON.stringify(action, null, 2);
    }
    el("approve").disabled = pending.has("approve") || pending.has("stop");
    el("reply-form").hidden =
      unknownReview ||
      !task.canResume ||
      !["needs_input", "review_result", "failed"].includes(task.status);
    el("reply").disabled = pending.has("reply");
    el("resume").disabled = pending.has("reply") || pending.has("stop") || pending.has("complete");
    el("result-review").hidden = task.status !== "review_result" && !unknownReview;
    el("review-instructions").textContent = unknownReview
      ? "The action may have happened. Check the destination before starting a new task; this action will not be retried."
      : "Review the result in the destination before marking this task complete.";
    el("review-label").textContent = unknownReview
      ? "I checked the destination and understand the outcome is unconfirmed."
      : "I reviewed the result.";
    el("complete").textContent = unknownReview ? "Acknowledge outcome" : "Mark complete";
    el("complete").disabled =
      !el("reviewed").checked ||
      state.connecting ||
      pending.has("connect") ||
      pending.has("approve") ||
      pending.has("complete") ||
      pending.has("stop") ||
      pending.has("reply");
    el("receipt-count").textContent = `(${task.receipts.length})`;
    el("receipts").replaceChildren();
    for (const receipt of task.receipts) {
      const row = node("li");
      row.append(
        node("strong", `${receipt.summary} · ${receipt.status}`),
        node("p", receipt.result),
      );
      const details = node("details");
      details.append(
        node("summary", "Exact action"),
        node("pre", JSON.stringify(receipt.action, null, 2)),
      );
      row.append(details);
      el("receipts").append(row);
    }
  }
  function render() {
    renderError();
    if (!state) return;
    el("connection-status").textContent = state.connecting
      ? "Connecting…"
      : state.connectionRecoveryRequired
        ? "Connection needs recovery"
        : state.connected
          ? "Connected"
          : "Not connected";
    el("connect").textContent =
      state.connected || state.connectionRecoveryRequired
        ? "Disconnect everywhere"
        : state.connecting
          ? "Connecting…"
          : "Connect";
    el("connect").title =
      state.connected || state.connectionRecoveryRequired
        ? "Also revokes this account's BotBound Desktop planning access on other computers."
        : "Connect your BotBound account.";
    el("connect").disabled = state.connecting || pending.has("connect");
    el("connection-recovery").hidden = !state.connectionManualRecoveryRequired;
    el("confirm-revocation").disabled =
      !state.connectionManualRecoveryRequired ||
      !el("revocation-reviewed").checked ||
      pending.has("recovery");
    el("stop").disabled =
      (!active() && !pending.has("start") && !pending.has("connect") && !state.connecting) ||
      pending.has("stop");
    el("stop-shortcut").textContent = state.platform === "darwin" ? "⌘⇧." : "Ctrl+Shift+.";
    replaceOptions(
      el("bot"),
      state.bots.map((bot) => ({ id: bot.id, label: bot.name })),
      state.connected ? "Choose a Bot" : "Connect to choose a Bot",
    );
    if (!el("bot").value && state.bots.length === 1) el("bot").value = state.bots[0].id;
    replaceOptions(
      el("window"),
      state.windows.map((item) => ({ id: item.id, label: `${item.appName}: ${item.title}` })),
      "MCP tools only",
    );
    el("bot").disabled =
      !state.connected ||
      state.connectionRecoveryRequired ||
      Boolean(active()) ||
      pending.has("start");
    for (const id of ["goal", "window", "share"])
      el(id).disabled = Boolean(active() || pending.has("start"));
    el("start").disabled =
      !state.connected ||
      state.connectionRecoveryRequired ||
      !state.bots.length ||
      pending.has("start") ||
      Boolean(active()) ||
      needsOutcomeReview();
    el("refresh-windows").disabled = Boolean(active()) || pending.has("windows");
    renderTask();
    renderServers();
  }
  el("connect").addEventListener("click", () =>
    run("connect", () =>
      state?.connected || state?.connectionRecoveryRequired
        ? bridge.disconnect()
        : bridge.connect(),
    ),
  );
  el("account").addEventListener("click", () => run("account", () => bridge.openAccount()));
  el("recovery-account").addEventListener("click", () =>
    run("account", () => bridge.openAccount()),
  );
  el("revocation-reviewed").addEventListener("change", render);
  el("confirm-revocation").addEventListener("click", async () => {
    if (await run("recovery", () => bridge.confirmRevocation(el("revocation-reviewed").checked)))
      el("revocation-reviewed").checked = false;
  });
  el("refresh-windows").addEventListener("click", () =>
    run("windows", () => bridge.refreshWindows()),
  );
  el("stop").addEventListener("click", () => run("stop", () => bridge.stop()));
  el("task-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (needsOutcomeReview()) {
      error("Check the destination and acknowledge the unconfirmed outcome first.");
      return;
    }
    const servers = state.servers
      .filter(
        (server) =>
          taskServers.has(server.id) &&
          server.approvedDigest === server.catalogDigest &&
          server.selectedTools.length,
      )
      .map((server) => server.id);
    const input = {
      botId: el("bot").value,
      goal: el("goal").value.trim(),
      windowId: el("window").value || null,
      serverIds: servers,
      shareConfirmed: el("share").checked,
    };
    if (!input.windowId && !servers.length) {
      error("Choose a window or approve and select an MCP connection.");
      return;
    }
    if (await run("start", () => bridge.startTask(input))) el("share").checked = false;
  });
  el("approve").addEventListener("click", () => {
    const id = state?.task?.status === "approval" ? state.task.proposal?.id : null;
    if (id) void run("approve", () => bridge.approve(id));
  });
  el("reply-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = el("reply").value.trim();
    if (text) {
      el("reviewed").checked = false;
      if (await run("reply", () => bridge.reply(text))) el("reply").value = "";
    }
  });
  el("reviewed").addEventListener("change", render);
  el("complete").addEventListener("click", () => {
    if (el("reviewed").checked) void run("complete", () => bridge.complete());
  });
  el("server-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = {
      label: el("server-label").value.trim(),
      url: el("server-url").value.trim(),
      token: el("server-token").value,
    };
    if (!input.url.startsWith("https://")) {
      error("Use a public HTTPS MCP endpoint.");
      return;
    }
    if (await run("add-server", () => bridge.addServer(input))) {
      for (const id of ["server-label", "server-url", "server-token"]) el(id).value = "";
    }
  });
  const unsubscribe = bridge.onState((next) => {
    stateRevision++;
    if (state?.connected && !next.connected) {
      taskServers.clear();
      catalogChoices.clear();
      for (const id of ["goal", "reply", "server-label", "server-url", "server-token", "window"])
        el(id).value = "";
      el("share").checked = false;
      el("reviewed").checked = false;
      localError = "";
    }
    state = next;
    render();
  });
  const initialRevision = stateRevision;
  void bridge
    .getState()
    .then((next) => {
      if (stateRevision === initialRevision) {
        state = next;
        render();
      }
    })
    .catch((cause) =>
      error(cause instanceof Error ? cause.message : "Could not load the desktop session."),
    );
  return unsubscribe;
}

if (typeof document !== "undefined") {
  if (window.botbound) mountDesktop(document, window.botbound);
  else {
    const error = document.getElementById("error");
    error.textContent = "Open this interface in BotBound Desktop to connect.";
    error.hidden = false;
  }
}
