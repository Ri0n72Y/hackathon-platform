# Issue #44 + #48 — Repo Home Playground 验收

## 工程装配

业务入口：plugins/repo-home/src/index.tsx 中的 createRepoHomePlugin(api)。可独立装配 ReactUIService 与 RepoHomeApi，不依赖 repo-issues、repo-panel、issue-detail、#43 或 #47。

- 仓库项目主页：/:owner/:repo
- 全部成员：/:owner/:repo/members
- 登记成员：/:owner/:repo/members/register
- Vercel Functions：api/repo-home、api/repo-feed、api/repo-member-permission、api/repo-member-register。
- 公开仓库匿名只读通过动态仓库 Installation 和限单 Repo 短期 Read Token；不依赖旧固定 Installation ID。
- 展示分支默认 main，配置保存在当前浏览器按 owner/repo 区分的 localStorage 偏好里。仅成功确认分支存在后保存，不更改配置同步分支、Labels 或任何共享数据库。
- Feed 读取 Open/Closed 普通 Issue，排除 PR；不读取 Config，不展示 Label 筛选；详情 URL 始终为 /:owner/:repo/issues/:number。

## 启动与真实读取入口

在具备网络与依赖的环境运行：

    npm install --no-audit --no-fund
    npm run dev

仅 Vite dev server 不提供 Vercel Functions。真实 API 验收需带相同 Functions 的 Vercel 测试部署或 vercel dev。

- http://localhost:5173/Ri0n72Y/hackathon-platform?repoOnly=1
- http://localhost:5173/Ri0n72Y/hackathon-platform/members?repoOnly=1
- http://localhost:5173/Ri0n72Y/hackathon-platform/members/register?repoOnly=1

这些路径独立装配 Repo Home 与 React UI；需要仓库实际接入 LabourChain App。未接入必须显示权限/安装错误而非伪造数据。**未经 Lead 明确授权，不在真实业务仓库点击「提交成员资料」进行验证性写入。**

## 单插件受控替身

无需 Functions 和 GitHub 权限，使用如下查询参数。在 http://localhost:5173/octocat/hello 后添加：

| 查询参数 | 场景与预期 |
| --- | --- |
| ?repoFixture=1&fixtureCount=0 | 无 Issue、正常介绍与团队 |
| ?repoFixture=1&fixtureCount=20 / 21 / 120 | 单页、跨页、大于 100 Issue 的无限下拉 |
| ?repoFixture=1&fixtureCount=21&fixtureCase=pr-page | 第一页全为 PR，仍继续到第二页 |
| ?repoFixture=1&fixtureCount=21&fixtureCase=duplicate-page | 第二页重复 id，去重后仅显示一次 |
| ?repoFixture=1&fixtureCount=21&fixtureCase=feed-429 | 第二页首次 429，保留旧卡片与游标，手动重试 |
| ?repoFixture=1&fixtureCount=21&fixtureCase=feed-error | 第二页首次 503，同游标重试 |
| ?repoFixture=1&fixtureTeam=missing / empty / invalid / error | team-member.json 缺失、有效空数组、坏格式、读取错误 |
| ?repoFixture=1&fixtureCase=description | Description 优先于 README |
| ?repoFixture=1&fixtureCase=readme-missing / readme-error / intro-error | README 缺失、局部失败及介绍整体失败 |
| ?repoFixture=1&fixtureCase=unauthenticated / denied / bot-denied | 401 OAuth、403 用户 Repo 写权限、403 Bot App 权限 |
| ?repoFixture=1&fixtureCase=pr | 受保护分支登记成功返回待合并 PR |
| ?repoFixture=1&fixtureCase=conflict / write-error | 409 SHA 冲突与 Bot 写入失败，表单不清空 |

登记页完整例子：http://localhost:5173/octocat/hello/members/register?repoFixture=1&fixtureCase=pr

mock 数据仅用于受控异常，并不证明 GitHub/Vercel 的真实 OAuth、写入或分支保护结果。

## 手工走查（尚未实际执行）

1. 检查 Description 有值时 Hero 不再展示 README 摘要；Description 为空时去除重复一级标题、Badge、目录、代码和装饰段落，保留有效完整 README 链接。
2. 头像行只能单行滚动。分别用鼠标 Hover、Tab Focus、Enter/Space、触屏 Tap 打开锚定 Popover；移入卡内链接不中断，Escape / 外部点击关闭。损坏头像显示姓名首字母。
3. 在 320、375、768px、桌面及 200% 缩放下检查无页面级横向溢出，成员卡片两列/一列、Popover 不出视口；另做真实键盘/读屏/触屏验收。
4. 成员文件 missing / empty / invalid / error 为独立状态；Team 错误不阻断 Issue Feed，按文件原有顺序显示成员资料。
5. 登记页校验字段、链接 HTTPS、账号格式、只读目标分支；匿名返回 OAuth，当前操作者无 Repo push 或 Bot 无 Contents/PR Write 时禁用提交。失败保留草稿，PR 待合并不更新成员列表。
6. Feed 测试 0/20/21/120、全 PR 页、重复滚动、取消旧请求、刷新首页、429/5xx 后本游标手动恢复。展开长正文时原始媒体顺序不变，折叠时不可见链接不得获得焦点。
7. 检查标题、段落、强调、列表、引用、代码、文本链接、分隔线、图片失败与来源链接、仅标记视频外链、恶意 HTML / javascript URL 安全回退。没有嵌入播放器。
8. 普通/频道 Issue 链接均为通用 Issue URL。本 PR 不修改 PR #49 所属的 #43 详情门槛修复。

## 自动化测试和证据边界

新增 tests/repo-home.test.mjs，由原 tests/installation-probe.test.mjs 导入并在 npm run test:installation 中执行，未修改 package scripts、CI workflow 或依赖。

受控 Node 用例覆盖：team-member.json v1 四态、重复 ID / HTTPS 校验、追加保留旧成员、README 过滤、分页参数、Installation 读取和全 PR 页、OAuth 操作者写权限、App 缺少 Contents Write、受保护分支的 Bot 维护 PR 与真实请求者归属、409 SHA 冲突重读、跨域 POST 拒绝。实际测试结果以对应 GitHub Actions Head run 为准。

GitHub-hosted CI、Node 受控替身和静态构建不代表真实浏览器或真实 GitHub/Vercel 集成验收。尚无实际受保护分支 Bot PR/Commit 或现场 OAuth 证据，也没有执行真实业务仓库成员文件写入。

## 权限阻塞与待独立 QA

- 当前仓库 main 的 Ruleset 26371241 已确认有 pull_request、non_fast_forward 和 deletion 规则；当前连接的旧 branch-protection endpoint 返回 403。
- 设计文档仅记录 LabourChain App Issues/Metadata 权限，**当前 App 实际 Contents: write 与 Pull requests: write 尚未获得可信的线上权限验证**。服务端运行时重新检查该 Installation 的权限；没有时返回错误，不尝试自动扩权。
- 需要 Lead 审核当前 App 的实际权限与隔离测试仓库。如需扩权或真实写入，必须另行明确授权。
- 独立 Code Reviewer 须检查授权、Branch Ruleset、SHA/PR 冲突及路由切换；Designer 须依据 PR #42 检查响应式排版、Popover 可访问性。开发者静态检查不能冒充上述独立审查。
