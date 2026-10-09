import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareContribution, discussionAttributes } from '../web/contributions.mjs';
import { validateDiscussionConfig } from '../web/discussions.mjs';

test('网页提词保留中文、特殊字符与真实链接，生成待审核的 GitHub 草稿', () => {
  const input = {
    term: '新词 & #例子', meaning: '含义包含“引号”、换行\n和 ? = 字符。',
    examples: '自编：这里有个新说法。', sources: 'https://www.bilibili.com/video/BV1example/?a=1&b=2\nhttps://example.com/原帖#用例',
  };
  const draft = prepareContribution(input);
  assert.deepEqual(draft.errors, {});
  const url = new URL(draft.url);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/Roelatriper/lans-sea/issues/new');
  assert.equal(url.searchParams.get('template'), 'web-submission.md');
  assert.equal(url.searchParams.get('title'), `[提词] ${input.term}`);
  assert.equal(url.searchParams.get('body'), draft.body);
  assert.ok(draft.body.includes(input.meaning));
  assert.ok(draft.body.includes(input.sources));
  assert.ok(draft.body.includes('内容待维护者核对'));
});

test('网页提词拒绝缺项、超长内容、危险协议及混入说明的来源行', () => {
  assert.deepEqual(Object.keys(prepareContribution({}).errors).sort(), ['meaning', 'sources', 'term']);
  for (const sources of ['javascript:alert(1)', 'https://example.com 这是一条来源', 'https://name:secret@example.com']) {
    assert.ok(prepareContribution({ term: '词', meaning: '含义', sources }).errors.sources);
  }
  assert.ok(prepareContribution({ term: '词'.repeat(81), meaning: '含义', sources: 'https://example.com' }).errors.term);
});

test('中文长草稿不丢内容，切换为复制粘贴，避免过长 URL', () => {
  const draft = prepareContribution({ term: '长词条', meaning: '释义'.repeat(600), examples: '例句'.repeat(400), sources: 'https://example.com' });
  assert.deepEqual(draft.errors, {});
  assert.equal(draft.prefilled, false);
  assert.equal(new URL(draft.url).searchParams.has('body'), false);
  assert.ok(draft.body.includes('释义'.repeat(600)));
});

test('词条讨论按稳定 ID 严格匹配，改名不丢讨论，不同词不共用讨论', () => {
  const config = { enabled: true, repo: 'owner/repo', repoId: 'repo-id', category: '词条讨论', categoryId: 'category-id' };
  const a = discussionAttributes(config, { id: 'a', term: '旧名' });
  const renamed = discussionAttributes(config, { id: 'a', term: '新名' });
  const b = discussionAttributes(config, { id: 'b', term: '新名' });
  assert.equal(a.mapping, 'specific');
  assert.equal(a.strict, '1');
  assert.equal(a.term, renamed.term);
  assert.notEqual(a.term, b.term);
  assert.equal(a.id, 'entry/a');
  assert.equal(discussionAttributes({ ...config, enabled: false }, { id: 'a' }), null);
  assert.throws(() => validateDiscussionConfig({ giscus: { enabled: true } }), /categoryId/);
  assert.doesNotThrow(() => validateDiscussionConfig({ giscus: { enabled: false } }));
});
