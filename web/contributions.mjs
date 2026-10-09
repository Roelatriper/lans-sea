export const REPO = 'Roelatriper/lans-sea';
export const DRAFT_KEY = 'meme-dictionary-contribution-v1';
export const LIMITS = { term: 80, meaning: 1200, examples: 800, sources: 2000 };

export function prepareContribution(input) {
  const fields = Object.fromEntries(Object.entries(LIMITS).map(([key]) => [key, String(input[key] || '').trim()]));
  const errors = {};
  for (const [key, limit] of Object.entries(LIMITS)) {
    if (fields[key].length > limit) errors[key] = `请控制在 ${limit} 字以内。`;
  }
  if (!fields.term) errors.term = '请填写词名。';
  if (/[\r\n]/.test(fields.term)) errors.term = '一次提交一个词，词名不要换行。';
  if (!fields.meaning) errors.meaning = '请说明含义和场景；没有把握时可以写“含义待核实”。';
  const sources = fields.sources.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (!sources.length) errors.sources = '请至少附上一个来源链接。';
  for (const source of sources) {
    try {
      const url = new URL(source);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { errors.sources = '请每行填写一个完整的 http:// 或 https:// 链接。'; }
  }
  if (Object.keys(errors).length) return { errors, fields };
  const title = `[提词] ${fields.term}`;
  const body = [
    '### 词名', fields.term,
    '### 中文含义和使用场景', fields.meaning,
    '### 例句或具体用例', fields.examples || '暂未补充。',
    '### 来源链接', sources.join('\n'),
    '### 核对说明', '- [x] 我已区分自己编写的解释与来源原文，未把未知起源写成事实。',
    '---', '通过迷因之海网页提词；内容待维护者核对，不自动进入正式词库。',
  ].join('\n\n');
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set('template', 'web-submission.md');
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  // Long Chinese text expands significantly when URL-encoded. Preserve the full
  // draft and use copy/paste rather than risking GitHub's URI length limit.
  const prefilled = url.href.length <= 7500;
  if (!prefilled) url.searchParams.delete('body');
  return { errors: {}, fields, title, body, url: url.href, prefilled };
}

export function discussionAttributes(config, entry) {
  if (!config?.enabled || !config.repo || !config.repoId || !config.category || !config.categoryId) return null;
  return {
    id: `entry/${entry.id}`,
    repo: config.repo,
    repoid: config.repoId,
    category: config.category,
    categoryid: config.categoryId,
    mapping: 'specific',
    term: `词条 / ${entry.id}`,
    strict: '1',
    reactionsenabled: '1',
    emitmetadata: '0',
    inputposition: 'top',
    theme: 'light',
    lang: 'zh-CN',
    loading: 'lazy',
  };
}
