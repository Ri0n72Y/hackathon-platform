# LabourChain — Vercel Functions 缓存能力调研

> 状态：技术调研 / 架构倾向，尚未实施或压测（2026-10-25）
>
> 关联：[Architecture Map（PR #16）](./architecture.md#p3b-vercel-functions-缓存倾向)、[P3 Installation 动态定位 #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18)、[MVP 产品规格](./LabourChain-MVP-Product-Spec.md) §11。
>
> 依据：Vercel 官方文档，核对截至 2026-10-25。本文区分 **平台已提供**、**仓库现状**、**用户已确认倾向** 和 **待验证实现**。

## 1. 结论与目标

**[用户明确倾向]** LabourChain 应积极利用缓存：优先缩短用户访问已接入公开 GitHub 项目、Issue、配置与劳动记录时的等待，并减少对 GitHub API 的重复、慢速请求。数据权威仍在 GitHub，缓存是可丢弃的加速层，不成为第二份业务真相。

**[官方确认]** 对当前 React + Cordis / 普通 Vercel Functions 架构，Vercel 的两种原生能力可直接考虑：

- **CDN Cache**：缓存完整 HTTP GET 响应；命中时可在 Function 执行之前返回，减少访问延迟、Function 调用和后端 GitHub 请求。
- **Runtime Cache**：通过 `@vercel/functions` 的 `getCache()`，在 Function 执行时缓存 GitHub 响应或处理后的公共数据，减少同一区域内的重复上游读取；支持 TTL、标签失效，可跨 Function 实例复用。

二者不是互斥架构，也不要求另行运行 Redis、在线业务数据库、Webhook Worker 或服务端 Cordis；**但 Runtime Cache 本身确实是一种托管的服务端共享临时缓存**。是否同时启用、怎样划分对象、具体参数，都需要依据真实接口和观测结果定，不在本报告冻结。

## 2. 能力与适用边界

| 特性 | CDN Cache | Runtime Cache |
| --- | --- | --- |
| 缓存单位 | 完整 HTTP 响应（Function/公开 API 等） | 数据对象或计算结果（如已验证的公开 Issue 列表） |
| 命中位置 | Vercel CDN，Function 不必执行 | Function 执行期间；可避免访问 GitHub |
| 使用方式 | Function 响应的 `Cache-Control`、`CDN-Cache-Control`、`Vercel-CDN-Cache-Control` | `@vercel/functions` 的 `getCache().get/set/delete/expireTag` |
| 范围与性质 | CDN 分区域、临时且可能提前淘汰 | 每运行区域隔离；跨部署仍可保留；按环境隔离，非持久存储 |
| 失效 | 时间/SWR、`Vercel-Cache-Tag`、按标签 invalidate/delete | TTL、`delete`、`expireTag`；可按共同标签实施跨层失效 |
| 用户身份 | 适合内容与访问者身份无关的公共响应 | 可复用经过安全范围验证的公共数据，不应缓存会话或混合权限数据 |
| 可观测性 | `x-vercel-cache` 与请求日志 | Runtime Cache 命中率、读写、标签失效等 Observability 指标 |

**[官方限制]** CDN 可缓存请求须符合条件，例如 GET/HEAD、无请求 `Authorization` 头、响应无 `Set-Cookie`，且不能设置 `private/no-store/no-cache`。CDN 不缓存以高基数 `Vary: Cookie` 区分的响应；不能假定登录 Cookie 自然形成安全的 CDN 隔离。对用户定制结果应保持不共享/不缓存或单独设计严格隔离，而非给 OAuth 接口随意添加公共缓存头。

**[官方限制]** Runtime Cache 是按区域的临时 KV：可因容量限制提前驱逐；单条目最大 2 MB，最多 128 个标签；Hobby 团队共享缓存容量，Pro/Enterprise 按项目划分；使用有费用。它不保证跨区域一致性，不是持久业务存储，也不会让普通 Node.js `fetch()` 自动变成共享缓存。完整 HTTP 响应仍应优先评估 CDN，而非对每个端点预建双层缓存。

**[文档参考]**

- [Vercel CDN Cache](https://vercel.com/docs/caching/cdn-cache)
- [Cache-Control headers](https://vercel.com/docs/caching/cache-control-headers)
- [Runtime Cache](https://vercel.com/docs/caching/runtime-cache)
- [Purging Vercel CDN cache](https://vercel.com/docs/caching/cdn-cache/purge)
- [Runtime Cache API 发布说明](https://vercel.com/changelog/introducing-the-runtime-cache-api)

## 3. 当前仓库与机会

**[代码现状]** `api/_github.mjs` 的 `json()` 固定返回 `Cache-Control: no-store`；`api/repos.mjs`、`api/issues.mjs` 等读取链路使用这一默认行为。现有 Function 还依赖固定 `GITHUB_INSTALLATION_ID` 取得 Installation Token，然后向 GitHub 读取数据。这已是一条用于测试的工作链路，**尚未集成 CDN 响应缓存或 Runtime Cache**。

**[已确认的其他前提]** GitHub App 安装并授权公开 Repo，即接入平台；有用户登录态时按用户 OAuth 授权路径读取/同步，没有登录态走其他合法读取方式。如何动态定位 Installation 独立由 #18 研究，本调研不能用缓存绕过安装/用户权限，也不重新设计两条读取路径。

**[倾向，不是实现指令]** 优先考虑对**所有浏览者具有相同含义的已接入公开仓库数据**提供受控共享缓存，如公开配置、公开 Issue 数据、公开频道/Commit 衍生数据。具体是否缓存于 CDN、Runtime Cache 或两者结合，应由端点是否真正与用户会话无关、是否已完成安装范围/权限校验、更新频率与实际性能决定。

例如，公开数据响应即使由某个用户令牌发起 GitHub 获取，也**不因此自动证明响应可以公开共享**。只有输出已脱敏、权限与来源核验不依赖单个请求用户、且不会混入用户特有字段时才有共享缓存资格。用户 OAuth 会话、Token、授权范围查询、登录/回调、写入结果、错误中携带的敏感上下文均不进入公共 CDN/共享数据缓存。写入接口及错误响应默认不缓存；特定 `404` 虽可被 CDN 技术上缓存，也不意味着权限失败或“未授权仓库”应缓存。

缓存键在未来实现时必须区分实际影响数据的维度（例如 repo 身份、资源类型、页码、查询范围、受管配置版本等），不能跨仓库、跨环境或混合访问权限；不要把 Token 或 Cookie 作为普通键值/可共享数据。这里**不冻结键格式**。

## 4. 鲜度、变更后的可见性、强制刷新

**[Vercel 能力]** CDN 可使用 `s-maxage`、`stale-while-revalidate` 缩短访问延迟，并以 `Vercel-CDN-Cache-Control` 区分 Vercel 缓存与浏览器缓存。通过 `Vercel-Cache-Tag` 或 `addCacheTag()` 标记响应，调用 `invalidateByTag()` 可使 CDN、Runtime/Data Cache 的匹配项失效并在后续请求上后台刷新；`dangerouslyDeleteByTag()` 执行硬删除后下一个请求需要同步读取源站，可能带来延迟或突发流量。Runtime Cache 自身另有 `expireTag()`，**仅针对 Runtime Cache 层**。以上接口在当前普通 Functions / Vite 前端架构下可研究使用，不必引入 Next.js ISR。

**[工程风险]** GitHub Issue/Label/评论可能被 LabourChain 或直接在 GitHub 修改；只有本平台能观察到的写入才有机会主动失效相关缓存，没有 Webhook 或持续后台同步时无法承诺即时感知仓库外变更。既有数据一段时间内过期是缓存策略的显式代价，而非“已实时同步”。

**[用户已确认·读取容忍度]** 写入是否成功以**GitHub 写入接口返回的实际结果**为准；之后通过读取 API 获取数据。用户实测写入后的新数据可能约 **1–2 分钟**才在读取结果中可见，当前接受这一延迟，**不是实时性承诺或固定 SLA**。不要求写后立即使所有读取视图同步，不引入 WebSocket、持续轮询或复杂的客户端一致性协调；手动刷新及加载/失败反馈即可按实际功能提供。缓存仍应避免无意延长陈旧窗口，TTL/按资源失效方式待端点实测；写入失败或非原子部分失败必须明确反馈，不能因旧缓存或超时把结果伪装为成功。

**[测试候选]** 先在受控公开仓库上测 CDN MISS/HIT/STALE、Runtime Cache hit/miss、写后失效、外部 GitHub 修改造成的短暂旧数据、分页及跨仓库隔离，再选择 TTL、tag 粒度和强制刷新形式。不能仅凭设置响应头就宣称缓存命中或延迟改善。

## 5. 对 MVP 约束的影响

- **[现有旧规格]** [MVP 产品规格 §2.2/§11](./LabourChain-MVP-Product-Spec.md) 写了“不使用服务端共享缓存”，并规定浏览器临时缓存、普通/强制刷新；该条款来自早期的“无在线业务数据库、无后台服务”简化方向。
- **[后续用户倾向]** 当前明确希望**积极使用缓存并优先让 Vercel Functions 承担缓存优化**，避免每次由浏览器驱动对 GitHub 的慢速读取。这允许研究、并在验证安全与成本后采用 Vercel 托管 Runtime Cache；并不等于批准自建 Redis、持久化数据库或持续同步基础设施。
- **[待同步]** 旧规格的“无服务端共享缓存”与 Runtime Cache 的实际能力语义有冲突。架构地图应记录后续倾向，待产品规格修订时显式调和；不将旧限制机械地用于否决所有托管缓存，也不将具体缓存实现默认为已经确定。

## 6. 下一步验证清单（未执行）

1. 识别和分类当前所有 GET/API 路由：公开且相同的响应、用户相关响应、授权验证响应与可变写入响应；先明确缓存资格而不是全局添加响应头。
2. 在 Vercel Preview 的受控公开仓库中，以最少改动测试单一路由的 CDN 缓存：通过 `x-vercel-cache` 与函数执行记录验证命中是否真的跳过 Function；观察区域与查询参数变化。
3. 如果需要在 Function 内缓存公共数据，再对该路由验证 Runtime Cache `getCache()` 的命中率、数据大小、费用与标签失效；确认双层缓存确实有收益。
4. 验证授权用户、匿名用户、不同仓库及安装撤销后不会因为缓存看到不属于其权限范围的数据；实测写后读取的过期窗口，确保缓存不会无意将已接受的约 1–2 分钟延迟明显放大。
5. 对照用户端访问延迟、GitHub 请求次数、Function 执行量和 Vercel 缓存费用决定进一步推广范围；失败回退和过期可见性另作验收。

**本次只是调研与方向记录，没有改动业务代码、响应头、Vercel 项目设置或实际部署。**
