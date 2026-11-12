# #31 TopicPage 主分支移植与验收记录

基线 main 2cbdd42655018578dfbe014f867102323b7a814b。独立分支 feat/topic-page-main-31；旧 PR #35 只读参考，保留 Open/CHANGES_REQUESTED，不覆盖当前 Router/Runtime/package/lock。

## 功能契约
- /topic/:owner/:repo 通过已有 ReactUIService.registerPage 与单个 BrowserRouter 路由；匿名读取外部公开 GitHub 仓库，不检查 Installation，不宣称候选已安装 LabourChain。#3 另行验收。
- README.md 首个一级标题之后的纯文本描述，保留换行、移除 email:/datetime: 元数据行，两个可选字段显示顶部卡片底部脚注；可选 cover.jpg。
- topics.config.yaml 仅支持 topic 和 whitelist（默认 true）；projects/*.yaml 声明 repository: owner/name。仅支持严格平坦 YAML，不引入第三方解析依赖。白名单单文件失败使用服务端安全日志保留路径和错误原因，不包含 Token/请求头。
- GitHub Topic Search 分页；白名单交集、大小写不敏感去重、排除来源仓库；不足 10 个继续补页直到真实耗尽或 1000 Search 窗口耗尽。窗口耗尽、429 和真正结束是三种不同状态，界面不得混淆。
- 仅现有 repo-access dispatcher 中新增内部两个只读 API 与 rewrite；公共 Vercel Functions 仍然 11 个。无额外依赖/数据库/Webhook/CI 变更。

## 错误报告安全状态
- 错误界面包含阶段、HTTP、重试；已登录用户可打开错误报告编辑弹窗。受控 Fixture 模拟失败时，弹窗内显示 role=alert，保留标题/正文，允许编辑。
- 生产自动创建 Issue 明确禁用。旧 PR #35 的独立写入口不符合 main 的权限与 CSRF/Installation 契约，等待 Lead/用户确认后再评估。弹窗提供草稿和前往 GitHub 手动创建 Issue 的链接；不得声称站内 OAuth Issue 写入已经交付。

## Playground 可复现（本阶段未执行浏览器人工操作）
运行 npm run dev，进入 /topic/sample/repo?topicFixture=1&topicCase=<case>。Fixture 只装配 TopicPage 和共享 UI Host，不向 GitHub 写入。
- ready：README 标题/简介/底部脚注、Topic 白名单过滤与跨页补足、去重；
- no-whitelist：不使用白名单过滤；empty：真实空结果；window：1000 窗口告警；
- bad-config：422 配置错误；missing、readme-error：源码读取错误；rate-limit：第二页 429 与重试；
- report-fail&fixtureAuth=1：报告弹窗内模拟 403，保留可编辑草稿；
- report-success&fixtureAuth=1：模拟返回 GitHub Issue 链接（没有真实写入）。

## 验证范围
相关 Node/domain/HTTP mock 与 SSR View/Fixture 回归已编写；在 GitHub Actions 对应 Head 运行后回填实证结果。浏览器点击、不同宽度实测、Vercel Runtime、真实 GitHub/OAuth/Issue 写入均按用户决定暂缓，不能标记为通过。
Independent Reviewer 须针对最新 Head 核查 6 项源码问题、分页/窗口/状态、权限、Router/Runtime 合并及可访问性。#31/#3 继续 Open，PR #35 不自行关闭或合并。