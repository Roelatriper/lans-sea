# 网页提词与讨论区

迷因之海的仓库为 [Roelatriper/lans-sea](https://github.com/Roelatriper/lans-sea)，Pages 地址为 `https://roelatriper.github.io/lans-sea/`。

## 从网页提词

1. 点击「提交词条或线索」，填写词名、中文含义、可选例句和来源。来源每行一个完整的 HTTP(S) 链接。
2. 确认解释与来源原文已经区分，点击「预览提词」。草稿只保存在当前浏览器。
3. 点击「到 GitHub 确认提交」，登录 GitHub，检查自动填入的内容并提交 Issue。草稿较长时，页面会提示先复制正文，再在 GitHub 粘贴。
4. 维护者核对内容并通过 PR 更新正式词库，通常每周集中审核。提交 Issue、评论或保存草稿都不会自动发布词条。

网站使用 [GitHub 官方支持的 Issue URL 参数](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query)，没有提交后台，也不在网页存放 GitHub Token。仓库必须在 Settings → General → Features 开启 Issues；fork 默认可能关闭这一项。

## 启用 giscus

每个词条卡片有「讨论这个词」入口，详情底部有独立讨论区。尚未配置或加载失败时，可以通过 GitHub 纠错入口反馈。

维护者需要完成：

1. 保持仓库公开，在 Settings → General 打开 Discussions。
2. 在 [giscus App](https://github.com/apps/giscus) 安装应用，只选择 `lans-sea` 仓库。授权由仓库管理员完成。
3. 到 [giscus 配置页](https://giscus.app/zh-CN) 输入 `Roelatriper/lans-sea`，选择公告类型的讨论分类。从生成的 script 取得 `data-repo-id`、`data-category` 和 `data-category-id`。
4. 修改 `web/site-config.json`：填写分类名称与 ID，核对仓库和 repoId，并将 `enabled` 改为 `true`。这些是公开 ID，无需 Token。
5. 执行 `npm run check`，通过 PR 合并并部署。在两个词条之间切换，确认讨论不会混用；实际发表评论需登录 GitHub。

网页使用 [giscus 官方 Web Component](https://github.com/giscus/giscus-component)，版本固定为 `1.6.0`，只在启用后的词条详情中加载。首次留言时 giscus 会建立对应讨论。它处理 GitHub 登录与组件关闭后的清理。

讨论按 `词条 / <entry.id>` 严格匹配，而不是按同一首页 URL 匹配。已发布的 `entry.id` 不要修改；词名修改不会另建讨论。网站改名后更新 repo 配置，保留 repoId、分类 ID 与词条 ID。

## 改名后的地址

Git 远程使用 `git@github.com:Roelatriper/lans-sea.git`。本地文件夹名可以保持原样。GitHub 会重定向旧仓库链接，但项目 Pages 地址不会随旧路径重定向；分享链接应使用 `/lans-sea/`。[GitHub 改名说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)

感谢 giscus 与 GitHub 的公开实现和文档，以及每一位补充语境与来源的贡献者。
