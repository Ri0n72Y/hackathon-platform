# Issue #43 · 普通 Issue 与频道 Issue 共用详情验证

本文件提供可复现的受控检查清单。自动 CI、Playground 浏览器操作与真实 GitHub/Vercel 人工验收分别记录，不互相替代。

## 实施边界

- `/{owner}/{repo}/issues/{number}` 的读取条件：合法 URL、目标仓库的原有 GitHub App 读取授权、匹配编号的真实 Open/Closed Issue。Pull Request 继续排除。
- 通用 Issue 读取不调用 `getConfig`，不要求 `channel:*` 标签。缺少或无法解析 `labourchain.config.yaml` 不阻断普通 Issue；频道成员有效性使用独立 `validChannelIssue`。
- 原有评论分页、OAuth 写入权限、评论/劳动双 Tab、§9.4 主观登记工时、重复 Commit 排除、Controller/View 和根路径 RepoPanel 保持现有行为。
- 不改 Config 同步、GitHub App 授权范围、API 公开数据结构及 Vercel/CI 配置。

## 自动测试

对 PR 最新 Head 执行：

```sh
npm install --no-audit --no-fund
npm run build
npm run test:installation
node --test tests/router-fallback.test.mjs
```

新 `tests/issue-universal.test.mjs` 通过现有 `tests/installation-probe.test.mjs` 运行，覆盖：
无标签/其他标签/多频道标签/有效频道、Open/Closed、PR、错误编号和跨仓库目标；
无 Config、坏 Config 仍按 `getIssue → getComments` 加载；
读取的 404/403/429/502 不被 Config 422 覆盖；
旧目标取消、单 Issue Labour 汇总；
另由现有 Issue API、OAuth 和 §9.4 测试覆盖权限与业务回归。
每次代码修改后以**对应 Head 的 GitHub CI**为正式自动测试证据。

## Playground 受控浏览器复现

启动 `npm run dev`，访问 `/__issue-fixture?issueFixture=1`。使用控制页链接：

1. `/sample/repo/issues/1?issueFixture=1`：有效频道 Issue，Open、正文、讨论/劳动双 Tab，`~0.5` + `~1h` 汇总 1.5 小时；匿名只读。
2. `/sample/repo/issues/4?issueFixture=1`（仅 `status:todo`）、#12（无标签）、#13（两个频道标签）、#14（未配置的频道标签）均为有效普通 Issue。
3. `/sample-no-config/repo/issues/1?issueFixture=1`、`/sample-bad-config/repo/issues/1?issueFixture=1` 均加载标题、正文和评论，而不因 Config 缺失/错误进入 422。
4. #2 Closed 可读；#3 PR、#8 不存在进入 404；#5、#6、#7 分别保留 429、502、403 提示与重试。
5. #9 先读 100/102，再加载第二页；#10 重复 SHA 的劳动记录冲突不能累计；#11 延迟读取时切换路由，旧响应不得覆盖新目标。
6. `/other/repo/issues/1?issueFixture=1` 是另一仓库 404；Back/Forward 返回上一 Issue；更换合法 owner/repo/number 不混用目标数据。
7. `?issueFixture=1&fixtureAuth=1` 执行内存 OAuth/提交/失败草稿用例；`/` 原 RepoPanel 回归；卸载 Issue 插件后路由 404。

这些是**待执行浏览器步骤**，不是运行通过或截图证明。fixture 不进行真实网络写入。

## 合并后的人工验收（由 Lead 协调）

在对应 main SHA 的 Vercel 部署中，人工验证未配置 Channel 的普通 Issue、Open/Closed、配置缺失/错误、真实 PR/不存在 Issue、评论分页、匿名与用户授权、§9.4 归属和导航/刷新。记录 URL、SHA、浏览器、执行时间、响应状态与截图。禁止本 PR 开发期间对真实仓库进行测试性写入。
