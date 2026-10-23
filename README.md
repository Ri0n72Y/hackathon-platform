# LabourChain 最小 React + Cordis Issue 浏览器

在 Vercel 的 `hackathon-platform` 项目使用仓库根目录。Vite 入口位于 `apps/playground`，Cordis 插件位于 `plugins/`，函数位于根目录 `api/`。

依照 [React + Cordis Web 指南](https://github.com/Ri0n72Y/agent-identity/blob/main/library/react-cordis.md) 分离 React Root、Cordis 组件注册、数据服务和页面组件。

使用 GitHub App **Installation** 授权。Vercel 服务端变量：`GITHUB_APP_CLIENT_ID`（或 `GITHUB_APP_ID`）、`GITHUB_APP_PRIVATE_KEY`、`GITHUB_INSTALLATION_ID`。App 必须已安装到目标仓库并具有 Issues Read 与 Metadata Read 权限。不要设置任何 `VITE_*` 凭据。

- `GET /api/repos`：返回该安装授权范围内的公开仓库（最多 500 个）。
- `GET /api/issues?owner=...&repo=...`：返回目标仓库前 100 个 Open Issue，过滤 PR。
- `npm install && npm run build`：构建网页。
- `vercel dev`：本地同时运行网页和 API；`npm run dev` 只提供 Vite 前端，需自行启动 3000 端口上的 API。

当前 Issue 浏览器仍为 Installation 身份的只读功能；User OAuth 入口正在独立 PR 中接入，不涉及 Issue 写入、私有仓库或跨仓库代理。请求的仓库必须来自安装授权列表。Function 不返回安装令牌。Issue 列表暂时只读取第一页。

### GitHub App User OAuth（独立登录验证）

手动在 GitHub App → General → Callback URL 添加：
`https://hackathon-platform-sigma-drab.vercel.app/api/github-callback`。入口地址为
`https://hackathon-platform-sigma-drab.vercel.app/api/github-login`。使用已有的生产域名，不能将预览域名当成同一回调地址。

在 Vercel Production 的 Environment Variables 中手动配置：

- `GITHUB_APP_CLIENT_ID`：已有的 GitHub App Client ID，**不是** App ID。
- `GITHUB_APP_CLIENT_SECRET`：GitHub App → General → Client secrets 新生成的机密。
- `GITHUB_OAUTH_CALLBACK_URL`：`https://hackathon-platform-sigma-drab.vercel.app/api/github-callback`，必须与 GitHub App 中配置的 URL 完全一致。
- `GITHUB_OAUTH_COOKIE_KEY`：32 字节随机密钥的 base64url 编码；可在可信的本地终端运行 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` 生成，作为敏感环境变量保存。

已有只读 API 的 `GITHUB_APP_PRIVATE_KEY`、`GITHUB_INSTALLATION_ID` 等保持不变。不要把 Secret、Cookie key 或用户 token 放入 `VITE_*`、GitHub 仓库或浏览器 JS。

登录流程：访问 `/api/github-login` → GitHub 授权 → `/api/github-callback` → 重定向主页。使用随机 state、PKCE S256、10 分钟有效的短期加密 Cookie 与服务端 code 交换；登录成功后只设置 `HttpOnly; Secure; SameSite=Lax` 的 AES-256-GCM 加密会话 Cookie。会话最多保留 8 小时；本阶段不保存刷新令牌，过期需重新授权。当前主页尚无登录状态 UI，用户身份读取、授权仓库检查、写入及登出/刷新流程属于后续任务。

GitHub App 中如启用了「Request user authorization (OAuth) during installation」，应避免依赖它直接完成此 PKCE 登录；请使用上述显式入口，以保证先设置 state / verifier Cookie。
