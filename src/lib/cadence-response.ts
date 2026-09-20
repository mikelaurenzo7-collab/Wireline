export type StepType = "call" | "sms" | "email";
export type Step = { type: StepType; delayHours: number; template?: string };

export interface Cadence {
  id: string;
  name: string;
  description: string | null;
  steps: Step[];
  active: boolean | null;
}

export interface CadenceRun {
  id: string;
  cadenceId: string;
  leadId: string | number;
  currentStep: number;
  status: string;
  nextDueAt: string | null;
  lastResult: string | null;
  contactName?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function validStep(value: unknown): value is Step {
  return (
    record(value) &&
    typeof value.type === "string" &&
    ["call", "sms", "email"].includes(value.type) &&
    typeof value.delayHours === "number" &&
    Number.isFinite(value.delayHours) &&
    value.delayHours >= 0 &&
    (value.template === undefined || typeof value.template === "string")
  );
}
function validCadence(value: unknown): value is Cadence {
  return (
    record(value) &&
    nonemptyString(value.id) &&
    nonemptyString(value.name) &&
    nullableString(value.description) &&
    (value.active === null || typeof value.active === "boolean") &&
    Array.isArray(value.steps) &&
    value.steps.every(validStep)
  );
}
function validRun(value: unknown): value is CadenceRun {
  return (
    record(value) &&
    nonemptyString(value.id) &&
    nonemptyString(value.cadenceId) &&
    (nonemptyString(value.leadId) ||
      (typeof value.leadId === "number" && Number.isFinite(value.leadId))) &&
    typeof value.currentStep === "number" &&
    Number.isInteger(value.currentStep) &&
    value.currentStep >= 0 &&
    nonemptyString(value.status) &&
    nullableString(value.nextDueAt) &&
    nullableString(value.lastResult) &&
    [value.contactName, value.contactNumber, value.contactEmail].every(
      (entry) => entry === undefined || nullableString(entry),
    )
  );
}

/** Missing or malformed data is unavailable, not an empty sequence or run list. */
export function parseCadences(value: unknown): Cadence[] | null {
  return record(value) && Array.isArray(value.cadences) && value.cadences.every(validCadence)
    ? value.cadences
    : null;
}

export function parseCadenceRuns(value: unknown): CadenceRun[] | null {
  return record(value) && Array.isArray(value.runs) && value.runs.every(validRun)
    ? value.runs
    : null;
}
