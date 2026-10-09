import { discussionAttributes, REPO } from './contributions.mjs';

let configRequest;
let widgetRequest;

export function validateDiscussionConfig(site) {
  const config = site?.giscus;
  if (!config || typeof config.enabled !== 'boolean') throw new Error('giscus.enabled 必须是布尔值');
  if (config.enabled && !discussionAttributes(config, { id: 'validation' })) {
    throw new Error('启用 giscus 前请填写 repo、repoId、category、categoryId');
  }
  if (config.enabled && !/^[\w.-]+\/[\w.-]+$/.test(config.repo)) throw new Error('giscus.repo 必须是 owner/repository');
  return config;
}

function configuration() {
  configRequest ||= fetch(new URL('./site-config.json', import.meta.url), { signal: AbortSignal.timeout(5000) })
    .then(response => { if (!response.ok) throw new Error(); return response.json(); })
    .then(validateDiscussionConfig).catch(() => null);
  return configRequest;
}

function loadWidget() {
  if (!widgetRequest) {
    let timeout;
    widgetRequest = Promise.race([
      // Official giscus Web Component handles OAuth, messages and cleanup.
      import('https://esm.sh/giscus@1.6.0'),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 10000); }),
    ]).catch(error => { widgetRequest = null; throw error; }).finally(() => clearTimeout(timeout));
  }
  return widgetRequest;
}

export async function mountDiscussion(container, entry) {
  const note = document.createElement('p');
  note.className = 'discussion-note';
  note.textContent = '分享你见过的用法、不同理解或新的来源。讨论不会自动修改词条。';
  const status = document.createElement('p');
  status.className = 'discussion-status';
  status.setAttribute('role', 'status');
  status.textContent = '正在准备讨论区…';
  const fallback = document.createElement('a');
  fallback.className = 'text-link';
  const issue = new URL(`https://github.com/${REPO}/issues/new`);
  issue.searchParams.set('template', 'correction.yml');
  issue.searchParams.set('title', `[纠错] ${entry.term}`);
  fallback.href = issue.href;
  fallback.target = '_blank';
  fallback.rel = 'noopener';
  fallback.textContent = '到 GitHub 补充或纠错 ↗';
  container.append(note, status, fallback);
  const config = await configuration();
  if (!container.isConnected) return;
  const attributes = discussionAttributes(config, entry);
  if (!attributes) { status.textContent = '讨论区暂未开启，可以先提交补充或纠错。'; return; }
  try {
    await loadWidget();
    if (!container.isConnected) return;
    let backlink = document.querySelector('meta[name="giscus:backlink"]');
    if (!backlink) {
      backlink = document.createElement('meta');
      backlink.name = 'giscus:backlink';
      document.head.append(backlink);
    }
    const entryUrl = new URL(location.href);
    entryUrl.searchParams.delete('giscus');
    entryUrl.hash = `entry/${entry.id}`;
    backlink.content = entryUrl.href;
    const widget = document.createElement('giscus-widget');
    // giscus consumes its OAuth return parameter in the constructor. Restore
    // the entry hash afterwards so reloads and shared links retain this word.
    history.replaceState(null, '', entryUrl.pathname + entryUrl.search + entryUrl.hash);
    for (const [name, value] of Object.entries(attributes)) widget.setAttribute(name, value);
    container.insertBefore(widget, fallback);
    status.textContent = '评论需要登录 GitHub；首次留言后会建立这个词的讨论。';
  } catch {
    if (container.isConnected) status.textContent = '讨论区暂时无法加载，可以先到 GitHub 补充或纠错。';
  }
}
