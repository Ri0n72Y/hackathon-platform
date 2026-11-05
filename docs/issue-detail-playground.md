# Issue #33 · 独立 Issue 详情 Playground 验证

本文件随 Issue #33 的业务 PR 提供可复现测试入口，不是实际在线验收报告。

## 构建与自动验证

从 PR Head 检出仓库，执行：

```sh
npm install --no-audit --no-fund
npm run build
npm run test:installation
node --test tests/router-fallback.test.mjs
```

现有 `CI / Build & test` 工作流不变。新 `tests/issue-api.test.mjs` 和
`tests/issue-domain.test.mjs` 由现有 `tests/installation-probe.test.mjs` 导入，因此
`npm run test:installation` 会运行新的 Issue 检查和原有 Installation/OAuth 测试。

## 独立 Playground · 不使用真实 GitHub

启动 `npm run dev`。以下都由 `issueFixture=1` 提供独立 Cordis 业务插件和可取消的内存 API；
不会请求真实 GitHub、Vercel Functions，不执行真实写入。

1. 打开 `/__issue-fixture?issueFixture=1`，使用控制页中的链接跳转到 Issue。
2. `/sample/repo/issues/1?issueFixture=1`：Open、原始正文、普通讨论与劳动历史。
   检查 `~0.5` 与 `~1h` 分别被解析为 0.5 和 1 小时，
   工时汇总为 1.5 小时；无效 YAML 评论留在普通讨论，显示不完整提示。
3. `/sample/repo/issues/2?issueFixture=1`：Closed Issue 仍可读取。
4. `/sample/repo/issues/3?issueFixture=1`：有 `pull_request` 字段，被拒绝并显示 404；
   #4 无有效 `channel:*` 标签、#8 不存在，也显示 404。
5. #5、#6、#7 分别返回 429、502、403，不得被伪装成 404；
   点击重试会再次请求受控数据。
6. #9 有 102 条评论：先加载 100，显示“不完整”，点击“加载下一页”后为 102，
   评论顺序与 GitHub 原始数据一致。
7. #10 两条劳动记录引用同一 SHA：显示冲突，不能累加这两条的工时。
   #11 延迟返回：快速返回控制页或打开另一个 Issue；旧响应不能覆盖当前页面。
8. 在控制页点击“卸载 Issue 详情插件”，再次访问任一 Issue URL 应进入统一 Router 404。
   刷新后重新装配。未使用 `issueFixture=1` 时，页面走真实 API，不应收到受控样本。
9. 匿名访问带 `issueFixture=1` 的样本，只有只读功能；使用
   `/__issue-fixture?issueFixture=1&fixtureAuth=1` 和保持同样 Query 的样本 URL，
   检查模拟 OAuth、提交确认和成功后重新读取。包含 `FAIL_POST` 的评论模拟 403，
   草稿必须保留。此处不使用真实 OAuth，也不证明线上用户权限。
10. 访问 `/`：原 RepoPanel 仍使用原先的已授权仓库列表；
    点击 Issue 标题时由 `<Link>` 导航到独立 Issue URL。直接打开 Issue URL 时，
    Playground 不能因为旧入口额外预取 `/api/repos` 或 `/api/issues`。
11. 浏览器直达、刷新、Back/Forward 及更改 `owner/repo/number` 时，
    URL 应与页面一致。非法编号应返回 404。

## 合并 main 后的人工 Vercel 验收清单

此阶段不在开发 PR 内执行线上测试性评论写入。由 Lead 安排人工核验：

- Vercel 上匿名直达公开且已获 App 授权的有效 Open/Closed Issue；检查刷新、
  API 响应状态和配置匹配，以及未授权/私有/不存在仓库的不同错误。
- 确认 GitHub Issue 与 Comment 原始字段未裁剪，分页直至全部加载；
  比较原始评论顺序、当前 Issue Labour Record 分流、来源链接与统计。
- 真实 GitHub OAuth 登录从 Issue 深链接返回同一 URL；验证无权限和授权变更的情况，
  检查同源、用户 Token 和 GitHub 实际写权限。**真实评论写入必须由获得授权的
  人工验收执行**，本 PR 开发过程不做测试性写入。
- 验证已安装公开仓库、缺失 `labourchain.config.yaml`、无效配置、
  GitHub 403/429/503，以及 OAuth 会话过期的错误提示。
- 测试回归：原 RepoPanel 仓库选择与 Issue 创建，已有 Installation Probe，
  OAuth 回跳及 SPA 深链，旧 API `/api/github-issue` 响应不变。

## 验证边界

Labour Record 只从当前 Issue 的结构化 GitHub 评论建立。评论中列出的 Commit SHA
作为可追溯关联来源；没有独立证据证明某个 Commit 与当前 Issue 关联时，不扫描整个
仓库也不补造 Commit Message 基础劳动记录。配置使用当前业务契约中明确的
`channel:*` 声明；不推断缺失的频道配置。
