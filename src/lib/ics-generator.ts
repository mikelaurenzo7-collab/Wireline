export function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function generateRfc5545Ics(params: {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  organizerEmail: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName?: string;
  location?: string;
}): string {
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(params.start);
  const dtEnd = formatIcsDate(params.end);
  const summary = escapeIcsText(params.summary);
  const description = escapeIcsText(params.description);
  const location = params.location ? escapeIcsText(params.location) : "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BotBound//SMB Calendar Engine//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
  ];

  if (location) {
    lines.push(`LOCATION:${location}`);
  }
  lines.push(`ORGANIZER;CN=${escapeIcsText(params.organizerName || "BotBound Service")}:mailto:${params.organizerEmail}`);
  lines.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${escapeIcsText(params.attendeeName || params.attendeeEmail)}:mailto:${params.attendeeEmail}`);
  lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}
