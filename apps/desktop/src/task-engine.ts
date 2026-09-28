import { randomUUID } from "node:crypto";
import {
  COMPUTER_LIMITS,
  parseComputerStepInput,
  parseComputerStepProposal,
  type ComputerStepInput,
} from "../../../src/lib/computer-protocol";
import type { Bot, StartTask, TaskView } from "./contracts";
import type { DesktopStore } from "./store";
import type { NativeAdapter, NativeObservation } from "./native";
import { catalogDigest, McpClient, validateToolArguments } from "./mcp-client";

type EngineDependencies = {
  store: DesktopStore;
  native: NativeAdapter;
  planner: McpClient;
  server: (id: string) => McpClient;
  notify: () => void;
  platform?: "windows" | "macos";
  now?: () => number;
};

export class TaskEngine {
  private task: TaskView | null;
  private controller: AbortController | null = null;
  private input: ComputerStepInput | null = null;
  private observation: NativeObservation | null = null;
  private serverIds: string[] = [];
  private generation = 0;
  private running = false;
  private idleWaiters: Array<() => void> = [];
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private latestToolResult = "No tool has been called yet.";
  constructor(private readonly deps: EngineDependencies) {
    this.task = deps.store.read().task;
  }
  view(): TaskView | null {
    if (!this.task) return null;
    return {
      ...structuredClone(this.task),
      canResume: Boolean(
        !this.running &&
        this.controller &&
        !this.controller.signal.aborted &&
        this.now() < this.task.expiresAt &&
        !this.needsOutcomeReview() &&
        ["needs_input", "review_result", "failed"].includes(this.task.status),
      ),
    };
  }
  resetAccount(): void {
    if (this.running || this.active()) throw new Error("Stop the task before changing accounts.");
    this.generation++;
    this.controller?.abort();
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    this.task = this.deps.store.read().task;
    this.controller = null;
    this.input = null;
    this.observation = null;
    this.serverIds = [];
    this.deps.notify();
  }
  active(): boolean {
    return (
      this.running ||
      Boolean(
        this.task &&
        ["planning", "approval", "executing", "needs_input", "review_result"].includes(
          this.task.status,
        ),
      )
    );
  }
  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
  private operationFinished(): void {
    this.running = false;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
  async stopAndDrain(message?: string): Promise<void> {
    try {
      await this.stop(message);
    } finally {
      // Stop revokes authority immediately; app shutdown must also wait for the
      // native runner's confirmed exit, cleanup, and final receipt to settle.
      if (this.running) await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
    }
  }
  private needsOutcomeReview(): boolean {
    return Boolean(
      this.task &&
      !this.task.unknownOutcomeReviewed &&
      (this.task.status === "unknown" ||
        this.task.receipts.some((receipt) => receipt.status === "unknown")),
    );
  }
  private async persist(): Promise<void> {
    const task = structuredClone(this.task);
    await this.deps.store.update((state) => ({ ...state, task }));
    this.deps.notify();
  }
  private assertCurrent(generation: number): void {
    if (
      generation !== this.generation ||
      !this.task ||
      !this.controller ||
      this.controller.signal.aborted
    )
      throw new Error("Task stopped.");
    if (this.now() >= this.task.expiresAt)
      throw new Error("Task sharing expired. Start a new task to continue.");
  }

  async start(input: StartTask, bots: Bot[]): Promise<void> {
    if (this.active() || this.running)
      throw new Error("Stop the current task before starting another.");
    if (this.needsOutcomeReview())
      throw new Error(
        "Check the destination and acknowledge the unconfirmed outcome before starting another task.",
      );
    const bot = bots.find((item) => item.id === input.botId);
    if (
      !bot ||
      !input.shareConfirmed ||
      typeof input.goal !== "string" ||
      !input.goal.trim() ||
      input.goal.length > 4000
    )
      throw new Error("Choose your Bot, describe the task, and confirm sharing.");
    if (
      !Array.isArray(input.serverIds) ||
      input.serverIds.length > 12 ||
      new Set(input.serverIds).size !== input.serverIds.length
    )
      throw new Error("Choose valid tool connections.");
    const stored = this.deps.store.read();
    for (const id of input.serverIds) {
      const server = stored.servers.find((item) => item.id === id);
      if (
        !server ||
        !server.approvedDigest ||
        server.approvedDigest !== server.catalogDigest ||
        !server.selectedTools.length
      )
        throw new Error("Review and approve each selected tool connection first.");
    }
    if (!input.windowId && !input.serverIds.length)
      throw new Error("Share one window or choose a tool connection.");
    this.controller = new AbortController();
    const generation = ++this.generation;
    const signal = this.controller.signal;
    this.running = true;
    let created = false;
    try {
      const windows = input.windowId ? await this.deps.native.listWindows(signal) : [];
      if (generation !== this.generation || signal.aborted)
        throw new Error("Task stopped before sharing.");
      const selected = input.windowId ? windows.find((item) => item.id === input.windowId) : null;
      if (input.windowId && !selected) throw new Error("That window is no longer available.");
      this.serverIds = [...input.serverIds];
      this.latestToolResult = "No tool has been called yet.";
      this.input = null;
      this.observation = null;
      this.task = {
        id: randomUUID(),
        bot,
        goal: input.goal.trim(),
        window: selected
          ? { id: selected.id, title: selected.title, appName: selected.appName }
          : null,
        status: "planning",
        step: 0,
        expiresAt: this.now() + COMPUTER_LIMITS.grantMs,
        message: "Reviewing the shared context…",
        proposal: null,
        receipts: [],
      };
      created = true;
      if (this.expiry) clearTimeout(this.expiry);
      this.expiry = setTimeout(() => {
        void this.stop("Task sharing expired. Start a new task to continue.").catch(() => {
          if (this.task)
            this.task.message =
              "Access expired, but the final receipt could not be saved. Review the target before starting again.";
          this.deps.notify();
        });
      }, COMPUTER_LIMITS.grantMs);
      await this.persist();
      this.assertCurrent(generation);
    } catch (failure) {
      if (created && generation === this.generation && this.task) {
        this.task.status = "failed";
        this.task.message = "The task could not start. No action was dispatched.";
        this.deps.notify();
      }
      throw failure;
    } finally {
      this.operationFinished();
    }
    await this.plan();
  }

  private sharedTools(): ComputerStepInput["tools"] {
    const tools = this.deps.store
      .read()
      .servers.filter((server) => this.serverIds.includes(server.id))
      .flatMap((server) => {
        if (server.approvedDigest !== server.catalogDigest || !server.approvedDigest)
          throw new Error("Tool permissions changed. Start a new task after reviewing them.");
        return server.tools
          .filter((tool) => server.selectedTools.includes(tool.name))
          .map((tool) => ({ ...tool, serverId: server.id }));
      });
    if (tools.length > COMPUTER_LIMITS.tools)
      throw new Error("Choose at most 32 tools for one task.");
    return tools;
  }

  private async plan(): Promise<void> {
    if (!this.task || this.running) throw new Error("A task operation is already running.");
    this.running = true;
    const generation = this.generation;
    try {
      this.assertCurrent(generation);
      if (this.task.step >= COMPUTER_LIMITS.steps) {
        await this.stop(
          "This task reached its 20-step limit. Review the work before starting another.",
        );
        return;
      }
      this.task.status = "planning";
      this.task.proposal = null;
      this.task.message = "Reviewing the shared context…";
      await this.persist();
      const signal = this.controller!.signal;
      this.observation = this.task.window
        ? await this.deps.native.observe(this.task.window.id, signal)
        : null;
      this.assertCurrent(generation);
      const screenshot = this.observation?.screenshot;
      this.task.preview = screenshot
        ? `data:${screenshot.mimeType};base64,${screenshot.data}`
        : undefined;
      const input = parseComputerStepInput({
        agent_id: this.task.bot.id,
        task_id: this.task.id,
        goal: this.task.goal,
        step: this.task.step,
        observation: {
          id: randomUUID(),
          source: {
            kind: this.task.window ? "window" : "mcp",
            label: (this.task.window?.title || "Owner-approved tools").slice(0, 200),
            ...(this.task.window && this.deps.platform ? { platform: this.deps.platform } : {}),
          },
          ...(screenshot ? { screenshot } : {}),
          text: this.latestToolResult,
        },
        history: this.task.receipts.slice(-COMPUTER_LIMITS.history).map((receipt) => ({
          summary: `${receipt.summary}\n${receipt.result}`.slice(0, 2000),
          status:
            receipt.status === "applied"
              ? "completed"
              : receipt.status === "rejected"
                ? "failed"
                : "unconfirmed",
        })),
        tools: this.sharedTools(),
      });
      this.input = input;
      this.deps.notify();
      const result = await this.deps.planner.call(
        "plan_computer_step",
        input as unknown as Record<string, unknown>,
        signal,
      );
      this.assertCurrent(generation);
      if (result.isError) throw new Error(result.text || "The Bot could not plan this step.");
      const proposal = parseComputerStepProposal(result.structuredContent, input);
      this.task.step++;
      this.task.message = proposal.summary;
      this.task.proposal = { ...proposal, id: randomUUID() };
      this.task.status =
        proposal.decision === "action"
          ? "approval"
          : proposal.decision === "complete"
            ? "review_result"
            : "needs_input";
      await this.persist();
    } catch (error) {
      if (generation === this.generation && this.task) {
        this.task.status = "failed";
        this.task.proposal = null;
        this.task.message =
          error instanceof Error ? error.message : "Planning failed. No action was approved.";
        await this.persist();
      }
    } finally {
      this.operationFinished();
    }
  }

  async approve(id: string): Promise<void> {
    if (
      this.running ||
      !this.task ||
      this.task.status !== "approval" ||
      this.task.proposal?.id !== id ||
      !this.input
    )
      throw new Error("This proposal is no longer awaiting approval.");
    this.running = true;
    const generation = this.generation;
    let claimed = false;
    let nextStep = false;
    const task = this.task;
    try {
      this.assertCurrent(generation);
      const { decision, summary, action: proposedAction } = task.proposal!;
      const proposal = parseComputerStepProposal(
        { decision, summary, action: proposedAction },
        this.input,
      );
      const action = proposal.action;
      if (!action) throw new Error("There is no action to approve.");
      const signal = this.controller!.signal;
      // Check remote catalog immediately before the irreversible dispatch boundary.
      let remote: McpClient | null = null;
      if (action.type === "mcp_call") {
        const server = this.deps.store
          .read()
          .servers.find((item) => item.id === action.serverId && this.serverIds.includes(item.id));
        if (
          !server ||
          server.approvedDigest !== server.catalogDigest ||
          !server.selectedTools.includes(action.name)
        )
          throw new Error("This tool is no longer approved.");
        remote = this.deps.server(server.id);
        const current = await remote.tools(signal);
        this.assertCurrent(generation);
        if (catalogDigest(current) !== server.approvedDigest)
          throw new Error("The server's tools changed. Review its catalog before continuing.");
        const tool = current.find((item) => item.name === action.name);
        if (!tool) throw new Error("The approved tool is unavailable.");
        validateToolArguments(tool, action.arguments);
      } else if (!task.window || !this.observation)
        throw new Error("The shared window is unavailable.");
      this.assertCurrent(generation);
      task.status = "executing";
      task.proposal = null;
      task.receipts.push({
        id,
        action,
        summary: proposal.summary,
        status: "claimed",
        result: "Dispatch recorded; outcome pending.",
        createdAt: this.now(),
      });
      await this.persist(); // MUST reach durable storage before native/remote execution.
      this.assertCurrent(generation);
      claimed = true;
      const receipt = task.receipts.at(-1)!;
      if (action.type === "mcp_call") {
        const result = await remote!.call(action.name, action.arguments, signal);
        const text = [
          result.text,
          result.structuredContent === undefined ? "" : JSON.stringify(result.structuredContent),
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, COMPUTER_LIMITS.textCharacters);
        this.latestToolResult =
          `Untrusted result from ${action.serverId}/${action.name}:\n${text || "The tool returned no readable result."}`.slice(
            0,
            COMPUTER_LIMITS.textCharacters,
          );
        receipt.status = result.isError ? "unknown" : "applied";
        receipt.result = result.isError
          ? "The tool reported an error; partial effects are possible. Check the service before trying again."
          : text.slice(0, 1800) ||
            "The tool returned a response. Its real-world effect still requires verification.";
      } else {
        const result = await this.deps.native.execute(
          task.window!.id,
          this.observation!.fingerprint,
          action,
          signal,
        );
        receipt.status = result.status;
        receipt.result = result.message.slice(0, 1800);
      }
      if (generation !== this.generation) {
        task.status = receipt.status === "unknown" ? "unknown" : "stopped";
        task.message = "Stopped. Review the last recorded action; stopping does not undo it.";
      } else if (receipt.status !== "applied") {
        task.status = receipt.status === "unknown" ? "unknown" : "needs_input";
        task.message = receipt.result;
      } else {
        nextStep = true;
      }
      await this.persist();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The action did not finish normally.";
      const receipt = task.receipts.find((item) => item.id === id);
      if (claimed && receipt) {
        receipt.status = "unknown";
        receipt.result =
          "The action may have happened. Check the target; it will not be retried automatically.";
        task.status = "unknown";
        task.message = receipt.result;
      } else {
        if (receipt) {
          receipt.status = "rejected";
          receipt.result = "Stopped before dispatch.";
        }
        task.status = generation === this.generation ? "needs_input" : "stopped";
        task.message = message;
      }
      task.proposal = null;
      await this.persist();
    } finally {
      this.operationFinished();
    }
    if (nextStep && generation === this.generation) await this.plan();
  }

  async reply(text: string): Promise<void> {
    if (
      this.running ||
      !this.task ||
      !this.controller ||
      this.controller.signal.aborted ||
      this.now() >= this.task.expiresAt ||
      this.needsOutcomeReview() ||
      !["needs_input", "review_result", "failed"].includes(this.task.status)
    )
      throw new Error("This task cannot resume here.");
    if (typeof text !== "string" || !text.trim() || text.length > 1000)
      throw new Error("Enter a short instruction or the result of your manual action.");
    const goal = `${this.task.goal}\nOwner update: ${text.trim()}`;
    if (goal.length > 4000)
      throw new Error("This task has enough context. Start a new one to continue.");
    this.task.goal = goal;
    await this.plan();
  }
  async complete(): Promise<void> {
    const unknownReview = this.needsOutcomeReview();
    if (!this.task || (this.task.status !== "review_result" && !unknownReview) || this.running)
      throw new Error("Review the result when the Bot finishes.");
    const generation = this.generation;
    const accountId = this.deps.store.read().accountId;
    const reviewed: TaskView = {
      ...structuredClone(this.task),
      status: unknownReview ? "stopped" : "completed",
      ...(unknownReview ? { unknownOutcomeReviewed: true } : {}),
      message: unknownReview
        ? "You checked the destination. The prior outcome remains unconfirmed; you may start a new task."
        : "Result reviewed by you.",
      proposal: null,
      preview: undefined,
    };
    // Keep the confirmed state and start lock until review is durably recorded.
    this.running = true;
    try {
      await this.deps.store.update((state) => {
        if (state.accountId !== accountId || state.task?.id !== reviewed.id)
          throw new Error(
            "The account or task changed. Review the current task before continuing.",
          );
        if (generation !== this.generation)
          throw new Error("Review was interrupted. Check the current task before continuing.");
        return { ...state, task: reviewed };
      });
      if (generation === this.generation) {
        this.task = reviewed;
        this.controller?.abort();
        if (this.expiry) clearTimeout(this.expiry);
        this.expiry = null;
        this.input = null;
        this.observation = null;
        this.latestToolResult = "No tool has been called yet.";
      }
    } finally {
      this.operationFinished();
      this.deps.notify();
    }
  }
  async stop(message = "Stopped. No further actions will run."): Promise<void> {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    this.input = null;
    this.observation = null;
    this.latestToolResult = "No tool has been called yet.";
    if (!this.task) return;
    const unresolved =
      this.needsOutcomeReview() || this.task.receipts.some((item) => item.status === "claimed");
    this.task.proposal = null;
    this.task.preview = undefined;
    if (!unresolved && ["completed", "failed", "stopped"].includes(this.task.status)) {
      this.deps.notify();
      return;
    }
    this.task.status = unresolved ? "unknown" : "stopped";
    this.task.message = message;
    await this.persist();
  }
}
