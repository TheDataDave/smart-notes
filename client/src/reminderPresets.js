import {
  addDays, addHours, addMinutes, isAfter, nextMonday,
  setHours, startOfDay, subDays, subHours,
} from 'date-fns';

const at = (day, hour) => setHours(startOfDay(day), hour);

export function presetsFor(note, now = new Date()) {
  const list = [
    { label: 'In 1 min', when: addMinutes(now, 1) },
    { label: 'In 1 hour', when: addHours(now, 1) },
    { label: 'This evening', when: at(now, 18) },
    { label: 'Tomorrow morning', when: at(addDays(now, 1), 9) },
    { label: 'In 3 days', when: at(addDays(now, 3), 9) },
    { label: 'Next Monday', when: at(nextMonday(now), 9) },
  ];

  if (note.due_at) {
    const due = new Date(note.due_at);
    list.push({ label: '1 hour before due', when: subHours(due, 1) });
    list.push({ label: '1 day before due', when: subDays(due, 1) });
  }

  // Only offer times that are still in the future
  return list.filter((p) => isAfter(p.when, now));
}