import test from 'node:test';
import assert from 'node:assert/strict';
import { lookup, lookupResponse, validateEntries } from '../src/dictionary.mjs';
import worker from '../worker/index.js';

const entry = { id: 'nei-juan', term: '内卷', pinyin: 'nèi juǎn', aliases: ['卷'], definitions: [{ meaning: '过度竞争', usage: '职场或学习', examples: ['大家又开始内卷了。'] }], sources: [{ title: '用例', url: 'https://example.org/source', kind: 'usage', publisher: '编辑' }], first_seen: null, reviewed_at: '2026-10-08', status: 'published', tags: ['职场'] };
const candidate = { ...entry, id: 'candidate', term: '待审词', status: 'candidate', sources: [] };
const dataset = { schema_version: 1, release: { version: 'test' }, entries: [entry] };

test('精确查询不把别名、近似输入和待审内容当成命中', () => {
  assert.equal(lookup([entry, candidate], ' 内卷 '), entry);
  for (const term of ['卷', '内', '待审词', '', null]) assert.equal(lookup([entry, candidate], term), null);
});
test('正式数据必须有可追溯来源、释义与有效日期，重复词名不可发布', () => {
  validateEntries([entry, candidate]);
  assert.throws(() => validateEntries([{ ...entry, sources: [] }]), /来源/);
  assert.throws(() => validateEntries([{ ...entry, sources: [{ ...entry.sources[0], url: 'javascript:alert(1)' }] }]), /HTTP/);
  assert.throws(() => validateEntries([{ ...entry, reviewed_at: '2026-02-30' }]), /日期/);
  assert.throws(() => validateEntries([entry, { ...entry, id: 'other' }]), /词名重复/);
});
test('查询返回明确的400/404/200和跨域头', async () => {
  assert.equal(lookupResponse(dataset, null, 'https://example.org').status, 400);
  assert.equal(lookupResponse(dataset, '未知', 'https://example.org').status, 404);
  const result = lookupResponse(dataset, '内卷', 'https://example.org');
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('access-control-allow-origin'), '*');
  assert.equal((await result.json()).entry.term, '内卷');
});
test('Worker使用同一份部署数据，处理OPTIONS及词库不可用', async () => {
  const env = { ASSETS: { fetch: async request => { assert.equal(new URL(request.url).pathname, '/api/v1/all.json'); return Response.json(dataset); } } };
  const result = await worker.fetch(new Request('https://example.org/api/v1/lookup?term=内卷'), env);
  assert.equal((await result.json()).entry.id, 'nei-juan');
  assert.equal((await worker.fetch(new Request('https://example.org/api/v1/lookup', { method: 'OPTIONS' }), env)).status, 204);
  assert.equal((await worker.fetch(new Request('https://example.org/api/v1/lookup', { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://example.org/api/v1/lookup?term=内卷'), { ASSETS: { fetch: async () => new Response('', { status: 404 }) } })).status, 503);
});
