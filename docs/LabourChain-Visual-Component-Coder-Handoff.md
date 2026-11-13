# LabourChain 双主题效果图 → Coder 组件与样式交付（D2）

> Product Interface Designer · 2026-11-13
>
> **依据**：本次对话生成的两张 **LabourChain 项目主页效果图**，Dark（深炭黑/蓝紫/少量黄）和 Light（冷柠檬 Lime 单品牌主色），另以已合并 [PR #66](https://github.com/Ri0n72Y/hackathon-platform/pull/66) 的 [Visual Style Guide](./LabourChain-Visual-Style-Guide.md)、[五页 D2 布局](./LabourChain-Five-Page-Layout-Design.md)、[Repo UX Baseline](./LabourChain-Repo-Board-Issue-UX-Baseline.md) 与 `AGENTS.md` 为约束。
>
> **状态**：视觉拆分和参考 CSS 已可交给 Coder；这是**设计交付**，并未更改业务 TSX/CSS、实现主题切换、验收线上页面或给测试背书。两张图片为**效果概念图**，仓库内的业务字段、路由、权限和真实数据始终更权威。图片中的人物、Issues、栏目及示例数据均为占位，不在开发时硬编码。
>
> **配套可复制 CSS 参考**：[LabourChain-Visual-Styles.reference.css](./design-reference/LabourChain-Visual-Styles.reference.css)，文件不被工程导入。请 Coder 把涉及的真实组件样式落至 `*.module.css`，按已存在类名或适量新类名实现，遵守仓库 `AGENTS.md`。

## 1. 效果图中确认采用的结构与需排除的元素

两个主题**同布局、同数据和交互，只改变视觉 Token**。项目主页结构固定为：

```text
[实际已有站点导航/面包屑，不新增业务入口]
┌ Repo Hero ──────────────────────────────────────────┐
│ owner / repo · 项目名称 · Description/README 摘要    │
│ [真实 README/GitHub/Config/Channels 入口]            │
│ [展示分支输入/应用]                                   │
│ (可选 CSS 低对比抽象几何装饰，不能遮挡正文)             │
└─────────────────────────────────────────────────────┘
┌ Team / 成员展示 ─────────────────────────────────────┐
│ 标题 + 查看全部成员 | ○ ○ ○ ○ → 单行横向滚动            │
└─────────────────────────────────────────────────────┘
┌ Repo Issue Feed ────────────────────────────────────┐
│ 标题 + 真实刷新                                      │
│ ┌ Issue Card：元信息 → 标题 → Markdown 原文顺序 ┐     │
│ │ Expand/Collapse · 站内详情 · GitHub 原文       │     │
│ └───────────────────────────────────────────────┘     │
│ [Loading / Empty / Error / Retry / Load more]        │
└─────────────────────────────────────────────────────┘
```

### 1.1 从图片提取为设计规则

- **可采用**：深浅表面分层、圆角/局部非对称角、卡片细线与温和阴影、顶部身份/说明/操作的 Hero 层级、单行 Team 头像条、Issue 第一楼正文单列阅读、轻量元数据胶囊、按钮与链接样式、Markdown 代码/媒体的独立承载层。
- **不能照搬为业务要求**：截图的 `Pull Requests` 导航、分类筛选「功能开发/问题修复/需求讨论/文档改进」、项目热度、点赞/投票、虚构数值、硬编码 `Ri0n72Y` 团队成员和头像、固定 Issue #128/#127/#126、静态媒体文件名、虚构 API 代码、`任务协同` 功能入口等。现行 Repo Feed 只支持真实 Issue 集合和实际已存在的控制项；如需新增筛选、菜单或导航，须独立产品决定。
- **Hero 插画边界**：图右侧 3D 层叠团队图案属于概念装饰，仓库没有此授权可用资产。**不要求 Coder 生成/下载/模仿游戏图形**。可以先用 CSS 原创低对比斜切几何/渐变表达，或留空；不得改变 Description、分支及真实操作的可见顺序。
- **截图宽度≠冻结尺寸**：图片为 1448×1086 的视觉效果图，实际页面采用 D2 已给候选宽度（页面约 1120px，正文约 760px）。现有 CSS 为 `max-width:960px`；是否调整到 1120px 由本设计目标与实屏校准决定，不能仅按截图比例扩成 1400px。
- **GitHub 数据与顺序**：Description 优先，缺失时用 README 摘要；Team 仍为真实成员 JSON；Repo Feed 保持所有普通 GitHub Issues（排除 PR）、`updated_at` 倒序，第一楼 Markdown 顺序不变。截图看似右栏 Code/Media 的位置是视觉排版，不允许强行重排正文节点或生成虚构附件。
- **设计样式与交互分离**：已有组件的请求、存储、分支、登录、权限、报错、读取与分页逻辑不因样式迁移而改变。

## 2. 组件拆分（推荐可维护边界，不要求每项新增 TSX 文件）

| 视觉职责 | 推荐展示单元 / 复用层级 | 当前真实代码入口 | 实施建议 |
| --- | --- | --- | --- |
| 全站外观上下文 | Theme variables / UI Host | `plugins/react-ui/` + `apps/playground/src/main.tsx` | 先定义 Dark/Light 语义 Token。主题选择器、默认模式、偏好记忆尚未由用户确认，不抢先写业务逻辑；避免给页面装第二个 React Root |
| 顶部站点导航 | SiteHeader / ExistingNav | 当前全站 Host/入口，依现存导航为准 | **只对已有真实链接着色**；截图的 PR 导航等不可新增 |
| 项目身份与 Hero | RepoHero（可以仍为 `RepoHomePage` 内部展示区） | `plugins/repo-home/src/RepoHomePage.tsx` 的 `styles.hero/eyebrow/intro/actions/branch` | Hero 卡片、标题、说明、真实链接、显示分支；原有 Loading/Error/Retry 保持 |
| 区块标题 | SectionHeading（CSS class 可复用） | `RepoHomePage.tsx` 的 `styles.sectionHead` | 两个 section 的标题、右侧真实操作，装饰竖条通过伪元素，不引入虚构按钮 |
| Team 横条 | TeamPanel / TeamStrip | `RepoHomePage.tsx`, `plugins/repo-home/src/Team.tsx` | 整段做表面卡片，内部**单行头像横滚**；资料浮层保持 Hover/Focus/Tap 与 Escape |
| 头像与浮层 | MemberAvatar / MemberProfilePopover | `Team.tsx` 的 `MemberAvatar`, `TeamStrip`, `MemberProfile` | 外圈、间距、Shadow 与角色文字用真实成员数据；失败回退不变 |
| Repo 动态容器 | RepoFeedSection | `RepoHomePage.tsx` 的 `styles.feed` | 单列阅读，不使用三列卡片墙；Refresh/Loading/Empty/Retry/Load more 保持 |
| Issue 文章卡 | RepoIssueActivityCard | `plugins/repo-home/src/RepoIssueActivityCard.tsx` | 卡片边框、4px 强调条、编号/状态/作者/时间排版、标题、正文与底部链接；不添加虚构类别/评论数 |
| Markdown 承载层 | SafeMarkdown / MarkdownSurface | `plugins/repo-home/src/SafeMarkdown.tsx`, `SafeMarkdown.module.css` | 代码、引文、图片、视频外链使用主题面板；文章内 H1 低于外部 Issue 标题；原文顺序不变 |
| 复用按钮/胶囊 | Action/Pill 视觉语义 | 各业务组件 CSS Modules | 仅当两个以上页面真的需要且维护有价值才抽共享组件，否则复用 Token/类名，不新建 Cordis 插件 |
| 成员列表/登记 | MemberCard / MemberForm | `MembersPage.tsx`、`MemberRegisterPage.tsx`、`Team.tsx` | 直接复用表面、按钮、输入与状态 Token；不重做校验和 Bot/PR 语义 |
| Issue 详情 | IssueHeader / Tabs / Discussion / Labour | `plugins/issue-detail/src/IssueDetailView.tsx` + `.module.css` | 双主题卡、真实讨论/劳动 Tab；不得改变独立 URL 与表单权限 |
| Topic Page #31 | TopicHead / ProjectCard | [PR #64](https://github.com/Ri0n72Y/hackathon-platform/pull/64) 的实际文件，合并后由 Coder 再确认 | 真实海报横卡＋Flex 项目封面流；无图不伪造；**该 PR 未合并时禁止并行修改其分支/重叠文件** |

> **组件拆分原则**：当前 `RepoHomePage`、`TeamStrip`、`RepoIssueActivityCard`、`SafeMarkdown` 已具有真实业务边界。优先保持既有 TSX 文件，按视觉需要在其内部创建私有纯展示单元即可；共享样式通过 CSS Modules 和语义 Token 实现。不得为单个按钮/标签再建 Cordis 插件或强制拆出无用的 `*View` 文件。

## 3. Dark / Light 样式 Token（Coder 落地基线）

| 语义 | Dark（保持不动） | Light（冷 Lemon-Lime） | 关键用法 |
| --- | --- | --- | --- |
| 画布 `canvas` | `#11141B` | `#F5F7F1` | 页面与空白基底 |
| 主卡 `surface` | `#191E29` | `#FCFDF9` | Hero 下卡、Feed、成员卡 |
| 次级 `surface-raised` | `#242B3B` | `#EEF3E1` | Hero、浮层与内容辅助层 |
| 输入/代码 `surface-input` | `#202737` | `#F6F9F0` | Code、Form、媒体外链 |
| 边框 `stroke` | `#3C4659` | `#D4DFC9` | 卡片细线 |
| 强边框 `stroke-strong` | `#71809B` | `#7D9468` | 输入框/控件可辨识边界 |
| 主文字 `text` | `#F5F7FF` | `#283327` | 标题/正文 |
| 次级文字 | `#C3CCDC` | `#4B5B46` | 说明 |
| 弱文字 | `#96A4C0` | `#5B6B55` | 时间/元信息 |
| 主按钮 `primary` | `#5368E9` | `#D3E985` | 仅真实操作与活动态 |
| Hover | `#465BD2` | `#C4DE6C` | 无独立第三品牌色 |
| **主按钮文字** | **`#FFFFFF`** | **`#283327`** | **Light 亮 Lime 不可配白字** |
| 链接 | `#92A6FF` | `#4A661B` | 可读正文链接 |
| 键盘 Focus | `#ACB7F8` | `#6C8A2A` | 3px 外环，`outline-offset:3px` |
| 弱强调背景/字 | 暗色蓝灰 / 浅紫 | `#E7F0C7` / `#465F18` | 元信息胶囊 |
| Dark 局部黄 | `#FBE13B` | **无** | Light 不混入独立金黄或蓝紫 |
| Error | `#FF8498` | `#AC334B` | 独立于品牌的真实错误状态 |

`docs/design-reference/LabourChain-Visual-Styles.reference.css` 采用 **`[data-lc-theme="dark"]`/`[data-lc-theme="light"]` 仅作示意**。其实际属性名、是否设置在 `html`、UI Host 或应用容器、首次选择与记忆方式需由现有主题状态方案决定；如没有已批准机制，Coder 应先提供可分别渲染的受控外观 Fixture，不擅自强加默认/持久化行为。

**数值检查基线（sRGB 设计计算）**：Dark 白字主按钮约 4.6:1；Light 深字/Lime 主按钮约 9.9:1、深绿链接/卡片约 6.4:1、输入强边线/输入底约 3.1:1、焦点/画布约 3.7:1。实际组件要按 Hover、Focus、Disabled、卡片不同背景重检；这些不是浏览器 D4 结论。

## 4. 从效果图提取的间距 / 尺寸 / 密度（D2 候选）

| 层级 | 设计目标 | 备注 |
| --- | --- | --- |
| 页面内容上限 | `max-width:1120px` | 当前 `RepoHome.module.css` 为 960px；变更需在视觉实施 PR 明示 |
| 长文 Feed 阅读栏 | `max-width:760px` | 文章保持单列；不把 markdown 媒体自动浮到旁边 |
| 页面左右边距 | ≥900px：32px；600–899px：24px；手机：16px | 设计断点仅供参考，与真实既有断点协调 |
| Hero | `padding:20–30px`，背景 `surface-raised`，弱阴影、14px 非对称角 | 标题建议 clamp(29px,3.6vw,38px)，说明可读 16px / 1.7–1.8 |
| Team 区 | 顶部约 28–36px 段落间距，整条内 12–16px | 头像 40px（手机 36px）、一行滚动、边线和浅层背景 |
| Repo Feed | 文章卡垂直间距 16px；卡片内约 20–22px，手机 16px | Issue 标题约 19px / 1.4，元数据约 13px，正文约 15px / 1.7 |
| 卡片外观 | `border:1px solid stroke`，约 14px 圆角，允许一角 4px | 可加 4px 顶部主色短横条；不要用粗霓虹描边 |
| 表单操作 | 主操作高度 ≥44px；输入边框用 `stroke-strong` | 输入错误附近有可读错误文字，不用颜色代替 |
| 细胶囊 | 约 5px × 10px 内边距，圆角 999px | 只显示真实存在的状态或标签；不据效果图新加 Issue 筛选 |

截图里的大幅 3D Hero、荧光边缘与人物肖像是**渲染表达**；工程实现优先上述可读结构与轻量样式，不需为了还原发光效果增加重依赖或下载专有图形。

## 5. CSS Modules 落地路径（不要求照搬文件名）

现有源码确认：

- `plugins/repo-home/src/RepoHomePage.tsx` → `RepoHome.module.css`：已有 `.page`, `.hero`, `.actions`, `.sectionHead`, `.strip`, `.feed`, `.branch`。可保留这些类名，调整语义 Token 与外观；仅当明确的真实交互需要时新增类。
- `plugins/repo-home/src/Team.tsx` → `RepoHome.module.css`：已有 `.avatar`, `.avatarLarge`, `.popover`, `.profile`；保留弹层位置计算、Hover/Focus/Tap/Escape 和失效头像回退。
- `plugins/repo-home/src/RepoIssueActivityCard.tsx` → `RepoHome.module.css`：已有 `.card`, `.cardMeta`, `.cardActions`；卡片强调条可 CSS `::before` 实现，不新增业务字段；`long` / `expanded` / Markdown preview 逻辑不改。
- `plugins/repo-home/src/SafeMarkdown.module.css`：现有引文、代码、媒体、预览 `max-height` 规则继续保留；换用对应主题的背景/边框/链接颜色，图片保持比例和原文次序。
- `plugins/issue-detail/src/IssueDetailView.module.css`：已有 960px 阅读区、`.summary`, `.tabs`, `.composer`；主题迁移不删 `aria-selected`、`:focus-visible`、`[hidden]`、表单权限提示。
- `apps/playground/src/style.css`：当前含旧版全局样式；**新增/修改的组件专属 CSS 必须进入对应 `*.module.css`**。全局文件仅可用于 Reset、跨组件设计 Token 或确实全局样式，禁止继续将新卡片样式塞进全局选择器。
- `plugins/topic-page/`（PR #64 当前未进入 main）：等待 Lead 安排后再对最新代码映射，不抢先改 #64 分支。

在实际业务组件上优先使用语义化 React `Link` / `a` 作导航、`button type="button"` 作局部状态或 `button type="submit"` 作表单。卡片不嵌套可点击导航、多个链接不叠层。新增主要组件/Hook 遵守 `AGENTS.md` 的具名 `@summary` 与业务逻辑/展示职责分隔。

## 6. Coder 分阶段实施建议（由 Lead 排期与批准）

**Phase A · Repo Home 可运行样式（首要）**

1. 在真实 UI Host/受控 Fixture 中提供 Dark/Lime 双主题可重复检查的外观范围（如已有受控主题接口直接沿用）。不要自行决定默认主题/持久化机制。
2. 在 `RepoHome.module.css` 与 `SafeMarkdown.module.css` 实施 Hero、Team、Feed、正文、按钮、链接、Focus、Loading/Error/Empty 主题样式；当前 GitHub 数据请求、分支切换、Markdown 展开和滚动加载保持原样。
3. 在 Playground 以现有 Fixture **独立装配 Repo Home 与必需依赖**，展示已知正常、无简介、成员缺失/错误、Issue 空列表/加载/失败/重试、极长 Markdown、图片/视频外链、320/375/768px + 200% 缩放（后者为用户 D4 检查项，Coder 只记录实际可测环境）。
4. Coder 输出 PR Diff、构建与已有业务测试结果；若无法进行浏览器操作，标注未实测，不声称 D4。

**Phase B · 五页视觉复用（独立排期）**

- 成员列表/登记与 Issue Detail 复用已稳定的双主题 Token、表面/按钮/输入/选中 Tab，不挪动业务字段、不改变授权结果。
- Topic Page #31 仅在 PR #64 业务分支稳定且 Lead 指定目标分支后迁移主题；真实主办方海报必须保留原始颜色与比例，项目卡仍 Flex 自适应换行。
- 所有新增视觉外观优先限于现有插件 CSS Module；跨业务复用 Token 即可，无真实复用需求前不新建共享 UI 框架。

### 6.1 Coder 交付与回归检查单

- [ ] Dark 蓝紫（`#5368E9`）与 Light Lime（`#D3E985`）均可在受控外观环境辨识；Light **没有**蓝紫/独立装饰黄。
- [ ] Light 主要按钮是**深字**，链接是深橄榄绿；聚焦边界在背景、卡片、输入上可见。
- [ ] Hero、Team 单行头像、Feed 单列正文与原先的数据/交互一致；没有固定截图假数据。
- [ ] Markdown 原顺序、预览展开/收起、真实站内详情与外部 GitHub 链接、失败重试及加载更多均无回归。
- [ ] 320/375/768px、200% 缩放无整页水平溢出；头像条可以局部横滚；表单可操作，长链接/代码块正确换行或局部横滚。
- [ ] Focus、Hover、Disabled、Loading、Error、Empty、成功状态都有可识别视觉表达；真实语义警告/错误不强制套品牌色。
- [ ] 未添加 PR 功能、固定分类筛选、虚构用户/数量/图片、额外 GitHub 请求、App 权限或依赖；PR 业务写入未经授权不试写。
- [ ] CI/构建与可执行 Playground 场景报告说明具体执行了什么；真实 Vercel/浏览器 D4 仍由用户检查，#51 不自动关闭。

## 7. 待产品/Lead 决定的点

1. **主题切换机制**：站点入口、首次默认、是否跟随系统以及偏好是否持久化，目前仅有 D2 建议，不能作为 Coder 已授权的 UX 行为。
2. **Hero 插画**：效果图中的复杂等距 3D 组合非现有仓库资产。先按无插画布局保证完整功能；若未来需要品牌插画，产品方另行批准原创资产规格。
3. **视觉容器扩宽**：1120px 与当前 960px 的取舍须依据实际内容、长文与用户视觉验收进行校准；保留 Markdown 阅读宽度优先。
4. **跨页排期**：当前截图仅覆盖 Repo Home 的 Dark/Lime 两种视觉；另外四页已在 D2 方案中定义了布局，但**并无对应高保真图片**。Phase B 先依据共用 Token 做视觉一致性，未确认部分可返还 Designer。
5. **图像交付**：两张效果图原件由本对话生成，**GitHub 文档仓库本次未存储二进制截图**。此 Markdown 将布局、Token 与组件拆分作为可持久引用的开发交接依据。

**实施时的权威顺序**：最新用户明确决定 → 已合并的主题/五页设计基线 → 本交付中的视觉规则 → 已有业务契约与 `AGENTS.md`。遇到产品行为/工程范围冲突，不得直接照搬概念图覆盖业务规则。
