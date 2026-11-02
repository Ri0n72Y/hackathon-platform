import { oauthConfig, readSession, oauthHeaders } from "./_oauth.mjs";
import {
  github,
  githubError,
  json,
  repoPath,
  validRepo,
} from "./_issue-interaction.mjs";

const maxBytes = 128 * 1024;

/** @summary Create a user-authorized Issue in any public repository that accepts the token. */
export default {
  async fetch(request) {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    let config;
    try {
      config = oauthConfig();
    } catch {
      return json({ error: "GitHub 登录尚未配置" }, 503);
    }
    if (
      new URL(request.url).origin !== config.origin ||
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return json({ error: "写入请求来源校验失败" }, 403);
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers.get("content-type") || "",
      )
    )
      return json({ error: "Only application/json is accepted" }, 415);
    const session = readSession(request);
    if (!session) return json({ error: "请先登录 GitHub", relogin: true }, 401);
    let body;
    try {
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > maxBytes)
        return json({ error: "请求内容过长" }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "JSON 格式错误" }, 400);
    }
    if (
      !validRepo(body?.owner, body?.repo) ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 256 ||
      typeof body.body !== "string" ||
      !body.body.trim() ||
      body.body.length > 20000
    )
      return json({ error: "仓库参数、标题或正文无效" }, 400);
    try {
      const response = await github(
        repoPath(body.owner, body.repo) + "/issues",
        session.token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: body.title.trim(), body: body.body }),
        },
      );
      if (response.status !== 201) return githubError(response);
      const issue = await response.json();
      return new Response(
        JSON.stringify({
          issue: {
            number: issue.number,
            title: issue.title,
            html_url: issue.html_url,
          },
        }),
        { status: 201, headers: oauthHeaders() },
      );
    } catch {
      return json(
        {
          error:
            "创建 Issue 的请求未能完成，请先在 GitHub 检查是否已创建，避免重复提交",
        },
        502,
      );
    }
  },
};
