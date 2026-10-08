import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, output } from '../scripts/build.mjs';

test('构建输出可下载词库、单条及索引，并清除不再发布的旧词条文件', async () => {
  const first = await build();
  const removed = path.join(output, 'api/v1/entries/removed-entry.json');
  await writeFile(removed, '{"entry":{"status":"candidate"}}');
  const second = await build();
  assert.equal(first.release.version, second.release.version);
  await assert.rejects(readFile(removed), { code: 'ENOENT' });
  const index = JSON.parse(await readFile(path.join(output, 'api/v1/index.json'), 'utf8'));
  const all = JSON.parse(await readFile(path.join(output, 'api/v1/all.json'), 'utf8'));
  assert.ok(all.entries.length > 0);
  assert.equal(index.entries.length, all.entries.length);
  for (const item of index.entries) {
    const document = JSON.parse(await readFile(path.join(output, 'api/v1', item.path), 'utf8'));
    assert.equal(document.entry.term, item.term);
    assert.equal(document.entry.status, 'published');
    assert.ok(document.entry.sources.length);
    assert.equal(document.release.version, all.release.version);
  }
  const html = await readFile(path.join(output, 'index.html'), 'utf8');
  assert.ok(html.includes('./assets/app.js'));
  await readFile(path.join(output, 'assets/app.js'));
  await readFile(path.join(output, 'lib/dictionary.mjs'));
});
