import { issueReadAccess, issueGitHubGet, issueQuery, issueResponse, issueError, IssueAccessError } from './_issue-access.mjs'

/** @summary Return the repository's original labourchain.config.yaml GitHub contents object. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 })
    try {
      const { owner, repo } = issueQuery(request)
      const access = await issueReadAccess({ owner, repo })
      const path = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
        '/contents/labourchain.config.yaml'
      let data
      try { ({ data } = await issueGitHubGet(access, path)) }
      catch (error) {
        if (error instanceof IssueAccessError && error.status === 404) {
          throw new IssueAccessError('Repository configuration file is missing', 422)
        }
        throw error
      }
      if (!data || Array.isArray(data) || data.type !== 'file' || data.encoding !== 'base64' ||
          typeof data.content !== 'string') {
        return Response.json({ error: 'Repository configuration is invalid' }, { status: 422 })
      }
      return issueResponse(data)
    } catch (error) { return issueError(error) }
  },
}
