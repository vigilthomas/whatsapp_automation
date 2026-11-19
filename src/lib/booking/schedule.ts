// ============================================================
// Dynamic appointment times — pure, no I/O, no time zones.
//
// Works in minutes from the start of one day, so the booking assistant
// (clinic time zone) and the staff appointment form (browser time) share
// the same rules:
//
//   - Start at opening time and step by the gap (30 min by default).
//   - Every appointment keeps half its service's buffer free before it
//     and half after it. Two back-to-back visits are therefore one full
//     buffer apart (half of each).
//   - When a time would clash with a booking, jump straight to just
//     after that booking (plus the buffers) and carry on stepping from
//     there. So with a 45 min visit booked at 9:00 and no buffer, the
//     next time offered is 9:45, then 10:15, 10:45…
// ============================================================

export interface Block {
  /** Minutes from midnight. */
  start: number;
  end: number;
  /** Buffer of the booked service (half before, half after). */
  bufferMin: number;
}

export interface StartsInput {
  /** Opening and closing time, minutes from midnight. */
  open: number;
  close: number;
  /** Length and buffer of the service being booked. */
  durationMin: number;
  bufferMin: number;
  /** Step between offered times when nothing is in the way. */
  gapMin: number;
  /** Existing bookings for this doctor on this day. */
  blocks: readonly Block[];
  /** Nothing before this minute is offered (now + notice). */
  earliest?: number;
}

/** The start times (minutes from midnight) free for one doctor on one day. */
export function dynamicStarts({ open, close, durationMin, bufferMin, gapMin, blocks, earliest = -Infinity }: StartsInput): number[] {
  const half = bufferMin / 2;
  const gap = Math.max(5, gapMin);
  const reserved = blocks
    .map((b) => ({ s: b.start - b.bufferMin / 2, e: b.end + b.bufferMin / 2 }))
    .sort((a, b) => a.s - b.s);
  const out: number[] = [];
  let m = open;
  for (let guard = 0; m + durationMin <= close && guard < 2000; guard++) {
    const s = m - half;
    const e = m + durationMin + half;
    const hit = reserved.find((r) => s < r.e && r.s < e);
    if (hit) {
      // Right after the clash, leaving our half of the buffer.
      m = Math.max(m + 1, Math.ceil(hit.e + half));
      continue;
    }
    if (m >= earliest) out.push(m);
    m += gap;
  }
  return out;
}

/** "HH:MM" for minutes from midnight. */
export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
