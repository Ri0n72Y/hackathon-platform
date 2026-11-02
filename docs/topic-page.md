# TopicPage 插件

TopicPage 是按 URL 直接读取一个公开 GitHub 仓库的聚合页面：

`/topic/<owner>/<repository>/`

目标仓库需要在根目录提供 `README.md` 与 `topics.config.yaml`。配置只包含数据源约定：

```yaml
topic: hackathon-project
whitelist: true
```

`whitelist` 默认开启。开启后，页面只展示 `projects/*.yaml` 中声明的 `repository: owner/name`；关闭后展示 Topic 搜索结果。页面不检查 GitHub App Installation 状态，也不把报名、赛事统计或其他业务信息写入配置。README 的首个一级标题作为顶部卡片标题，其余正文作为普通文本描述，保留换行；可选的 `cover.jpg` 作为封面。

README 顶部卡片还支持两个可选的单行字段。字段会从描述中移除，并显示在卡片底部脚注区域：

```text
# 活动标题

这里是第一行说明。
这里是第二行说明。

email: organizer@example.com
datetime: 2026-11-15 14:00
```

`email` 和 `datetime` 可以单独出现，也可以同时缺省。README 内容按普通文本节点渲染，不解析 Markdown，不执行或插入 HTML。

项目由 GitHub Topic 搜索提供。前端在白名单筛选、大小写不敏感去重后继续请求后续页，直到累计 10 个可展示项目或 GitHub 候选耗尽；网络失败和限流进入错误状态，不会伪装成空列表。项目卡片使用 Flex 布局，通过 `min-width`、`max-width` 和 `flex-basis` 自然换行。

## Playground 验收

启动 `npm run dev` 后访问 `/topic/<owner>/<repository>/`。TopicPage 在该路径独立装配，其他路径仍装配既有 Issues Playground。已实际执行：

- `npm install`：依赖安装成功。
- `npx prettier --check ...`：本 PR 涉及的 TSX、MJS、CSS 文件全部通过。
- `npm run build`：TypeScript 检查与 Vite 构建通过。
- Vite Playground：合法 Topic 路由返回独立 Playground HTML；非法 pathname 仍由同一入口接管，页面组件显示路由错误。
- YAML 解析：`topic: demo # comment` 与 `whitelist: false` 被解析为字符串和布尔值，注释不会污染配置值。
- README 字段：检查首个 H1、多行描述换行、`email`/`datetime` 的提取和缺省状态；普通文本不会被执行或转换为 HTML。

Vite 本身不会执行 Vercel Functions，因此本地 Playground 已验证入口装配和页面路由，真实 GitHub Topic、README、白名单、限流和用户授权写入仍需在 Vercel 部署环境联调。错误页会保留请求阶段和 HTTP 状态；重试使用请求序号与 AbortController，旧请求不能覆盖新状态。
