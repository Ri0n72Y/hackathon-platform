import { readSession, oauthHeaders } from './_oauth.mjs'
import { resolveInstalledRepository, ProbeError, validRepository } from './_installation-probe.mjs'
import { github, githubError, repoPath } from './_issue-interaction.mjs'

function json(body, status = 200) {
  return Response.json(body, { status, headers: oauthHeaders() })
}

/** @summary Confirm the OAuth user's identity and membership in this repository's current App installation. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    const params = new URL(request.url).searchParams
    const owner = params.get('owner'), repo = params.get('repo')
    if (!validRepository(owner, repo)) return json({ error: 'Invalid repository' }, 400)
    let session
    try { session = readSession(request) }
    catch { return json({ error: 'GitHub login configuration unavailable' }, 503) }
    if (!session) return json({ error: '请先完成 GitHub OAuth 登录', relogin: true }, 401)

    try {
      const resolved = await resolveInstalledRepository({ owner, repo })
      const userResponse = await github('/user', session.token)
      if (!userResponse.ok) return githubError(userResponse)
      const { id, login } = await userResponse.json()
      if (!Number.isSafeInteger(id) || typeof login !== 'string') {
        return json({ error: 'GitHub user response invalid' }, 502)
      }
      const fullName = (owner + '/' + repo).toLowerCase()
      let found
      for (let page = 1; page <= 5; page++) {
        const response = await github('/user/installations/' + resolved.installationId +
          '/repositories?per_page=100&page=' + page, session.token)
        if (response.status === 404) break
        if (!response.ok) return githubError(response)
        const data = await response.json()
        if (!Array.isArray(data.repositories)) return json({ error: 'GitHub repository response invalid' }, 502)
        found = data.repositories.find(item => item.full_name?.toLowerCase() === fullName &&
          item.private === false)
        if (found || data.repositories.length < 100) break
        if (page === 5) return json({ error: 'Repository verification exceeded 500 items' }, 409)
      }
      const p = found?.permissions
      const permissions = p ? {
        admin: p.admin === true, maintain: p.maintain === true, push: p.push === true,
        triage: p.triage === true, pull: p.pull === true,
      } : null
      return json({ user: { id, login },
        repository: { full_name: owner + '/' + repo, accessible: Boolean(found), permissions } })
    } catch (error) {
      if (error instanceof ProbeError) return json({ error: error.message }, error.status)
      return json({ error: 'GitHub verification service unavailable' }, 502)
    }
  },
}
