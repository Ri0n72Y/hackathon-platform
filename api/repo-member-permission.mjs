import { paramsFor, reply, issueError } from './_repo-home-access.mjs'
import { capabilityFromRequest } from './_repo-member-write.mjs'
/** @summary Report confirmed GitHub OAuth operator, App permissions, and protected branch status. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405)
    try {
      const { owner, repo, branch } = paramsFor(request)
      const result = await capabilityFromRequest(request, owner, repo, branch)
      return reply({ user: result.user, branch, protected: result.protectedBranch,
        mode: result.protectedBranch ? 'pr' : 'commit' })
    } catch (error) { return issueError(error) }
  },
}
