export const SCHEMA_VERSION = 1;

export function validateEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('词库必须是数组');
  const ids = new Set();
  const terms = new Set();
  for (const entry of entries) {
    const fail = message => { throw new Error(`${entry?.id || '未知词条'}: ${message}`); };
    if (!entry || typeof entry !== 'object') fail('词条必须是对象');
    if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) fail('id 必须是稳定的 ASCII 标识');
    if (ids.has(entry.id)) fail('id 重复');
    ids.add(entry.id);
    if (typeof entry.term !== 'string' || !entry.term.trim() || entry.term !== entry.term.trim()) fail('term 必须是非空、无首尾空格的词名');
    const normalized = entry.term.normalize('NFC');
    if (terms.has(normalized)) fail('词名重复');
    terms.add(normalized);
    if (!['published', 'candidate'].includes(entry.status)) fail('status 必须为 published 或 candidate');
    for (const field of ['pinyin']) if (typeof entry[field] !== 'string') fail(`${field} 必须是字符串`);
    for (const field of ['aliases', 'tags']) if (!Array.isArray(entry[field]) || entry[field].some(value => typeof value !== 'string')) fail(`${field} 必须是字符串数组`);
    if (!Array.isArray(entry.sources)) fail('sources 必须是数组');
    for (const source of entry.sources) {
      let url;
      try { url = new URL(source.url); } catch { fail('来源 URL 无效'); }
      if (!['https:', 'http:'].includes(url.protocol)) fail('来源必须使用 HTTP(S)');
      if (!source.title || !source.publisher || !['usage', 'explanation'].includes(source.kind)) fail('来源需要 title、publisher 和 kind');
    }
    if (!Array.isArray(entry.definitions)) fail('definitions 必须是数组');
    for (const definition of entry.definitions) {
      if (typeof definition.meaning !== 'string' || !definition.meaning.trim()) fail('释义不能为空');
      if (typeof definition.usage !== 'string' || !definition.usage.trim()) fail('使用场景不能为空');
      if (!Array.isArray(definition.examples) || !definition.examples.length || definition.examples.some(value => typeof value !== 'string' || !value.trim())) fail('至少需要一个例句');
    }
    if (entry.first_seen !== null && !isDate(entry.first_seen)) fail('first_seen 使用 YYYY-MM-DD 或 null');
    if (entry.status === 'published') {
      if (!entry.sources.length || !entry.definitions.length) fail('正式词条必须包含来源和释义');
      if (!isDate(entry.reviewed_at)) fail('正式词条需要有效的核对日期');
    }
  }
  return entries;
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

// v1 deliberately matches only canonical terms. Aliases and fuzzy matching are TODOs.
export function lookup(entries, term) {
  if (typeof term !== 'string') return null;
  const query = term.trim().normalize('NFC');
  return entries.find(entry => entry.status === 'published' && entry.term.normalize('NFC') === query) || null;
}

export function lookupResponse(dataset, term, suggestionUrl) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=300',
  };
  if (typeof term !== 'string' || !term.trim() || term.length > 128) {
    return Response.json({ schema_version: SCHEMA_VERSION, error: { code: 'invalid_term', message: '请提供 1–128 字符的 term 参数' } }, { status: 400, headers });
  }
  const entry = lookup(dataset.entries, term);
  if (!entry) {
    return Response.json({ schema_version: SCHEMA_VERSION, release: dataset.release, error: { code: 'not_found', message: '正式词库暂未收录此词', suggestion_url: suggestionUrl } }, { status: 404, headers });
  }
  return Response.json({ schema_version: SCHEMA_VERSION, release: dataset.release, entry }, { headers });
}
