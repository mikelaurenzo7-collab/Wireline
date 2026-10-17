import { describe, expect, it, vi } from "vitest";
import {
  AppointmentCreateError,
  appointmentRequestIsUncertain,
  createCalendarAppointment,
  readAppointmentAvailability,
  type AppointmentCreateRequest,
} from "../src/lib/appointment-create-client";

const request: AppointmentCreateRequest = Object.freeze({
  request_key: "calendar-owner:stable-request",
  date: "2030-01-08",
  time: "09:00",
  time_zone: "UTC",
  customer_name: "QA Customer",
});
const receipt = () => ({
  appointment: {
    id: "11111111-1111-4111-8111-111111111111",
    status: "Requested",
    bookingSource: "native",
    bookingRequestKey: request.request_key,
  },
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("owner appointment creation receipts and retry identity", () => {
  it("does not unlock an earlier uncertain request after a later conflict or expired session", () => {
    const conflict = new AppointmentCreateError("Review this booking.", false);
    expect(appointmentRequestIsUncertain(false, conflict)).toBe(false);
    expect(appointmentRequestIsUncertain(true, conflict)).toBe(true);
    expect(appointmentRequestIsUncertain(true, new AppointmentCreateError("Sign in.", false))).toBe(
      true,
    );
  });
  it("retries the exact request after a network outcome is uncertain", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection dropped"))
      .mockResolvedValueOnce(response(receipt()));
    await expect(createCalendarAppointment(request, fetcher)).rejects.toMatchObject({
      uncertain: true,
    });
    await expect(createCalendarAppointment(request, fetcher)).resolves.toMatchObject({
      status: "Requested",
    });
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(request);
  });

  it.each([408, 500, 502, 503])("retains an uncertain request for HTTP %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: "temporary" }, status));
    await expect(createCalendarAppointment(request, fetcher)).rejects.toMatchObject({
      uncertain: true,
    });
  });

  it("treats a confirmed slot conflict as editable rather than apparent success", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ error: "That time is no longer available." }, 409));
    await expect(createCalendarAppointment(request, fetcher)).rejects.toMatchObject({
      uncertain: false,
      message: "That time is no longer available.",
    });
  });

  it.each(["missing", "wrong-key", "invalid-id", "wrong-source", "unknown-status"])(
    "never acknowledges an unverified 2xx receipt: %s",
    async (problem) => {
      const body = receipt();
      if (problem === "wrong-key") body.appointment.bookingRequestKey = "other-request";
      if (problem === "invalid-id") body.appointment.id = "not-an-id";
      if (problem === "wrong-source") body.appointment.bookingSource = "connected";
      if (problem === "unknown-status") body.appointment.status = "done-maybe";
      const fetcher = vi.fn().mockResolvedValue(response(problem === "missing" ? {} : body));
      await expect(createCalendarAppointment(request, fetcher)).rejects.toBeInstanceOf(
        AppointmentCreateError,
      );
      const again = vi.fn().mockResolvedValue(response(problem === "missing" ? {} : body));
      await expect(createCalendarAppointment(request, again)).rejects.toMatchObject({
        uncertain: true,
      });
    },
  );
});

describe("available appointment slots", () => {
  const available = () => ({
    time_zone: "UTC",
    duration_minutes: 30,
    booking_mode: "approval",
    slots: [
      {
        date: request.date,
        time: "09:00",
        start_at: "2030-01-08T09:00:00Z",
        end_at: "2030-01-08T09:30:00Z",
      },
    ],
  });
  it("accepts only the selected date and verified slot duration", () => {
    expect(readAppointmentAvailability(available(), request.date)).toMatchObject({
      booking_mode: "approval",
    });
    expect(readAppointmentAvailability(available(), "2030-01-09")).toBeNull();
    const wrongDuration = available();
    wrongDuration.slots[0].end_at = "2030-01-08T10:00:00Z";
    expect(readAppointmentAvailability(wrongDuration, request.date)).toBeNull();
  });
  it("accepts a genuine empty day and rejects malformed or duplicate slots", () => {
    expect(readAppointmentAvailability({ ...available(), slots: [] }, request.date)?.slots).toEqual(
      [],
    );
    const duplicate = available();
    duplicate.slots.push({ ...duplicate.slots[0] });
    expect(readAppointmentAvailability(duplicate, request.date)).toBeNull();
    expect(
      readAppointmentAvailability({ ...available(), time_zone: "Not/AZone" }, request.date),
    ).toBeNull();
  });
});
