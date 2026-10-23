import { readSession, oauthHeaders } from './_oauth.mjs'

const ghHeaders = token => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  Authorization: 'Bearer ' + token,
  'User-Agent': 'LabourChain-PoC',
})

function json(body, status = 200) {
  return Response.json(body, { status, headers: oauthHeaders() })
}

async function github(path, token) {
  const response = await fetch('https://api.github.com' + path, {
    headers: ghHeaders(token), signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) return { status: response.status }
  return { status: response.status, body: await response.json() }
}

/** Verify the current GitHub user and their accessible repository within this App installation. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    const params = new URL(request.url).searchParams
    const owner = params.get('owner'), repo = params.get('repo')
    if (!owner || !repo || !/^[a-z\d-]{1,39}$/i.test(owner) ||
        !/^[a-z\d._-]{1,100}$/i.test(repo)) return json({ error: 'Invalid repository' }, 400)

    let session
    try {
      session = readSession(request)
    } catch {
      return json({ error: 'GitHub login configuration unavailable' }, 503)
    }
    if (!session) return json({ error: '请先完成 GitHub 登录', relogin: true }, 401)

    const installation = process.env.GITHUB_INSTALLATION_ID
    if (!/^\d+$/.test(installation || '')) return json({ error: 'App installation not configured' }, 503)

    try {
      const userResponse = await github('/user', session.token)
      if (userResponse.status === 401) return json({ error: 'GitHub 授权已失效', relogin: true }, 401)
      if (userResponse.status !== 200) return json({ error: 'GitHub 用户验证失败' }, 502)
      const { id, login } = userResponse.body
      if (!Number.isSafeInteger(id) || typeof login !== 'string') {
        return json({ error: 'GitHub 用户响应格式异常' }, 502)
      }

      const fullName = owner.toLowerCase() + '/' + repo.toLowerCase()
      let found = null
      for (let page = 1; page <= 5; page++) {
        const response = await github('/user/installations/' + installation +
          '/repositories?per_page=100&page=' + page, session.token)
        if (response.status === 401) return json({ error: 'GitHub 授权已失效', relogin: true }, 401)
        if (response.status === 404) break // User cannot access this installation
        if (response.status !== 200 || !Array.isArray(response.body.repositories)) {
          return json({ error: 'GitHub 仓库授权检查失败' }, 502)
        }
        const repositories = response.body.repositories
        found = repositories.find(item =>
          item.full_name?.toLowerCase() === fullName && item.private === false)
        if (found || repositories.length < 100) break
        if (page === 5) return json({ error: '仓库超过单次检查的 500 条上限' }, 409)
      }

      const p = found?.permissions
      const permissions = p ? {
        admin: p.admin === true, maintain: p.maintain === true,
        push: p.push === true, triage: p.triage === true, pull: p.pull === true,
      } : null
      return json({
        user: { id, login },
        repository: { full_name: owner + '/' + repo, accessible: Boolean(found), permissions },
      })
    } catch {
      return json({ error: 'GitHub 验证服务暂不可用' }, 502)
    }
  },
}
