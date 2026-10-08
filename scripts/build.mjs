import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateEntries, SCHEMA_VERSION } from '../src/dictionary.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const output = path.join(root, 'dist');
async function readOptional(file, fallback) {
  try { return JSON.parse(await readFile(path.join(root, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function build() {
  const entries = validateEntries(JSON.parse(await readFile(path.join(root, 'data/entries.json'), 'utf8')));
  const observations = await readOptional('data/candidates.json', []);
  if (!Array.isArray(observations)) throw new Error('候选队列必须是数组');
  const collection = await readOptional('data/collection-status.json', null);
  const published = entries.filter(entry => entry.status === 'published').sort((a, b) => a.id.localeCompare(b.id));
  const candidates = entries.filter(entry => entry.status === 'candidate');
  const version = createHash('sha256').update(JSON.stringify(published)).digest('hex').slice(0, 16);
  const release = { version, reviewed_at: published.map(entry => entry.reviewed_at).sort().at(-1) || null, count: published.length };
  const dataset = { schema_version: SCHEMA_VERSION, release, entries: published };
  // dist is generated output. Validate its absolute boundary before clearing it.
  if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') throw new Error('输出目录不在仓库内');
  await rm(output, { recursive: true, force: true });
  const api = path.join(output, 'api/v1');
  await mkdir(path.join(api, 'entries'), { recursive: true });
  const json = (file, value) => writeFile(path.join(api, file), JSON.stringify(value, null, 2) + '\n');
  await json('all.json', dataset);
  await json('index.json', { schema_version: SCHEMA_VERSION, release, entries: published.map(entry => ({ id: entry.id, term: entry.term, pinyin: entry.pinyin, tags: entry.tags, path: `entries/${entry.id}.json` })) });
  await json('candidates.json', { schema_version: SCHEMA_VERSION, note: '未审核线索，不代表正式词条或当前热梗', entries: candidates, observations });
  const pendingCount = candidates.length + observations.filter(item => !['accepted', 'rejected'].includes(item.review_status)).length;
  await json('status.json', { schema_version: SCHEMA_VERSION, release, candidate_count: pendingCount, collection });
  for (const entry of published) await json(`entries/${entry.id}.json`, { schema_version: SCHEMA_VERSION, release, entry });
  await cp(path.join(root, 'index.html'), path.join(output, 'index.html'));
  await cp(path.join(root, 'web'), path.join(output, 'assets'), { recursive: true });
  await mkdir(path.join(output, 'lib'), { recursive: true });
  await cp(path.join(root, 'src/dictionary.mjs'), path.join(output, 'lib/dictionary.mjs'));
  await writeFile(path.join(output, '.nojekyll'), '');
  await writeFile(path.join(output, '_headers'), '/api/*\n  Access-Control-Allow-Origin: *\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, max-age=300\n');
  console.log(`构建完成：${published.length} 条正式词条，${candidates.length + observations.length} 条候选；版本 ${version}`);
  return dataset;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
