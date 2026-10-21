# GitHub App 双身份认证与 Vercel Functions 部署调查

- 日期：2026-10-21
- 关联任务：[Issue #5](https://github.com/Ri0n72Y/hackathon-platform/issues/5)、[Issue #1](https://github.com/Ri0n72Y/hackathon-platform/issues/1)
- 性质：部署调查 + 文档内最小实验代码；不包含工程实现。
- 当前决定：**一个 GitHub App 同时提供 User 与 Bot 身份**。具体业务操作使用哪个身份留待交互设计逐项决定。
- 项目约束：React + Cordis、Vercel 静态站点与 Functions、公开 GitHub 仓库、首版只处理 Issue、不使用在线业务数据库。
- 验证状态：已核对官方文档和仓库现状；**尚未注册新 App、部署 Vercel Function 或执行真实双身份写入**。以下示例代码仅为待运行的只读验证样例。

## 1. 先明确：注册一次 GitHub App 即可提供两类令牌

| 身份 | 用途 | 获取条件 | GitHub 操作归属 |
| --- | --- | --- | --- |
| User access token | 代表授权用户调用 API | OAuth Web Application Flow，用户同意授权 | 用户；仍受 App 权限、安装仓库范围、用户权限限制 |
| Installation access token | 代表已安装的 App 调用 API | App 私钥签 JWT，再换取安装令牌 | `APP-NAME[bot]` |
| App JWT | 不是普通业务写入令牌 | App ID / Client ID + 私钥 | 用于 App 自身 API 与换取安装令牌 |

App JWT 最多签发至当前时间之后 10 分钟；安装令牌有效期约 1 小时。用户令牌默认约 8 小时，开启过期功能时还有刷新令牌。**安装成功不等于某位用户完成授权，用户授权成功也不等于 App 已安装于目标仓库。**

## 2. 在 GitHub 注册 App：实际操作清单

入口：[GitHub App 注册](https://github.com/settings/apps/new)，或 GitHub → Settings → Developer settings → GitHub Apps → New GitHub App。

1. **App owner**：实验阶段使用当前个人账号；名称选择 GitHub 全站唯一的短名称（不超过 34 字符），如 `labourchain-board-dev`（仅举例，需检查可用性）。
2. **Homepage URL**：当前仓库 `https://github.com/Ri0n72Y/hackathon-platform` 即可，暂时不要求已有 Vercel 站点。
3. **Callback URL**：User OAuth 启用时必须有真实回调地址，如 `https://<deployment-domain>/api/github-callback`。现阶段尚无域名，可先注册，等 Vercel 部署后补全。授权请求的 `redirect_uri` 必须匹配已登记的 Callback URL。
4. **Expire user authorization tokens**：保留开启；不要为逃避会话管理而改成永久令牌。
5. **Request user authorization (OAuth) during installation**：实验阶段可不勾选，分别验证安装和用户登录；后续可改变。该选项不是支持双身份的必要条件。
6. **Enable Device Flow**：关闭；网页使用 Web Application Flow。
7. **Webhooks → Active**：关闭；最小实验不需要 Webhook，也不引入定时/后台同步。
8. **Repository permissions**：`Issues: Read & write`（未来验证 Issue 写入），`Metadata: Read`（默认）。`Contents` 暂时不需要；以后验证配置文件更新时另行申请。无需申请 PR 权限。
9. **Where can this GitHub App be installed?**：先选 `Only on this account`；以后若开放给其他仓库所有者安装，再评估改成 `Any account`。
10. 点击 **Create GitHub App**。到 App 设置中记下 **App ID** 和 **Client ID**，在 **Credentials / Client secrets** 创建 **Client Secret**，在 **Credentials / Key pairs** 生成并安全保管 **Private Key (PEM)**。
11. 在 App 设置中点击 **Install App**，选择当前账号，然后选择 **Only select repositories**，仅授权 `Ri0n72Y/hackathon-platform`。记录安装 ID（Installation ID）；不要把 App ID 与 Installation ID 混淆。

| 配置或凭据 | 使用位置 | 是否秘密 |
| --- | --- | --- |
| App ID、Client ID、Installation ID | Function 配置 | 不是秘密，但仍需验证来源 |
| Client Secret | OAuth code 换 User token | **秘密，服务端** |
| Private Key PEM | 签发 App JWT | **高度敏感，服务端** |
| User access / refresh token | 用户授权会话 | **秘密，不进入浏览器持久存储** |
| Installation token | Bot API 请求 | **秘密，不发给浏览器** |

注册完成后，可以随时修改 Callback URL 和权限。权限变更可能需要现有安装重新批准。**不要把 PEM、Client Secret、Token 写进 Git、`NEXT_PUBLIC_*`、客户端 Bundle、URL 查询参数或日志。**

## 3. Vercel Functions 如何部署

### 3.1 构建/部署路径

Vercel 在项目根目录的 `api/` 自动识别 Node.js Functions。最小结构示例（**只是文档说明，当前仓库没有创建这些文件**）：

```text
hackathon-platform/
├── api/
│   └── github-app-check.mjs    # 下文的只读 Bot 示例
├── ...                         # 未来 React + Cordis 前端
└── docs/
    └── github-app-vercel-deployment-research.md
```

在非 Next.js 的 Node.js Function 中可以使用 `.mjs`，并使用 Vercel 官方当前支持的 `export default { fetch(request) { ... } }` 风格。访问路径通常为 `/api/github-app-check`。无需常驻服务器或数据库；Function 实例内存不能作为跨调用持久会话。

### 3.2 创建并配置 Vercel 项目

1. Vercel Dashboard → **Add New / Project** → 导入 GitHub 仓库 `Ri0n72Y/hackathon-platform`。如果 Vercel GitHub 集成没有仓库权限，先调整该集成的允许仓库范围。
2. 选择仓库根目录作为 **Root Directory**。实际 UI 框架和构建命令应在 React + Cordis 的工程配置确定后再设置；**不要把 `docs/` 或已删除的 `experiments/` 当成部署根目录**。
3. 在 **Project Settings → Environment Variables** 中录入必要变量，按 Development / Preview / Production 分别配置。保密值只提供给服务端运行环境；改变环境变量后需要新的部署才能在对应部署生效。
4. 将待测试的 `api/*.mjs` 放入项目根目录，使用 Vercel Dashboard 部署或在正确的项目目录执行 `vercel`（预览）/ `vercel --prod`（生产）。
5. 在部署详情的 **Functions / Logs** 确认 Function 已生成，并请求 `https://<deployment-domain>/api/github-app-check`。不要把令牌写入公开日志。
6. 获取稳定部署域名后，在 GitHub App 设置中补全 OAuth Callback URL，再实施 User 流程。

本项目当前只存在文档，尚未形成实际可部署的 React/Cordis 工程。**只提交这份 Markdown 不会部署 Function。**

### 3.3 服务端环境变量

```text
GITHUB_APP_CLIENT_ID=Iv1.xxx
GITHUB_APP_PRIVATE_KEY=<PEM 内容>
GITHUB_INSTALLATION_ID=<数字 ID>
POC_SECRET=<仅用于隔离实验的随机长字符串>

# 只有接入 User OAuth 时才需要：
GITHUB_APP_CLIENT_SECRET=<client secret>
GITHUB_OAUTH_CALLBACK_URL=https://<deployment-domain>/api/github-callback
```

`POC_SECRET` 只是只读实验接口的临时访问保护，**不是生产身份系统**。建议实验完成后删除测试接口和测试密钥。Vercel 环境变量属于运行时配置；注意 Preview 部署和 Production 部署可能使用不同变量。

## 4. 一份可复制的最小 Bot 只读实验代码

**目的**：验证 `Vercel Function → App JWT → Installation token → 当前仓库 Issue API`。不做任何写操作。将以下代码临时存为项目根目录 `api/github-app-check.mjs`，部署后再测试。

```javascript
import { sign } from 'node:crypto';

const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');

export default {
  async fetch(request) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const env = process.env;
    if (!env.POC_SECRET || !env.GITHUB_APP_CLIENT_ID ||
        !env.GITHUB_APP_PRIVATE_KEY || !env.GITHUB_INSTALLATION_ID) {
      return new Response('Missing server configuration', { status: 503 });
    }
    if (request.headers.get('x-poc-secret') !== env.POC_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const data = enc({ alg: 'RS256', typ: 'JWT' }) + '.' +
        enc({ iss: env.GITHUB_APP_CLIENT_ID, iat: now - 60, exp: now + 540 });
      const pem = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
      const jwt = data + '.' + sign('RSA-SHA256', Buffer.from(data), pem).toString('base64url');

      const tokenResponse = await fetch(
        'https://api.github.com/app/installations/' +
        env.GITHUB_INSTALLATION_ID + '/access_tokens',
        { method: 'POST', headers: {
            Authorization: 'Bearer ' + jwt,
            Accept: 'application/vnd.github+json'
          }, body: JSON.stringify({
            repositories: ['hackathon-platform'],
            permissions: { issues: 'read' }
          })
        }
      );
      if (!tokenResponse.ok) throw new Error('Installation token rejected');
      const { token } = await tokenResponse.json();

      const issueResponse = await fetch(
        'https://api.github.com/repos/Ri0n72Y/hackathon-platform/issues/5',
        { headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/vnd.github+json'
          }
        }
      );
      if (!issueResponse.ok) throw new Error('Issue read failed');
      const issue = await issueResponse.json();
      return Response.json({ ok: true, issue: issue.number, title: issue.title });
    } catch {
      return Response.json({ ok: false, error: 'GitHub verification failed' }, { status: 502 });
    }
  }
};
```

在**受控终端**调用（不要把测试密钥公开或写入截图）：

```bash
curl -H "x-poc-secret: $POC_SECRET" \
  "https://<deployment-domain>/api/github-app-check"
```

成功条件：返回 `ok: true`、`issue: 5` 和 Issue 标题。失败时检查 App 是否已安装到本仓库、Installation ID 是否正确，以及 PEM 是否保留换行。**此验证只证明 Bot 能读取；不证明已经能够以 Bot 身份写入。**

## 5. User OAuth：需要部署哪些 Function，怎么验证

同一个 GitHub App 的 **User** 路径独立于 Bot 安装令牌：

```text
浏览器
  → GET /api/github-login
  → github.com/login/oauth/authorize
  → GitHub 重定向 /api/github-callback?code=...&state=...
  → Function 验证 state + PKCE
  → POST github.com/login/oauth/access_token
  → 服务器持有 User token（安全会话）
  → GET api.github.com/user （只读确认账号）
```

实际部署至少需要两个路由：

- `api/github-login.mjs`：生成随机 `state` 和 PKCE `code_verifier`，将短期上下文绑定到受保护的 `HttpOnly; Secure; SameSite=Lax` Cookie，向 GitHub 授权页重定向。授权 URL 需要 `client_id`、完全匹配的 `redirect_uri`、`state`、`code_challenge`、`code_challenge_method=S256`。
- `api/github-callback.mjs`：拒绝缺失或不匹配的 `state`；取回 `code_verifier`，使用 `client_id`、`client_secret`、`code`、`redirect_uri`、`code_verifier` 向 `https://github.com/login/oauth/access_token` 交换令牌；把 Token 保持在服务端可控的安全会话中，再以 User token 调用 `GET https://api.github.com/user`。

以下只是 **Callback 在完成 state 与 PKCE 校验之后** 的最小代码片段，**不可独立部署为回调端点**：

```javascript
const response = await fetch('https://github.com/login/oauth/access_token', {
  method: 'POST',
  headers: { Accept: 'application/json' },
  body: new URLSearchParams({
    client_id: process.env.GITHUB_APP_CLIENT_ID,
    client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
    code, redirect_uri: process.env.GITHUB_OAUTH_CALLBACK_URL,
    code_verifier
  })
});
if (!response.ok) throw new Error('OAuth exchange failed');
const { access_token } = await response.json();
if (!access_token) throw new Error('No access token');
const userResponse = await fetch('https://api.github.com/user', {
  headers: { Authorization: 'Bearer ' + access_token }
});
if (!userResponse.ok) throw new Error('User token invalid');
const { login } = await userResponse.json();
// 仅展示 login；令牌不能返回给浏览器或写入日志。
```

验证目标：以本人 GitHub 身份得到 `login`；随后检查 `GET /user/installations` 和 `GET /user/installations/{installation_id}/repositories`，确认目标仓库在 App/用户共同可访问范围中。长期会话、用户 Token 刷新和并发轮换方案仍待实际设计，不能通过本片段假定已经解决。

## 6. 实验完成前必须区分的事实

| 项目 | 当前状态 |
| --- | --- |
| GitHub App 支持 User/Bot 双身份 | 官方文档确认 |
| JWT、安装令牌、OAuth、Vercel Function 部署路径 | 官方文档确认 |
| 当前仓库有 GitHub App 登录/Function 工程 | **没有** |
| 真实 App 注册与安装 | **未验证/未执行** |
| Bot 测试请求返回 GitHub Issue | **未执行** |
| User OAuth Callback + Session | **未实现/未验证** |
| User/Bot 作者分别显示在 GitHub Issue | **未执行写入实验** |

后续只有在注册、部署和只读身份检查都成功后，才适合对指定测试 Issue 分别做一次 User/Bot 的可逆写入测试。该报告不决定哪些产品交互由哪种身份提交。

## 7. 官方文档

- [GitHub：注册 GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)
- [GitHub：安装自己的 GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)
- [GitHub：管理 App 私钥](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)
- [GitHub：App 三种认证身份](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)
- [GitHub：App JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)
- [GitHub：安装令牌](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [GitHub：User OAuth Web Application Flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Vercel：Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel：导入 GitHub 仓库](https://vercel.com/docs/git)
- [Vercel：环境变量](https://vercel.com/docs/environment-variables)
