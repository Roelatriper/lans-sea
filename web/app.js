import { lookupResponse } from '../lib/dictionary.mjs';
import { REPO, DRAFT_KEY, LIMITS, prepareContribution } from './contributions.mjs';
import { mountDiscussion } from './discussions.mjs';

const repo = `https://github.com/${REPO}`;
const $ = id => document.getElementById(id);
let dataset = null;
let activeTag = '全部';
let lastFocus = null;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function externalLink(text, url, className) {
  const link = node('a', text, className);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}
function suggestion(term = '') {
  const url = new URL(`${repo}/issues/new`);
  url.searchParams.set('template', 'meme.yml');
  if (term) url.searchParams.set('title', `[提词] ${term}`);
  return url.href;
}
function render() {
  if (!dataset) return;
  const normalizeSearch = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const query = normalizeSearch($('search').value.trim());
  const entries = dataset.entries.filter(entry => {
    const searchable = normalizeSearch([entry.term, entry.pinyin, ...entry.definitions.map(item => item.meaning)].join(' '));
    const pinyin = normalizeSearch(entry.pinyin).replace(/\s/g, '');
    return (!query || searchable.includes(query) || pinyin.includes(query.replace(/\s/g, ''))) && (activeTag === '全部' || entry.tags.includes(activeTag));
  }).sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || a.term.localeCompare(b.term, 'zh-CN'));
  $('entries').replaceChildren(...entries.map(card));
  $('resultCount').textContent = `共 ${entries.length} 条${query || activeTag !== '全部' ? '匹配结果' : '正式词条'}`;
  $('noResults').hidden = entries.length > 0;
}
function card(entry) {
  const article = node('article', undefined, 'entry-card');
  const top = node('div', undefined, 'card-top');
  const title = node('button', entry.term, 'entry-title');
  title.type = 'button';
  title.addEventListener('click', () => openEntry(entry, title));
  top.append(title, node('span', entry.tags[0] || '网络用语', 'card-tag'));
  const meta = node('div', undefined, 'card-meta');
  meta.append(node('span', `${entry.sources.length} 个来源 · ${entry.reviewed_at} 核对`), node('span', '↗', 'arrow'));
  const discuss = node('button', '讨论这个词 ↗', 'card-discuss');
  discuss.type = 'button';
  discuss.setAttribute('aria-label', `讨论${entry.term}`);
  discuss.addEventListener('click', () => {
    openEntry(entry, discuss, true);
  });
  article.append(top, node('p', entry.pinyin, 'pinyin'), node('p', entry.definitions[0].meaning, 'card-meaning'), meta, discuss);
  return article;
}
function section(title) {
  const element = node('section', undefined, 'detail-section');
  element.append(node('h3', title));
  return element;
}
function openEntry(entry, trigger = null, showDiscussion = false) {
  lastFocus = trigger || document.activeElement;
  const content = $('detailContent');
  const title = node('h2', entry.term, 'detail-title');
  title.id = 'detailTerm';
  const tags = node('div', undefined, 'detail-tags');
  tags.append(...entry.tags.map(tag => node('span', tag, 'card-tag')));
  const children = [node('span', '词条 / DICTIONARY ENTRY', 'eyebrow'), title, node('p', entry.pinyin, 'pinyin'), tags];
  entry.definitions.forEach((definition, i) => {
    const explanation = section(entry.definitions.length > 1 ? `含义 ${i + 1}` : '含义与语境');
    explanation.append(node('p', definition.meaning), node('p', definition.usage));
    definition.examples.forEach(example => explanation.append(node('blockquote', example, 'example')));
    explanation.append(node('p', '例句由词库编辑编写。', 'detail-meta'));
    children.push(explanation);
  });
  const sources = section('核对来源');
  const list = node('ol', undefined, 'detail-sources');
  entry.sources.forEach(source => { const item = node('li'); item.append(externalLink(source.title, source.url), node('span', ` · ${source.publisher}`)); list.append(item); });
  sources.append(list);
  children.push(sources, node('p', `本次核对：${entry.reviewed_at} · 最早出现：${entry.first_seen || '尚未确定'}`, 'detail-meta'));
  const actions = node('div', undefined, 'detail-actions');
  const json = new URL(`./api/v1/entries/${entry.id}.json`, location.href);
  actions.append(externalLink('读取词条 JSON ↗', json.href, 'text-link'), externalLink('补充或纠错 ↗', `${repo}/issues/new?template=correction.yml&title=${encodeURIComponent(`[纠错] ${entry.term}`)}`, 'text-link'));
  children.push(actions);
  const discussion = section(`讨论「${entry.term}」`);
  discussion.id = 'entryDiscussion';
  children.push(discussion);
  content.replaceChildren(...children);
  // The element's id also preserves this entry through giscus OAuth redirects.
  history.replaceState(null, '', `#entry/${encodeURIComponent(entry.id)}`);
  if (!$('entryDialog').open) $('entryDialog').showModal();
  $('entryDialog').scrollTop = 0;
  mountDiscussion(discussion, entry).then(() => {
    if (showDiscussion && discussion.isConnected && $('entryDialog').open) {
      $('entryDialog').scrollTo({ top: discussion.offsetTop - 20, behavior: 'auto' });
    }
  });
}
async function demo() {
  if (!dataset) return;
  const response = lookupResponse(dataset, $('demoTerm').value, suggestion());
  $('demoOutput').textContent = JSON.stringify(await response.json(), null, 2);
}
function fromHash() {
  if (!dataset || !location.hash.startsWith('#entry/')) return;
  let id;
  try { id = decodeURIComponent(location.hash.slice(7)); } catch { return; }
  const entry = dataset.entries.find(item => item.id === id);
  if (entry) openEntry(entry);
}
$('search').addEventListener('input', render);
$('searchForm').addEventListener('submit', event => { event.preventDefault(); render(); });
$('demoForm').addEventListener('submit', event => { event.preventDefault(); demo(); });
$('closeDialog').addEventListener('click', () => $('entryDialog').close());
$('entryDialog').addEventListener('close', () => {
  $('detailContent').replaceChildren();
  if (location.hash.startsWith('#entry/')) history.replaceState(null, '', '#dictionary');
  lastFocus?.focus();
});
$('entryDialog').addEventListener('click', event => {
  if (event.target !== $('entryDialog')) return;
  const rect = $('entryDialog').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('entryDialog').close();
});
$('copyJson').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('demoOutput').textContent); $('copyJson').textContent = '已复制'; }
  catch { $('copyJson').textContent = '请选中文本复制'; }
  setTimeout(() => { $('copyJson').textContent = '复制 JSON'; }, 1800);
});
window.addEventListener('hashchange', fromHash);

const contributionFields = {
  term: $('contributionTerm'), meaning: $('contributionMeaning'),
  examples: $('contributionExamples'), sources: $('contributionSources'),
};
let contributionDraft = null;
function saveDraft() {
  const values = Object.fromEntries(Object.entries(contributionFields).map(([key, element]) => [key, element.value]));
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    $('draftStatus').textContent = '草稿已保存在当前浏览器，尚未提交。';
  } catch { $('draftStatus').textContent = '浏览器无法保存草稿，离开前请复制备份。'; }
}
try {
  const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    for (const [key, element] of Object.entries(contributionFields)) {
      if (typeof saved[key] === 'string') element.value = saved[key].slice(0, LIMITS[key]);
    }
    $('draftStatus').textContent = '已恢复上次草稿，尚未提交。';
  }
} catch { /* The form remains usable when browser storage is unavailable. */ }
for (const element of Object.values(contributionFields)) element.addEventListener('input', () => {
  $('contributionPreview').hidden = true;
  contributionDraft = null;
  saveDraft();
});
$('contributionConfirm').addEventListener('change', () => { $('contributionPreview').hidden = true; contributionDraft = null; });
$('contributionForm').addEventListener('submit', event => {
  event.preventDefault();
  const result = prepareContribution(Object.fromEntries(Object.entries(contributionFields).map(([key, element]) => [key, element.value])));
  for (const [key, element] of Object.entries(contributionFields)) {
    $(`${key}Error`).textContent = result.errors[key] || '';
    element.setAttribute('aria-invalid', String(Boolean(result.errors[key])));
  }
  const firstError = Object.keys(result.errors)[0];
  if (firstError) { contributionFields[firstError].focus(); return; }
  contributionDraft = result;
  saveDraft();
  $('contributionPreviewTitle').textContent = result.title;
  $('contributionPreviewBody').textContent = result.body;
  $('submitContribution').href = result.url;
  $('copyContribution').textContent = '复制草稿';
  $('contributionHandoff').textContent = result.prefilled
    ? '内容尚未提交。下一步会打开已填好的 GitHub Issue，请确认后再提交。'
    : '草稿较长，请先复制草稿，再到 GitHub 正文框中粘贴并确认提交。';
  $('contributionPreview').hidden = false;
  $('contributionPreview').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
$('copyContribution').addEventListener('click', async () => {
  if (!contributionDraft) return;
  try { await navigator.clipboard.writeText(contributionDraft.body); $('copyContribution').textContent = '已复制'; }
  catch { $('copyContribution').textContent = '请选中上方草稿复制'; }
});
$('clearContribution').addEventListener('click', () => {
  $('contributionForm').reset();
  for (const [key, element] of Object.entries(contributionFields)) { element.value = ''; element.removeAttribute('aria-invalid'); $(`${key}Error`).textContent = ''; }
  contributionDraft = null;
  $('contributionPreview').hidden = true;
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be disabled. */ }
  $('draftStatus').textContent = '草稿已清空。';
  contributionFields.term.focus();
});
$('suggestLink').addEventListener('click', () => {
  if (!contributionFields.term.value.trim()) { contributionFields.term.value = $('search').value.trim().slice(0, LIMITS.term); saveDraft(); }
  contributionFields.term.focus({ preventScroll: true });
});
async function init() {
  try {
    const response = await fetch('./api/v1/all.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dataset = await response.json();
    if (!Array.isArray(dataset.entries)) throw new Error('无效词库');
    $('entryCount').textContent = dataset.entries.length;
    $('reviewDate').textContent = dataset.release.reviewed_at || '等待首批审核';
    const tags = ['全部', ...new Set(dataset.entries.flatMap(entry => entry.tags))];
    $('filters').replaceChildren(...tags.map(tag => {
      const button = node('button', tag, `filter${tag === '全部' ? ' active' : ''}`);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(tag === '全部'));
      button.addEventListener('click', () => {
        activeTag = tag;
        for (const element of $('filters').children) { const selected = element.textContent === tag; element.classList.toggle('active', selected); element.setAttribute('aria-pressed', String(selected)); }
        render();
      });
      return button;
    }));
    render(); demo(); fromHash();
  } catch (error) {
    $('loadError').hidden = false;
    $('resultCount').textContent = '读取失败';
    $('demoOutput').textContent = '词库无法读取，请刷新重试。';
    console.error(error);
  }
  try {
    const response = await fetch('./api/v1/status.json');
    if (!response.ok) throw new Error();
    const status = await response.json();
    $('candidateCount').textContent = status.candidate_count;
    if (status.collection) $('collectionStatus').textContent = '候选采集结果已记录；可查看队列与来源状态。候选不进入正式查询。';
  } catch { $('candidateCount').textContent = '—'; }
}
init();
