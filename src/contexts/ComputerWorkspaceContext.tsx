import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { authFetch, readApiJson } from "../lib/api";
import { useAuth } from "./AuthContext";
import {
  readComputerStatusReceipt,
  readComputerTaskListReceipt,
  readComputerTaskReceipt,
} from "../lib/computer-task-receipt";
import type {
  OwnerBrowserCapabilities,
  OwnerBrowserDownload,
  OwnerBrowserHistory,
  OwnerSavedLogin,
} from "../lib/cloud-computer/browser-capabilities";

export type ComputerTaskStatus =
  "running" | "needs_input" | "completed" | "blocked" | "failed" | "stopped" | "interrupted";
export type ComputerTaskEvent = {
  at: string;
  kind: "action" | "note" | "question" | "reply" | "result" | "error";
  text: string;
  url?: string;
  ok?: boolean;
};
export type ComputerTask = {
  id: string;
  agentId: string;
  goal: string;
  startUrl: string | null;
  status: ComputerTaskStatus;
  summary: string | null;
  question: string | null;
  sources: string[];
  events: ComputerTaskEvent[];
  errorCode: string | null;
  turnCount: number;
  actionCount: number;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  liveView: boolean;
  frameCapturedAt?: string | null;
  frameUrl?: string | null;
  agentPointer?: { x: number; y: number; at: string } | null;
  currentUrl: string | null;
  ownerControl: boolean;
  controlRequested?: boolean;
  ownerTabs?: Array<{ id: string; label: string; active: boolean }>;
  ownerHistory?: OwnerBrowserHistory[];
  ownerDownloads?: OwnerBrowserDownload[];
  ownerSavedLogins?: OwnerSavedLogin[];
  ownerDownloadNotice?: string | null;
  browserCapabilities?: OwnerBrowserCapabilities | null;
  preparingBrowser?: boolean;
  stopping: boolean;
};
export type ComputerStatus = {
  available: boolean;
  reason:
    | "ready"
    | "model_unconfigured"
    | "browser_unconfigured"
    | "storage_unavailable"
    | "plan_required";
  limits: { maxMinutes: number; maxSteps: number };
};
export const ACTIVE_COMPUTER_TASKS: ComputerTaskStatus[] = ["running", "needs_input"];
type NewTask = { agentId: string; goal?: string; startUrl?: string; prepareBrowser?: boolean };

function retainConfirmedTask(previous: ComputerTask | undefined, next: ComputerTask) {
  if (!previous) return next;
  if (
    Date.parse(next.updatedAt) < Date.parse(previous.updatedAt) ||
    (!ACTIVE_COMPUTER_TASKS.includes(previous.status) &&
      ACTIVE_COMPUTER_TASKS.includes(next.status))
  )
    return previous;
  return previous.stopping && ACTIVE_COMPUTER_TASKS.includes(next.status)
    ? { ...next, stopping: true }
    : next;
}

/** One account-owned task list and poller serves Work chat and its browser. */
function useComputerTaskModel(enabled: boolean) {
  const { user } = useAuth();
  const owner = user?.id ?? null;
  const [status, setStatus] = useState<ComputerStatus | null>(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [tasks, setTasks] = useState<ComputerTask[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [starting, setStarting] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const tasksRef = useRef<ComputerTask[] | null>(null);
  const epoch = useRef(0);
  const mutationInFlight = useRef(false);
  const refreshInFlight = useRef(false);
  const uncertain = useRef(false);
  const lastAutoSelectedActiveIdRef = useRef<string | null>(null);
  const scope = useRef({ owner, live: true });
  scope.current.owner = owner;
  const valid = useCallback(
    (requestedOwner: string | null) =>
      enabled &&
      Boolean(requestedOwner) &&
      scope.current.live &&
      scope.current.owner === requestedOwner,
    [enabled],
  );
  useEffect(() => {
    const accountScope = scope.current;
    accountScope.live = true;
    return () => {
      accountScope.live = false;
    };
  }, []);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  const markUnconfirmed = useCallback(() => {
    if (!valid(owner)) return;
    uncertain.current = true;
    setRefreshRequired(true);
  }, [owner, valid]);

  const loadStatus = useCallback(
    async (signal?: AbortSignal) => {
      if (!valid(owner)) return;
      try {
        const result = await readApiJson<unknown>(
          await authFetch("/api/computer/status", { signal }),
        );
        if (signal?.aborted || !valid(owner)) return;
        const next = result.ok ? readComputerStatusReceipt(result.data) : null;
        setStatusFailed(!next);
        if (next) setStatus(next);
      } catch {
        if (!signal?.aborted && valid(owner)) setStatusFailed(true);
      }
    },
    [owner, valid],
  );

  const loadTasks = useCallback(
    async ({
      signal,
      focusActive = false,
      silent = false,
      confirmRecovery = false,
    }: {
      signal?: AbortSignal;
      focusActive?: boolean;
      silent?: boolean;
      confirmRecovery?: boolean;
    } = {}) => {
      if (!valid(owner)) return;
      const revision = epoch.current;
      try {
        const result = await readApiJson<{ tasks?: unknown }>(
          await authFetch("/api/computer/tasks", { signal }),
        );
        if (signal?.aborted || revision !== epoch.current || !valid(owner)) return;
        const receipts = result.ok ? readComputerTaskListReceipt(result.data?.tasks) : null;
        if (!receipts) {
          if (!silent || tasksRef.current === null) setListFailed(true);
          return;
        }
        const next = receipts.map((receipt) =>
          retainConfirmedTask(
            tasksRef.current?.find((task) => task.id === receipt.id),
            receipt,
          ),
        );
        const active = next.find((task) => ACTIVE_COMPUTER_TASKS.includes(task.status));
        const isNewlyDetectedActive = Boolean(
          active && active.id !== lastAutoSelectedActiveIdRef.current,
        );
        if (active) {
          lastAutoSelectedActiveIdRef.current = active.id;
        }
        setListFailed(false);
        tasksRef.current = next;
        setTasks(next);
        if (confirmRecovery) {
          uncertain.current = false;
          setRefreshRequired(false);
        }
        setSelectedId((current) =>
          (focusActive || isNewlyDetectedActive || active?.status === "needs_input") && active
            ? active.id
            : current && next.some((task) => task.id === current)
              ? current
              : (next[0]?.id ?? null),
        );
      } catch {
        if (!signal?.aborted && valid(owner) && (!silent || tasksRef.current === null))
          setListFailed(true);
      }
    },
    [owner, valid],
  );

  const applyTask = useCallback(
    (receipt: unknown, announce = false) => {
      if (!valid(owner)) return;
      const parsed = readComputerTaskReceipt(receipt);
      if (!parsed) {
        markUnconfirmed();
        throw new Error("The task update could not be confirmed. Refresh work before continuing.");
      }
      // Every confirmed adoption invalidates reads started before it, including
      // direct owner controls that do not pass through performMutation.
      epoch.current += 1;
      const previous = tasksRef.current?.find((task) => task.id === parsed.id);
      const next = retainConfirmedTask(previous, parsed);
      if (next === previous) {
        if (announce) return;
        markUnconfirmed();
        throw new Error("A newer task state is already confirmed. Refresh work before continuing.");
      }
      if (
        previous &&
        ACTIVE_COMPUTER_TASKS.includes(previous.status) &&
        !ACTIVE_COMPUTER_TASKS.includes(next.status)
      )
        setSelectedId(next.id);
      if (announce && previous?.status !== next.status) {
        setAnnouncement(
          next.status === "needs_input"
            ? `Your Bot needs you: ${next.question || "Open the browser to continue."}`
            : `Task ${next.status.replaceAll("_", " ")}.`,
        );
        if (next.status === "needs_input") setSelectedId(next.id);
      } else if (next.status === "running") setAnnouncement("");
      const current = tasksRef.current;
      const adopted = current?.some((task) => task.id === next.id)
        ? current.map((task) => (task.id === next.id ? next : task))
        : [next, ...(current ?? [])];
      tasksRef.current = adopted;
      setTasks(adopted);
    },
    [markUnconfirmed, owner, valid],
  );

  useEffect(() => {
    if (!valid(owner)) return;
    const controller = new AbortController();
    void loadStatus(controller.signal);
    void loadTasks({ signal: controller.signal });
    return () => controller.abort();
  }, [loadStatus, loadTasks, owner, valid]);

  const activeTask = tasks?.find((task) => ACTIVE_COMPUTER_TASKS.includes(task.status)) ?? null;
  const activeId = activeTask?.id ?? null;
  const hasLoadedTasks = tasks !== null;
  useEffect(() => {
    if (!valid(owner) || !hasLoadedTasks) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let inFlight = false;
    const poll = async () => {
      if (document.hidden || inFlight || refreshInFlight.current) {
        timer = window.setTimeout(poll, activeId ? 2000 : 3500);
        return;
      }
      inFlight = true;
      try {
        if (activeId) {
          const pollRevision = epoch.current;
          const result = await readApiJson<{ task: ComputerTask }>(
            await authFetch(`/api/computer/tasks/${activeId}`, { signal: controller.signal }),
          );
          if (!controller.signal.aborted && valid(owner) && pollRevision === epoch.current) {
            const next = result.ok
              ? readComputerTaskReceipt(result.data?.task, {
                  taskId: activeId,
                  agentId: tasksRef.current?.find((task) => task.id === activeId)?.agentId,
                })
              : null;
            if (next) {
              setListFailed(false);
              applyTask(next, true);
            } else if (!result.ok && result.status === 404) void loadTasks();
            else setListFailed(true);
          }
        } else await loadTasks({ signal: controller.signal, silent: true });
      } catch {
        /* A dropped poll retries while the owner remains in this account. */
      } finally {
        inFlight = false;
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, activeId ? 2000 : 3500);
    };
    const onReturn = () => {
      if (document.hidden || inFlight || refreshInFlight.current) return;
      if (timer) window.clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    timer = window.setTimeout(poll, activeId ? 2000 : 3500);
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [activeId, applyTask, hasLoadedTasks, loadTasks, owner, valid]);

  const performMutation = useCallback(
    async (
      path: string,
      body: unknown,
      expected: { taskId?: string; agentId?: string; goal?: string },
    ) => {
      if (!valid(owner)) throw new Error("The account session changed. Refresh before continuing.");
      if (uncertain.current)
        throw new Error("Refresh work to confirm the previous action before trying again.");
      if (mutationInFlight.current) throw new Error("Another task action is still in progress.");
      mutationInFlight.current = true;
      let knownRejection = false;
      try {
        const result = await readApiJson<{ task?: unknown }>(
          await authFetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        );
        if (!valid(owner))
          throw new Error("The account session changed. Refresh before continuing.");
        if (!result.ok) {
          knownRejection = result.status >= 400 && result.status < 500;
          if (result.code === "COMPUTER_BUSY") {
            epoch.current += 1;
            void loadTasks({ focusActive: true });
          }
          if (knownRejection) throw new Error(result.error);
          throw new Error(
            "The action outcome could not be confirmed. Refresh work before trying again.",
          );
        }
        const next = readComputerTaskReceipt(result.data?.task, expected);
        if (!next)
          throw new Error(
            "The task receipt did not match this action. Refresh work before trying again.",
          );
        applyTask(next);
        return next;
      } catch (reason) {
        if (!knownRejection && valid(owner)) markUnconfirmed();
        throw reason;
      } finally {
        mutationInFlight.current = false;
      }
    },
    [applyTask, loadTasks, markUnconfirmed, owner, valid],
  );

  const startTask = useCallback(
    async (input: NewTask) => {
      setStarting(true);
      setAnnouncement("");
      try {
        const next = await performMutation("/api/computer/tasks", input, {
          agentId: input.agentId,
          ...(!input.prepareBrowser && input.goal !== undefined ? { goal: input.goal.trim() } : {}),
        });
        setSelectedId(next.id);
        return next;
      } finally {
        if (valid(owner)) setStarting(false);
      }
    },
    [owner, performMutation, valid],
  );

  const taskAction = useCallback(
    async (taskId: string, action: "reply" | "stop", message?: string) => {
      const task = tasksRef.current?.find((item) => item.id === taskId);
      if (!task) throw new Error("Refresh work to find this task before continuing.");
      return performMutation(
        `/api/computer/tasks/${encodeURIComponent(taskId)}/${action}`,
        action === "reply" ? { message } : {},
        { taskId, agentId: task.agentId },
      );
    },
    [performMutation],
  );

  const handoffTask = useCallback(
    async (taskId: string, goal: string) => {
      const task = tasksRef.current?.find((item) => item.id === taskId);
      if (!task) throw new Error("Refresh work to find this browser before continuing.");
      return performMutation(
        `/api/computer/tasks/${encodeURIComponent(taskId)}/control/return`,
        { goal },
        { taskId, agentId: task.agentId },
      );
    },
    [performMutation],
  );

  const refreshWork = useCallback(async () => {
    if (!valid(owner) || refreshInFlight.current) return;
    refreshInFlight.current = true;
    // The authoritative refresh owns this read window. Older polls cannot
    // advance the epoch and new polls wait until its task list is adopted.
    epoch.current += 1;
    try {
      await Promise.all([loadStatus(), loadTasks({ focusActive: true, confirmRecovery: true })]);
    } finally {
      refreshInFlight.current = false;
    }
  }, [loadStatus, loadTasks, owner, valid]);

  return {
    status,
    statusFailed,
    tasks,
    listFailed,
    setListFailed,
    selectedId,
    setSelectedId,
    selected: tasks?.find((task) => task.id === selectedId) ?? null,
    activeTask,
    anyActive: activeId !== null,
    announcement,
    starting,
    loadStatus,
    loadTasks,
    applyTask,
    startTask,
    taskAction,
    handoffTask,
    refreshRequired,
    refreshWork,
    markUnconfirmed,
  };
}
type ComputerWorkspaceModel = ReturnType<typeof useComputerTaskModel>;
const ComputerWorkspaceContext = createContext<ComputerWorkspaceModel | null>(null);
function AccountComputerWorkspace({ children }: { children: ReactNode }) {
  const model = useComputerTaskModel(true);
  return (
    <ComputerWorkspaceContext.Provider value={model}>{children}</ComputerWorkspaceContext.Provider>
  );
}
export function ComputerWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <AccountComputerWorkspace key={user?.id || "signed-out"}>{children}</AccountComputerWorkspace>
  );
}
/** A standalone Computer page gets one local model; a split workspace shares it. */
export function useComputerWorkspace() {
  const shared = useContext(ComputerWorkspaceContext);
  const standalone = useComputerTaskModel(shared === null);
  return shared ?? standalone;
}
