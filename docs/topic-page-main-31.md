# #31 TopicPage · B1 分页与 OAuth 报错 Issue 写入验收边界

## 来源和当前权限
- Work Issue #31 与 Member #54 Request #6824645892（Search B1），#6825301010（新授权的 Topic 错误报告 OAuth User Token 创建 Issue）。
- 独立 PR #64，分支 feat/topic-page-main-31；旧 PR #35 只读参考、保留原 CHANGES_REQUESTED。#3 平台发现流另行验收：#31 仅公开 Topic 聚合，不核验 App Installation。
- GitHub App 权限、OAuth 授权范围、CI 配置、依赖与公共 Vercel Function 数保持不变（当前 11 个）。新 POST 是独立 Topic 报告入口；不修改现有普通 Issue/Config 写入的 Installation 约束。

## B1 Search 真实调用预算
- API _topic-projects.mjs 每页 100，最大 page=10；禁止第 11 页；匿名 GitHub Search 最多连续 10 次请求。筛选/大小写去重后不足 10 个才继续取页。
- total_count > 1000 且已读取第 10 页、仍不足 10 个有效结果：返回 windowExhausted，并在页面提示不能确认所有候选均已耗尽。total_count <= 1000 时最后可访问页属于真实结果结束，不报窗口耗尽。
- GitHub Search HTTP 200 但 `incomplete_results: true` 表示搜索服务已返回不完整候选。API 明确返回 `502 / topic-search / retryable:true`；Control 拒绝不完整页面，不将候选解释为真实结束、空列表或 1000 窗口告警。HTTP→Control Mock 同时覆盖空页、有项目页及第二页截断，失败时整体不展示部分候选。
- GitHub 429/403/422、网络异常显示明确错误及可重试提示，不视作真实列表结束。匿名 Search 额度按公网 IP 共享，即使请求数不超过 10，真实请求也可能限流；本实现不自行重试或绕过限额。
- 可执行 tests/topic-pagination.test.mjs 通过真实 grouped 内部 handler + Control 同源加载函数模拟 10 页 Search、100 项/页、稀疏白名单、1000 与超过 1000 窗口、两页终止、第 2 页 429、page=11 拒绝。

## Topic 报告显式用户写入
- 仅已登录 GitHub 用户会看到错误报告编辑入口。GET /api/topic-report?owner&repo 检查当前 User Access Token 对目标的公开可读、Issues 已启用及协作者创建权限，返回绑定当前用户会话指纹、owner/repo、10 分钟 TTL 的密封目标证明。
- 用户自行修改标题和正文、点击确认后，浏览器向 /api/topic-report 发送单次 JSON POST（credentials: same-origin、Origin、X-LabourChain-Write、confirmed=true 和目标 proof）。
- 服务端检查同源及 Sec-Fetch-Site、加密 OAuth Session、确认标志、128 KiB 原始请求大小、标题正文长度、owner/repo、禁止任意 destination URL、目标 proof 绑定身份/仓库/有效期；可用时比较 Referer 的 Topic 页面仓库路径。
- POST 前以 User Access Token 再次读取 /repos/{owner}/{repo}，严格确认 full_name、private=false、has_issues=true、权限 triage/push/maintain/admin 中至少一项为真。没有 Installation 证明要求，也绝不回退 App/Bot Token。
- 完全由服务端在 github.com API 下构造 /repos/{owner}/{repo}/issues 的 POST，Payload 仅 {title,body}。可疑 Token、Cookie、Bearer、环境变量字样的报告内容被拒绝。服务端不输出凭证、请求头、原始 GitHub 错误正文。
- GitHub 201 只有在真实 Issue number 与 https://github.com/{owner}/{repo}/issues/{number} 严格匹配时，才显示成功链接。401/403/404/410/422/429 明确错误；503、网络超时或 201 无法核实返回 outcomeUnknown，保留草稿，禁用重复提交，用户必须先到 GitHub 核查并明确点击“已核查，允许再次提交”，系统才重新验证权限，且**不会自动重放 POST**。
- GitHub App User Access Token 仅覆盖当前用户与 App 授权仓库的交集。依照 [Lead 已确认的 B1-2 降级策略](https://github.com/Ri0n72Y/hackathon-platform/issues/31#issuecomment-6848294203)，自动 Issue 报告必须对同一目标同时满足当前 App 授权安装与当前 OAuth 用户的 Issues 创建权限；其他公开 TopicPage 仍可匿名只读，报告走手动 GitHub Issue 入口。
- GET 预检与 POST 前均复用 `resolveInstalledRepository`：用 App JWT（仅安装核验）确认匹配的公开仓库、当前 App Installation 与仓库 id；再用当前 User Access Token 读取 `/user/installations/{id}/repositories`（每页100，最多10页），要求同一 id、full_name、公开属性精确匹配；最后单独检查当前用户仓库的 Issues 开关与 triage/push/maintain/admin 权限。安装/交集列表不可用、被拒绝、响应异常、超出核验上限一律 fail-closed；任何写入只由 User Token POST，绝不使用 JWT/Bot 代写。
- 受控 Node/HTTP Mock 现在实际模拟匿名公开仓库元数据、签名 App JWT 安装查询、User Token 安装仓库列表、用户仓库权限及最终 Issue POST，覆盖 App 已装/未装 × 用户可写/不可写、私有、安装证明异常/429/网络失败、预检后安装撤销、已有目标 Proof 防篡改与提交结果未知。前端同时增加“查看现有 Issues”链接与同步 in-flight 防重复提交保护。

## 独立受控 Fixture 与测试
- 在 Playground 中访问 /topic/sample/repo?topicFixture=1&topicCase=ready|empty|window|rate-limit|report-fail|report-success|report-unknown&fixtureAuth=1。
- window 模式有 10 页模拟数据，第 10 页才进入 Search 窗口耗尽；rate-limit 在第 2 页报 429。
- report-fail 在弹窗内显示 403 且保留编辑草稿；report-success 返回纯模拟 https://github.com/sample/repo/issues/77；report-unknown 显示核查门槛，未触发第二次 POST。
- tests/topic-report.test.mjs 使用可控 GitHub HTTP Mock 验证 Token 身份、权限、公开仓库、Issues 开关、同源/CSRF、已确认字段、签发证明、有效期/跨用户/跨仓库拒绝、敏感字段、各类失败及超时和 201 响应核验。
- tests/topic-report-ui.test.mjs 以可控 fetch 注入 TopicPageService，验证预检、唯一一次确认 POST、成功链接、403、未知结果、权限准备失败；tests/topic-ui.test.mjs 提供 SSR 弹窗内错误、草稿保留、未知结果人工核查按钮。没有真实浏览器 DOM 点击测试。

## 当前明确未验证的内容
- 用户已决定暂缓 Playground 浏览器人工操作、真实 Vercel Runtime、真实 OAuth/仓库权限与任何真实 GitHub Issue 写入 D4。此 PR 的 Node/HTTP/SSR Mock、CI 成功只能证明当前代码对替身的可执行契约，不能当作真实 GitHub 创建成功证据。
- 结果未知时不存在分布式持久去重数据库；不会静默重放，但同一用户在手工核查后再次确认可能创建第二条 Issue。弹窗提供指向当前源仓库的现有 Issues 列表入口，必须先核查真实 GitHub。
- 独立 Reviewer 对新 Head 完整审查（包括 B1 与新 POST）并由 Owner 显式决定合并；本 Coder 不自行批准、合并或关闭旧 PR #35。