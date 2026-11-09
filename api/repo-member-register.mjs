import { writeContext } from './_issue-interaction.mjs'
import { memberWriteCapability, registerMember } from './_repo-member-write.mjs'
import { reply, issueError, paramsFor } from './_repo-home-access.mjs'
/** @summary Authorize each explicit same-origin submission before Bot Commit or maintenance PR. */
export default {
  async fetch(request) {
    let context
    try { context = await writeContext(request, { dynamicInstallation: true }) }
    catch { return reply({ error: 'OAuth 会话检查失败' }, 503) }
    if (context.error) return context.error
    const { owner, repo, branch, member } = context.body
    try {
      const query = new URL('https://example.invalid/?owner=' + encodeURIComponent(owner) +
        '&repo=' + encodeURIComponent(repo) + '&branch=' + encodeURIComponent(branch || ''))
      const target = paramsFor({ url: query.href })
      if (target.branch !== branch) return reply({ error: '目标分支无效' }, 400)
      const capability = await memberWriteCapability({
        owner, repo, branch, userToken: context.token,
      })
      const result = await registerMember(capability, branch, member)
      return reply({ ...result, requestedBy: capability.user.login }, result.status === 'pending_pr' ? 202 : 201)
    } catch (error) { return issueError(error) }
  },
}
