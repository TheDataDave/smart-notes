import { findDates } from '../src/smartDates.js';

const phrases = [
  'Call mom September 3pm',
  'Dentist 9 @ 3pm',
  'Report due 3am on September',
  'Sept 9 @ 3pm',
  'tomorrow at 5pm',
  'next friday',
  'in 3 days',
  'I may go',
];

for (const p of phrases) {
  console.log(JSON.stringify(p));
  const hits = findDates(p);
  if (!hits.length) console.log('   (no date found)');
  for (const h of hits) console.log(`   "${h.text}" -> ${h.date.toString()}${h.past ? '  (past)' : ''}`);
}