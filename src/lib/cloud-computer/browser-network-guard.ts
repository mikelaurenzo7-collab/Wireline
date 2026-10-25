import type { CDPSession } from "playwright-core";

const GUARD_TIMEOUT_MS = 5_000;
const MAX_PENDING = 128;
const MAX_CHILD_TARGETS = 64;

type Event = Record<string, unknown>;
type Endpoint = {
  active: boolean;
  work: Set<() => void>;
  replies: Map<number, { resolve(value: unknown): void; reject(error: Error): void }>;
  send(method: string, params?: Event, workOwner?: Endpoint): Promise<unknown>;
  dispatch(method: string, params: Event): void;
  close(): void;
};

/**
 * Playwright routing only sees the first request in a redirect chain. A
 * separate CDP client pauses every hop before Chromium sends it. This client
 * attaches only to one owned page and its child targets, never the browser's
 * other contexts. Failure closes the context; it never drops interception.
 */
export class BrowserNetworkGuard {
  private stopped = false;
  private pendingRequests = 0;
  private nextCommand = 1;
  private readonly endpoints = new Set<Endpoint>();
  private readonly root: Endpoint;

  constructor(
    private readonly cdp: CDPSession,
    private readonly allowed: (url: string) => Promise<boolean>,
    private readonly onBlocked: () => void,
    private readonly onFailure: () => void,
    private readonly pageClosed: () => boolean = () => false,
  ) {
    const send = cdp.send.bind(cdp) as (method: string, params?: Event) => Promise<unknown>;
    this.root = this.endpoint(send);
    cdp.on("Fetch.requestPaused", (event) => this.root.dispatch("Fetch.requestPaused", event));
    cdp.on("Target.attachedToTarget", (event) =>
      this.root.dispatch("Target.attachedToTarget", event),
    );
    cdp.on("Target.receivedMessageFromTarget", (event) =>
      this.root.dispatch("Target.receivedMessageFromTarget", event),
    );
    cdp.on("Target.detachedFromTarget", (event) =>
      this.root.dispatch("Target.detachedFromTarget", event),
    );
    cdp.on("close", () => {
      if (this.pageClosed()) this.stop();
      else this.fail();
    });
  }

  async start(): Promise<void> {
    try {
      await this.configure(this.root);
    } catch {
      this.fail();
      throw new Error("The browser provider cannot enforce safe network requests.");
    }
  }

  stop(): void {
    this.stopped = true;
    this.root.close();
    // Do not detach a live paused target: detaching can resume its requests.
    // The owning context is closed by CloudBrowserSession instead.
  }

  private fail(): void {
    if (this.stopped) return;
    this.stop();
    // Closing a page also cancels guard setup/commands for that page. A live
    // page losing interception still closes the entire owned context.
    if (!this.pageClosed()) this.onFailure();
  }

  private bounded<T>(work: Promise<T>, endpoint: Endpoint): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: () => void;
    return Promise.race([
      work,
      new Promise<never>((_, reject) => {
        cancel = () => reject(new Error("Network guard closed"));
        endpoint.work.add(cancel);
        timer = setTimeout(
          () => reject(new Error("Network guard deadline exceeded")),
          GUARD_TIMEOUT_MS,
        );
      }),
    ]).finally(() => {
      clearTimeout(timer);
      endpoint.work.delete(cancel);
    });
  }

  private async configure(endpoint: Endpoint): Promise<void> {
    await endpoint.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
    });
    await endpoint.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: false,
      filter: [{}],
    });
  }

  private endpoint(transport: Endpoint["send"]): Endpoint {
    const children = new Map<string, { endpoint: Endpoint; targetId: string }>();
    const endpoint: Endpoint = {
      active: true,
      work: new Set(),
      replies: new Map(),
      send: async (method, params, workOwner = endpoint) => {
        if (this.stopped || !endpoint.active || !workOwner.active)
          throw new Error("Network guard closed");
        return this.bounded(transport(method, params), workOwner);
      },
      close: () => {
        if (!endpoint.active) return;
        endpoint.active = false;
        for (const child of children.values()) child.endpoint.close();
        children.clear();
        for (const cancel of endpoint.work) cancel();
        endpoint.work.clear();
        for (const command of endpoint.replies.values())
          command.reject(new Error("Network guard closed"));
        endpoint.replies.clear();
        this.endpoints.delete(endpoint);
      },
      dispatch: (method, params) => {
        if (this.stopped || !endpoint.active) return;
        if (method === "Fetch.requestPaused") {
          void this.request(endpoint, params);
        } else if (method === "Target.attachedToTarget") {
          const sessionId = params.sessionId;
          const info = params.targetInfo as Event | undefined;
          if (
            typeof sessionId !== "string" ||
            typeof info?.targetId !== "string" ||
            !["iframe", "page"].includes(String(info?.type)) ||
            this.endpoints.size >= MAX_CHILD_TARGETS
          ) {
            // Workers can originate requests outside a page's routing/session.
            // Keep them unavailable rather than resuming an unguarded target.
            this.fail();
            return;
          }
          const child = this.endpoint(async (childMethod, childParams) => {
            if (child.replies.size >= MAX_PENDING)
              throw new Error("Too many network guard commands");
            const id = this.nextCommand++;
            const reply = new Promise<unknown>((resolve, reject) =>
              child.replies.set(id, { resolve, reject }),
            );
            void reply.catch(() => undefined);
            try {
              await endpoint.send(
                "Target.sendMessageToTarget",
                {
                  sessionId,
                  message: JSON.stringify({ id, method: childMethod, params: childParams ?? {} }),
                },
                child,
              );
              return await this.bounded(reply, child);
            } finally {
              child.replies.delete(id);
            }
          });
          children.set(sessionId, { endpoint: child, targetId: info.targetId });
          void this.configure(child)
            .then(() => child.send("Runtime.runIfWaitingForDebugger"))
            .catch(() => {
              if (child.active) this.fail();
            });
        } else if (method === "Target.receivedMessageFromTarget") {
          if (typeof params.sessionId !== "string" || typeof params.message !== "string") {
            this.fail();
            return;
          }
          const child = children.get(params.sessionId)?.endpoint;
          if (!child) return;
          try {
            const message = JSON.parse(params.message) as Event;
            if (typeof message.id === "number") {
              const command = child.replies.get(message.id);
              if (message.error) command?.reject(new Error("Browser network command failed"));
              else command?.resolve(message.result);
            } else if (typeof message.method === "string") {
              child.dispatch(message.method, (message.params ?? {}) as Event);
            }
          } catch {
            this.fail();
          }
        } else if (method === "Target.detachedFromTarget" && typeof params.sessionId === "string") {
          const child = children.get(params.sessionId);
          child?.endpoint.close();
          children.delete(params.sessionId);
          if (child) void this.confirmRemoved(child.targetId);
        }
      },
    };
    this.endpoints.add(endpoint);
    return endpoint;
  }

  private async confirmRemoved(targetId: string): Promise<void> {
    try {
      await this.root.send("Target.getTargetInfo", { targetId });
      // A still-live target losing interception is a protocol failure.
      this.fail();
    } catch (error) {
      if (this.stopped) return;
      if (
        !(error instanceof Error) ||
        !/No target with given id|target.*not found/i.test(error.message)
      )
        this.fail();
    }
  }

  private async request(endpoint: Endpoint, params: Event): Promise<void> {
    if (this.stopped || !endpoint.active) return;
    if (++this.pendingRequests > MAX_PENDING) {
      this.fail();
      return;
    }
    try {
      const request = params.request as Event | undefined;
      if (typeof params.requestId !== "string" || typeof request?.url !== "string") {
        this.fail();
        return;
      }
      const url = request.url;
      const local = url === "about:blank" || url.startsWith("data:") || url.startsWith("blob:");
      const allowed = local || (await this.bounded(this.allowed(url), endpoint));
      if (this.stopped || !endpoint.active) return;
      if (allowed) {
        await endpoint.send("Fetch.continueRequest", { requestId: params.requestId });
      } else {
        this.onBlocked();
        await endpoint.send("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "BlockedByClient",
        });
      }
    } catch {
      if (endpoint.active) this.fail();
    } finally {
      this.pendingRequests -= 1;
    }
  }
}
