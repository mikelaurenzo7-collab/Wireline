export type ToastPauseReason = "pointer" | "focus";

type ToastTimer = {
  handle?: ReturnType<typeof setTimeout>;
  remaining: number;
  deadline: number;
  persistent: boolean;
  pausedBy: Set<ToastPauseReason>;
};

/** Each toast keeps its unread time while a person is interacting with it. */
export function createToastTimers(onExpire: (id: string) => void) {
  const timers = new Map<string, ToastTimer>();
  let active = true;

  function stop(timer: ToastTimer) {
    if (timer.handle !== undefined) clearTimeout(timer.handle);
    timer.handle = undefined;
  }

  function start(id: string, timer: ToastTimer) {
    if (!active || timer.persistent || timer.pausedBy.size > 0) return;
    timer.deadline = Date.now() + timer.remaining;
    timer.handle = setTimeout(() => {
      timers.delete(id);
      onExpire(id);
    }, timer.remaining);
  }

  return {
    activate() {
      if (active) return;
      active = true;
      for (const [id, timer] of timers) start(id, timer);
    },
    deactivate() {
      if (!active) return;
      active = false;
      for (const timer of timers.values()) {
        if (timer.handle !== undefined) {
          timer.remaining = Math.max(0, timer.deadline - Date.now());
        }
        stop(timer);
      }
    },
    schedule(id: string, duration: number) {
      const previous = timers.get(id);
      if (previous) stop(previous);
      const timer: ToastTimer = {
        remaining: Math.max(0, duration),
        deadline: 0,
        persistent: duration <= 0,
        pausedBy: previous?.pausedBy ?? new Set(),
      };
      timers.set(id, timer);
      start(id, timer);
    },
    pause(id: string, reason: ToastPauseReason) {
      const timer = timers.get(id);
      if (!timer || timer.pausedBy.has(reason)) return;
      if (timer.handle !== undefined) {
        timer.remaining = Math.max(0, timer.deadline - Date.now());
        stop(timer);
      }
      timer.pausedBy.add(reason);
    },
    resume(id: string, reason: ToastPauseReason) {
      const timer = timers.get(id);
      if (!timer || !timer.pausedBy.delete(reason)) return;
      start(id, timer);
    },
    clear(id: string) {
      const timer = timers.get(id);
      if (timer) stop(timer);
      timers.delete(id);
    },
    clearAll() {
      for (const timer of timers.values()) stop(timer);
      timers.clear();
    },
  };
}
