import { useEffect, useRef, useState, type FormEvent } from "react";
import { authFetch } from "../lib/api";
import type { CalendarSettings } from "../lib/calendar-settings-client";
import {
  appointmentRequestIsUncertain,
  appointmentDateToday,
  createCalendarAppointment,
  readAppointmentAvailability,
  type AppointmentAvailability,
  type AppointmentCreateReceipt,
  type AppointmentCreateRequest,
} from "../lib/appointment-create-client";
import { Button, Input, NativeSelect, Textarea } from "./atoms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./atoms/Dialog";
import { StatusNotice } from "./molecules";

/** Kept mounted by Calendar so closing the dialog never discards an uncertain request. */
export default function AppointmentDialog({
  open,
  settings,
  onOpenChange,
  onCreated,
  onRecoveryChange,
}: {
  open: boolean;
  settings: CalendarSettings;
  onOpenChange: (open: boolean) => void;
  onCreated: (receipt: AppointmentCreateReceipt) => void;
  onRecoveryChange: (pending: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => appointmentDateToday(settings.time_zone));
  const [time, setTime] = useState("");
  const [service, setService] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [availability, setAvailability] = useState<AppointmentAvailability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [frozen, setFrozen] = useState<Readonly<AppointmentCreateRequest> | null>(null);
  const requestRef = useRef<Readonly<AppointmentCreateRequest> | null>(null);
  const pendingRef = useRef(false);
  const uncertainRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || frozen) return;
    const controller = new AbortController();
    setLoadingSlots(true);
    setAvailability(null);
    setSlotsError(null);
    void (async () => {
      try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a date.");
        const response = await authFetch(
          `/api/calendar/availability?date=${encodeURIComponent(date)}`,
          {
            signal: controller.signal,
          },
        );
        const body = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body?.error || "Available times could not be loaded.");
        const parsed = readAppointmentAvailability(body, date);
        if (!parsed) throw new Error("Available times could not be confirmed. Try again.");
        setAvailability(parsed);
        setTime((current) => (parsed.slots.some((slot) => slot.time === current) ? current : ""));
      } catch (reason) {
        if (!controller.signal.aborted)
          setSlotsError(
            reason instanceof Error ? reason.message : "Available times could not be loaded.",
          );
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    })();
    return () => controller.abort();
  }, [open, date, refresh, frozen]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    if (!requestRef.current) {
      if (!name.trim() || !availability?.slots.some((slot) => slot.time === time)) return;
      requestRef.current = Object.freeze({
        request_key: `calendar-owner:${crypto.randomUUID()}`,
        date,
        time,
        time_zone: availability.time_zone,
        customer_name: name.trim(),
        ...(service.trim() ? { service_type: service.trim() } : {}),
        ...(phone.trim() ? { phone_number: phone.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setFrozen(requestRef.current);
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    let receipt: AppointmentCreateReceipt | null = null;
    try {
      receipt = await createCalendarAppointment(requestRef.current);
    } catch (reason) {
      const uncertain = appointmentRequestIsUncertain(uncertainRef.current, reason);
      const priorUncertain = uncertainRef.current;
      uncertainRef.current = uncertain;
      onRecoveryChange(uncertain);
      setError(
        priorUncertain
          ? "Check Calendar, then retry this booking."
          : reason instanceof Error
            ? reason.message
            : "This booking could not be confirmed. Retry the same request.",
      );
      if (!uncertain) {
        requestRef.current = null;
        setFrozen(null);
        setTime("");
        setRefresh((current) => current + 1);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
    if (!receipt) return;
    requestRef.current = null;
    uncertainRef.current = false;
    setFrozen(null);
    onRecoveryChange(false);
    setName("");
    setTime("");
    setService("");
    setPhone("");
    setNotes("");
    setRefresh((current) => current + 1);
    onCreated(receipt);
    onOpenChange(false);
  }

  const zone = frozen?.time_zone || availability?.time_zone || settings.time_zone;
  const duration = availability?.duration_minutes || settings.duration_minutes;
  const recovery = Boolean(frozen && !pending);
  const canSubmit = Boolean(frozen || (name.trim() && time && availability && !loadingSlots));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pendingRef.current) onOpenChange(next);
      }}
    >
      <DialogContent
        className="min-w-0 p-3 sm:p-6 [&>button]:size-[44px]"
        showClose={!pending}
        onOpenAutoFocus={(event) => {
          openerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          event.preventDefault();
          (requestRef.current ? submitRef.current : nameRef.current)?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (openerRef.current?.isConnected) openerRef.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (pendingRef.current) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pendingRef.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="pr-[44px] text-lg">
            {recovery ? "Check booking" : "New booking"}
          </DialogTitle>
          <DialogDescription>
            {zone} · {duration} min
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="min-w-0 space-y-4">
          {error ? (
            <StatusNotice
              tone="warning"
              icon={false}
              className="px-3"
              title={recovery ? "Not Confirmed" : "Not Saved"}
            >
              {error}
            </StatusNotice>
          ) : null}
          <fieldset disabled={pending || Boolean(frozen)} className="min-w-0 space-y-4">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="appointment-name" className="text-sm font-medium">
                Customer name
              </label>
              <Input
                ref={nameRef}
                id="appointment-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                required
                autoComplete="name"
              />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="appointment-date" className="text-sm font-medium">
                  Date
                </label>
                <Input
                  id="appointment-date"
                  type="date"
                  className="min-w-0 max-w-full"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setTime("");
                  }}
                  required
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <label htmlFor="appointment-time" className="text-sm font-medium">
                  Available time
                </label>
                <NativeSelect
                  id="appointment-time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  required
                  disabled={
                    pending || Boolean(frozen) || loadingSlots || !availability?.slots.length
                  }
                >
                  <option value="">
                    {loadingSlots
                      ? "Loading…"
                      : availability && !availability.slots.length
                        ? "No times available"
                        : "Choose a time"}
                  </option>
                  {availability?.slots.map((slot) => (
                    <option key={slot.time} value={slot.time}>
                      {new Intl.DateTimeFormat(undefined, {
                        timeZone: zone,
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(slot.start_at))}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            {!loadingSlots && availability && !availability.slots.length ? (
              <p role="status" className="text-sm text-muted-foreground">
                No available times on this date. Choose another date.
              </p>
            ) : null}
            <details className="min-w-0 rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">More details</summary>
              <div className="mt-3 min-w-0 space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="appointment-service" className="text-sm font-medium">
                    Appointment type
                  </label>
                  <Input
                    id="appointment-service"
                    value={service}
                    onChange={(event) => setService(event.target.value)}
                    placeholder={settings.appointment_name}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="appointment-phone" className="text-sm font-medium">
                    Phone number
                  </label>
                  <Input
                    id="appointment-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={50}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="appointment-notes" className="text-sm font-medium">
                    Notes
                  </label>
                  <Textarea
                    id="appointment-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={2000}
                    rows={3}
                  />
                </div>
              </div>
            </details>
          </fieldset>
          {slotsError && !frozen ? (
            <StatusNotice
              tone="warning"
              icon={false}
              className="px-3"
              title="Times Unavailable"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRefresh((current) => current + 1)}
                >
                  Retry
                </Button>
              }
            >
              {slotsError}
            </StatusNotice>
          ) : null}
          <DialogFooter className="min-w-0">
            <Button
              type="button"
              className="h-auto min-h-11 whitespace-normal break-words py-2"
              variant="secondary"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              ref={submitRef}
              className="h-auto min-h-11 whitespace-normal break-words py-2"
              type="submit"
              disabled={pending || !canSubmit}
              aria-busy={pending}
            >
              {pending
                ? "Saving…"
                : recovery
                  ? "Check booking"
                  : availability?.booking_mode === "approval"
                    ? "Request appointment"
                    : "Create appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
