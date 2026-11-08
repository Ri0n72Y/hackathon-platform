import { RepoHomeError, type RepoHomeApi, type RepoHomeData, type RepoFeedIssue,
  type MemberSubmitResult } from '../../../plugins/repo-home/src/service'
const sampleIssue = (n: number): RepoFeedIssue => ({
  id: n, number: n, state: n % 2 ? 'open' : 'closed', title: '示例 Issue #' + n,
  html_url: 'https://github.com/octocat/Hello-World/issues/' + n,
  updated_at: new Date(Date.UTC(2026, 9, 31, 0, 0, 0) - n * 1000).toISOString(),
  user: { login: 'octocat' },
  body: n === 1 ? '# Markdown 测试\n文字 **加粗** 与 [外链](https://github.com)\n\n' +
    '![图像](https://github.com/favicon.ico)\n\n@[video](https://www.youtube.com/watch?v=sample)\n\n' +
    Array(20).fill('长正文内容').join('。') : '演示正文：' + n,
})
/** @summary Exercise Repo Home reads, independent failures, pagination and submission without GitHub writes. */
export function createRepoFixtureService(query: URLSearchParams): RepoHomeApi {
  const mode = query.get('fixtureCase') || 'default'
  const count = Math.min(120, Math.max(0, Number(query.get('fixtureCount') || 21) || 0))
  const cases: Record<string,string> = { missing: 'missing', invalid: 'invalid', empty: 'empty', error: 'error' }
  let failedPage = false
  return {
    async getHome(owner, repo, branch, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (mode === 'intro-error') throw new RepoHomeError('受控项目读取失败', 502)
      if (mode === 'bad-branch' && branch !== 'main') throw new RepoHomeError('展示分支不存在', 404)
      const state = cases[query.get('fixtureTeam') || ''] || 'ready'
      return {
        repository: { full_name: owner + '/' + repo, name: repo,
          description: mode === 'description' ? '仅使用 GitHub Description' : null,
          html_url: 'https://github.com/' + owner + '/' + repo, default_branch: 'main' },
        branch,
        readme: mode === 'readme-error' ? { state: 'error', error: '受控 README 失败' } :
          mode === 'readme-missing' ? { state: 'missing' } :
          { state: 'ready', path: 'README.md',
            content: '# ' + repo + '\n\n![badge](https://example.com/badge.svg)\n\n**这是有效的 README 摘要。**\n' },
        team: { state, members: state === 'ready' ? [
          { id: 'one', name: 'Alice', role: 'Maintainer', bio: '负责设计与工程。',
            githubUsername: 'octocat', links: [{ label: '项目', url: 'https://github.com' }] },
          { id: 'two', name: 'Bob' },
        ] : [], error: state === 'invalid' ? '模拟 JSON 结构无效' : state === 'error' ? '模拟读取失败' : undefined },
      } as RepoHomeData
    },
    async getFeed(_owner, _repo, page, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if ((mode === 'feed-error' || mode === 'feed-429') && page === 2 && !failedPage) {
        failedPage = true
        throw new RepoHomeError('受控分页失败', mode === 'feed-429' ? 429 : 503)
      }
      const totalPages = Math.ceil(count / 20)
      const start = (page - 1) * 20
      return { page, hasMore: page < totalPages, items: mode === 'pr-page' && page === 1 ? [] :
        Array.from({ length: Math.max(0, Math.min(20, count - start)) }, (_, i) => sampleIssue(start + i + 1)) }
    },
    async getCapability(_owner, _repo, branch, signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (mode === 'unauthenticated') throw new RepoHomeError('请先登录', 401)
      if (mode === 'denied') throw new RepoHomeError('用户无写权限', 403)
      if (mode === 'bot-denied') throw new RepoHomeError('App 缺少 Contents: write 权限', 403)
      return { user: { login: 'fixture-operator', id: 123 }, branch,
        protected: mode === 'pr', mode: mode === 'pr' ? 'pr' : 'commit' }
    },
    async register(_owner, _repo, _branch, _member, signal): Promise<MemberSubmitResult> {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (mode === 'conflict') throw new RepoHomeError('受控 SHA 冲突', 409)
      if (mode === 'write-error') throw new RepoHomeError('受控 Bot 失败', 502)
      return { status: mode === 'pr' ? 'pending_pr' : 'committed',
        url: mode === 'pr' ? 'https://github.com/octocat/Hello-World/pull/1' :
          'https://github.com/octocat/Hello-World/commit/0123456',
        sha: '0123456', requestedBy: 'fixture-operator' }
    },
  }
}
