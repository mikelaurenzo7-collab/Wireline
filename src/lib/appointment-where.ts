import { and, eq, gte, lt, ne } from "drizzle-orm";
import * as schema from "../db/schema";

/**
 * The one appointments window predicate, shared by the Insights funnel and
 * the Goals actuals so the two surfaces can never disagree about what an
 * "appointment" count means: the tenant's appointments created in the
 * window, EXCLUDING cancelled ones. A cancelled booking is not an
 * appointment that happened (the funnel previously counted the founder's
 * two cancelled QA bookings as "Appointments 2", and Goals counted them
 * toward monthly progress).
 */
export function appointmentsInWindow(userId: string, start: Date, end?: Date) {
  const conditions = [
    eq(schema.appointments.userId, userId),
    gte(schema.appointments.createdAt, start),
    ne(schema.appointments.status, "Cancelled"),
  ];
  if (end) conditions.push(lt(schema.appointments.createdAt, end));
  return and(...conditions);
}
