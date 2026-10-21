# GitHub App × Vercel 最小实验

状态：JWT 与安装令牌请求格式已通过本地模拟测试；真实 GitHub App 注册、GitHub API 调用及 Vercel 部署仍未验证。

## GitHub App 注册

GitHub Settings → Developer settings → GitHub Apps → New GitHub App。

- App name：使用唯一实验名称，例如 `labourchain-board-dev-...`。
- Homepage URL：本仓库 URL，后续可改为实际网站。
- Callback URL：未来的 `https://<your-domain>/api/github-callback`；本实验尚未实现用户 OAuth 回调。
- Webhook Active：关闭（目前不需要 Webhook）。
- Repository permissions：Issues = Read & write；Metadata = Read（默认）。Contents 仅在后续配置写入实验时申请。
- Account permissions：初期不申请。
- Installation scope：Only on this account，安装时选择本仓库。
- 注册后保管 App ID、Client ID、Client Secret、Private Key（PEM）；安装后记录 Installation ID。

同一 App 支持 User access token 和 Installation access token。Client Secret 用于用户授权 code 交换，Private Key 用于 App JWT；不要混淆。不得把密钥写入 Git、浏览器或日志。

## Vercel Functions

当前仓库还没有 Vercel 项目。此实验隔离于 `experiments/github-app-auth/`，不会自动生成 Vercel Function 路由。部署时可将 `api/github-app-poc.mjs` 放入 Vercel 项目根目录的 `api/`，或将该实验目录配置成 Vercel Root Directory，并确认路由生成。

服务端环境变量：

```text
GITHUB_APP_ID=<app id>
GITHUB_APP_PRIVATE_KEY=<PEM; literal newlines or escaped \n>
GITHUB_INSTALLATION_ID=<installation id>
POC_CHECK_SECRET=<high-entropy random secret>
```

后续用户授权还需 GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、SESSION_ENCRYPTION_KEY、PUBLIC_BASE_URL。本实验**没有实现**用户 OAuth、Cookie Session 或自动刷新。

配置部署后，以受控请求调用 GET /api/github-app-poc?action=bot-check，传 `x-poc-check-secret` 请求头。Function 生成 JWT，换取限于本仓库且仅 `issues:write` 的安装令牌，然后读取仓库元信息。它不会回传 token，也不会写入 Issue。密钥不能通过查询参数传递。

## 本地模拟测试

Node.js 20+，在本目录执行 `node --test tests/*.test.mjs`。只验证 JWT 签名和 GitHub 令牌请求格式，不能替代真实 API 测试。

## 尚未验证的真实闭环

- 在 GitHub 注册并安装 App，仅授权此仓库。
- 将环境变量配置到 Vercel，并调用只读 Bot 检查。
- 增加 User OAuth Web Application Flow（state + PKCE，回调 code 交换，安全 Cookie），再验证 /user 身份。
- 经明确确认后，分别以 User、Bot 身份向固定测试 Issue 发表评论，并验证显示的作者。
- 写入实验必须限制仓库、Issue、调用者、CSRF/Origin 及重放，不能提供开放式 Bot 写入代理。

官方文档：

- https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- https://vercel.com/docs/functions/runtimes/node-js
