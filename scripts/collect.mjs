import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

function listAt(value, platform) {
  if (!Array.isArray(value)) throw new Error(`${platform}: unexpected payload (missing list)`);
  return value;
}

function titleOf(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}

function safeUrl(value, fallback) {
  try {
    const url = new URL(value || fallback);
    if (url.protocol === 'https:') return url.href;
  } catch { /* Use the canonical platform URL if an optional URL is malformed. */ }
  return fallback;
}

export function parseBilibili(payload) {
  if (payload?.code !== undefined && payload.code !== 0) throw new Error(`bilibili: API code ${payload.code}`);
  return listAt(payload?.data?.list, 'bilibili').flatMap(item => {
    const title = titleOf(item?.title);
    const id = item?.bvid || (item?.aid ? `av${item.aid}` : '');
    if (!title || !id) return [];
    const url = `https://www.bilibili.com/video/${encodeURIComponent(id)}`;
    return [{ platform: 'bilibili', id: String(id), title, url: safeUrl(item.short_link_v2 || item.short_link, url) }];
  });
}

export function parseWeibo(payload) {
  if (payload?.ok !== undefined && payload.ok !== 1) throw new Error(`weibo: API ok ${payload.ok}`);
  return listAt(payload?.data?.realtime, 'weibo').flatMap(item => {
    const title = titleOf(item?.word || item?.word_scheme);
    if (!title || item?.is_ad) return [];
    return [{ platform: 'weibo', id: title, title,
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}` }];
  });
}

export function parseDouyin(payload) {
  if (payload?.status_code !== undefined && payload.status_code !== 0) throw new Error(`douyin: API status ${payload.status_code}`);
  return listAt(payload?.data?.word_list, 'douyin').flatMap(item => {
    const title = titleOf(item?.word);
    const id = item?.sentence_id;
    if (!title || id === undefined || id === null || String(id) === '') return [];
    return [{ platform: 'douyin', id: String(id), title,
      url: `https://www.douyin.com/hot/${encodeURIComponent(id)}` }];
  });
}

async function responseAt(fetchImpl, url, signal, headers = {}) {
  const response = await fetchImpl(url, { signal, headers: { ...HEADERS, ...headers } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response;
}

export async function fetchBilibili({ fetchImpl = fetch, signal } = {}) {
  const response = await responseAt(fetchImpl,
    'https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1', signal,
    { Referer: 'https://www.bilibili.com/' });
  return parseBilibili(await response.json());
}

export async function fetchWeibo({ fetchImpl = fetch, signal } = {}) {
  const response = await responseAt(fetchImpl, 'https://weibo.com/ajax/side/hotSearch', signal,
    { Referer: 'https://weibo.com/' });
  return parseWeibo(await response.json());
}

export async function fetchDouyin({ fetchImpl = fetch, signal } = {}) {
  const login = await responseAt(fetchImpl, 'https://login.douyin.com/', signal, { Accept: 'text/html' });
  const cookieHeaders = login.headers.getSetCookie?.() ?? [login.headers.get('set-cookie') || ''];
  // Only send cookie name/value pairs, never Set-Cookie attributes or stored credentials.
  const cookie = cookieHeaders.flatMap(value => value.split(/,(?=\s*[^;,=\s]+=)/))
    .map(value => value.trim().split(';')[0]).filter(Boolean).join('; ');
  await login.body?.cancel();
  if (!cookie) throw new Error('douyin: login response did not provide temporary cookies');
  const response = await responseAt(fetchImpl,
    'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1',
    signal, { Cookie: cookie, Referer: 'https://www.douyin.com/' });
  return parseDouyin(await response.json());
}

export const SOURCES = Object.freeze({ bilibili: fetchBilibili, weibo: fetchWeibo, douyin: fetchDouyin });

export function mergeCandidates(existing, incoming, observedAt) {
  if (!Array.isArray(existing)) throw new Error('Existing candidates must be a JSON array; refusing to overwrite it');
  const byId = new Map();
  for (const item of existing) {
    if (!item?.platform || item.id === undefined || !item.title || !item.url) {
      throw new Error('Invalid existing candidate; refusing to overwrite the archive');
    }
    byId.set(`${item.platform}\0${item.id}`, { ...item });
  }
  for (const item of incoming) {
    const key = `${item.platform}\0${item.id}`;
    const old = byId.get(key);
    byId.set(key, { ...old, ...item,
      first_seen: old?.first_seen || observedAt, last_seen: observedAt });
  }
  return [...byId.values()];
}

export async function collectCandidates({ existing = [], sources = Object.keys(SOURCES),
  fetchImpl = fetch, timeoutMs = 15000, now = new Date().toISOString(), adapters = SOURCES } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be positive');
  if (!sources.length || sources.some(source => typeof adapters[source] !== 'function')) throw new Error('Unknown or empty source selection');
  const results = await Promise.all(sources.map(async platform => {
    const controller = new AbortController();
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Timeout after ${timeoutMs} ms`));
        }, timeoutMs);
      });
      const items = await Promise.race([adapters[platform]({ fetchImpl, signal: controller.signal }), deadline]);
      if (!Array.isArray(items)) throw new Error('Adapter did not return a list');
      return { platform, items, status: { platform, ok: true, count: items.length } };
    } catch (error) {
      const cause = error?.cause?.code || error?.cause?.message;
      const message = error?.message || String(error);
      return { platform, items: [], status: { platform, ok: false, count: 0,
        error: cause ? `${message} (${cause})` : message } };
    } finally { clearTimeout(timer); }
  }));
  return {
    candidates: mergeCandidates(existing, results.flatMap(result => result.items), now),
    status: { collected_at: now, sources: results.map(result => result.status) },
  };
}

async function readCandidates(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Cannot read existing candidates: ${error.message}`);
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, path);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function runCli(args = process.argv.slice(2), { root = ROOT, fetchImpl = fetch, log = console.log } = {}) {
  let dryRun = false;
  let sources = Object.keys(SOURCES);
  let timeoutMs = 15000;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--sources') sources = [...new Set((args[++index] || '').split(',').filter(Boolean))];
    else if (arg === '--timeout') timeoutMs = Number(args[++index]);
    else if (arg === '--help') {
      log('node scripts/collect.mjs [--dry-run] [--sources bilibili,weibo,douyin] [--timeout 15000]');
      return 0;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  const candidatesPath = resolve(root, 'data/candidates.json');
  const statusPath = resolve(root, 'data/collection-status.json');
  const existing = await readCandidates(candidatesPath);
  // Validate before networking or writing, including when all sources fail.
  mergeCandidates(existing, [], new Date().toISOString());
  const result = await collectCandidates({ existing, sources, timeoutMs, fetchImpl });
  if (!dryRun) {
    if (result.status.sources.some(item => item.ok)) await writeJson(candidatesPath, result.candidates);
    await writeJson(statusPath, result.status);
  }
  for (const item of result.status.sources) log(`${item.platform}: ${item.ok ? `${item.count} candidates` : `ERROR ${item.error}`}`);
  log(`${dryRun ? 'Dry run: ' : ''}${result.candidates.length} total candidates; no definitions generated or published.`);
  return result.status.sources.some(item => item.ok) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Collection failed: ${error.message}`);
    process.exitCode = 1;
  });
}
