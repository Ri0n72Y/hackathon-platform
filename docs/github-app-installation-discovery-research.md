# GitHub App Installation 动态定位研究

- 日期：2026-10-29（2026-11-02 根据用户确认补充流程决定）
- 状态：用户流程与接入判定已确认；动态 Installation API 属候选技术方案，真实 Installation / Vercel 验证尚未执行
- 关联：[Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18)、[Issue #1](https://github.com/Ri0n72Y/hackathon-platform/issues/1)、[Issue #3](https://github.com/Ri0n72Y/hackathon-platform/issues/3)、[Issue #5](https://github.com/Ri0n72Y/hackathon-platform/issues/5)
- 范围：只研究安装关系与目标仓库的动态解析；不修改业务代码，不调整 GitHub App 设置，不讨论缓存实现。

## 0. 已确认的产品与架构流程（用户确认，2026-11-02）

本节是**已确认的用户操作顺序与架构约束**；后续各节的 API 端点、回调设置和异常处理属于技术建议或待验证项。不得因为技术候选方案尚未通过 PoC，就重开此处已确认的用户流程。

### 0.1 GitHub OAuth 登录不要求安装 App

1. 用户在 LabourChain 静态网页点击「使用 GitHub 登录」，经过 GitHub OAuth 授权后返回平台。
2. Vercel Function 负责授权回调和会话建立；**OAuth 成功表示用户已经登录 LabourChain，不表示其仓库已经接入 LabourChain**。
3. 用户即使没有安装 App，仍可保持登录状态；公开、已接入项目的匿名浏览规则不变。

登录与安装分离。现有 `api/github-login.mjs`、`github-callback.mjs` 的 `state` / PKCE / Cookie 机制可作为后续接入引导的基础，但**当前代码没有实现完整的「登录后添加项目」流程**。

### 0.2 「添加项目」在 OAuth 登录之后独立触发

用户在 LabourChain 网页点击「添加项目」，输入目标公开仓库 `owner/repo` 或从真实可发现的候选仓库中选择，再由 Vercel Function 查询 GitHub 当前 App 安装与仓库授权关系。

| GitHub 当前状态 | LabourChain 应提供的行为 |
| --- | --- |
| **目标仓库已经授权给当前 LabourChain App** | Function 再次检查仓库级 Installation；确认后直接进入项目。无需重复安装或平台内第二次绑定。 |
| **仓库所属个人/组织账户尚未安装 App** | 从 LabourChain 引导到 GitHub 首次安装界面；用户在 GitHub 确认账户、权限及「全部仓库 / 指定仓库」授权，随后返回 LabourChain 重新验证。 |
| **账户已安装 App，但未包含目标仓库** | 引导修改现有 Installation 的授权仓库范围；第一版可使用 GitHub 安装管理界面完成，返回后由 Function 重新验证。未来可研究受控 Function 调用官方增加仓库 API，但其附加权限与真实可行性尚未确认。 |
| **用户缺少目标仓库的安装/管理权限，或组织要求审批** | 明确显示权限/审批原因，等待 GitHub 上的合法授权操作；不得回退使用 Bot 或其他安装绕过。 |

这与 Vercel 类似：**App 安装发生在个人账户或组织账户层级**，安装时可选择所有仓库或特定仓库。每个获得实际授权的公开仓库自动成为 LabourChain 项目；**不创建平台侧项目登记表或第二次「绑定」步骤**。GitHub 当前 Installation / 仓库范围是唯一的接入判定来源。

产品目标是**尽可能让用户留在 LabourChain 进行后续操作**。GitHub 的首次安装授权与必要的仓库授权范围/组织审批仍由 GitHub 承担；不承诺永远只访问 GitHub 一次。

### 0.3 安装完成后动态解析，不固定或永久登记 Installation ID

读取已接入仓库时，由 Function 使用 **App JWT** 查询 `GET /repos/{owner}/{repo}/installation`，取得对应 Installation（包括当前 `installation_id`），并在必要时创建受限 Installation Token 读取该仓库数据。

- `installation_id` 是 GitHub API 需要的**运行时结果**，不是浏览器提交的可信授权凭据；无需使用固定环境变量 `GITHUB_INSTALLATION_ID`，也无需为仓库永久保存 ID 映射。
- GitHub App 安装关系及选中的仓库范围才决定**平台是否接入**；用户 OAuth 只决定**当前用户是谁、可以执行何种用户身份操作**。
- 当前 App 可以有多个个人/组织 Installation；不能把一个 Installation ID 套用到所有 `owner/repo`。
- 安装更新/回跳参数及浏览器提交的 `installation_id` 不得直接视为成功。**以回跳后服务端向 GitHub 重新查询得到的安装状态为准**。
- 后续 Issue、成员、配置等业务操作留在 LabourChain，通过受控 Vercel Functions 调用 GitHub，使用各功能原定的用户或 Bot 身份与权限校验。

### 0.4 最终 App 将公开；不代表目前已经改为 public

用户已确认：**正式上线的 LabourChain GitHub App 将设置为 public**，以支持其他个人和组织账户安装。当前 App 的真实可见性及何时修改尚未验证；本研究不得声称已修改 GitHub App 设置或已成功跨账户安装。

### 0.5 为减少 GitHub 跳转的技术建议（尚未最终选型）

- **登录和安装保持独立。** GitHub 的「安装期间自动请求 OAuth」与安装后 `Setup URL` 不能同时启用。考虑到用户先在 LabourChain 完成 OAuth，**优先研究 Setup URL 回跳到 LabourChain，并保持现有 `state` / PKCE 登录防护**；是否启用 Setup URL、redirect-on-update 和具体回跳路径，需要实施时决定，不能把建议写成已配置事实。
- 对**已经授权**的仓库，使用仓库级 Installation 查询；对**准备授权、尚未包含在 Installation 中**的仓库，仓库级查询可能返回 404，需要按仓库所属账户查现有 Installation：`GET /users/{username}/installation` 或 `GET /orgs/{org}/installation`（App JWT）。这是待按实际安装状态核对的技术路径。
- GitHub 提供 `PUT /user/installations/{installation_id}/repositories/{repository_id}`，但要求目标仓库 Admin 权限和 `GitHub App installation repository access: write`；现有 App 的权限、User Token 是否能在**目标尚未获 App 授权**时实际成功，以及组织限制都尚未验证。**第一版不依赖这项 API 才能完成添加项目**，可以由 LabourChain 引导到 GitHub 安装管理页作为稳定回退。
- OAuth 登录用的 User Token 只能代表用户在 GitHub App 已授权资源范围内的能力；**不能假定仅用它就能列出用户所有尚未接入的仓库**。MVP 可通过仓库 URL 输入与公开仓库信息查询确定候选目标，再交 GitHub 完成安装确认。

官方依据：[GitHub Apps REST API](https://docs.github.com/en/rest/apps/apps)、[Installation REST API](https://docs.github.com/en/rest/apps/installations)、[Modifying GitHub App registration](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration)。

---

## 1. 结论摘要

仓库里已有相关研究，但还没有解决 Issue #18 的完整方案。

**优先验证的方案是：使用服务端 GitHub App JWT，直接查询目标仓库的 Installation。**

`GET /repos/{owner}/{repo}/installation` 是 GitHub 官方提供的“查询当前认证 App 在指定仓库上的 Installation”端点。它需要 App JWT，不需要预先知道 Installation ID。成功响应会给出 Installation 信息；官方列出的状态包括 200、301 和 404。随后可以用响应中的 Installation ID 创建 Installation Access Token，并把 Token 的仓库范围限制到当前目标仓库、权限限制到当前读取任务需要的最小集合。

这比先列出所有安装，再逐个扫描安装仓库更直接；也比用当前用户的 OAuth Token 查询安装列表更符合已确认的产品规则：**仓库是否接入平台由 App Installation 关系决定，而不是由当前浏览者的 OAuth 可见性决定。**

这是基于官方 API 契约的推荐候选方案，不是已通过真实环境验证的最终结论。下一步仍需检查实际 App 的可见性，并对安装、未安装、所选仓库、安装暂停/撤销和仓库改名等情况做最小 PoC。

## 2. 仓库已有研究盘点

### Issue #18：直接对应本任务

[Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18) 已明确要求：移除固定 `GITHUB_INSTALLATION_ID`，按目标仓库动态确认 Installation 与授权范围，处理多安装、用户/组织、权限变更和撤销。最初尚无专项研究结论；本报告提供了第一轮桌面研究，真实环境验证和实施仍未完成。

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

## 4. 已接入仓库的数据读取解析流程（待 PoC 验证）

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

Issue #5 的 2026-10-23 历史评论记载，当时创建的 GitHub App 为 private。此记录不证明 App 当前仍是 private。**用户已决定正式发布时 App 将为 public**；当前设置与实际切换工作仍需核实。

GitHub 官方说明：private GitHub App 只能安装到 App 所属账户；public GitHub App 才能由其他 GitHub 账户安装。若产品要求其他个人账户或组织的 Owner/Maintainer 能将公开仓库接入 LabourChain，则 App 必须具备相应的跨账户安装能力。公开 App 不等于必须发布到 GitHub Marketplace。

来源：[GitHub Docs — Making a GitHub App public or private](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)。

本研究不更改 App 可见性。正式发布前需要核实它已变为 public 并具有跨账户安装能力。

## 7. 验证计划

本报告没有执行真实 App API 调用或 Vercel 部署。用户流程已确认；以下验证只针对尚未确认的 GitHub API、权限和回调行为，不要求重新选择登录/安装顺序。建议在隔离的测试仓库中验证：

1. App 安装且已授权目标仓库：仓库级 Installation 查询返回正确 Installation ID。
2. App 未安装在目标仓库：查询不能被误判为已接入。
3. App 安装在账户上但采用 selected repositories，目标仓库未被选中：确认仓库级查询与后续 Token 创建均拒绝访问。
4. 个人账户与组织账户的安装：都能按目标仓库解析，不依赖用户属于哪一个安装者。
5. 安装暂停、卸载、仓库从授权列表移除：后续请求失败关闭。
6. 仓库改名/转移及不存在的公开仓库：验证 301/404 的处理与错误区分。
7. 匿名读取：Installation Token 仅能访问目标仓库及明确授予的最小权限；Token 不出现在响应、Cookie 或日志。
8. 已登录用户：App 安装判定成功但用户权限不足时，用户写入仍被拒绝；不得回退到 Bot/Installation 身份。
9. API 限流、超时、5xx 和权限变更：不缓存“已接入”作为长期授权证明，不把错误映射为成功。

10. OAuth 已成功但尚无 App Installation：点击「添加项目」，完成 GitHub 安装、仓库选择与回跳后，Function 重新查询 Installation，并保持用户会话和目标仓库上下文；不得把 GitHub 回跳参数本身当作授权成功。
11. 已有 selected-repositories Installation，目标仓库尚未获准：区分账户级 Installation 查询与仓库级接入查询；从 GitHub 管理页增加仓库并回跳后重新确认。若评估直接 PUT，则单独验证其附加权限及对尚未授权仓库的适用性。
12. 用户已登录但不拥有仓库 Admin 权限、组织要求审批、会话已过期或目标仓库被移出授权范围：应返回明确状态并提供合法回退，不产生平台自己的接入记录。
13. 正式 public App 的跨个人/组织安装：在 App 真正设置为 public 后确认跨账户可安装，不能凭产品计划宣称已验证。

每个用例记录端点、HTTP 状态、规范化目标仓库、Installation ID（非秘密）与可复现结果；绝不记录 JWT、私钥或访问 Token。

## 8. 当前结论与未决项

**已确认的产品流程：** GitHub OAuth 登录 LabourChain → 用户独立点击「添加项目」→ GitHub 安装 App 或扩大已安装 App 的仓库授权（全部/指定仓库）→ 回到 LabourChain，由 Function 再查 GitHub 当前 Installation → 已接入仓库的后续操作主要在 LabourChain 完成。正式 App 将为 public；不设平台侧第二次绑定或持久化 Installation ID 对照表。

**推荐候选：** App JWT + `GET /repos/{owner}/{repo}/installation` 做目标仓库级接入判定；解析成功后再签发目标仓库范围受限的 Installation Token，或在用户已登录时使用 User Token 并执行独立的用户权限检查。

**尚未验证：**
- 当前 App 的可见性，以及它能否按产品目标安装到其他个人/组织账户。
- 对 selected-repository installation、暂停、撤销和仓库转移的实际 API 行为。
- Vercel 环境中的 JWT、Token 范围限制和错误处理。
- 读取/写入请求应如何处理 Installation 查询的重复调用；缓存与 TTL 留给既有缓存研究，不在本 Issue 定案。

本研究已记录用户确认的 OAuth 登录与仓库接入顺序，同时将官方 API 契约、技术候选方案及待验证事项分开标注；**并不授权业务代码改造或变更 GitHub App 设置**。如需实施，另行核实权限和回跳行为并确定开发任务。

## 官方资料

- [Get a repository installation for the authenticated app](https://docs.github.com/en/rest/apps/apps#get-a-repository-installation-for-the-authenticated-app)
- [List installations for the authenticated app](https://docs.github.com/en/rest/apps/apps#list-installations-for-the-authenticated-app)
- [List app installations accessible to the authenticated user](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-authenticated-user)
- [List repositories accessible to the user access token](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token)
- [Create an installation access token for an app](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app)
- [Making a GitHub App public or private](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)
