import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, unlink, rmdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBilibili, parseWeibo, parseDouyin, fetchDouyin, collectCandidates,
  mergeCandidates, runCli } from '../scripts/collect.mjs';

const BILI = { code: 0, data: { list: [{ bvid: 'BV123', title: ' 原始视频标题 ', short_link_v2: 'https://b23.tv/abc' }] } };
const WEIBO = { ok: 1, data: { realtime: [{ word: '#有内味了#' }, { word: '广告', is_ad: 1 }] } };
const DOUYIN = { status_code: 0, data: { word_list: [{ sentence_id: '123', word: '打工人' }] } };

test('B站 preserves video identity and source URL, dropping incomplete rows', () => {
  assert.deepEqual(parseBilibili(BILI), [{ platform: 'bilibili', id: 'BV123', title: '原始视频标题', url: 'https://b23.tv/abc' }]);
  assert.equal(parseBilibili({ data: { list: [{ bvid: 'BV1', title: '片段' }, {}, { title: '无ID' }] } })[0].url,
    'https://www.bilibili.com/video/BV1');
});

test('微博 retains hashtag text, uses stable topic identity and encoded search URL', () => {
  const items = parseWeibo(WEIBO);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '#有内味了#');
  assert.equal(items[0].id, '#有内味了#');
  assert.equal(new URL(items[0].url).searchParams.get('q'), '#有内味了#');
});

test('抖音 retains hotspot ID and source URL, not a claimed original video', () => {
  assert.deepEqual(parseDouyin(DOUYIN), [{ platform: 'douyin', id: '123', title: '打工人', url: 'https://www.douyin.com/hot/123' }]);
  assert.equal(parseDouyin({ data: { word_list: [{ word: '无ID' }] } }).length, 0);
});

test('unexpected payloads and API failures are reported, not accepted as empty success', () => {
  for (const parser of [parseBilibili, parseWeibo, parseDouyin]) assert.throws(() => parser({}), /missing list/);
  assert.throws(() => parseBilibili({ code: -412 }), /-412/);
  assert.throws(() => parseWeibo({ ok: 0 }), /ok 0/);
  assert.throws(() => parseDouyin({ status_code: 5 }), /status 5/);
});

test('temporary 抖音 cookies are extracted without Set-Cookie attributes', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (requests.length === 1) return {
      ok: true, headers: { getSetCookie: () => ['one=1; Path=/; HttpOnly', 'two=2; Expires=Wed, 09 Jun 2027 10:18:14 GMT'] },
      body: { cancel: async () => {} },
    };
    return { ok: true, json: async () => DOUYIN };
  };
  assert.equal((await fetchDouyin({ fetchImpl }))[0].id, '123');
  assert.equal(requests[1].options.headers.Cookie, 'one=1; two=2');
  assert.match(requests[1].url, /hot\/search\/list/);
});

test('incremental merge preserves first_seen and manual review state across repeat sightings', () => {
  const original = { ...parseBilibili(BILI)[0], first_seen: '2026-10-01T00:00:00.000Z',
    last_seen: '2026-10-01T00:00:00.000Z', status: 'rejected', note: 'not a meme' };
  const incoming = { ...original, title: '更新后的原视频标题' };
  delete incoming.status;
  delete incoming.note;
  const merged = mergeCandidates([original], [incoming, incoming, ...parseWeibo(WEIBO)], '2026-10-08T00:00:00.000Z');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].first_seen, original.first_seen);
  assert.equal(merged[0].last_seen, '2026-10-08T00:00:00.000Z');
  assert.equal(merged[0].status, 'rejected');
  assert.equal(merged[0].note, 'not a meme');
  assert.equal(merged[0].title, incoming.title);
  assert.equal(original.title, '原始视频标题');
});

test('each source fetch is injected, and partial failure leaves old entries intact', async () => {
  const old = parseDouyin(DOUYIN)[0];
  const seen = [];
  const result = await collectCandidates({ existing: [old], fetchImpl: async (url, options) => {
    seen.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    if (url.includes('api.bilibili')) return { ok: true, json: async () => BILI };
    if (url.includes('weibo.com')) return { ok: false, status: 403 };
    throw new Error('DNS unavailable');
  }, now: '2026-10-08T00:00:00.000Z' });
  assert.equal(seen.length, 3);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates[0], old);
  assert.deepEqual(result.status.sources.map(item => item.ok), [true, false, false]);
  assert.match(result.status.sources[1].error, /403/);
  assert.match(result.status.sources[2].error, /DNS/);
});

test('source deadline cancels a stuck request without preventing other results', async () => {
  let aborted = false;
  const result = await collectCandidates({ sources: ['bilibili', 'weibo'], timeoutMs: 20,
    fetchImpl: async (url, { signal }) => {
      if (url.includes('bilibili')) return { ok: true, json: async () => BILI };
      return new Promise((_, reject) => signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('request aborted'));
      }, { once: true }));
    } });
  assert.equal(aborted, true);
  assert.equal(result.status.sources[1].ok, false);
  assert.equal(result.candidates.length, 1);
});

async function temporaryRoot(t) {
  // Use the writable workspace: Windows AppContainer temp can deny rename replacement.
  const root = await mkdtemp(join(fileURLToPath(new URL('./', import.meta.url)), '.collect-test-'));
  await mkdir(join(root, 'data'));
  t.after(async () => {
    for (const name of await readdir(join(root, 'data'))) await unlink(join(root, 'data', name));
    await rmdir(join(root, 'data'));
    await rmdir(root);
  });
  return root;
}

test('dry run does not create or update candidate/status files', async t => {
  const root = await temporaryRoot(t);
  const original = JSON.stringify(parseWeibo(WEIBO));
  await writeFile(join(root, 'data/candidates.json'), original);
  const code = await runCli(['--dry-run', '--sources', 'bilibili'], { root,
    fetchImpl: async () => ({ ok: true, json: async () => BILI }), log: () => {} });
  assert.equal(code, 0);
  assert.equal(await readFile(join(root, 'data/candidates.json'), 'utf8'), original);
  assert.deepEqual(await readdir(join(root, 'data')), ['candidates.json']);
});

test('all source failures retain archive, record errors, and return a failed exit code', async t => {
  const root = await temporaryRoot(t);
  const existing = parseWeibo(WEIBO);
  await writeFile(join(root, 'data/candidates.json'), JSON.stringify(existing));
  const logs = [];
  assert.equal(await runCli([], { root, fetchImpl: async () => { throw new Error('offline'); },
    log: text => logs.push(text) }), 1);
  assert.deepEqual(JSON.parse(await readFile(join(root, 'data/candidates.json'), 'utf8')), existing);
  const status = JSON.parse(await readFile(join(root, 'data/collection-status.json'), 'utf8'));
  assert.equal(status.sources.length, 3);
  assert.ok(status.sources.every(item => !item.ok && item.error === 'offline'));
  assert.equal(logs.filter(line => line.includes('ERROR')).length, 3);
});

test('successful CLI persists repeated observations without duplicate entries', async t => {
  const root = await temporaryRoot(t);
  const options = { root, fetchImpl: async () => ({ ok: true, json: async () => BILI }), log: () => {} };
  assert.equal(await runCli(['--sources', 'bilibili'], options), 0);
  const first = JSON.parse(await readFile(join(root, 'data/candidates.json'), 'utf8'));
  assert.equal(await runCli(['--sources', 'bilibili'], options), 0);
  const second = JSON.parse(await readFile(join(root, 'data/candidates.json'), 'utf8'));
  assert.equal(second.length, 1);
  assert.equal(second[0].first_seen, first[0].first_seen);
  assert.ok(second[0].last_seen >= first[0].last_seen);
  assert.deepEqual(await readdir(join(root, 'data')), ['candidates.json', 'collection-status.json']);
});

test('corrupt local archive is never replaced and invalid CLI selections fail early', async t => {
  const root = await temporaryRoot(t);
  await writeFile(join(root, 'data/candidates.json'), '{broken');
  let fetched = false;
  await assert.rejects(runCli([], { root, fetchImpl: async () => { fetched = true; }, log: () => {} }), /Cannot read/);
  assert.equal(fetched, false);
  assert.equal(await readFile(join(root, 'data/candidates.json'), 'utf8'), '{broken');
  assert.throws(() => mergeCandidates({}, [], 'now'), /JSON array/);
  await assert.rejects(collectCandidates({ sources: ['unknown'] }), /Unknown/);
});
