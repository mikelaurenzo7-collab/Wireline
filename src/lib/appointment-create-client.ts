import { authFetch } from "./api";

export type AppointmentSlot = { date: string; time: string; start_at: string; end_at: string };
export type AppointmentAvailability = {
  time_zone: string;
  duration_minutes: number;
  booking_mode: "automatic" | "approval" | "inherit";
  slots: AppointmentSlot[];
};
export type AppointmentCreateRequest = {
  request_key: string;
  date: string;
  time: string;
  time_zone: string;
  customer_name: string;
  service_type?: string;
  phone_number?: string;
  notes?: string;
};
export type AppointmentCreateReceipt = {
  id: string;
  status: "Scheduled" | "Requested" | "Confirmed" | "Rescheduled" | "Completed" | "Cancelled";
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readAppointmentAvailability(
  value: unknown,
  date: string,
): AppointmentAvailability | null {
  const data = object(value);
  if (
    !data ||
    typeof data.time_zone !== "string" ||
    !Number.isInteger(data.duration_minutes) ||
    Number(data.duration_minutes) < 15 ||
    Number(data.duration_minutes) > 240 ||
    !["automatic", "approval", "inherit"].includes(String(data.booking_mode)) ||
    !Array.isArray(data.slots) ||
    data.slots.length > 96
  )
    return null;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: data.time_zone }).format();
  } catch {
    return null;
  }
  const times = new Set<string>();
  for (const raw of data.slots) {
    const slot = object(raw);
    if (
      !slot ||
      slot.date !== date ||
      typeof slot.time !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time) ||
      times.has(slot.time) ||
      typeof slot.start_at !== "string" ||
      typeof slot.end_at !== "string" ||
      !Number.isFinite(Date.parse(slot.start_at)) ||
      Date.parse(slot.end_at) - Date.parse(slot.start_at) !== Number(data.duration_minutes) * 60_000
    )
      return null;
    times.add(slot.time);
  }
  return data as AppointmentAvailability;
}

export class AppointmentCreateError extends Error {
  constructor(
    message: string,
    readonly uncertain: boolean,
  ) {
    super(message);
    this.name = "AppointmentCreateError";
  }
}

/** A later refusal cannot prove an earlier unacknowledged transaction never committed. */
export function appointmentRequestIsUncertain(
  previouslyUncertain: boolean,
  error: unknown,
): boolean {
  return previouslyUncertain || !(error instanceof AppointmentCreateError) || error.uncertain;
}

const UNCERTAIN = "Retry this booking before starting another.";

/** Retrying this exact immutable request lets the server return its original receipt. */
export async function createCalendarAppointment(
  request: Readonly<AppointmentCreateRequest>,
  fetcher: typeof authFetch = authFetch,
): Promise<AppointmentCreateReceipt> {
  let response: Response;
  try {
    response = await fetcher("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new AppointmentCreateError(UNCERTAIN, true);
  }
  const body = object(await response.json().catch(() => null));
  if (!response.ok) {
    // A gateway/server failure or timeout can occur after the transaction commits.
    // Never rotate the key or change the payload until a definite answer arrives.
    const uncertain = response.status >= 500 || response.status === 408;
    const message =
      !uncertain && typeof body?.error === "string" && body.error.trim()
        ? body.error.slice(0, 500)
        : uncertain
          ? UNCERTAIN
          : "This appointment could not be saved. Check the details and try again.";
    throw new AppointmentCreateError(message, uncertain);
  }
  const row = object(body?.appointment);
  if (
    !row ||
    typeof row.id !== "string" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.id) ||
    row.bookingRequestKey !== request.request_key ||
    row.bookingSource !== "native" ||
    !["Scheduled", "Requested", "Confirmed", "Rescheduled", "Completed", "Cancelled"].includes(
      String(row.status),
    )
  )
    throw new AppointmentCreateError(UNCERTAIN, true);
  return { id: row.id, status: row.status as AppointmentCreateReceipt["status"] };
}

export function appointmentDateToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
