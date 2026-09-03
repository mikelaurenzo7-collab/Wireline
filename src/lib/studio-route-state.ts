export type StudioInspectorSection = "setup" | "review";
export type StudioWorkroomMode = "configure" | "test";

export type StudioRouteStateInput = {
  section: string | null;
  workroom: string | null;
  command: string | null;
  commandNonce: string | null;
};

export function readStudioInspectorSection(value: string | null): StudioInspectorSection {
  return value === "review" ? "review" : "setup";
}

export function readStudioWorkroomMode(input: StudioRouteStateInput): StudioWorkroomMode {
  return input.workroom === "test" ||
    input.section === "test" ||
    Boolean(input.command || input.commandNonce)
    ? "test"
    : "configure";
}

function canonicalStudioParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete("mode");
  next.delete("view");
  if (next.get("section") === "test") {
    next.delete("section");
    next.set("workroom", "test");
  }
  if (next.get("workroom") !== "test") next.delete("workroom");
  return next;
}

export function normalizeStudioRouteParams(current: URLSearchParams): URLSearchParams {
  const legacyMode = current.get("mode");
  const legacyView = current.get("view");
  const next = canonicalStudioParams(current);

  if (legacyMode === "workroom") next.set("workroom", "test");
  if (legacyMode !== "workroom" && legacyView === "workspace" && !next.has("section")) {
    next.set("section", "setup");
  }
  if (next.has("command") || next.has("commandNonce")) next.set("workroom", "test");
  return next;
}

export function setStudioWorkroomModeParams(
  current: URLSearchParams,
  mode: StudioWorkroomMode,
): URLSearchParams {
  const next = canonicalStudioParams(current);
  if (mode === "test") {
    next.set("workroom", "test");
  } else {
    next.delete("workroom");
    next.delete("command");
    next.delete("commandNonce");
  }
  return next;
}

export function setStudioInspectorSectionParams(
  current: URLSearchParams,
  section: StudioInspectorSection,
): URLSearchParams {
  const hadCommand = current.has("command") || current.has("commandNonce");
  const next = canonicalStudioParams(current);
  next.set("section", section);
  if (hadCommand) next.set("workroom", "test");
  next.delete("command");
  next.delete("commandNonce");
  return next;
}

export function clearStudioInspectorSectionParams(current: URLSearchParams): URLSearchParams {
  const next = canonicalStudioParams(current);
  if (next.get("section") === "setup" || next.get("section") === "review") {
    next.delete("section");
  }
  return next;
}
