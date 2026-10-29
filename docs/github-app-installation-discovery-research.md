# GitHub App Installation 动态定位研究

- 日期：2026-10-29
- 状态：初步研究稿；官方 API 契约已核对，真实 Installation / Vercel PoC 尚未执行
- 关联：[Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18)、[Issue #1](https://github.com/Ri0n72Y/hackathon-platform/issues/1)、[Issue #3](https://github.com/Ri0n72Y/hackathon-platform/issues/3)、[Issue #5](https://github.com/Ri0n72Y/hackathon-platform/issues/5)
- 范围：只研究安装关系与目标仓库的动态解析；不修改业务代码，不调整 GitHub App 设置，不讨论缓存实现。

## 1. 结论摘要

仓库里已有相关研究，但还没有解决 Issue #18 的完整方案。

**优先验证的方案是：使用服务端 GitHub App JWT，直接查询目标仓库的 Installation。**

`GET /repos/{owner}/{repo}/installation` 是 GitHub 官方提供的“查询当前认证 App 在指定仓库上的 Installation”端点。它需要 App JWT，不需要预先知道 Installation ID。成功响应会给出 Installation 信息；官方列出的状态包括 200、301 和 404。随后可以用响应中的 Installation ID 创建 Installation Access Token，并把 Token 的仓库范围限制到当前目标仓库、权限限制到当前读取任务需要的最小集合。

这比先列出所有安装，再逐个扫描安装仓库更直接；也比用当前用户的 OAuth Token 查询安装列表更符合已确认的产品规则：**仓库是否接入平台由 App Installation 关系决定，而不是由当前浏览者的 OAuth 可见性决定。**

这是基于官方 API 契约的推荐候选方案，不是已通过真实环境验证的最终结论。下一步仍需检查实际 App 的可见性，并对安装、未安装、所选仓库、安装暂停/撤销和仓库改名等情况做最小 PoC。

## 2. 仓库已有研究盘点

### Issue #18：直接对应本任务

[Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18) 已明确要求：移除固定 `GITHUB_INSTALLATION_ID`，按目标仓库动态确认 Installation 与授权范围，处理多安装、用户/组织、权限变更和撤销。它目前没有研究评论或已交付的专项结论，因此仍是本次主任务。

### Issue #1：总体技术调研

[Issue #1](https://github.com/Ri0n72Y/hackathon-platform/issues/1) 已定义 React/Cordis、Vercel Functions、公开仓库、GitHub App 用户授权和无在线数据库等技术边界。它要求梳理授权与权限，但没有给出目标仓库到 Installation 的动态解析结论。

### Issue #5 与现有授权研究文档：可复用，但解决的是相邻问题

- [Issue #5](https://github.com/Ri0n72Y/hackathon-platform/issues/5) 和 `docs/github-app-user-write-auth-research.md` 讨论 User Token、Installation Token、会话安全、用户写入身份，以及安装范围检查。
- 该文档建议使用 `GET /user/installations` 和 `GET /user/installations/{installation_id}/repositories` 检查当前用户可访问的安装与仓库。这对**用户级访问检查**有用，但它仍需要一个 Installation ID，而且返回范围受当前用户权限约束，不能单独作为全平台接入状态的权威来源。
- `docs/github-app-vercel-deployment-research.md` 记录了固定 Installation ID 的部署与测试方式，也明确没有完成动态多安装解析。
- Issue #5 的历史评论记录了基础读取链路、User OAuth 和用户权限检查的阶段进度；它们没有证明固定 ID 已被移除。

### Issue #3：相关但不同的问题

[Issue #3](https://github.com/Ri0n72Y/hackathon-platform/issues/3) 需要在 Topic 搜索结果中过滤未接入平台的仓库。它依赖本研究的 Installation 判定，但还需单独决定“已接入”是否足以允许公开出现在 Topic 信息流中。

### 当前代码：仍使用固定 ID

在当前 `main` 中检查到：

- `api/_github.mjs` 的 `auth()` 从 `GITHUB_INSTALLATION_ID` 读取固定 ID，并用它创建 Installation Token；`repos()` 再读取该安装可访问的仓库列表。
- `api/issues.mjs` 通过上述仓库列表拒绝不在当前固定安装范围内的目标仓库。
- `api/github-verify.mjs` 与 `api/_issue-interaction.mjs` 也用固定 ID 调用 `/user/installations/{installation_id}/repositories`。
- 目前没有发现按 `owner/repo` 动态解析 Installation 的代码路径。

因此，现有材料包含身份模型和部分校验建议，但**没有现成的动态 Installation resolver，也没有覆盖多安装的验收结果**。

## 3. GitHub 官方 API 能力

### 3.1 按目标仓库直接查 Installation

端点：`GET /repos/{owner}/{repo}/installation`

- 认证：GitHub App JWT。
- 用途：查找当前认证 App 在指定仓库上的 Installation。
- 官方状态码：200、301、404。
- 返回数据包含 Installation ID、所属账户、`repository_selection`、权限与暂停状态等安装信息。
- 该端点不接受 User Access Token 或 Installation Access Token；不能用用户会话令牌替代 App JWT。

来源：[GitHub REST API — Get a repository installation for the authenticated app](https://docs.github.com/en/rest/apps/apps#get-a-repository-installation-for-the-authenticated-app)。

### 3.2 列出 App 的所有 Installations

端点：`GET /app/installations`

- 认证：GitHub App JWT。
- 结果按分页返回，`per_page` 最大为 100。
- 可以用于诊断、管理或确实需要枚举全部安装的任务。
- 对单个目标仓库的实时判断，不建议先枚举全部 Installation 再逐个查仓库；直接查询仓库 Installation 的端点更贴合本任务。

来源：[GitHub REST API — List installations for the authenticated app](https://docs.github.com/en/rest/apps/apps#list-installations-for-the-authenticated-app)。

### 3.3 当前用户可访问的 Installations

端点：`GET /user/installations`；列出某个已认证用户有明确权限访问的 App Installations。

端点：`GET /user/installations/{installation_id}/repositories`；列出该用户在指定 Installation 中有权限访问的仓库。

这两个端点使用 GitHub App User Access Token。其结果受当前用户的仓库权限和组织成员关系限制。它们适合检查“这个登录用户能否在该安装范围内操作目标仓库”，但不能替代 App JWT 对平台接入状态的判定，也不能支持匿名访问路径。

来源：[GitHub REST API — Installations](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-authenticated-user)。

### 3.4 创建范围受限的 Installation Token

端点：`POST /app/installations/{installation_id}/access_tokens`

- 认证：GitHub App JWT。
- 默认情况下，Token 可以访问该 Installation 获准访问的所有仓库。
- 请求可以通过 `repositories` 或 `repository_ids` 将 Token 限制到指定仓库，最多 500 个；也可以限制权限，但不能超出 App/Installation 已授予的权限。
- Installation Token 有效期为一小时。

对匿名用户读取公开项目的路径，建议在解析到 Installation 后，只为当前仓库创建最小权限 Token，不发给浏览器，不把它作为全局凭据复用。

来源：[GitHub REST API — Create an installation access token for an app](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app)。

## 4. 建议的解析流程（待 PoC 验证）

1. 服务端接收 URL 中的 `owner/repo`，验证格式；不接受浏览器传入的 Installation ID 作为可信输入。
2. 由于 MVP 只支持公开仓库，先读取公开仓库 metadata，确认仓库存在、公开，并取得规范化的 `full_name` / repository ID。
3. 服务端用 App ID 与私钥生成短期 JWT，调用 `GET /repos/{owner}/{repo}/installation`。
4. 对 200 响应，读取返回的 Installation ID 和状态；如果 `suspended_at` 非空，拒绝继续。若返回 301，解析规范仓库路径并重新执行校验，不直接沿用旧的 owner/repo。
5. 对 404，结合第 2 步的公开仓库检查，返回“仓库未接入/当前 App 未获准访问”的结果；对其他 API 错误，返回暂时无法验证，不要误报成未接入。
6. 匿名读取路径：使用解析出的 Installation ID 创建只限目标仓库、最小读取权限的 Installation Token，再读取业务数据。
7. 已登录路径：先用 App JWT 判定平台接入；然后单独使用 User Access Token 执行用户级读取/写入，并检查该用户对目标仓库的实际权限。用户没有权限时应拒绝该用户操作，不能回退到 Installation Token 代替用户身份。
8. 每次敏感读取/写入都必须遵循当前授权状态；不能因为 URL、旧页面状态或之前成功过就跳过校验。缓存行为不在本研究范围内。

该流程没有全局项目登记表，也不依赖固定 Installation ID。它将“平台接入”和“当前用户能否操作”作为两个不同的检查。

## 5. 需要明确的边界

| 情况 | 处理原则 |
| --- | --- |
| 公开仓库存在，但 App 未安装/未获准该仓库 | 不视为已接入；拒绝 Installation Token 路径 |
| App 安装在组织，但只选择了部分仓库 | 仅把实际获准的目标仓库视为已接入；必须验证目标仓库级查询行为 |
| 当前用户没有该仓库权限，但 App 已安装 | 仓库的 App 接入状态不因此改变；用户级操作仍拒绝 |
| App Installation 被暂停或撤销 | 不再允许新请求继续读取；识别 API 失败并按未授权处理 |
| 仓库被改名或转移，API 返回 301 | 使用规范仓库地址重新校验，不能静默把旧路径当成同一个已验证目标 |
| 仓库不存在或不是公开仓库 | 按 MVP 范围拒绝；不要只凭 Installation 查询的 404 推断所有原因 |
| GitHub API 超时、限流或 5xx | 返回可重试的验证失败，不把未知状态误判为已接入或未接入 |
| 安装权限不足或目标资源被移出范围 | 失败关闭；不要扩大 Token 权限或改用其他安装 |
| 一个请求中出现不同的 owner/repo 参数 | 以经过规范化、校验的单一目标为准；安装查询、Token 限制和数据读取必须指向同一仓库 |

## 6. 一个产品级前置条件：App 可见性

Issue #5 的 2026-10-23 历史评论记载，当时创建的 GitHub App 为 private。此记录不证明 App 当前仍是 private，实施前必须查看当前 GitHub App 设置。

GitHub 官方说明：private GitHub App 只能安装到 App 所属账户；public GitHub App 才能由其他 GitHub 账户安装。若产品要求其他个人账户或组织的 Owner/Maintainer 能将公开仓库接入 LabourChain，则 App 必须具备相应的跨账户安装能力。公开 App 不等于必须发布到 GitHub Marketplace。

来源：[GitHub Docs — Making a GitHub App public or private](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)。

本研究不更改 App 可见性。需要先确认当前设置与产品发布范围一致。

## 7. 验证计划

本报告没有执行真实 App API 调用或 Vercel 部署。建议在隔离的测试仓库中验证：

1. App 安装且已授权目标仓库：仓库级 Installation 查询返回正确 Installation ID。
2. App 未安装在目标仓库：查询不能被误判为已接入。
3. App 安装在账户上但采用 selected repositories，目标仓库未被选中：确认仓库级查询与后续 Token 创建均拒绝访问。
4. 个人账户与组织账户的安装：都能按目标仓库解析，不依赖用户属于哪一个安装者。
5. 安装暂停、卸载、仓库从授权列表移除：后续请求失败关闭。
6. 仓库改名/转移及不存在的公开仓库：验证 301/404 的处理与错误区分。
7. 匿名读取：Installation Token 仅能访问目标仓库及明确授予的最小权限；Token 不出现在响应、Cookie 或日志。
8. 已登录用户：App 安装判定成功但用户权限不足时，用户写入仍被拒绝；不得回退到 Bot/Installation 身份。
9. API 限流、超时、5xx 和权限变更：不缓存“已接入”作为长期授权证明，不把错误映射为成功。

每个用例记录端点、HTTP 状态、规范化目标仓库、Installation ID（非秘密）与可复现结果；绝不记录 JWT、私钥或访问 Token。

## 8. 当前结论与未决项

**推荐候选：** App JWT + `GET /repos/{owner}/{repo}/installation` 做目标仓库级接入判定；解析成功后再签发目标仓库范围受限的 Installation Token，或在用户已登录时使用 User Token 并执行独立的用户权限检查。

**尚未验证：**
- 当前 App 的可见性，以及它能否按产品目标安装到其他个人/组织账户。
- 对 selected-repository installation、暂停、撤销和仓库转移的实际 API 行为。
- Vercel 环境中的 JWT、Token 范围限制和错误处理。
- 读取/写入请求应如何处理 Installation 查询的重复调用；缓存与 TTL 留给既有缓存研究，不在本 Issue 定案。

本研究只提供官方文档依据与候选流程，不授权业务代码改造。完成 PoC 与 Review 后，再单独确定实现任务。

## 官方资料

- [Get a repository installation for the authenticated app](https://docs.github.com/en/rest/apps/apps#get-a-repository-installation-for-the-authenticated-app)
- [List installations for the authenticated app](https://docs.github.com/en/rest/apps/apps#list-installations-for-the-authenticated-app)
- [List app installations accessible to the authenticated user](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-authenticated-user)
- [List repositories accessible to the user access token](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token)
- [Create an installation access token for an app](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app)
- [Making a GitHub App public or private](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)
