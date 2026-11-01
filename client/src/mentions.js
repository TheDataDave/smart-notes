const TOKEN = /@\[([^\]\n]*)\]\((\d+)\)/g;

// A note's name as shown in a mention (never empty, never contains ] or newlines)
export const cleanTitle = (note) =>
  (note.title || '').replace(/[[\]\n\r]/g, ' ').trim() || 'Untitled';

// Give every note a name that is unique among ALL notes (case-insensitive).
// Returns Map(noteId -> label).
export function buildLabels(notes) {
  const byTitle = new Map();
  for (const n of notes) {
    const key = cleanTitle(n).toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(n);
  }

  const labels = new Map();
  for (const list of byTitle.values()) {
    if (list.length === 1) {
      labels.set(list[0].id, cleanTitle(list[0]));
      continue;
    }
    list.sort((a, b) => a.id - b.id); // oldest first, so #1 is the oldest
    const counter = {};
    for (const n of list) {
      const sameKind = list.filter((x) => x.kind === n.kind).length;
      counter[n.kind] = (counter[n.kind] || 0) + 1;
      labels.set(
        n.id,
        `${cleanTitle(n)} · ${n.kind}` + (sameKind > 1 ? ` #${counter[n.kind]}` : '')
      );
    }
  }

  // Safety net: a note literally titled "Groceries · task" could still collide
  const used = new Set();
  for (const [id, label] of labels) {
    let l = label;
    while (used.has(l.toLowerCase())) l += ` #${id}`;
    used.add(l.toLowerCase());
    labels.set(id, l);
  }
  return labels;
}

// Stored text -> what the textarea shows. Also returns a label -> id lookup.
export function toDisplay(stored, labels) {
  const map = new Map();
  const taken = new Set([...labels.values()].map((l) => l.toLowerCase()));
  const gone = new Map(); // id -> label, for notes that were deleted

  const text = stored.replace(TOKEN, (_, savedTitle, rawId) => {
    const id = Number(rawId);
    let label = labels.get(id);
    if (!label) {
      label = gone.get(id);
      if (!label) {
        label = `${savedTitle.replace(/ \(deleted\)$/, '')} (deleted)`;
        while (taken.has(label.toLowerCase())) label += ` #${id}`;
        taken.add(label.toLowerCase());
        gone.set(id, label);
      }
    }
    map.set(label, id);
    return '@' + label;
  });
  return { text, map };
}

// What the textarea shows -> stored text (known @Labels become tokens again)
export function toStored(text, map) {
  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}_.])@(${escaped.join('|')})(?![\\p{L}\\p{N}_])`,
    'gu'
  );
  return text.replace(re, (_, name) => `@[${name}](${map.get(name)})`);
}

// Stored text -> pieces for display: { text } or { mention, id, title }
export function splitBody(stored) {
  const parts = [];
  let last = 0;
  for (const m of stored.matchAll(TOKEN)) {
    if (m.index > last) parts.push({ text: stored.slice(last, m.index) });
    parts.push({ mention: true, id: Number(m[2]), title: m[1] });
    last = m.index + m[0].length;
  }
  if (last < stored.length) parts.push({ text: stored.slice(last) });
  return parts;
}

export const mentionIds = (stored) => [
  ...new Set([...stored.matchAll(TOKEN)].map((m) => Number(m[2]))),
];

// Is the caret right after an "@something"? Returns where it starts and what was typed.
export function findTrigger(text, caret) {
  const before = text.slice(0, caret);
  const m = /(^|\s)@(\S[^\n@]{0,29}|)$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

// "task #2" from "Groceries · task #2" (empty when the title is already unique)
export const tagOf = (label, note) =>
  label.slice(cleanTitle(note).length).replace(/^ · /, '');

// A short preview of a note's body, with mentions flattened to plain text
export const snippet = (note) =>
  note.body.replace(TOKEN, '@$1').replace(/\s+/g, ' ').trim().slice(0, 50);

// Plain text of a stored line: mentions flattened to "@Title"
export const plainText = (stored) =>
  stored.replace(TOKEN, '@$1').replace(/\s+/g, ' ').trim();