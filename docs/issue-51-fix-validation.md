# Issue #51 · Coder 修复验证清单（PR #52）

本清单记录**代码修复与后续可复现步骤**，不是 #51 D4 用户操作验收结论。权威真实操作标准仍为 Issue #51 的八条流程。没有截图、浏览器操作或人工授权时，不标记为通过。

## 1. B0 · Vercel Hobby 部署 Function 数超限

Designer 于 2026-11-09 报告 production deployment `dpl_BTJXSmgmA6vwAYxTW4bYpRPk68Zv` 状态 ERROR，错误 `exceeded_serverless_functions_per_deployment`。

此修复保留八条原有公开 API URL，改变其部署入口布局：

| 原公开路径 | 内部处理器 | 共享 Function |
| --- | --- | --- |
| `/api/issue-detail` | `api/_issue-detail.mjs` | `api/issue-read.mjs` |
| `/api/issue-comments` | `api/_issue-comments.mjs` | 同上 |
| `/api/issue-config` | `api/_issue-config.mjs` | 同上 |
| `/api/repo-home` | `api/_repo-home.mjs` | `api/repo-access.mjs` |
| `/api/repo-feed` | `api/_repo-feed.mjs` | 同上 |
| `/api/repo-member-permission` | `api/_repo-member-permission.mjs` | 同上 |
| `/api/repo-member-register` | `api/_repo-member-register.mjs` | 同上 |
| `/api/github-installation-probe` | `api/_github-installation-probe.mjs` | 同上 |

Vercel 忽略 `api/_*.mjs` 独立 Function 构建，dispatcher 仍导入旧模块，原处理器业务实现及 OAuth / App / Bot 校验不变。代码目录从 17 个公开 Function 减至 11 个；静态测试保证路径映射与计数未意外回归。

**待在线核实：** 对**本 PR Head 的 Preview Deployment**确认 Function 构建 READY；以原路径请求以上八个 API，逐项验证 URL Query、Cookie、HTTP method、body、返回码、授权行为。尤其 `/api/repo-member-register` 的真实 Bot 写入不能在未授权测试仓库操作。检查 `/api/github-login`、`/api/github-callback`、`/api/github-session`、`/api/github-issue-comment` 保持原路由，并验证 SPA 深链与刷新。

## 2. V1 · Markdown 标题层级

在本地执行 `npm run dev`，打开：

```
/octocat/Hello-World?repoFixture=1
```

第 1 条受控动态包含 H1–H6、普通链接、图片和视频外链。展开正文，对比各级标题的大小、间距和阅读顺序；检查 320px、375px、768px、桌面和 200% zoom 下标题无裁切，并确保媒体不自动播放。

源码采用 `role="heading"`、`aria-level` 与局部 CSS Module 字号/间距；CI 的 SSR 测试只证明节点及样式规则存在，**不证明真实视觉效果**。

## 3. V2 · 成员登记字段级校验与聚焦

在隔离的 **Repo Fixture** 中打开：

```
/octocat/Hello-World/members/register?repoFixture=1
```

该 Fixture 的权限用户为 `fixture-operator`，提交只返回本地模拟 Commit/PR 结果，不进行真实 GitHub 写入。

逐次填写并点击「提交成员资料」：
1. 姓名留空：应在姓名字段旁显示可读提示，聚焦姓名，输入后能清除该字段错误。
2. 头像 URL 输入 `http://example.com/avatar.png`：应提示 HTTPS URL 要求并聚焦头像字段；保留其他已输入内容。
3. 第三条链接填名称 Website，URL 填 `javascript:alert(1)`：应在**第三条 URL** 旁提示并聚焦对应字段，而非仅有顶部错误。
4. 修改为有效 HTTPS URL，可继续通过现有 `validateMemberInput` 服务端一致性校验；`fixtureCase=write-error` 模拟失败应保留草稿。
5. 切换 owner/repo、展示分支后重新访问登记页：旧项目的草稿、成功提示和字段级错误不应混入新项目。
6. 键盘 Tab、焦点可见、屏幕阅读器 `aria-invalid` 和 `aria-describedby` 的实际可用性须浏览器人工检查。

## 4. 自动构建与真实验收边界

原有 CI 执行：`npm install --no-audit --no-fund`、`npm run build`、
`npm run test:installation`、`node --test tests/router-fallback.test.mjs`。
新增 `tests/api-routing.test.mjs`（Function 数、映射、方法/错误码）和
`tests/repo-ui.test.mjs`（Markdown SSR/字段校验）由原测试入口运行。
自动结果以 PR **最新 Head** 对应的 GitHub Actions 为准。

**仍未验证：** 本地交互浏览器、真实 Vercel Preview 构建/HTTP 响应、production 部署、#51 八条流程 D4、OAuth/成员登记真实写入。V3（详情页 Markdown）、V4（跨页面 Token）和 V5（Popover）按 Designer 报告保留为后续设计/人工检查事项，本 PR 未扩大这三项的范围。#51 在实际人工验收前保持 Open。

## Designer / Reviewer 后续 P2 局部修正

- V1：Feed 第一条 Issue 卡片标题应高于正文 H1–H6；收起与展开均维持这一视觉关系，完整 README 则保留较大的 Markdown 标题。需实际观察桌面、320/375px、200% 缩放；自动测试不等于视觉实测。
- V2：首次提交触发字段错误后，把头像 URL 从一个 HTTP 地址改成另一个 HTTP 地址，第三条链接也从脚本 URL 改成 HTTP 地址；字段错误继续显示，直到改成合法 HTTPS URL。所有字段有效后顶部提示应同步消失；不做真实 GitHub 写入。
