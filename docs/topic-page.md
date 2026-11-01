# TopicPage 插件

TopicPage 是按 URL 直接读取一个公开 GitHub 仓库的聚合页面：

`/topic/<owner>/<repository>/`

目标仓库需要在根目录提供 `README.md` 与 `topics.config.yaml`。配置只包含数据源约定：

```yaml
topic: hackathon-project
whitelist: true
```

`whitelist` 默认开启。开启后，页面只展示 `projects/*.yaml` 中声明的 `repository: owner/name`；关闭后展示 Topic 搜索结果。页面不检查 GitHub App Installation 状态，也不把报名、赛事统计或其他业务信息写入配置。README 的首个一级标题作为顶部标题，其余 Markdown 作为介绍正文；可选的 `cover.jpg` 作为封面。

项目由 GitHub Topic 搜索提供。前端在白名单筛选、大小写不敏感去重后继续请求后续页，直到累计 10 个可展示项目或 GitHub 候选耗尽；网络失败和限流进入错误状态，不会伪装成空列表。项目卡片使用 Flex 布局，通过 `min-width`、`max-width` 和 `flex-basis` 自然换行。

## Playground 验收

启动 `npm run dev` 后访问 `/topic/<owner>/<repository>/`。TopicPage 在该路径独立装配，其他路径仍装配既有 Issues Playground。已执行 `npm run build`（TypeScript 检查与 Vite 构建通过）。真实 GitHub/Vercel Function 联调需要在部署环境中验证，本地构建不等同于联调成功。
