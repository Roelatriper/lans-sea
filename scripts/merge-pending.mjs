import { readFile, writeFile } from 'node:fs/promises';
import { mergeCandidates } from './collect.mjs';

const pending = JSON.parse(await readFile(process.argv[2], 'utf8'));
const current = JSON.parse(await readFile(new URL('../data/candidates.json', import.meta.url), 'utf8'));
// Current main holds the maintainer's latest review state; preserve it on overlap.
const combined = mergeCandidates(pending, [], new Date().toISOString());
const byKey = new Map(combined.map(item => [`${item.platform}\0${item.id}`, item]));
for (const item of current) {
  const key = `${item.platform}\0${item.id}`;
  const old = byKey.get(key);
  byKey.set(key, { ...old, ...item,
    first_seen: [old?.first_seen, item.first_seen].filter(Boolean).sort()[0],
    last_seen: [old?.last_seen, item.last_seen].filter(Boolean).sort().at(-1) });
}
await writeFile(new URL('../data/candidates.json', import.meta.url), JSON.stringify([...byKey.values()], null, 2) + '\n');
