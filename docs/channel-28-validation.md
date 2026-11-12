# Issue #28 · Channel v1 有界实现与验证

实现基线：`main` `dc1fee0681c4e81481b6ae8975f2ba500a07c999`（已合并 PR #60）；独立分支 `feat/channel-28`。

## 业务路径

- 仓库主页 `/{owner}/{repo}` 提供「项目频道」入口，进入 `/{owner}/{repo}/channels`。
- 内部 GET `/api/repo-channels?owner=...&repo=...` 使用现有公开仓库 App Installation 只读身份，**固定 main** 读取根目录 `labourchain.config.yaml`，复用 #47 已合并的严格 `parseConfigNamespaces` 和 `decodeConfigFile`。
- `channel` Namespace 不存在、显式空列表都无频道；配置缺失与非法分别返回 `config_missing`、`invalid_config`。不使用 README、展示分支、其他仓库或默认值作为替代。
- 完整分页读取 GitHub Open Issues（`state=open&sort=created&direction=desc&per_page=100`）；有界最多 10 页。超限返回 `snapshot_incomplete` 且不展示不完整候选，保留分页/访问错误并允许用户重试。服务端严格排除 PR、Closed、未配置 `channel:*`、含两个及以上 `channel:*` 的 Issue。
- 对每个已配置频道选择创建时间最新的有效 Open Issue；同创建时间按 Issue number 较大者取最新。无有效候选显示独立空状态。
- 点击频道进入**既有** `/{owner}/{repo}/issues/{number}` 通用详情。该详情已提供 Issue 正文、讨论/评论分页、OAuth 权限与评论写入、结构化 Labour Record 解析、重复 Commit 冲突排除和工时合计。频道不新增帖子、评论、劳动记录或跨 Issue 汇总体系；普通 Open/Closed Issue 的详情访问不依赖频道标签。
- Channel Control 与 View 分离，页面样式用 CSS Modules；Cordis `reactUI` 注册随插件生命周期撤销。组件以 `owner/repo` 建 key 同步隔离跨仓库状态，旧请求支持 AbortSignal。
- 新增内部 `api/_repo-channels.mjs`，复用已有 `api/repo-access.mjs` 与精确 Vercel rewrite；公共 Vercel Function 总数保持 11。**Channel 不包含任何写操作或新增权限。**

## Playground 独立装配

在支持本仓库依赖的环境运行 `npm run dev` 后，打开 `/sample/repo/channels?channelFixture=1&channelCase=<case>`。

| case | 预期 |
| --- | --- |
| `ready` | Discussion Issue #1 入口及 Wishlist 空状态；点 Issue #1 进入现有 Issue 详情，显示其正文、普通讨论和有效 Labour Record |
| `empty` | 已配置频道仍展示，但都没有有效 Open Issue |
| `missing` | `config_missing`，不发起 Issues 选择 |
| `invalid` | `invalid_config`，不输出候选 |
| `no-channels` | 配置无有效 Channel，空状态 |
| `incomplete` | `snapshot_incomplete`，禁止展示部分结果 |
| `denied` | 403 错误可见，提供重试 |
| `failure` | 429 错误可见，提供重试 |
| `slow` | 异步响应延迟；从 A 导航至其他 repo 时旧控制器取消，B 失败时不复用 A 卡片 |

这些是**可复现手工步骤及预期结果**；本阶段用户决定暂缓浏览器/真实 Vercel/OAuth/写入 D4。没有实际执行时不得标记为通过。

## 已纳入自动测试的用例

- 最新 Open Issue 选择；Closed、PR、多 `channel:*`、未知频道排除；相同时间的稳定选择。
- v1 YAML 缺失/无效/合法、Channel Namespace 缺失/显式 `[]`；配置仅从 `main` 读取。
- 有界完整分页，多页候选比较，分页未完成时无候选、GitHub 429/权限错误、无 main 不回退。
- 基于既有 IssueDetail `loadIssueContent` / `summarizeIssueComments` 对指定 Issue 评论解析、去重和合计；不同 Issue 评论绝不参与。
- 新路由在既有 dispatcher 内，方法拒绝及 URL 参数校验；Channel View 语义和无障碍提示；Fixture 返回状态、旧请求取消、仓库 key 隔离。
- 构建 `npm run build`、`npm run test:installation`、Router tests 由新 Head GitHub Actions 执行后记录结果；不能以测试计划代替运行结果。

## 仍待真实运行的验收

真实浏览器 Channel→Issue 交互、A→B 参数切换、Config 与 Issue 评论的真实 GitHub 读取、真实 GitHub OAuth/限流/Vercel Runtime 均未在本轮验证。所有数据继续以 GitHub 为准。没有 GitHub App 扩权、真实仓库测试写入、Webhook、独立数据库或 Channel 写入 API。
