import { oauthConfig, readSession, oauthHeaders } from './_oauth.mjs'

export function json(body, status = 200) {
  return Response.json(body, { status, headers: oauthHeaders() })
}

export function validRepo(owner, repo) {
  return typeof owner === 'string' && /^[a-z\d-]{1,39}$/i.test(owner) &&
    typeof repo === 'string' && /^[a-z\d._-]{1,100}$/i.test(repo)
}

export function validNumber(number) {
  return Number.isSafeInteger(number) && number > 0
}

export async function github(path, token, init = {}) {
  return fetch('https://api.github.com' + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LabourChain-PoC',
      Authorization: 'Bearer ' + token,
      ...init.headers,
    },
    signal: AbortSignal.timeout(10000),
  })
}

export function githubError(response) {
  if (response.status === 401) return json({ error: 'GitHub 授权已失效，请重新登录', relogin: true }, 401)
  if (response.status === 403) {
    const rateLimited = response.headers.get('x-ratelimit-remaining') === '0'
    return json({ error: rateLimited ? 'GitHub API 请求额度已耗尽' : 'GitHub 拒绝了此操作，请确认用户及 App 权限' }, rateLimited ? 429 : 403)
  }
  if (response.status === 404) return json({ error: '仓库或 Issue 不存在，或当前用户无权访问' }, 404)
  if (response.status === 410) return json({ error: '仓库 Issue 功能已关闭' }, 410)
  if (response.status === 422) return json({ error: 'GitHub 拒绝了提交内容，请检查格式或稍后再试' }, 422)
  return json({ error: 'GitHub 请求失败，HTTP ' + response.status }, 502)
}

export function repoPath(owner, repo) {
  return '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
}

/** User-to-server writes: require an explicit same-origin JSON request and installation membership. */
export async function writeContext(request) {
  if (request.method !== 'POST') return { error: json({ error: 'Method not allowed' }, 405) }
  let config
  try { config = oauthConfig() } catch { return { error: json({ error: 'GitHub 登录尚未配置' }, 503) } }
  if (new URL(request.url).origin !== config.origin ||
      request.headers.get('origin') !== config.origin ||
      request.headers.get('x-labourchain-write') !== '1' ||
      request.headers.get('sec-fetch-site') === 'cross-site') {
    return { error: json({ error: '写入请求来源校验失败' }, 403) }
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return { error: json({ error: 'Only application/json is accepted' }, 415) }
  }
  const length = Number(request.headers.get('content-length') || '0')
  if (length > 26000) return { error: json({ error: '请求内容过长' }, 413) }

  let body
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 26000) return { error: json({ error: '请求内容过长' }, 413) }
    body = JSON.parse(raw)
  } catch {
    return { error: json({ error: 'JSON 格式错误' }, 400) }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !validRepo(body.owner, body.repo)) return { error: json({ error: '仓库参数无效' }, 400) }

  const session = readSession(request)
  if (!session) return { error: json({ error: '请先登录 GitHub', relogin: true }, 401) }
  const installation = process.env.GITHUB_INSTALLATION_ID
  if (!/^\d+$/.test(installation || '')) return { error: json({ error: 'App 安装配置不可用' }, 503) }

  const expected = (body.owner + '/' + body.repo).toLowerCase()
  try {
    for (let page = 1; page <= 5; page++) {
      const response = await github('/user/installations/' + installation +
        '/repositories?per_page=100&page=' + page, session.token)
      if (!response.ok) {
        if (response.status === 404) return { error: json({ error: '当前用户无权访问此 App 安装' }, 403) }
        return { error: githubError(response) }
      }
      const data = await response.json()
      if (!Array.isArray(data.repositories)) return { error: json({ error: 'GitHub 安装仓库响应异常' }, 502) }
      if (data.repositories.some(item => item.full_name?.toLowerCase() === expected && !item.private)) {
        return { body, token: session.token }
      }
      if (data.repositories.length < 100) break
      if (page === 5) return { error: json({ error: '仓库列表超出验证上限' }, 409) }
    }
    return { error: json({ error: '此仓库不在用户授权的 App 安装范围内' }, 403) }
  } catch {
    return { error: json({ error: 'GitHub 权限检查暂不可用' }, 502) }
  }
}
