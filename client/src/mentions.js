const TOKEN = /@\[([^\]\n]*)\]\((\d+)\)/g;

// A note's name as shown in a mention (never empty, never contains ] or newlines)
export const cleanTitle = (note) =>
  (note.title || '').replace(/[[\]\n\r]/g, ' ').trim() || 'Untitled';

// Stored text -> what the textarea shows. Also returns a name -> id lookup.
export function toDisplay(stored, notesById) {
  const map = new Map();
  const text = stored.replace(TOKEN, (_, savedTitle, id) => {
    const note = notesById.get(Number(id));
    const shown = note ? cleanTitle(note) : savedTitle;
    map.set(shown, Number(id));
    return '@' + shown;
  });
  return { text, map };
}

// What the textarea shows -> stored text (known @Names become tokens again)
export function toStored(text, map) {
  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`@(${escaped.join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
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