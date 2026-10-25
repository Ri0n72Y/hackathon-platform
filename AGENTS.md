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
- GitHub 写入使用经授权的用户身份并遵守其实际权限。服务端验证会话、目标仓库与操作权限；App 私钥、令牌和其他服务端秘密不得暴露给前端。
- GitHub API 写入可能失败或部分完成；界面应反映权威结果，并提供可理解的失败反馈，不把未经确认的本地变更当作已持久化。

## 工程入口

- `apps/playground/`：当前 React/Vite 应用入口。
- `plugins/react-ui/`、`plugins/repo-issues/`、`plugins/repo-panel/`：现有 Cordis 服务及 UI。
- `api/`：Vercel Functions，处理 GitHub 访问、授权及 Issue 操作。
- `docs/`：产品规格与技术研究；`package.json`、`vite.config.ts`、`tsconfig.json`：项目构建配置。

`npm run dev` 仅启动 Vite 前端；`npm run build` 执行 TypeScript 检查和 Vite 构建。涉及 Functions 的完整行为需要相应服务端运行环境验证。

## 修改与交付

- 根据现有职责组织代码，避免为未出现的需求提前拆包、引入框架或重构无关部分。
- 执行与变更相关的可用检查，说明实际结果和未验证的部分；静态检查不能代替 GitHub 授权、真实写入或部署环境的验证。
- 在独立分支提交有界改动，通过 PR 说明变更、验证证据和待决事项。需要独立 Review 时由未参与实现的人检查最新修订。
