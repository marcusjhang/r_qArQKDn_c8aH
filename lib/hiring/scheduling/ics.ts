// Minimal iCalendar (RFC 5545) builder — no library. Uses absolute UTC `Z`
// instants so no VTIMEZONE block is needed (DST-safe). Built in Phase 1, used
// by the email layer in Phase 2 (invites / confirmations / cancellations).

export interface IcsAttendee {
  name: string;
  email: string;
}

export interface IcsParams {
  uid: string;
  method: 'REQUEST' | 'CANCEL';
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  organizer: IcsAttendee;
  attendees: IcsAttendee[];
  /** dtstamp override for deterministic tests; defaults to `start`. */
  stamp?: Date;
}

/** Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ. */
export function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** Escape per RFC 5545 (commas, semicolons, backslashes, newlines). */
function esc(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Fold lines at 75 octets with CRLF + space continuation. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(' ' + rest);
  return chunks.join('\r\n');
}

export function buildIcs(p: IcsParams): string {
  const status = p.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lightsprint Hiring//Interview Scheduling//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${p.method}`,
    'BEGIN:VEVENT',
    `UID:${p.uid}`,
    `DTSTAMP:${toIcsUtc(p.stamp ?? p.start)}`,
    `DTSTART:${toIcsUtc(p.start)}`,
    `DTEND:${toIcsUtc(p.end)}`,
    `SEQUENCE:${p.sequence}`,
    `STATUS:${status}`,
    `SUMMARY:${esc(p.summary)}`,
    p.description ? `DESCRIPTION:${esc(p.description)}` : '',
    p.location ? `LOCATION:${esc(p.location)}` : '',
    `ORGANIZER;CN=${esc(p.organizer.name)}:mailto:${p.organizer.email}`,
    ...p.attendees.map(
      (a) =>
        `ATTENDEE;CN=${esc(a.name)};RSVP=TRUE:mailto:${a.email}`
    ),
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);
  return lines.map(fold).join('\r\n');
}
