# API v1

公开只读，无需 API Key。所有正式接口只导出 `status: published` 的词条，候选通过独立文件查看。别名、错字纠正、近似匹配、句子识别列在 [TODO](../TODO.md)。

## 静态数据（GitHub Pages、本地或 Worker）

| 路径 | 内容 |
| --- | --- |
| `api/v1/all.json` | `{schema_version, release, entries}` 完整词库 |
| `api/v1/index.json` | 稳定 ID、词名、拼音、标签和相对单条路径 |
| `api/v1/entries/<id>.json` | `{schema_version, release, entry}` |
| `api/v1/candidates.json` | 人工候选与未审核平台线索，不能当正式释义使用 |
| `api/v1/status.json` | 正式词条数量、待审数量和最近采集结果 |

项目 Pages URL 带仓库子路径。示例 JavaScript（无需安装 SDK）：

```js
const base = 'https://Roelatriper.github.io/china-meme-dictionary/api/v1/';
const indexResponse = await fetch(new URL('index.json', base));
if (!indexResponse.ok) throw new Error(`HTTP ${indexResponse.status}`);
const index = await indexResponse.json();
const item = index.entries.find(entry => entry.term === '内卷');
if (!item) throw new Error('not_found');
const response = await fetch(new URL(item.path, base));
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const {entry} = await response.json();
console.log(entry.definitions, entry.sources);
```

这是部署目标示例，不表示已经上线。静态单条不存在时宿主可能返回 HTML 404，调用者必须先判断 HTTP 状态再解析 JSON。静态托管没有运行时查询参数解析能力。

## 直接查询（本地服务、可选 Worker）

`GET /api/v1/lookup?term=<URL编码的正式词名>`

```js
const api = new URL('/api/v1/lookup', 'http://127.0.0.1:8000');
api.searchParams.set('term', '内卷');
const response = await fetch(api);
const result = await response.json();
if (!response.ok) console.log(result.error.code);
else console.log(result.entry);
```

- `200`：`{schema_version: 1, release, entry}`。
- `400`：`error.code: invalid_term`，缺失、空白或长度超过 128 字符。
- `404`：`error.code: not_found`，含提词链接；不返回猜测解释。
- `405`：Worker 仅允许 `GET` 与 `OPTIONS`；本地还支持 `HEAD`。
- `503`：Worker 无法读取部署词库，`error.code: dataset_unavailable`。

首尾空格会去除，并使用 Unicode NFC 规范化；**不匹配别名，不自动转换大小写或简繁**。例如 `YYDS` 命中，`yyds` 暂不命中。来源、例句、多义项与静态词库完全一致。

查询和错误响应设置 `Access-Control-Allow-Origin: *`。跨域使用无需凭证的 GET，不要发送 Cookie 或 Authorization。Worker 免费额度有限；客户端可缓存整库，配额不足时使用已下载数据。

## 数据语义

- `id`：发布后稳定的 ASCII 标识。
- `term`：正式词名；`aliases` 预留给后续匹配功能。
- `definitions`：含义、场景/语气与编辑自编例句；多义项分别列出。
- `sources`：标题、HTTP(S) URL、原发布者和 `explanation` / `usage` 类型。来源是证据，不是起源保证。
- `first_seen`：仅在查明最早出现时填写日期，未知为 `null`。
- `reviewed_at`：本次人工或编辑核验日期，不是热度或爆红日期。
- `release.version`：由正式词库内容计算的哈希，候选采集不会改变正式内容版本。

兼容字段只新增；破坏性变更使用后续 API 版本。接口使用仓库 MIT 许可，重新分发时保留许可与来源署名。
