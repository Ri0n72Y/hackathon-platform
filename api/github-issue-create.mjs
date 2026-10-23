import { json, github, githubError, repoPath, writeContext } from './_issue-interaction.mjs'

/** Create an Issue as the signed-in user, never as the App installation bot. */
export default {
  async fetch(request) {
    const context = await writeContext(request)
    if (context.error) return context.error
    const { body, token } = context
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 256 ||
        typeof body.body !== 'string' || body.body.length > 20000) {
      return json({ error: '标题须为 1–256 字，正文不超过 20000 字' }, 400)
    }
    try {
      const response = await github(repoPath(body.owner, body.repo) + '/issues', token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: body.title.trim(), body: body.body }),
      })
      if (response.status !== 201) return githubError(response)
      const issue = await response.json()
      return json({ issue: { number: issue.number, title: issue.title, html_url: issue.html_url } }, 201)
    } catch {
      return json({ error: '创建 Issue 的请求未能完成，请先在 GitHub 检查是否已创建，避免重复提交' }, 502)
    }
  },
}
