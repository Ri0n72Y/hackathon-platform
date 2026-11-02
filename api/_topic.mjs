const API = "https://api.github.com";
import YAML from "yaml";

export function validRepo(owner, repo) {
  return (
    /^[a-z\d-]{1,39}$/i.test(owner || "") &&
    /^[a-z\d._-]{1,100}$/i.test(repo || "")
  );
}

export function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function github(path) {
  const response = await fetch(API + path, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "LabourChain-TopicPage",
    },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "GitHub API " + response.status);
    error.status = response.status;
    error.path = path;
    error.rateLimited =
      response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0";
    throw error;
  }
  return body;
}

export function repoPath(owner, repo, suffix = "") {
  return (
    "/repos/" +
    encodeURIComponent(owner) +
    "/" +
    encodeURIComponent(repo) +
    suffix
  );
}

export function parseYaml(source) {
  const value = YAML.parse(String(source || ""));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("YAML 根节点必须是对象");
  return value;
}

export async function content(owner, repo, path) {
  const data = await github(repoPath(owner, repo, "/contents/" + path));
  data.__path = path;
  if (Array.isArray(data) || typeof data.content !== "string")
    throw new Error("文件内容格式异常：" + path);
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString(
    "utf8",
  );
}

export function errorResponse(error, stage) {
  const status = Number(error?.status);
  const code = error?.rateLimited
    ? 429
    : status === 404
      ? 404
      : status === 403
        ? 403
        : 502;
  return json(
    {
      error: error?.message || "GitHub 请求失败",
      stage: error?.stage || stage,
      status: status || null,
      retryable: code !== 404,
      rateLimited: Boolean(error?.rateLimited),
    },
    code,
  );
}
