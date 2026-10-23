import { json, github, githubError, repoPath, validNumber, writeContext } from './_issue-interaction.mjs'

/** Comment as the signed-in user, restricted to Issues (not PRs). */
export default {
  async fetch(request) {
    const context = await writeContext(request)
    if (context.error) return context.error
    const { body, token } = context
    if (!validNumber(body.number) || typeof body.body !== 'string' ||
      !body.body.trim() || body.body.length > 20000) {
      return json({ error: 'Issue 编号或评论正文无效（正文最多 20000 字）' }, 400)
    }
    const path = repoPath(body.owner, body.repo) + '/issues/' + body.number
    try {
      const issueResponse = await github(path, token)
      if (!issueResponse.ok) return githubError(issueResponse)
      if ((await issueResponse.json()).pull_request) {
        return json({ error: '当前页面不支持向 Pull Request 评论' }, 400)
      }
      const response = await github(path + '/comments', token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.body.trim() }),
      })
      if (response.status !== 201) return githubError(response)
      const item = await response.json()
      return json({
        comment: { id: item.id, body: item.body || '', html_url: item.html_url,
          created_at: item.created_at, user: { login: item.user?.login || 'unknown' } },
      }, 201)
    } catch {
      return json({ error: '提交状态未知，请先在 GitHub 检查评论是否存在，避免重复发表' }, 502)
    }
  },
}
