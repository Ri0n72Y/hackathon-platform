# PR #60 · Reviewer B1 回归验证

对应 Reviewer [PR #60 审查意见](https://github.com/Ri0n72Y/hackathon-platform/pull/60#issuecomment-6817030921) 与 [Coder Request #6817040312](https://github.com/Ri0n72Y/hackathon-platform/issues/54#issuecomment-6817040312)。

## B1-1 · Config 页跨目标隔离

React UI Host 对 Config 路由采用稳定注册 ID，`/:owner/:repo/config` 改变参数不会自动重建外层路由元素。现在 Config 插件在路由参数读取处给 **stateful ConfigPage Control** 绑定 `configTargetKey(owner, repo)`，令 React 同步销毁 A 的 Control 并创建 B 的全新 Control。旧实例持有的 `snapshot`、`content`、`result`、`confirmRemovals`、`pendingPr` 不会被 B 读取。旧 load/save/sync 的 AbortController 在卸载时取消；即便 API 不尊重 signal，异步完成也不能向新实例回填状态。

Node [config-route.test.mjs](../tests/config-route.test.mjs) 检查不同目标的 React key 不同、Control 从空状态初始化、路由属性在上层同步传递，以及卸载/请求完成前的 signal 隔离源码契约。这是**静态/组件身份回归**；本轮没有实际执行浏览器导航。

浏览器复现（等待真实运行）：
1. 用受控 Fixture 或指定隔离环境在 `/octocat/repo-a/config` 创建模拟维护 PR；A 显示 `awaiting_pr_merge`。
2. 不卸载 React App，通过 `Link` 导航到 `/octocat/repo-b/config`。B 的页面应从 loading/空状态开始，不能显示 A 的 PR URL、草稿、确认勾选或结果。
3. 模拟 B 的 `api.get` 失败；B 仅显示自己的错误，不能回退显示 A 快照或允许以 A SHA 保存。
4. 在 A 的 save/sync Promise 尚未完成时导航 B；A 的 AbortSignal 应被取消，晚返回不得污染 B。
5. 返回 A 时重新读取 A 的远端状态；未合并 PR 不自动同步 Labels。

## B1-2 · 部分写入后的复核失败

服务端把复核 main 的调用统一交由 `verifyMainAfterWrites`：正常且 HEAD/Blob 未变继续；变化或 GET 抛出 429、403、5xx、超时，则返回 `partial_failure`，保留 `createdLabels`、`removedAssociations`、`pending`、`failed[kind/stage/error/retryAfter]`，明确 `requiresRefresh:true`。后续写入停止。重试必须先读取 GitHub 最新状态重新计算，不能重复使用旧预览。

同轮补强 Config PUT 后的维护分支和 main 复核：即使 GET 异常，也保留已返回的 commit/file SHA、维护分支 URL 与失败信息，不用通用 HTTP 错误吞掉提交结果。

隔离测试覆盖：
- 创建首个仓库 Label 后 `GET /branches/main` 返回 429 + `Retry-After: 60`，保留已创建 Label 且不 DELETE；
- 删除 10 个 Issue 标签关联后 `GET /branches/main` 返回 503，保留 10 个成功项及当前组待重算计划；
- 维护分支 PUT 返回 Commit 后，复核 GET 返回 503，保留 Commit、分支 URL，不创建 PR；
- main 直接 PUT 返回 Commit 后，复核 GET 返回 503，保留 Commit/File SHA。

所有测试使用受控 fetch Mock；**没有真实 GitHub / OAuth / Vercel 写入或浏览器 D4 验收证据**。PR 保持 Open，等待独立 Code QA，不执行合并。
