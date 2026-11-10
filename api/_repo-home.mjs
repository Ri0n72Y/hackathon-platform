import { paramsFor, accessFor, pathFor, readRepo, readText, readTeam, reply, issueError } from './_repo-home-access.mjs'
/** @summary Read an installed public repository, an explicit existing display branch, README and team file independently. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405)
    try {
      const { owner, repo, branch } = paramsFor(request)
      const access = await accessFor(owner, repo), base = pathFor(owner, repo)
      const [info, selected] = await Promise.all([
        readRepo(access, base), readRepo(access, base + '/branches/' + encodeURIComponent(branch)),
      ])
      if (info.data.private !== false) return reply({ error: '仅支持公开仓库' }, 404)
      const readme = await (async () => {
        try {
          const r = await readText(access, base + '/readme?ref=' + encodeURIComponent(branch))
          return r ? { state: 'ready', content: r.text, path: r.path } : { state: 'missing' }
        } catch (error) { return { state: 'error', error: error.message } }
      })()
      const team = await readTeam(access, base, branch)
      return reply({ repository: { full_name: info.data.full_name, name: info.data.name,
        description: info.data.description, html_url: info.data.html_url,
        default_branch: info.data.default_branch }, branch: selected.data.name, readme, team })
    } catch (error) { return issueError(error) }
  },
}
