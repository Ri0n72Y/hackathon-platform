import { issueReadAccess, issueGitHubGet, issueQuery, issueResponse, issueError } from './_issue-access.mjs'

/** @summary Proxy one unchanged page of GitHub Issue comments without truncating the discussion. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 })
    try {
      const { owner, repo, number, page } = issueQuery(request, { number: true, pagination: true })
      const access = await issueReadAccess({ owner, repo })
      const path = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
        '/issues/' + number + '/comments?per_page=100&page=' + page
      const { data, link } = await issueGitHubGet(access, path)
      if (!Array.isArray(data)) return Response.json({ error: 'Invalid comments response' }, { status: 502 })
      return issueResponse(data, link)
    } catch (error) { return issueError(error) }
  },
}
