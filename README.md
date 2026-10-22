# LabourChain 最小 React + Cordis Issue 浏览器

在 Vercel 的 `hackathon-platform` 项目使用仓库根目录。Vite 入口位于 `apps/playground`，Cordis 插件位于 `plugins/`，函数位于根目录 `api/`。

依照 [React + Cordis Web 指南](https://github.com/Ri0n72Y/agent-identity/blob/main/library/react-cordis.md) 分离 React Root、Cordis 组件注册、数据服务和页面组件。

使用 GitHub App **Installation** 授权。Vercel 服务端变量：`GITHUB_APP_CLIENT_ID`（或 `GITHUB_APP_ID`）、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_INSTALLATION_ID`。App 必须已安装到目标仓库并具有 Issues Read 与 Metadata Read 权限。不要设置任何 `VITE_*` 凭据。

- `GET /api/repos`：返回该安装授权范围内的公开仓库（最多 500 个）。
- `GET /api/issues?owner=...&repo=...`：返回目标仓库前 100 个 Open Issue，过滤 PR。
- `npm install && npm run build`：构建网页。
- `vercel dev`：本地同时运行网页和 API；`npm run dev` 只提供 Vite 前端，需自行启动 3000 端口上的 API。

本阶段只读，无用户 OAuth 登录、Issue 写入、私有仓库访问或跨仓库代理。请求的仓库必须来自安装授权列表。Function 不返回安装令牌。Issue 列表暂时只读取第一页。
