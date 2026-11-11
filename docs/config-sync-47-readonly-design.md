# Issue #47 · Config 与 Label 同步：只读切片及待决架构

**任务来源**：[Coder Member #54 Request](https://github.com/Ri0n72Y/hackathon-platform/issues/54#issuecomment-6759882182) · [Work Issue #47](https://github.com/Ri0n72Y/hackathon-platform/issues/47) · MVP Product Spec §§3/5/6/11 · AGENTS.md。

**本 PR 仅实现安全只读、保守校验与差异预览；不提供 Config/Label 写入能力。** 产品目标为初始化/维护同一固定的 `labourchain.config.yaml`，只有在仓库级唯一同步分支生效后才能修改普通 Issue 的受管 Label 关联。配置同步分支与展示分支独立。

## 设计来源与未决事项

- GitHub App Installation 是仓库接入的唯一依据，必须是目标公开仓库。Config 缺失需要初始化，但不会取消接入，也不会阻断主页正常阅读。
- namespace **缺失**：不管理；**非空**：管理有效前缀值；**显式空列表**：建议从普通 Issue 清除该前缀的关联。
- Label 名字通过完整的 `namespace:` 前缀判断（例如 `foo:` 不匹配 `foobar:`）。仅提出创建缺失的仓库级 Label 定义、删除普通 Issue 上受管的无效关联；不修改 PR、不删仓库级 Label 定义、不动未受管命名空间。
- [实施前方案和三项待审决策](https://github.com/Ri0n72Y/hackathon-platform/issues/47#issuecomment-6760018056) 已向 [Lead Member #53](https://github.com/Ri0n72Y/hackathon-platform/issues/53#issuecomment-6760020972) 发出 Request：
  1. 全仓库唯一同步分支的持久指针、无 `main` 的安全处理；
  2. OAuth 用户 / Bot 的 Contents、Pull requests、Issues Write 身份权限；
  3. 手动同步、高影响确认、Webhook 候选、失败恢复机制。
- **未批准前不实现**：新的仓库配置数据库/文件、默认分支自动回退、写入权限扩展、受保护分支绕过、同步写入、持久队列、Webhook 或自动重试任务。

## 当前已实现模块

| 模块 | 职责 |
| --- | --- |
| `plugins/repo-config/src/domain.mjs` | 保守解析受支持的命名空间列表子集；对完整 GitHub 快照生成纯 Label diff |
| `api/_repo-config-preview.mjs` | 使用现有公开仓库/Installation 读取链路取得 Config、同步分支 HEAD、文件 SHA、Label 和普通 Issue 全分页；不注册公开 Function |
| `tests/config-preview.test.mjs` | Node 隔离 Mock：有效/无效 Config、列表、前缀、PR 排除、分页、权限、读错与安全失败 |
| `tests/installation-probe.test.mjs` | 将测试纳入现有 npm 脚本，不修改 CI 配置 |

**YAML 子集限制：** 产品规格 §14 未冻结完整 Schema。当前只接受以 `namespaces:` 为唯一根的简单列表，支持缩进两空格的命名空间、四空格的条目和 `[a, b]` / `[]` 列表；条目采用标识符或 `<namespace>:<标识符>` 的形式。支持独立注释行，但未支持任意内联注释、Map、YAML anchor/alias、展示元数据或复杂字符串。示例：

```yaml
namespaces:
  status:
    - todo
    - doing
    - review
    - done
    - archived
  channel: [wishlist]
  foo: []
```

严格遵守 YAML 块映射键后的分隔规则：`foo: []` 是有效空列表；`foo:[]`、`foo:[bar]` 缺少冒号后的分隔空格，必须 `invalid_config`，不能当作删除 Label 关联的许可。相应解析与仓库只读快照均有 B1 回归测试。

**它是只读 Diff 的保守支持集，不是最终 YAML Schema 规范。** 已有其他合法业务字段的 YAML 在本切片会被报告 `invalid_config` / unsupported；绝不把未知格式默认为无管理、空列表或清理授权。完整字段及展示方式仍需单独确认并扩展 Schema 后才能进入写入阶段。缺失文件返回默认命名空间建议文本，**不会将建议立即变为已生效配置**。

### 只读流程

```text
GET GitHub repository + dynamic GitHub App Installation 校验（原 issueReadAccess）
   → GET /repos/{owner}/{repo} 并核实 public + full_name
   → GET /branches/{syncBranch}（默认 main，必须真实存在）
   → GET /contents/labourchain.config.yaml?ref={syncBranch}
   → 缺失：config_missing + defaultPreview，无 Label 变更
   → 无法安全解析：invalid_config，无 Label 变更
   → GET /labels?per_page=100&page=N（读完所有页，最多 50）
   → GET /issues?state=all&per_page=100&page=N（读完所有页，最多 50）
   → 只对不是 pull_request 的真实 Open/Closed Issues 生成差异
   → 返回 branch、HEAD SHA、Config Blob SHA、待创建 Label/待移除 Issue 关联及影响数量
```

默认本函数限制每类资源最多 10 页（每页 100 条），调用方可在 1–50 页间显式调整。尚有下一页时返回 `snapshot_incomplete`，`plan:null`；不会拿部分数据做完整变更计划。429/403/5xx 保留为失败，不能隐式转换为 Config 缺失。无 main 返回 `sync_branch_missing`，绝不退回展示分支/浏览者本地选择。

只读结果永久标记 `canApply:false`；即使 `plan.state=changes` 也**不提供执行路径**。GitHub App Installation token 的创建在 GitHub API 上是 POST，但只是取得 repo-scoped 的只读临时访问令牌；实际仓库操作全部为 GET。代码没有对 Label、Issue、Config 发任何变更请求。

## 未来端到端流程（需先批准）

1. **明确权限、同步分支指针和写入身份。** 仅用仓库级唯一指针，展示分支切换或未合并的维护 PR 不影响全局 Labels。
2. **初始预览：** 显示 GitHub HEAD 与文件 SHA、当前受管命名空间、待创建定义、受影响 Issue 及高风险清理；无差异不产生 Commit/PR。
3. **显式提交：** 写入前再次验证 OAuth 用户、Installation、目标 repo/branch、规则和 Config SHA。能直写则 Commit；分支受保护时创建受限维护分支及供维护者审核的 PR，绝不自动合并或绕过限制。
4. **生效后同步：** 只有 Config 被确认合入唯一同步分支后才能重新读取最新 HEAD/Blob/Labels/普通 Issues，重算差异并有界分批应用。待合并 PR 不触发仓库标签变更。
5. **可恢复错误：** `sync_pending → syncing → ready/partial_failure`；每一步核对当前 GitHub 数据，记录成功/失败项并支持人工重新读取重试。冲突、限流、超时或中途失败不标记 ready；无持久队列时不承诺自动最终一致。

## Mock 与验收覆盖

`node --test tests/config-preview.test.mjs`（被 `npm run test:installation` 引入）检查：

- Config 缺失提供默认文本、已有配置解析、显式 `foo: []` 与未声明 `foo` 的差别；
- 不支持的 YAML/重复键/别名/坏编码/超大文件 fail-closed；
- 仓库级 Label 仅计划创建缺失定义；清理普通 Open/Closed Issue 上的受管无效关联；
- `foo:` 不误匹配 `foobar:`，不触及未受管标签，不处理返回的 Pull Request；
- 全分页与超过上限的安全失败，缺失同步分支无回退；
- 非公开/未授权、429/其他 GitHub 失败不伪装成功；预览不提供写入方法；
- 无变化为 `no_changes`，再次读取相同状态不会生产重复操作。

**Playground / 真实 GitHub / Vercel**：本切片没有 UI、Cordis 插件注册或公开 Function 路由，故没有可操作 Playground 页面。Mock 仅验证普通纯数据和读取 helper；不构成完整初始化/维护 UI 闭环。正式 UI、权限回路、写入失败恢复及 Vercel 线上验证等待架构决策后的实施 PR。真实仓库写入、权限扩展和 Webhook 均未执行。

## 实际检查记录

按 PR 最新提交运行 `npm run build`、`npm run test:installation` 和 `node --test tests/router-fallback.test.mjs`；完整结果应以同一 Head 的 GitHub Actions 为准。无法执行的行为列为未验证，不能用本文复现步骤替代实际证据。
