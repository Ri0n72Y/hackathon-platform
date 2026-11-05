import { issueReadAccess, issueGitHubGet, issueQuery, issueResponse, issueError } from './_issue-access.mjs'

/** @summary Return an unmodified GitHub Issue for the URL-selected public repository. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 })
    try {
      const { owner, repo, number } = issueQuery(request, { number: true })
      const access = await issueReadAccess({ owner, repo })
      const path = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
        '/issues/' + number
      const { data } = await issueGitHubGet(access, path)
      if (!data || data.pull_request || data.number !== number) {
        return Response.json({ error: 'Issue not found' }, { status: 404 })
      }
      return issueResponse(data)
    } catch (error) { return issueError(error) }
  },
}
