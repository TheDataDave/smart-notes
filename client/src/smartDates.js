import * as chrono from 'chrono-node';

// "9 @ 3pm" / "9 at 3pm": a day of the month, then a time. chrono can't know
// that's what we mean, so we handle this one pattern ourselves.
const DAY_AT = /(?<![\d/:.-])(\d{1,2})\s*(?:@|at)\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b/gi;

// Words that make a match believable. Stops "I may go" from becoming a date.
const WORDS =
  /\b(today|tomorrow|tonight|noon|midnight|next|this|morning|afternoon|evening|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;

// The next time day-of-month `day` at hour:minute falls in the future
function resolveDay(day, hour, minute, now) {
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, day, hour, minute);
    if (d.getDate() === day && d > now) return d; // skips e.g. Feb 31
  }
  return null;
}

// Turn "Sept 9 @ 3pm" into "Sept 9 at 3pm" so chrono understands it, and
// remember where each character came from so highlights land in the right place.
function normalise(text) {
  let norm = '';
  const map = [];
  let last = 0;
  const re = /@(?=\s*\d)/g;
  let m;
  while ((m = re.exec(text))) {
    for (let k = last; k < m.index; k++) { norm += text[k]; map.push(k); }
    norm += 'at';
    map.push(m.index, m.index);
    last = m.index + 1;
  }
  for (let k = last; k < text.length; k++) { norm += text[k]; map.push(k); }
  return { norm, map };
}

// Returns [{ text, start, end, date, past }] for every date-like phrase in `text`
export function findDates(text, now = new Date()) {
  const hits = [];
  let masked = text;

  for (const m of text.matchAll(DAY_AT)) {
    const day = Number(m[1]);
    let hour = Number(m[2]);
    const minute = m[3] ? Number(m[3]) : 0;
    if (day < 1 || day > 31 || hour < 1 || hour > 12 || minute > 59) continue;
    hour = (hour % 12) + (m[4].toLowerCase() === 'pm' ? 12 : 0);
    const date = resolveDay(day, hour, minute, now);
    if (!date) continue;
    hits.push({ text: m[0], start: m.index, end: m.index + m[0].length, date, past: false });
    // blank it out so chrono doesn't read the same words again
    masked = masked.slice(0, m.index) + ' '.repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }

  const { norm, map } = normalise(masked);
  for (const r of chrono.parse(norm, now, { forwardDate: true })) {
    if (r.text.length < 3) continue;
    if (!/\d/.test(r.text) && !WORDS.test(r.text)) continue;

    const date = r.start.date();
    if (r.start.isCertain('hour')) date.setSeconds(0, 0);
    else date.setHours(9, 0, 0, 0); // a date with no time means 9 AM

    const start = map[r.index];
    const end = map[r.index + r.text.length - 1] + 1;
    hits.push({ text: text.slice(start, end), start, end, date, past: date <= now });
  }

  return hits.sort((a, b) => a.start - b.start);
}