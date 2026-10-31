# LabourChain / Hackathon Platform

本仓库开发面向黑客松团队和开源社区的 GitHub 项目协作界面，包括项目发现、Issue 看板、频道讨论和基础劳动记录。

## 工作依据

- 从当前任务和相关代码入手。涉及产品行为、领域模型或验收条件时，按需查阅 [MVP 产品说明](docs/LabourChain-MVP-Product-Spec.md) 的相应章节。
- 产品规格描述目标行为，代码反映当前实现；已实现不等于已在实际环境验证。研究方案和技术建议不自动成为项目规范。
- 保持修改与任务相符，优先沿用已有实现。涉及产品范围、核心架构、数据语义或安全权限边界的实质变更，先说明理由与影响并取得确认。

## 产品与技术边界

- 前端使用 React、Vite 和 Cordis，部署在 Vercel；需要服务端能力时使用 Vercel Functions。Cordis 负责插件与服务组织，React 负责界面。
- GitHub 是仓库、Issue、评论、Commit 及配置数据的权威来源。MVP 仅支持公开 GitHub 仓库，不建设在线业务数据库、常驻 Worker、持续 Webhook 同步或完整劳动链协议。
- MVP 处理 GitHub Issue，不实现 PR 功能。GitHub Issues API 可能返回带 `pull_request` 字段的 PR，必须识别并排除。
- 每个被挂载的 GitHub 仓库在其根目录提供 `labourchain.config.yaml`，由其中的 `status:*` 和 `channel:*` 等配置驱动看板与频道。只管理配置声明的 Label 命名空间；不改动无关标签，也不自动删除仓库级 Label 定义。具体有效性和同步规则见产品规格。
- GitHub 写入采用 GitHub App 用户授权，以当前用户身份执行并遵守其实际权限。服务端验证会话、目标仓库与操作权限；App 私钥、令牌和其他服务端秘密不得暴露给前端。
- GitHub API 写入可能失败或部分完成；界面应反映权威结果，并提供可理解的失败反馈，不把未经确认的本地变更当作已持久化。

## Cordis 插件与 React 开发约束

- **薄核心、业务插件：** 应用入口只负责创建 Cordis Context、装配/释放插件及 React Root，不在 Bootstrap 中实现项目、频道或 GitHub 业务。以**可独立验收的业务功能**划分插件；一个功能可贡献多个页面与组件，不必每个 URL 或组件建一个插件，也不把多个独立业务闭环合成大插件。Playground 应能按业务功能组合真实依赖或受控替身进行验收，不复制生产实现。
- **运行时分离：** 浏览器内由 Cordis 管理插件/服务和生命周期；服务端使用普通 Vercel Functions，**不创建第二套 Cordis 运行时**。跨浏览器/服务端只共享适用的普通领域解析或校验代码，不共享 `ctx` 或 React 组件实例。
- **服务与依赖：** 插件使用 Cordis `inject` 声明必需服务，消费其他插件的公开方法、类型和可观察数据；不运行时导入提供方的具体业务实现，不用启动顺序代替依赖声明。普通业务函数、单个按钮和 View 不单独包装成插件。跨插件需要时使用类型级 `import type`；无真实消费者前不新建通用契约平台。
- **UI 和生命周期：** 共享 React UI Host 管理唯一 React Root；业务插件通过 Cordis UI 注册能力贡献组件，不在各业务插件里另建 React Root。注册、监听和其他副作用随 Cordis 生命周期撤销（优先 `ctx.effect()`）；需要跨插件观察的数据由服务提供稳定的 `getSnapshot/subscribe`，React 按需以 `useSyncExternalStore` 订阅，再通过 props 驱动展示。具体页面路由和注册接口属于相应功能的架构方案，不在通用开发规范中另行冻结。
- **组件职责：** 一个 TSX/JSX 文件以**一个主要功能组件**为中心，允许在**同一文件**定义其私有 `*View`、props 类型和必要辅助函数。业务复杂时，外部功能组件负责业务 Hook、Store/Service、请求、业务状态与操作编排；私有 View 通过 props 接收显示数据和回调，只处理 JSX、样式与局部视觉状态（如 hover、展开和动画），**不直接发起业务请求或依赖业务 Store**。纯展示或简单组件可只有一层，不强制制造 View 或无意义的额外文件。只有真正复用或独立维护需要时再拆文件。
- **样式强制规则：** **所有新建或修改的业务 React 组件样式必须使用 CSS Modules（`*.module.css`）**，组件通过 `import styles from './Component.module.css'` 等方式引用类名。不得继续向全局 `style.css` 添加组件专属样式；全局 CSS 仅承担 reset、全局设计 Token 和确实跨组件的基础样式。已有原型的全局样式无需为无关任务整体迁移；修改某组件的样式时，应把本次涉及的组件专属样式转为 CSS Module。
- **语义化交互：** 导航到可直接访问、可复制 URL 的页面或资源，用真实 `<a href>` 或 React Router `<Link>`；执行操作、切换局部状态或提交表单用 `<button>`，非提交按钮标注 `type="button"`。不把普通导航做成 `button + navigate()` 或 `<a href="#">`；不要嵌套链接与按钮，保留浏览器新标签页与键盘行为。
- **可索引的源码：** 顶层具名组件、Hook 和承担独立职责的函数使用简短、准确的标准 JSDoc `@summary` 说明职责；局部回调及职责显而易见的简单辅助函数可省略。类型由 TypeScript 表达，不写重复类型注释。职责变化时更新注释。
- **业务插件 PR 验收：** 新增或实质修改业务功能插件时，开发 PR 必须说明如何在 Playground **单独装配该功能及其必要依赖**（可使用真实共享服务或受控替身），列出要验证的业务行为、成功/失败路径，并报告实际执行结果及未验证部分。仅展示组件渲染不等于验证业务闭环；模拟结果不能替代真实 GitHub/Vercel 集成验收。Playground 验收场景随相应业务 PR 落地，不要求提前建设通用测试平台或额外静态检查工具。

React 组件细则参考 [React Component Coding](https://github.com/Ri0n72Y/agent-identity/blob/main/.agents/skills/react-component-coding/SKILL.md)，审查参考 [React Component Review](https://github.com/Ri0n72Y/agent-identity/blob/main/.agents/skills/react-component-review/SKILL.md)；导航语义参考 [Links vs. Buttons](https://github.com/Ri0n72Y/agent-identity/blob/main/.agents/skills/frontend-development/references/links-vs-buttons.md)。上述**本仓库已明确的规则以本文件为准**；外部参考不自动引入其他强制要求。

## 工程入口

- `apps/playground/`：当前 React/Vite 应用入口。
- `plugins/react-ui/`、`plugins/repo-issues/`、`plugins/repo-panel/`：现有 Cordis 服务及 UI。
- `api/`：Vercel Functions，处理 GitHub 访问、授权及 Issue 操作。
- `docs/`：产品规格与技术研究；`package.json`、`vite.config.ts`、`tsconfig.json`：项目构建配置。

`npm run dev` 仅启动 Vite 前端；`npm run build` 执行 TypeScript 检查和 Vite 构建。涉及 Functions 的完整行为需要相应服务端运行环境验证。

## 修改与交付

- 根据现有职责组织代码，避免为未出现的需求提前拆包、引入框架或重构无关部分。
- 执行与变更相关的可用检查，说明实际结果和未验证的部分；静态检查不能代替 GitHub 授权、真实写入或部署环境的验证。对真实业务仓库进行验证性写入，必须得到当前任务的明确授权，并遵守其操作范围。
- 向上游仓库贡献时，在独立分支提交有界改动，通过 PR 说明变更、验证证据和待决事项。需要独立 Review 时由未参与实现的人检查最新修订。
