# React Router × Cordis：页面注册与组件获取方案（已选定）

> 2026-10-28 · **用户已确认以本方案为实施基础，不要求为选型另做独立实验**。本文是已选定的架构方向与实施参考；**不等于已经实现或通过实际环境验收**。遵守 Ponytail：沿用当前 `ReactUIService`，不照搬 DSH 的完整 Slots、插件模块加载器或服务端 Router。

## 1. 目标与边界

- URL 是仓库与页面身份来源：`/`、`/:owner/:repo`、`/:owner/:repo/kanban`、`/:owner/:repo/issues/:number`。URL 中的 `owner/repo` 决定仓库，普通 Filter/排序由 Query 承载。
- 一个浏览器 **React Root + Router**；页面功能由不同 Cordis 插件贡献，可在 Playground 按功能装配、卸载，不因 URL 数量强制一个页面一个插件。
- Router 只做**路径匹配/导航/渲染**，不持有 GitHub 数据、不负责 OAuth 权限、不重复建立仓库选择状态；现有 API / `repoIssues` 按 URL 对应仓库读取。
- 首页 Board 预览和独立 Kanban 共享 Board 领域逻辑；Issue 劳动历史只在 Issue 详情加载，不带入 Board。
- 本文讨论 **浏览器进程内的组件引用注册**。Cordis `ctx` 不跨 Vercel Function 传 React 对象，业务展示组件也不应直接接收整个 Cordis Context。

## 2. 外部依据：哪些已经验证

### 2.1 DSH：Cordis 插件贡献 React UI，**不是** React Router 参考实现

1. [DSH Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-client.md) 描述独立浏览器 Cordis 插件、Slots 组合及集中渲染。
2. [`ui-layout/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/src/client/index.ts) 在 `apply(ctx)` 中用 `ctx.slots.register({ name: 'root', ... }, AppFrame)` 注册 React 组件。
3. [`ui-chat/src/client/apply.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/apply.ts) 使用 `ctx.slots.inject()` 和 `ctx.slots.register()` 为其他插件声明的 UI 区域贡献视图。
4. [`ui-renderer/src/client/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-renderer/src/client/index.ts) 集中调用 `createRoot` / `hydrateRoot`；[`registry.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-renderer/src/client/registry.ts) 将注册纳入 `ctx.effect()` 生命周期。
5. [DSH Slots 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/slots.md) 明确组件不直接接收 `ctx`，业务服务留在插件 `apply` 闭包，向组件暴露必要 props、回调或可观察源。

**调查边界：** 在 DSH 仓库默认分支的源码检索中，未发现 `react-router`、`BrowserRouter`、`useRoutes` 的直接用例；DSH 主要通过自己的 Slot/Panel 机制组合和选择 UI。**所以它证明“ctx 注册与获取组件”可行，不证明 React Router 集成已经被 DSH 原样验证。**

### 2.2 React Router：采用 Declarative Mode 的公开 API

- [Declarative Mode 安装](https://reactrouter.com/start/declarative/installation)：入口中用 `<BrowserRouter>` 包裹应用。
- [useRoutes](https://reactrouter.com/api/hooks/useRoutes)：可在 React 树内接受动态 `RouteObject[]`，返回匹配页面元素；比业务插件各自建 Router 更合适。
- [路径参数与 Query](https://reactrouter.com/start/declarative/url-values)：在被匹配组件内使用 `useParams()`、`useSearchParams()`；`Link` / `useNavigate` 用于导航。
- [三种模式](https://reactrouter.com/start/modes)：Data/Framework Mode 的 Loader、Action、框架特性并非本 MVP 的当前需求；GitHub 数据获取继续由现有 API/Cordis 能力处理。

**结论：** 不需要每个业务插件自己实例化 `BrowserRouter`，也无需为 React Router 额外建设 Cordis 服务。**统一 Router 是 UI 宿主的内部实现**，插件仍经 `ctx.reactUI` 提供组件。

## 3. 采用的最小方案（实现时按需落地）

```text
apps/playground 或正式浏览器入口
  └─ 唯一 createRoot
       └─ 唯一 <BrowserRouter>
            └─ <App ui={ctx.reactUI}>
                 └─ useSyncExternalStore(ui.subscribe, ui.getSnapshot)
                      ├─ page 注册项 → useRoutes() → 当前 URL 的 Page
                      └─ 普通组件注册项 → 页面内按 ID 取组件（按需）
```

### 3.1 由插件注册页面；Router 统一获取组件

当前 `plugins/react-ui/src/index.tsx` 已有 `ctx.reactUI.register(id, ComponentType)`、稳定 `getSnapshot()/subscribe()`、`ctx.effect()` 卸载回收。**扩展这个服务即可，不要另建全局 Router 注册框架。**

最小接口示意（**方案已确认，方法签名不是现有 API；实现时可做等效调整**）：

```ts
type PageEntry = { id: string; path: string; Component: React.ComponentType }

// 基于现有 ReactUIService 扩展：
registerPage(entry: PageEntry): () => void
// 非页面位置沿用现有 register(id, Component)；仅按真实消费需求补最小读取入口。
```

业务插件例如 Board 负责提供 `/:owner/:repo/kanban` 的 `KanbanPage`：

```tsx
// 示例：业务插件内部（待实现的注册 API）
const issues = ctx.repoIssues
function KanbanPageEntry() {
  const { owner, repo } = useParams()
  return <KanbanPage service={issues} owner={owner} repo={repo} />
}
ctx.effect(() => ctx.reactUI.registerPage({
  id: 'board.kanban',
  path: '/:owner/:repo/kanban',
  Component: KanbanPageEntry,
}))
```

`KanbanPageEntry` 以闭包捕获必要的数据服务，`useParams()` 必须在 Router 管辖的 React 组件内部调用。参数缺失/无效时显示错误状态；路径参数**不能代替** Function 的权限检查。

宿主通过已有 `useSyncExternalStore` 得到**注册表快照中的组件引用**，并用 `useRoutes` 按 URL 渲染（示意）：

```tsx
function RoutedPages({ ui }: { ui: ReactUIService }) {
  const entries = useSyncExternalStore(ui.subscribe, ui.getSnapshot)
  const routes = entries
    .filter(isPageEntry)
    .map(({ path, Component }) => ({ path, element: <Component /> }))
  return useRoutes([
    ...routes,
    { path: '*', element: <NotFound /> },
  ])
}

// 唯一浏览器入口的 React Root 内
<BrowserRouter>
  <RoutedPages ui={ui} />
</BrowserRouter>
```

这里 `isPageEntry` / `NotFound` 是示意辅助逻辑。页面路径属于注册表元数据；**Router 不从某业务插件 import 具体 React 页面**。注册/撤销导致快照更新，`useSyncExternalStore` 触发重新匹配。已存在的 `register()` 可以在过渡期间保留；不要求现有 Playground 一次性迁移所有页面。**不再为选择这套机制另做独立 PoC；直接作为功能实现的技术基础。**

### 3.2 首页如何获得另一个插件的 BoardPreview

**页面注册**（把 `KanbanPage` 映射到 URL）与**嵌入组件**（首页插入 `BoardPreview`）不是同一需求。

最小候选：仍使用 `reactUI` 的**按名称组件注册**，Board 插件贡献 `board.preview`，仓库首页插件在自己的组件树中订阅并读取该名称对应的 `ComponentType`；注册表变化后重新渲染，注销后移除该区域。旧 `register(id, Component)` 可以担当贡献入口，UI Host 不再将所有普通注册项一股脑渲染。若需便利函数，可在 `react-ui` 内增加一个读取 Hook，例如 `useRegisteredUI(ui, 'board.preview')`（**接口示意，具体名称按实现需要确定**），该 Hook 从 `getSnapshot/subscribe` 读取，不把整个 Cordis `ctx` 放进 React props，也不让首页插件运行时依赖 Board 实现模块。

```text
Board 插件 ── registerPage('board.kanban', KanbanPage) ──> Router 渲染
          └─ register('board.preview', BoardPreview) ────> RepoHome 取组件后嵌入
```

某区域缺少插件时允许显示空态/入口，不建立组件注册循环依赖。**暂不引入** DSH 的 slot 定义所有权、chain、Store seat、跨包动态模块系统；如果第二个真实区域需要复杂多个贡献者，才复查是否提炼最小区域注册 API。

### 3.3 生命周期与冲突约束

- 页面插件仅依赖 `reactUI`（及其实际使用的基础服务），在 `apply` 内注册并通过 `ctx.effect()` 回收，遵守 Cordis 的 `inject` 机制。
- 每个页面注册需唯一 `id` 和唯一 `path`；重复注册应明确报错，而不是静默覆盖。更复杂的通配路由冲突留到实际出现时评估；`*` 404 属于宿主。
- 插件卸载时撤销页面/组件注册；若用户仍停留在该路径，显示没有可用页面的反馈，不创建第二个 React Root。
- `/:owner/:repo`、`/:owner/:repo/kanban`、`/:owner/:repo/issues/:number` 可以来自不同功能插件；一个功能插件也可以贡献多个页面或非路由组件。**不是“一 URL 一插件”**。
- 浏览器刷新直接访问深层 URL，要求部署层将非 `/api/*` 的前端路由送回 SPA 入口，且不吞掉 API/静态资源；当前仓库未见 `vercel.json`，**不声称生产深链 fallback 已验证**。
- URL 的 namespace/filter/sort 参数按已有业务规则管理；Router 不另设视图状态库；GitHub 写入后仍接受已确认的读取延迟。

## 4. 为什么不选其他方案

| 方案 | 结论 |
| --- | --- |
| 每个业务插件各自创建 React Root / BrowserRouter | 多 Router 与导航上下文相互割裂，不采用 |
| 所有业务页面、Board/Issue/Channels JSX 都集中到一个 UI 大插件 | 妨碍独立装配、独立验收，不采用 |
| 共享 Router + Cordis 页面注册 + 按名称取可复用组件 | **已选定的实施方案** |
| 直接移植 DSH 的完整 Slots/Client Modules | 超过当前需求，暂不采用 |
| 使用 Data/Framework Mode 的 Loader/Action 取代现有 API 数据访问 | 会引入重复职责，当前没有必要 |

## 5. 实施验收边界（不设独立实验前置门槛）

方案已选定，**无需单独创建 Router PoC 或实验任务**。开发相应页面时按常规工程质量要求检查：页面注册及卸载、唯一 ID/路径冲突、从 URL 读取仓库/Issue 参数、Filter/排序的浏览器历史与直接刷新、首页按名称嵌入 BoardPreview、无插件或路径不存在的回退，以及 Vercel 深层 URL 不吞掉 `/api/*` 或静态资源。这些是**实现验收项，不是继续选择 Router 架构的条件**。

**阶段结论：** DSH 和当前仓库静态源码确认了通过 `ctx` 的服务注册 React Component 的合法性；**已决定使用统一 React Router + 当前 `ReactUIService` 动态页面/组件注册**作为实施基础。尚未编写新 Router 代码或完成运行验收；不再要求架构选择前单独实验。
