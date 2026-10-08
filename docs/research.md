# 候选采集与免费发布：事实调查

调查日期：2026-10-08。以下来源是项目维护者的源代码或服务商文档。平台内部网页接口与正式开放平台 API 是两种不同的契约；能从代码看出读取方式，不代表平台保证稳定、不限流或提供梗的解释。

## 借鉴已有项目

[DailyHotApi](https://github.com/imsyy/DailyHotApi) 以独立的平台适配器汇总热榜，提供 RSS/JSON 与自部署方式；文档明确提示公共示例可能因流量或长期未维护异常。[NewsNow](https://github.com/newsnext/newsnow) 提供热点聚合和平台来源适配器，原 `ourongxing/newsnow` 地址目前重定向到 `newsnext/newsnow`。

本仓库学习了来源分离、保留原始链接、让采集失败可见的做法，没有复制上述项目的实现代码，也没有复制硬编码 cookie、WBI 签名算法或引入其运行依赖。二者仓库展示 MIT 许可证；若未来直接复制代码，须保留相应版权与许可声明。

| 来源 | 调查得到的读取路径与元数据 | 第一版实现 |
| --- | --- | --- |
| B站 | NewsNow 提供 popular 视频、搜索热词与 ranking 路径；视频含 BV ID、标题、作者、简介、时间与视频 URL | 读取 `https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1`，保存原视频 ID、标题及 HTTPS 短链或规范视频链接。没有复制 DailyHotApi 的 WBI 签名实现 |
| 微博 | DailyHotApi 读取 `https://weibo.com/ajax/side/hotSearch` 的 `data.realtime`；链接指向微博搜索。NewsNow 使用热榜 HTML 与 cookie | 选择 JSON 路径；以完整热词为稳定 ID，保留话题中的 `#`，生成可复查的搜索 URL；不使用持久登录 cookie |
| 抖音 | 两项目读取 `/aweme/v1/web/hot/search/list/` 的 `data.word_list`；包含 sentence ID、热词及热点页 URL，不是原始视频出处 | 参考 NewsNow 的 `https://login.douyin.com/` 临时 cookie 流程，随后读取热榜；cookie 只在单次进程内使用，不保存、不打印 |

以上依据：[NewsNow B站适配器](https://github.com/newsnext/newsnow/blob/main/server/sources/bilibili.ts)、[DailyHotApi 微博适配器](https://github.com/imsyy/DailyHotApi/blob/master/src/routes/weibo.ts)、[NewsNow 微博适配器](https://github.com/newsnext/newsnow/blob/main/server/sources/weibo.ts)、[NewsNow 抖音适配器](https://github.com/newsnext/newsnow/blob/main/server/sources/douyin.ts)、[DailyHotApi 抖音适配器](https://github.com/imsyy/DailyHotApi/blob/master/src/routes/douyin.ts)。

## 本仓库采集契约

`scripts/collect.mjs` 使用 Node 20+ 的内置 fetch、AbortController 和文件 API，无 npm 依赖。导入模块不会联网；网络请求只由显式调用或 CLI 发起。[Node fetch 与 AbortController 文档](https://nodejs.org/docs/latest-v20.x/api/globals.html)、[文件 API](https://nodejs.org/docs/latest-v20.x/api/fs.html)。

```sh
node scripts/collect.mjs --dry-run
node scripts/collect.mjs --sources bilibili,weibo,douyin --timeout 15000
node --test tests/collect.test.mjs
```

默认写入 `data/candidates.json`（数组）与 `data/collection-status.json`（本次各源成功/失败、数量、错误信息）。每个源有独立的总时限，包括抖音的两次请求与 JSON 读取。按 `platform + id` 去重，每次重新看到同一候选更新 `last_seen`，保留 `first_seen` 与已有人工审核字段；不同平台或不同视频不因标题相同而丢失证据。候选未再次上榜不会被删除。损坏的既有文件会阻止覆盖；单文件先写临时文件再 rename，但两个输出文件不具备跨文件事务，任务也应避免并发执行。

全部源失败仅保存失败状态，完全不改写既有候选文件并返回退出码 1，便于 Actions 显示失败；部分失败写入成功来源的数据并返回 0，各源错误仍在终端与状态文件中可见。`--dry-run` 可以发起只读请求、显示结果，但不创建或改写候选与状态文件。

本轮开发的 12 项测试使用注入 fetch 的离线 fixtures，验证三源 payload、原始链接、重复积累、审核字段保留、部分失败、超时、全失败、dry-run、成功重复落盘和文件损坏，全部通过。真实 CLI 的 `--dry-run --timeout 2000` 也已执行：三个来源均 fetch failed、退出码 1，未写数据。真实平台的 runner 可达性、当前风控与 cookie 流程尚未在可用公网环境验证。先前本机请求遇到 DNS 受限；不把这个结果当作平台停服证明。公共聚合实例也不作为第一版的必要依赖。

采集结果只是标题或视频线索，不自动判定为梗、不生成释义、不更新公开词库、不评论或关闭 GitHub issue。热点页和搜索页不等于梗的原始出处。审核时仍须确认真正的用法、原文/视频证据及梗与普通新闻的区别；需要中文解释的内容必须由审核流程另行录入。

## 免费发布的范围

GitHub Pages 适合发布审核后的索引、按 slug 的 JSON、整库 JSON 与浏览器搜索；项目站默认在 `/<repo>/` 子路径，不能在服务端运行 `GET /lookup?term=…`。[Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。站点 1 GB、月带宽 100 GB 软限、10 分钟部署超时及可能的 429 要作为可用性边界。[托管限额](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

公开仓库的标准 hosted Actions runner 免费，但定时任务可能延迟，60 天无仓库活动会停用 schedule。[计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[schedule 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。`GITHUB_TOKEN` 在 Actions push 的 commit 不会自动触发分支式 Pages build；发布需明确 upload/deploy Pages artifact。[发布规则](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

Cloudflare Workers Free 可实现实际的词名查询与 JSON/404 返回，别名匹配属于后续功能。免费计划账号每天 100,000 次 Worker 请求（UTC 零点重置，即香港时间 08:00），10 ms CPU、128 MB 内存；额度用尽返回 1027，免费计划没有按超额请求自动收费。静态资产可随审核数据部署并由 binding 读取，直接静态请求不调用 Worker 时免费且不限请求数。请求耗用 Worker 额度，不能称为无限免费服务。[限额](https://developers.cloudflare.com/workers/platform/limits/)、[计费](https://developers.cloudflare.com/workers/platform/pricing/)、[静态资产](https://developers.cloudflare.com/workers/static-assets/)。

GitHub Pages 的跨域 GET 在本轮未做实际响应头验收；正式发布后需从其他 HTTPS origin 验证。Workers 可显式设置响应 CORS，前端与 API 如果分开托管，要分别验证请求、404 与错误响应。[Cloudflare CORS 示例](https://developers.cloudflare.com/workers/examples/cors-header-proxy/)。

## References 与感谢

- 感谢 [imsyy / DailyHotApi](https://github.com/imsyy/DailyHotApi) 的公开来源适配器与限制说明。[许可证](https://github.com/imsyy/DailyHotApi/blob/master/LICENSE)。
- 感谢 [NewsNow 的贡献者](https://github.com/newsnext/newsnow) 提供热门视频与热点来源的可读实现。[许可证](https://github.com/newsnext/newsnow/blob/main/LICENSE)。
- [Node 20 文档](https://nodejs.org/docs/latest-v20.x/api/)、[GitHub Pages 文档](https://docs.github.com/en/pages)、[Cloudflare Workers 文档](https://developers.cloudflare.com/workers/) 是本实现运行与发布约束的服务商来源。

## 本机公网验证补充

完成离线测试后，在经批准的沙箱外本机网络执行真实采集：B站 50、微博 50、抖音 46，共 146 条线索，三源均成功。结果已写入 data/candidates.json 与 data/collection-status.json，未生成或发布释义。沙箱内失败与沙箱外成功是不同网络条件；此结果不保证平台长期稳定，GitHub runner 仍需首次运行验证。
