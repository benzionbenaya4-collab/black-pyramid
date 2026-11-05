// Writes tools/lines.json: every voiced line of the film, with its id and speaker.
import { writeFileSync } from 'node:fs';
import { CHAPTERS, lineId } from '../src/screenplay.js';
import { EXTRA, EXTRA2 } from '../src/screenplay-extra.js';
const out = [], seen = new Set();
for (const c of CHAPTERS) {
  const beats = [...c.beats];
  for (const ins of [...(EXTRA[c.id] || []), ...(EXTRA2[c.id] || [])].sort((a, b) => b.at - a.at)) beats.splice(ins.at, 0, ...ins.beats);
  for (const b of beats) {
    if (!b.t) continue;
    const id = lineId(b.s, b.t);
    if (seen.has(id)) continue; seen.add(id);
    out.push({ id, speaker: b.s, text: b.t });
  }
}
writeFileSync(new URL('./lines.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out.length, 'lines →', 'tools/lines.json');
