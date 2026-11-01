const LINE = /^(\s*)\[( |x|X)\][ \t]?(.*)$/;

// "[ ] buy milk" -> { indent, done, text }, or null if the line isn't a checklist item
export function parseLine(line) {
  const m = LINE.exec(line);
  return m ? { indent: m[1], done: m[2] !== ' ', text: m[3] } : null;
}

// Flip one line between [ ] and [x]
export function toggleLine(body, index) {
  const lines = body.split('\n');
  const item = parseLine(lines[index] ?? '');
  if (!item) return body;
  lines[index] = `${item.indent}[${item.done ? ' ' : 'x'}] ${item.text}`;
  return lines.join('\n');
}

export function progress(body) {
  let total = 0;
  let done = 0;
  for (const line of body.split('\n')) {
    const item = parseLine(line);
    if (item) { total++; if (item.done) done++; }
  }
  return { total, done };
}