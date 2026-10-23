import { auth, repos } from './_github.mjs'
import { json, github, githubError, repoPath, validRepo, validNumber } from './_issue-interaction.mjs'

/** Read an Issue and the first 100 comments on explicit user request. No write token is used. */
export default {
  async fetch(request) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    const p = new URL(request.url).searchParams
    const owner = p.get('owner'), repo = p.get('repo'), issueNumber = Number(p.get('number'))
    if (!validRepo(owner, repo) || !validNumber(issueNumber)) {
      return json({ error: 'Issue 参数无效' }, 400)
    }
    try {
      const token = await auth()
      const allowed = await repos(token)
      if (!allowed.some(item => item.owner.toLowerCase() === owner.toLowerCase() &&
        item.name.toLowerCase() === repo.toLowerCase())) return json({ error: '仓库未获得 App 安装授权' }, 404)
      const path = repoPath(owner, repo) + '/issues/' + issueNumber
      const issueResponse = await github(path, token)
      if (!issueResponse.ok) return githubError(issueResponse)
      const issue = await issueResponse.json()
      if (issue.pull_request) return json({ error: '当前页面不支持 Pull Request' }, 404)
      const commentsResponse = await github(path + '/comments?per_page=100&page=1', token)
      if (!commentsResponse.ok) return githubError(commentsResponse)
      const comments = await commentsResponse.json()
      if (!Array.isArray(comments)) return json({ error: '评论数据异常' }, 502)
      return json({
        issue: {
          number: issue.number, title: issue.title, body: issue.body || '',
          state: issue.state, html_url: issue.html_url,
          user: { login: issue.user?.login || 'unknown' },
          comments: issue.comments,
        },
        comments: comments.map(item => ({
          id: item.id, body: item.body || '', html_url: item.html_url,
          created_at: item.created_at, user: { login: item.user?.login || 'unknown' },
        })),
      })
    } catch {
      return json({ error: 'Issue 加载失败，请稍后重试' }, 502)
    }
  },
}
