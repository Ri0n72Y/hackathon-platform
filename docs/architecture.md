# Hackathon Platform — Architecture Map

> **状态：讨论草稿 v0.2（2026-10-25）**  
> **用途：** 先建立全局拼图，再按证据和用户决策填补空缺。本文不是已生效的工程规范，也不意味着建议模块已经实现。  
> **基线：** `Ri0n72Y/hackathon-platform` 的 `main` 分支、MVP 产品规格、Issues #1/#2/#5/#13、用户明确确认的全栈功能插件与 Playground 验收边界、Project Team v3。PR #14 不是用户确认的架构决定，不纳入此文档的决定性依据。

## 0. 标记方式

- **[约束]** 用户明确的产品或技术约束，或 MVP 规格已有明确规定的范围。
- **[现状]** 在当前 `main` 中已观察到的代码或文件；不表示生产验证通过。
- **[方向]** 当前采用的讨论方向，具体定义和验收标准尚待确定。
- **[待决]** 需要用户与 Architecture Steward 讨论后确定。
- **[待验证]** 需要代码实验、部署或专项研究支持，不能仅凭设计推断。
- **[规格已定义]** MVP 产品规格 Draft 0.1 已写明的领域语义；不是实现已完成或额外用户批准。
- **[规格差异]** 旧规格与后续用户明确决策存在差异；保留可追溯依据，待产品规格同步。
- **[待研究]** 已明确研究目标但尚无验证结论；可由专项 Issue 跟踪。
- **[暂缓]** 当前不研究或实施；与未解决的阻塞问题分开记录。
- **[后续]** 本轮不需要细化，不因此提前搭建基础设施。

## 1. 产品及运行边界

**[约束]** 平台面向黑客松团队和开源协作社区。MVP 通过公开 GitHub 仓库提供项目发现、Issue 看板、频道讨论和基础劳动记录。React 负责 UI；Cordis 负责插件及服务组织；Vercel 承载网页和 Functions；GitHub App 提供用户授权与仓库访问；GitHub 仓库是主要业务数据源；不建立传统在线业务数据库；保留 LabourChain 协议未来接入位置。

**[约束]** MVP 不包括私有仓库、PR 看板、跨平台 Git 适配器、持续后台同步、常驻 Worker、完整 LabourChain 协议或价值计算。细粒度权限、私有频道、独立 Thread、完整成员履历、声誉/贡献排名及完整异常诊断界面同样不在 MVP 范围；无效数据诊断界面可后置。产品规格所描述的 `labourchain.config.yaml`、`status:*`、`channel:*`、`CardItem`、`Asset` 和劳动记录属于已提出的产品/数据契约；不是已实现的代码模块。

**[约束·用户确认]** 将平台设计为**全栈业务功能插件的组合**。插件围绕一个完整、可验收的业务功能，而不是单个函数、组件或 API 操作；也不应同时吞并多个复杂且完整的业务模块。插件可以按需包含 UI、Cordis 服务、领域逻辑和服务端 Function，但前后端各自的代码与运行职责须保持可辨识，不能混成不可维护的大模块。

**[约束·用户确认]** 插件无需独立部署：MVP 统一部署平台。部分功能插件能在类似 Storybook 的 **Playground** 中运行；**每个业务插件都应能在 Playground 中按自身能力单独验收**。这一点指功能可隔离验证，不表示运行时必须零依赖，也不要求所有插件都提供独立可见页面。Playground 可通过明确的共享服务或受控测试替身提供前置能力。

**[约束·用户确认]** GitHub App 安装并授权仓库即视为该公开仓库接入平台，不设平台内部第二次绑定流程；未经 App 授权的公开仓库不作为平台项目。安装授权与用户登录 OAuth 仍是两个不同的 GitHub 授权机制。

**[约束·用户确认]** 采用**薄应用核心（Thin Core）+ 基础能力插件 + 业务功能插件**的责任划分：应用核心仅负责运行环境启动、Cordis Context 创建、插件装配与生命周期协调，不包含 GitHub 或看板等业务语义；UI 注册与 React 宿主、GitHub 身份接入、数据访问等可复用能力通过 Cordis 插件提供；业务功能插件消费所需服务并拥有各自的业务闭环。Playground 是另一种插件组合与验收入口，不是单独重写业务实现。

**[待决]** 一个逻辑功能插件是否对应独立包、Function 文件布局、如何组织 Playground 场景及如何验证真实 GitHub 写入，均不在此轮冻结。

## 2. 技术架构全局地图

```mermaid
flowchart TB
  User["用户 / 匿名访客"] --> UI
  subgraph Browser["浏览器 · React + Cordis"]
    Core["薄应用核心：Cordis 初始化 / 插件装配 / 生命周期"]
    UI["UI Host 插件：React 宿主 / UI 注册"]
    Shared["基础能力插件：GitHub 身份 / 数据访问 / 配置等"]
    Features["业务功能插件：发现 · 项目 · 看板 · 频道 · 劳动记录 · 成员"]
    State["前端临时状态 / UI 偏好（缓存研究后置）"]
    Core --> UI
    Core --> Shared
    Core --> Features
    Features <--> UI
    Features --> Shared
    Features <--> State
  end
  subgraph PG["Playground · 按业务功能隔离验收"]
    Cases["插件验收场景 / 交互"]
    Supports["真实共享能力或受控测试替身"]
  end
  Cases -.-> Core
  Supports -.-> Shared
  subgraph Server["Vercel Functions · 按请求执行"]
    Auth["OAuth / 会话 / 权限检查"]
    Ops["受控 GitHub 写入 / 配置同步 / 必要读取"]
  end
  Features -.->|"已接入仓库的数据读取（不同登录态的路径暂不展开）"| GH["GitHub API"]
  Features -->|"授权与变更"| Auth
  Features -->|"受控操作"| Ops
  Auth --> GH
  Ops --> GH
  GH <--> Repos["公开 GitHub 仓库 · 权威数据"]
  Future["未来 LabourChain 协议集成：接口位置待决"] -.-> Features
  Future -.-> Repos
```

这张图表示**逻辑边界**，不是部署拓扑的最终细节。**生产应用和 Playground 复用业务插件，而不是分开维护两套功能实现。** Playground 既能展示交互，也应能检查业务效果与失败路径；仅看到 UI 渲染，不等于一个依赖真实 GitHub 写入的闭环已经通过端到端验收。

### P1 全栈插件与 Serverless 运行边界（已确认）

**[约束·用户确认]** **浏览器端使用 Cordis 插件运行时，服务端使用普通 Vercel Functions**。MVP 不在 Functions 侧创建第二套 Cordis Context、插件装载与生命周期系统。当前 Serverless 的按请求执行模型不需要服务端动态插件组合；额外运行时会增加无需求支撑的启动与装配负担。

**[架构原则]** 一个“全栈业务插件”是按业务责任形成的**逻辑功能单元**，不是要求在前后端都运行 Cordis：浏览器中的 Cordis 插件提供服务和 UI；同一业务能力需要后端时，由普通 Function 入口承担认证、权限校验、GitHub 写入等服务端职责。相关领域解析和校验可在适用时复用普通 TypeScript 代码；是否放入同一包、Function 入口怎样组织，待实际功能落地时确定。前后端不共享运行时实例、Cordis Context 或浏览器状态。

**[现状]** 当前代码已经采用浏览器 Cordis + `api/*.mjs` Functions 的执行形式，但服务端文件与业务插件的逻辑归属仍未系统化整理；本决策确认目标边界，不把当前实现的文件布局视为最终标准。

**[后续]** 若未来真正出现需要服务端动态装载与替换插件的场景，应依据具体需求重新评估运行时；当前不为此建设基础设施。

## 3. 功能拼图（不是立即拆包清单）

| 功能区域 | 核心责任（高层） | 对照现状 | 状态 |
| --- | --- | --- | --- |
| Platform Core / Bootstrap | 创建 Cordis Context、装配与释放插件；不含业务逻辑 | `apps/playground/src/runtime.tsx` | [约束·用户确认] 薄核心；[现状] 基础原型 |
| React UI Host（基础能力插件） | 唯一 React 宿主及 UI 注册、组合 | `plugins/react-ui/` | [约束·用户确认] 归插件；[现状] 已有原型 |
| Playground / Acceptance Harness | 按业务场景单独装配插件并观察可验收行为，可按需使用可控依赖 | 现有 `apps/playground/` 目前是整体原型入口 | [约束] 需要插件级验收；场景设计 [待决] |
| GitHub Identity & Access | App OAuth、会话、权限与安装范围校验 | `api/github-login.mjs`、`github-callback.mjs`、`github-verify.mjs` | [现状] 局部实现；完整安全验收 [待验证] |
| GitHub Data Access | 仓库 / Issue / 评论 / Commit 的读取与错误处理；缓存暂缓 | `plugins/repo-issues/`、`api/_github.mjs`、`issues.mjs` 等 | [现状] 固定 Installation ID 的测试链路；动态仓库定位 [待研究：#18] |
| Project / Repository | 仓库级根对象、已授权安装范围、项目视图及仓库配置读取 | 当前仓库选择界面 | [规格已定义] 仓库及页面语义；[已确认] 安装授权即接入；流程待实现 |
| Config & Label Management | 根配置解析、Namespace 三态校验、仅对受管 Issue 标签进行同步 | MVP 规格 §5–6 | [规格已定义] 管理与清理边界；[现状] 未实现完整同步 |
| Issue Board | Issue → CardItem、按视图可选 Label Namespace 分列、置顶、Filter/URL 视图与本地手动排序；受控标签变更 | 当前为 Issue 列表与手动创建 / 评论 | [约束·用户补充] 视图规则已明确；[现状] 完整看板未实现 |
| Channels | 有效频道 Issue 选择、评论与按配置启用的 Wishlist 展示 | MVP 规格 §8 | [规格已定义] 频道语义；[现状] 未实现 |
| Labour Records | Commit Message / YAML 评论转劳动记录、Commit Asset 引用与去重显示 | MVP 规格 §9.3–9.4 | [规格已定义] 来源与关联语义；[现状] 未实现 |
| Team / Members | 可选 `team-index/` 成员索引，允许没有 GitHub 账号的参与者 | MVP 规格 §10 | [规格已定义] 最小结构；字段契约后置，未实现 |
| Discovery / Index | 从公共索引进入项目、项目卡片 | MVP 规格定义；#4 后置 | [方向] 未实现；具体索引契约 [待决] |
| LabourChain Integration | 后续正式协议集成边界 | MVP 明确不运行完整协议 | [后续] 只预留演进位置 |

**[约束·用户确认]** 功能模块沿纵向拥有自己的业务闭环与可验收行为；可依赖明确声明的共享能力。这里的功能区域不是一一对应的最终插件数，具体分合应由业务闭环、复杂度和可独立验收性共同决定。

### 3.1 插件边界的初步判断（已确认的原则，不是拆包清单）

- **合适的边界：** 例如“Issue 看板”能够加载任务、按当前视图指定的 Label Namespace 分列并触发受控标签变更；可以在 Playground 中提供测试仓库数据与受控写入模拟，检验完整交互路径。
- **太细：** 仅为 `parseStatusLabel()` 或单个按钮包装 Cordis 插件；应优先作为业务插件内部的普通函数或组件。
- **太大：** 一个插件同时独立实现看板、频道、成员和劳动记录等多个完整业务领域；应检查其是否含有多个可单独验收的业务闭环。
- **独立验收 ≠ 零依赖：** 共享身份、数据访问等能力可以以真实实现或测试替身提供；插件不应为了 Playground 而复制整套平台。模拟验收与真实 GitHub/Vercel 集成验证应明确区分。

### P5a 看板视图、置顶与手动排序（已确认的视图契约）

以下为用户从看板专项讨论补充的**[约束·用户确认]**，属于 Issue Board 功能的视图规则；不构成平台级通用过滤器或书签框架。

- **分列规则：** 当前看板视图可以选择 **`labourchain.config.yaml` 中已声明且定义了有效分列标签的 GitHub Label Namespace**；不允许使用未在该配置中声明的 Namespace 分列。`status:*` 不再是所有看板视图的唯一分列依据。所选 Namespace 决定 Issue 显示在哪一列；这直接沿用 MVP 规格 §5.2–5.3 的受管 Namespace 与有效标签语义，并非新增一套独立配置规则。特殊 `pinned` 标签只控制列内置顶，不作为分列 Namespace。
- **全局置顶：** Issue 添加特殊 `pinned` Label 后，始终排在其所属列顶部，**不受当前视图分列 Namespace 的影响**。它改变列内优先级，不代替分列所属关系；即使使用手动排序模式，`pinned` 的置顶语义也成立。
- **可共享的 Filter 视图：** 普通视图的筛选/排序规则通过 **URL Query Parameters** 表达；修改 Filter 应同步更新 URL，分享该 URL 可恢复该视图规则。它表达视图而非 GitHub 上的额外任务排序字段。
- **本地手动排序：** 用户拖动调整**显示顺序**后，当前 Filter **直接失效并清空**，界面显示「**手动排序**」；顺序只保存在本地，不写入 GitHub，**该手动排序视图暂不支持分享**。不能将不含 Filter 的 URL 宣称为手动排序的可复现链接。
- **常用视图：** 允许把常用 Filter/视图定义保存到仓库配置目录（如 `configs/`）或单独书签文件，由网页加载。**具体文件位置与格式待确定**；不将本地手动排序隐式转为可分享配置。

**[边界与待细化]** `pinned` 是 Issue 上的 GitHub Label，属于可被其他用户看到的仓库数据；Filter、URL 表达的是视图配置；本地手动顺序属于浏览器端个人显示状态。**跨列拖动**是否触发 GitHub Label 变更与**同列手动排序**不是一回事，仍需结合选定 Namespace 与写入权限验证确定。手动排序清空 Filter 后，分列 Namespace 的交互保留规则、刷新行为和同为 `pinned` 的卡片之间如何排序，均不在本轮擅自固定。

**[规格差异·待同步]** 当前 [MVP 产品规格](https://github.com/Ri0n72Y/hackathon-platform/blob/main/docs/LabourChain-MVP-Product-Spec.md) §7 仍以 `status:*` 为固定看板列、§7.3 仍写“筛选/排序偏好保存在本地”。这些表述与新确认的「可选 Namespace 分列、URL Filter、手动排序清空 Filter」并不完全一致。此处先记录新决策，旧规格原文及相关测试应在看板落地前按确认后的语义另行对齐。

### P5b 配置与 Label 管理边界（MVP 规格 §5–6 已定义）

**[规格已定义]** 根目录的 `labourchain.config.yaml` 是仓库级配置入口，负责有效标签、频道、显示方式和**由平台管理的 Namespace**。浏览器负责读取/解析用于展示的配置；服务端 Function 对写入、配置或标签同步须重新校验当前配置与 GitHub 用户权限。确切 Schema 和字段名尚未冻结，**不要因此重议下面已确定的语义**。

| 配置中某 Namespace 的状态 | 平台行为 |
| --- | --- |
| 不存在 | 不归平台管理，不检查也不修改；看板亦不能选择其作为分列 Namespace |
| 存在，且有效标签非空 | 纳入受管范围，仅配置声明的标签值有效；看板选择分列时使用该 Namespace 的有效标签 |
| 存在，但有效标签列表为空 | 仍在受管范围，但没有有效分列值；同步时清理 Issue 上属于该 Namespace 的标签 |

**[规格已定义]** 匹配以**完整命名空间前缀**为准，`foo:` 不等于 `foobar:`。删除整个 Namespace 配置意味着**停止管理且不自动清理**；保留配置但将列表设为空意味着**清理受管 Issue 上对应 Namespace 的标签**。这是两个不同的操作，不得合并为一个“删除标签”行为。

**[规格已定义]** 首次接入或配置变更时的 Label 同步由受控 Vercel Function 执行：读取仓库配置与状态、验证配置和用户权限、创建缺失的仓库级 Label 定义、检查 Issue 标签并清理受管 Namespace 下的无效值。**不删除仓库级 Label 定义、不主动处理 PR、不触碰未声明受管的 Namespace**。一轮同步包含多次 GitHub API 调用，**不是原子事务**；必须保留逐项失败信息与安全重试边界。

**[已确认·衔接]** GitHub App 安装并授予仓库访问权即完成平台接入，不附加第二次业务“绑定”。安装权限、项目接入与上述配置/Label 初始化属于不同责任；**不能因为已经接入就假定配置有效或同步已经成功**。动态 Installation 定位另由 [Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18) 研究。

**[边界]** `pinned` 是另行确认的特殊置顶标签，独立于当前分列 Namespace；它的创建、权限和与受管 Namespace 的关系需在具体写入实现中按既有权限约束核对，不将其当作可选择的分列 Namespace。

### P5c 看板与频道的业务判定（MVP 规格 §7–8 已定义）

**[规格已定义·看板]** 默认读取 **Open Issue**，Closed 默认不展示；用户主动打开“显示已关闭”后再分页读取 Closed，不强制一次获取全部历史 Issue。GitHub 的 Issue API 可能混入 PR，MVP 只处理 Issue。GitHub 的 Open/Closed 生命周期状态与业务 Namespace 标签是**不同的维度**。无效数据可供诊断，但完整诊断 UI 不是 MVP 的前置条件。

**[规格已定义 + 后续决策]** 原规格规定普通看板卡片必须**恰好拥有一个有效的 `status:*` 标签**，否则不展示；`status:archived` 默认隐藏在独立归档列表中。后续已确认“每个视图可选择配置中声明的 Namespace 分列”，所以**唯一有效分列标签**的判定应针对**当前选择的受管 Namespace**来理解；这属于对原固定 `status` 规则的推广，**具体无效卡片和归档跨 Namespace 行为尚未单独定义，不得假装旧文档已经覆盖**。跨列拖动引发的写入行为同样待落实；不得将本地手动排序误写成 GitHub Label 变更。

**[规格已定义·频道]** 每个频道由一个符合配置的 **Open Issue** 表示；必须恰好具有一个有效 `channel:*` 标签。没有有效 Issue → 空状态；出现多个候选 → 选择**创建时间最新**的有效 Issue；具有多个 `channel:*` 标签的 Issue 归属无效，不在频道视图展示。频道讨论直接使用该 Issue 的评论，不创建独立 Thread 对象。

**[规格已定义]** Wishlist 是默认的 `channel:wishlist`，适用相同的选择与有效性规则，只在展示方式上特殊；删除对应频道配置后不再显示 Wishlist 专用视图。一个 Issue 可同时符合看板与频道规则，并显示在不同视图中，**不需要为此复制 GitHub Issue 或创建第二种实体**。频道的初始化与创建交互仍属于实施细节。

**[规格已定义·用户操作]** 创建 Issue、评论和修改标签须遵守 GitHub 用户自身的权限；GitHub 写入失败时 UI 不得将未成功操作永久显示为完成，应呈现失败并允许恢复/重试。

### P5d 核心领域对象与来源关系（MVP 规格 §9–10 已定义）

| 对象 | 已确定身份与来源语义 | 不应预设 |
| --- | --- | --- |
| **Repo** | 仓库级根对象；MVP 仅实现 GitHub 类型，但领域身份不能把未来所有仓库类型都绑定为 GitHub 特定字段 | 多 Git 平台适配器或完整劳动链仓库协议 |
| **CardItem** | 标准任务卡片**引用源 Issue**，不建立完整 Issue 快照；允许预留少量 `patch?: Partial<CardItem>` | 完整 Patch 系统、以本地 Patch 静默覆盖 GitHub 权威字段 |
| **Asset** | 表示实际文件/资产；MVP 至少覆盖 GitHub Commit Asset，可由仓库与 Commit SHA 定位，保留原始地址、作者、提交者、时间及消息等来源信息 | 提前要求所有 Asset 都有 Commit，或实现非 Git 适配器 |
| **Labour Record** | 来源于 Commit Message 或结构化 Issue 评论；评论记录能够关联多个 Commit Asset | 必须关联 Commit、自动劳动价值计算或自动推算主观估时 |
| **Team Member** | 可选 `team-index/`：每人一个 Markdown，另有总 `index`；成员可无 GitHub 账号，也可为 Bot、设计、运营等贡献者 | 完整电子简历 Schema、以 GitHub 账号作为唯一成员身份 |

**[规格已定义·结构化劳动记录]** 有效记录来自 Issue 评论中**独立的 `yaml` 代码块**，顶层键为 `labour`；一条有效评论对应一条劳动记录。字段：`work`（必填，可多行）、`hr`（必填，以 `~0.5h`、`~1h` 等 **0.5 小时步进的主观估计**表示）、`commits`（可选，多 SHA）、`outcome`（可选）、`start-end`（可选，`start`/`end` 使用 RFC 3339 时间戳）。未填写起止时间时实际劳动发生时间保持未知；**评论创建时间是发表时间，不能充当劳动发生时间**。无 Commit 的工作记录仍有效。

**[规格已定义·展示与关联]** 评论 ID、作者、创建时间、所属 Issue 使用 GitHub 原始元数据，无需劳动者手填；有效结构化评论转为 Labour Record 展示，不再重复作为普通讨论；未通过校验的评论仍按普通评论显示。一个记录可关联多个 Commit；被有效结构化记录引用的 Commit 不再生成独立的基础 Commit Message 劳动记录。未被引用的 Commit 可以形成**信息不完整**的基础记录，不虚构时长或成果。同一 Commit 被多个结构化记录引用时，不自动合并，标为无效或待处理，避免重复展示；原始来源必须可追溯。

**[架构映射]** 以上是**业务模型与来源契约**，并不要求在 Core 中建立一个包揽 Repo、看板、频道、劳动记录和成员的统一业务服务。每个业务插件处理自己的领域转换；确需跨插件复用的原始来源访问或纯解析规则，再以明确公共服务或普通 TypeScript 逻辑承载。业务模型的最终类型定义、Schema 及资源路由仍需随首个可验收功能落地。

### P5e MVP 规格中已明确的其他边界（§2–4、§11–14）

**[规格已定义·身份]** 仓库接入发起者须具有相应的 Owner / Maintainer 权限（实际 GitHub App 安装/授权能力以 GitHub 结果为准）；普通交互式写入使用授权用户令牌，并接受 GitHub 用户权限及 App 授权范围限制；匿名用户可以浏览**已经接入平台的公开项目**，未安装授权的任意 GitHub 仓库不因此成为平台项目。服务器秘密不能进入浏览器。

**[规格已定义·项目入口]** 规格曾定义首页使用公共索引仓库驱动项目发现，项目详情拥有概览、看板、频道、劳动记录、成员视图；看板和频道属于独立视图，同一 Issue 可以在两边出现。**发现页、索引格式与推荐策略属于独立产品工作**，本地图仅标其边界，不在当前架构讨论中扩大范围。

**[已确认·实现方式]** 浏览器使用 React + Cordis；Vercel Functions 处理需要受控服务器环境的 OAuth、校验和 GitHub 写入。配置解析、Namespace 匹配、状态过滤、频道选择等领域计算优先使用易测试的纯 TypeScript 逻辑；不因预留未来能力而创建多平台适配层或服务端 Cordis 运行时。

**[暂缓·缓存]** MVP 规格 §11 曾要求浏览器临时缓存、普通/强制刷新、请求合并与过期提示；后续讨论明确**暂不设计缓存机制**，将该议题交给 Vercel Functions 侧后续处理。此处不把旧规格的浏览器缓存方案当成新的实施指令，也不否认失败状态和数据来源可信度的基本要求。

**[实现待定而非架构空白]** 根配置完整 Schema、成员索引字段、劳动 YAML 的解析实现、项目索引文件布局、Commit 分页与增量发现、标签同步的部分失败重试细节、频道初始化交互及实际 GitHub/Vercel 集成验收，均属于后续开发/专项验证，不要求在 Architecture Map 中先选择技术实现。

## 4. 平台核心与插件归属（P2 已确认）

**[约束·用户确认]** 应用核心只负责**让插件运行和组合**，而不直接提供 GitHub、看板或其他业务能力。基础能力与业务功能均通过 Cordis 插件提供，避免核心随着产品功能增长成为庞大模块。

| 层次 | 拥有什么 | 不应承担什么 | Cordis 插件？ |
| --- | --- | --- | --- |
| **Platform Core / Bootstrap** | 环境入口、创建 Cordis Context、装载插件、统一生命周期及退出清理 | GitHub 数据规则、身份业务、项目/看板等具体功能 | 否；它负责启动插件 |
| **Infrastructure Plugins** | 可复用平台能力，例如 React UI 注册宿主、GitHub 授权接入与数据访问 | 直接吞并具体业务闭环 | 是；按可复用能力组织，具体数量待实践确定 |
| **Feature Plugins** | 可在 Playground 独立验收的业务闭环，例如看板、频道、劳动记录 | 自建整套应用运行时，绕过共享服务重复实现认证/数据接入 | 是；以业务功能划分，避免过细或过大 |
| **Playground** | 选择性装配待验收插件及必要依赖，提供交互场景、测试替身与观察入口 | 复制正式应用的业务实现，或将模拟测试等同于生产集成验收 | 否；是应用装配与验收宿主 |

**[约束]** 基础能力插件可以没有独立用户页面，但应具备对其公开行为的可观察验收途径；领域内部普通函数、类型和 React 组件不因“插件化”原则而各自成为插件。业务插件可声明基础服务依赖；“独立验收”不等于“无依赖”。

**[现状]** `apps/playground/src/runtime.tsx` 已在应用入口构造 Cordis Context、挂载插件并逆序释放；`plugins/react-ui/` 提供 UI 注册能力；`plugins/repo-issues/` 提供部分数据服务。这些是当前设计的起点，不代表前后端已实现完整的插件化装配。`api/*.mjs` 当前承担部分 GitHub App OAuth、Issue 读取和用户身份写入；服务端的 Cordis 插件机制并不存在。

**DSH 参考边界。** [DeepSeek Harness 架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) 明确采用插件树、按配置组合能力，许多位于 `core/*` 的服务本身也是 Cordis 插件，并非特权业务单体；[Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md) 也区分插件加载、服务、客户端模型和 UI 组合。这支持“薄启动层、功能由插件贡献”的组织原则。**但本项目不照搬 DSH 的 Profile/Bundle 系统、常驻 Host 或远程通信框架**：它们不是当前 MVP 的需求。这里的“Core”专指我们的最小应用引导层，不是照抄 DSH 仓库 `core/*` 的包名划分。

### P2b 插件依赖与公开契约（机制已明确，具体接口待落地）

**[已验证·Cordis]** 服务是以名称注册在 Cordis Context 上的能力；消费者通过 `inject` 声明**必需服务**，由运行时在依赖满足时激活。提供方消失时消费者会卸载，并在服务恢复后重新激活；**不通过启动列表顺序解决依赖**。可选能力不列为硬依赖，应在使用时判断其是否存在。服务注册、监听器与子插件卸载由 Cordis 生命周期管理，额外的计时器、网络请求、外部订阅等副作用在插件作用域内明确清理。上述属于已有框架机制，不再自建依赖容器、插件状态机或卸载协议。

**[架构原则]** 消费插件只依赖其使用的**公开能力契约**（方法、数据类型、可观察状态），不通过运行时导入另一插件的具体实现来协同。TypeScript 可通过 `import type` 共享提供方导出的公共类型；`Context` 声明合并提供编译期提示，运行时仍需由 Cordis 满足服务依赖。**不要仅为类型预先建立独立的通用 `contracts` 包**；出现多个真实提供方或跨运行时复用需求时再评估抽离契约。服务之间应避免循环硬依赖：如发现循环，先检查业务职责是否缠绕、能力边界是否放错，而不是增加第二套事件总线或服务定位器绕过依赖关系。

**[架构原则]** 插件激活成功与业务数据已就绪不是同一个状态。需要可观察数据时，服务自身负责状态、订阅及更新；React 界面通过服务的快照/订阅接口观察变化，不以组件局部状态作为共享业务真相。只有真正跨插件消费的行为才需要成为服务；普通业务函数与组件仍可留在拥有它的插件内部。

**[约束·Playground]** Playground 按需要装配**被验收插件 + 声明的依赖**。对网络、授权等外部边界可以提供符合公开契约的受控替身，验证功能的成功、失败和生命周期行为；基础能力插件也可以通过操作/状态检查验收，不强制有可见的业务页面。应明确记录哪些结果来自替身、哪些来自真实 Vercel / GitHub 组合，避免把单插件验收报告为端到端验证。场景格式、目录和具体装载器暂不冻结。

**[现状与差距]** `repo-panel` 已声明 `inject: ['reactUI', 'repoIssues']`，并将 UI 注册撤销交由 `ctx.effect()`；`repo-issues` 通过 `getSnapshot/subscribe` 提供可观察状态。与此同时，`repo-panel` 和其 Issue 工作区仍直接发起部分 `/api/github-*` 请求；仓库目前没有单插件场景目录与独立验收装载能力。这是需要逐步演进的**现状差距**，不应描述为插件化已全面完成。

**[后续细化]** 具体服务名称、接口类型、错误/取消模型、插件包布局、是否需要多 UI 区域，以及跨浏览器与 Vercel Functions 的契约边界，都要在对应功能实现或专项调研时确定；这里不设计假想通用协议。

**来源：** [Cordis 服务与 `inject` 教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.zh.md)、[生命周期与 effect](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/02-lifecycle-and-effects.zh.md)、[React + Cordis 技术指南](https://github.com/Ri0n72Y/agent-identity/blob/main/library/react-cordis.md)。

### 尚未确定的技术边界

- **[已确认]** Functions 侧不运行 Cordis；**[待决]** API 端点在仓库中的组织、所属业务插件如何维护服务端处理逻辑，以及哪些纯领域代码适合跨运行时复用。
- **[已验证]** Cordis 已提供必需服务注入、依赖卸载与生命周期；**[待决]** 具体公共服务接口、路由、跨运行时与 UI 扩展点归属；**[暂缓]** 缓存/刷新内部机制，不纳入当前架构调查。
- **[约束]** Playground 可按业务功能隔离验收；共享依赖可以提供真实实现或受控替身，必须区分模拟路径与真实 GitHub/Vercel 集成验证。
- **[待验证]** 实际 Vercel 部署、会话失效、权限与安装范围、多仓库访问、GitHub 限流及并发修改。

## 5. 三类主数据流（先确定有这三类）

1. **已接入公开仓库的数据读取：** GitHub App 已安装并授权目标公开仓库 → 获取 GitHub 数据 → 解析配置/领域模型 → React 渲染。**[约束·用户确认]** 有登录态时沿用户 OAuth 授权链路读取/同步；没有登录态则使用其他合法方式获取。两种路径的差异本轮不展开、不提前决定具体实现。**[现状]** 测试代码通过 Function 使用固定 Installation ID 的安装令牌读取；多用户/多安装动态仓库定位尚未实现（见 [Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18)）。
2. **用户写入：** 用户执行明确操作 → 同源 Function 检查会话、目标与权限 → 用 GitHub App 用户令牌请求 GitHub → 回传结果并修正 UI。不得将服务端秘密下发浏览器 [约束]；当前 Issue 创建/评论具备这条链路的部分实现 [现状]。
3. **仓库挂载/配置同步：** 维护者授权 → 读取与校验配置、仓库权限 → 执行受控 Label/配置操作 → 返回逐项状态与失败信息。MVP 规定同步不是原子事务 [约束]；实际闭环尚未实现 [待验证]。

### P3 GitHub Data Access

**[待研究：Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18)** — 根据用户授权动态定位 GitHub App Installation 与可访问仓库，替代固定 `GITHUB_INSTALLATION_ID`。

**[现状·技术测试已跑通]** 现有 Function 通过环境变量 `GITHUB_INSTALLATION_ID` 使用一个固定的安装实例取得 Installation Token，并读取安装授权的仓库及 Issue；这是一条已跑通的技术测试链路，**不等于**正式环境的多用户、多组织动态安装定位能力。

**[约束·用户确认]** 安装 App 并授予仓库访问范围，即视为仓库自动接入平台；不设置额外绑定记录。用户有登录态时，按 OAuth 用户授权路径读取/同步；用户无登录态时，使用其他可行读取方式。**本轮不再比较两类读取路径**，也不将尚未研究的无登录读取方式提前写死。

**[待研究]** 调查如何在不预设全局 Installation ID 的前提下，依据用户授权与目标仓库确认对应安装实例、仓库授权范围及权限变化；处理多安装、不同用户/组织以及撤销等边界。调研与验证任务见 [Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18)；当前文档**不预设技术解法**。

**[暂缓]** 缓存不是本轮议题。缓存相关问题暂交由 Vercel Functions 一侧后续处理，不在当前架构文档中确定缓存机制、刷新间隔或浏览器缓存策略；MVP 既有产品规格中的缓存细节后续按实际实现同步对齐。

### P4 身份与用户写入边界（机制已确定；真实环境验证待完成）

**[约束·用户确认 / MVP §3]** GitHub App 安装并授予仓库权限是项目接入行为；**用户 OAuth 授权**是具体用户的身份与交互式写入凭据，两者不是同一个许可。交互式创建 Issue、评论、修改受管 Label、配置写入均应使用**用户授权身份**并遵守 GitHub 用户及 App 的有效权限；不得以 Installation Token 替代用户身份绕过拒绝。浏览器不得持有 App 私钥、Client Secret 或可直接读取的用户令牌。未登录用户可以浏览已接入的公开项目，但不具备用户写入会话。

**[现状·OAuth 与会话]** `api/github-login.mjs`、`github-callback.mjs`、`_oauth.mjs` 实现了 GitHub App OAuth 授权码流程、`state` 校验、PKCE S256、服务端 code 交换，以及 AES-GCM 密封的 `__Host-` 前缀 HttpOnly / Secure / SameSite=Lax Cookie。当前会话保存有时限的用户访问令牌（最长 8 小时），**不保存 Refresh Token**；`api/github-session.mjs` 提供不暴露令牌的登录态查询。上述是当前代码策略，不应写成已验证的多设备刷新、密钥轮换或即时吊销能力。

**[现状·受控用户写入]** `api/_issue-interaction.mjs` 对写入要求 POST、JSON、受控请求来源、用户会话、输入限制和目标仓库的 App 安装范围检查。`api/github-issue-create.mjs` 使用该用户令牌创建 Issue；`api/github-issue-comment.mjs` 先读取目标并排除 Pull Request，再以该用户令牌发表评论。失败时返回可识别的错误或提醒核实结果，避免网络超时后盲目重复创建。当前仓库范围校验仍依赖 **固定 `GITHUB_INSTALLATION_ID`**，它是已跑通的测试前提，动态定位方案单独见 [Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18)。

**[规格已定义·未完整实现]** 修改看板分列 Label、初始化/同步 Label 定义和更新 `labourchain.config.yaml` 仍需实际实现。已确定的约束包括：只修改配置允许的受管 Namespace；不覆盖 Issue 的其他 Label；配置文件写入需要检查当前 SHA 与用户权限；跨多个 GitHub 请求的状态修改/同步**不是原子事务**，冲突与部分失败必须显式呈现，不得在 UI 上假装持久成功。相关领域约束见 P5b–P5c。

**[研究建议 ≠ 已验收实现]** [Issue #5](https://github.com/Ri0n72Y/hackathon-platform/issues/5) 与 [授权研究文档](https://github.com/Ri0n72Y/hackathon-platform/blob/main/docs/github-app-user-write-auth-research.md) 列出会话安全、Origin/CSRF、授权撤销、访问控制、并发冲突、错误恢复等验证建议；其研究草稿在 2026-10-21 明确尚未进行真实 API 写入。当前代码已经实现其中部分防护，**但静态的 `X-LabourChain-Write` 请求头与 Origin 检查不可自动等同于独立的会话绑定 CSRF 令牌验收通过**；不得将现有代码或研究草稿冒充完整端到端安全测试。

**[待验证]** 至少按实际运行环境检查：OAuth 成功/失败/重放、回调和 Cookie 条件、用户权限拒绝、安装范围变化/撤销、跨仓库或 PR 目标、GitHub 写入 actor、会话过期和重新登录、写入冲突与不确定结果、安全来源校验、Vercel 多实例及配置/密钥轮换。细化用例属于 [Issue #5](https://github.com/Ri0n72Y/hackathon-platform/issues/5) 与具体写入功能的验收；**动态 Installation 发现不在 P4 重复研究**。

## 6. 第一批未完成拼图

| 决策 / 实验槽位 | 当前问题 | 本轮处理方式 |
| --- | --- | --- |
| **P1 全栈插件与 Serverless 运行边界** | **已确认**：浏览器 Cordis 插件 + 普通 Vercel Functions；业务插件是完整逻辑功能单元，不要求两端各运行 Cordis；部署统一。**待细化**：服务端文件归属和跨运行时代码布局 | **已填写第 2 节**；不建立第二套服务端插件运行时 |
| **P2 平台核心与插件的归属** | **已确认**：最小启动/装配核心不是插件；UI 宿主、GitHub 接入/数据等基础能力及各业务闭环通过 Cordis 插件提供；Playground 是验收入口 | **已填写第 4 节**；不再将原则性划分作为待批准问题 |
| **P2b 插件依赖与公开契约** | **已验证**：Cordis `inject` 与生命周期承担运行依赖；插件通过公开服务协同，Playground 用依赖组合/受控替身验收；**待细化**：具体接口和场景格式 | **已填写第 4 节**，不引入第二套依赖框架 |
| **P3 GitHub 数据访问** | **已确认**：GitHub App 安装授权即项目接入；有登录态使用用户 OAuth 授权路径，无登录态另行读取，暂不讨论差异。**待研究**：不写死 Installation ID 的动态安装与仓库定位 | [Issue #18](https://github.com/Ri0n72Y/hackathon-platform/issues/18) · 第 5 节；缓存暂缓，由 Functions 侧后续处理 |
| **P4 身份与写操作边界** | **已确认**：用户 OAuth 身份执行交互式写入，App 安装授予仓库范围；**已有代码**：State/PKCE、加密 Cookie、Issue 创建与评论。**待验收/实现**：会话和权限安全测试、Label 与配置写入、冲突与失败路径（安装动态定位单列 #18） | 第 5 节 P4 已填写；复用 [Issue #5](https://github.com/Ri0n72Y/hackathon-platform/issues/5) 的验收研究 |
| **P5 项目领域模型与配置** | **已核对**：规格 §5–10 的配置 Namespace 三态、Label 同步、看板/频道规则、Repo/CardItem/Asset/Labour/成员来源语义；**已补充**看板视图新约束。**待落实**：具体 Schema、插件接口和旧规格冲突同步 | 第 3 节 **P5a–P5e** 已填写；不再将现有规则作为待决问题 |
| P6 AI 开发与检查机制 | 项目级规则、技能引用、CI 和 Review 如何配合？ | 先确立架构，再变成可执行规范 |

## 7. AI 开发资料的正确层级

**[现状]** `main` 已经包含简短的 [`AGENTS.md`](https://github.com/Ri0n72Y/hackathon-platform/blob/main/AGENTS.md)，作为 AI 贡献和协作入口；`docs/architecture.md` 仍是事实、决定及未决架构问题的讨论地图，**不是**因写入草稿便自动生效的项目工程规范。AGENTS.md 不应复制整份地图，尚未确认的具体实现不得提升为强制规则。

`Ri0n72Y/agent-identity` 的资料按用途引用，不视为项目自身规范：

- `library/react-cordis.md`：React / Cordis / 插件装配的技术参考。
- `library/function-first-cordis-plugin-programming.md`：服务状态、纯逻辑与生命周期的编程参考；不强制禁用类。
- `.agents/skills/project-team/`：持续角色和 GitHub 交接（已与用户上传的 Team v3 核对）。
- `.agents/skills/ponytail/`：实现任务减少无用抽象的参考。
- `.agents/skills/dependency-risk-testing/`：从实际依赖风险选择测试的参考。
- `.agents/skills/ralph/`：需要边界清楚的工程任务时采用的任务/报告契约，不另建任务系统。

Core / Soul / Principles 属于通用身份或方法层，不应替代项目自有的架构与约束。外部技能是否被 AI 工具自动加载，需要按实际工具验证，不能仅凭仓库存在而假定。

## 8. 后续工作节奏

**先对齐地图（包含 Playground 验收角色）→ 逐个填 [待决] → 小实验验证 [待验证] → 将经确认的决定转成具体约束和测试 → 通过独立分支/PR 提交，交由 Lead 与用户确认。** 已具备可靠依据、属于常规技术判断的内容直接标注来源并填入文档；仅当存在实质架构取舍、证据冲突或超出既定约束的决定时，才单独请求用户判断，避免形式性的逐项确认。

本文仅提交架构讨论草稿，不修改业务代码，也不直接改变 `main`。合并及后续规范化需要 Lead 与用户确认；现有 Issues 和 PR 是工作事实的唯一 GitHub 记录位置，不另建影子任务板。

## 依据（截至 2026-10-25）

- [MVP 产品规格](https://github.com/Ri0n72Y/hackathon-platform/blob/main/docs/LabourChain-MVP-Product-Spec.md)
- [当前代码：apps/](https://github.com/Ri0n72Y/hackathon-platform/tree/main/apps)、[plugins/](https://github.com/Ri0n72Y/hackathon-platform/tree/main/plugins)、[api/](https://github.com/Ri0n72Y/hackathon-platform/tree/main/api)
- [Issue #1 技术调研](https://github.com/Ri0n72Y/hackathon-platform/issues/1)、[#2 项目页面](https://github.com/Ri0n72Y/hackathon-platform/issues/2)、[#5 GitHub 授权研究](https://github.com/Ri0n72Y/hackathon-platform/issues/5)、[#13 Team Index](https://github.com/Ri0n72Y/hackathon-platform/issues/13)
- 用户上传的 `SKILL - team v3.md`；[agent-identity](https://github.com/Ri0n72Y/agent-identity)
- [DSH 架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md)（用于验证薄启动层和插件贡献能力的架构边界；不是照搬其部署结构）
