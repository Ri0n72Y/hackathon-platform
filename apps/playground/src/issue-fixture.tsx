import styles from './issue-fixture.module.css'
import type { Context } from '@deepseek-ai/cordis'
import { Link } from 'react-router'
import { IssueRequestError, type GithubIssue, type GithubComment,
  type IssueDetailApi } from '../../../plugins/issue-detail/src/service'

const sha = 'a'.repeat(40)
const shortLabour = '```yaml\nlabour:\n  work: 测试无后缀估时\n  hr: ~0.5\n```'
const longLabour = '```yaml\nlabour:\n  work: |\n    修复 Issue 页面\n    验证分页逻辑\n  commits:\n    - ' +
  sha + '\n  outcome: |\n    可追溯结果\n  hr: ~1h\n```'
const conflicting = '```yaml\nlabour:\n  work: 另一条引用同一 Commit\n  commits:\n    - ' +
  sha + '\n  hr: ~1.5h\n```'
const comment = (id: number, body: string, owner: string, repo: string, number: number): GithubComment => ({
  id, body, html_url: 'https://github.com/' + owner + '/' + repo + '/issues/' + number + '#issuecomment-' + id,
  created_at: '2026-11-01T00:00:00Z', user: { login: 'fixture-user' },
  extra_field: 'original GitHub comment data',
})
const pages = new Map<string, GithubComment[]>()
const fixtureOwners = ['sample', 'sample-no-config', 'sample-bad-config']
function data(owner: string, repo: string, number: number): GithubComment[] {
  const key = owner + '/' + repo + '/' + number
  if (pages.has(key)) return pages.get(key)!
  const rows = number === 1 ? [
    comment(101, '普通讨论内容', owner, repo, number),
    comment(102, shortLabour, owner, repo, number),
    comment(103, longLabour, owner, repo, number),
    comment(104, '```yaml\nlabour:\n  hr: ~1\n```', owner, repo, number),
  ] : number === 9
    ? Array.from({ length: 102 }, (_, i) => comment(1000 + i, '第 ' + (i + 1) + ' 条评论', owner, repo, number))
    : number === 10 ? [comment(201, longLabour, owner, repo, number),
      comment(202, conflicting, owner, repo, number)] : []
  pages.set(key, rows)
  return rows
}
const wait = (signal: AbortSignal, ms = 25) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
  const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, ms)
  function stop() { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
  signal.addEventListener('abort', stop, { once: true })
})

/** @summary Provide an entirely local, abortable issue API without any GitHub or Vercel requests. */
export function createIssueFixtureService(loggedIn: boolean): IssueDetailApi {
  return {
    async getIssue(owner, repo, number, signal) {
      await wait(signal, number === 11 ? 400 : 25)
      if (!fixtureOwners.includes(owner) || repo !== 'repo' || number === 8) {
        throw new IssueRequestError('Fixture 404', 404)
      }
      if (number === 5) throw new IssueRequestError('Fixture rate limited', 429)
      if (number === 6) throw new IssueRequestError('Fixture upstream unavailable', 502)
      if (number === 7) throw new IssueRequestError('Fixture access denied', 403)
      const issue: GithubIssue = {
        number, title: '受控 Issue #' + number,
        body: '这是一份完整的模拟 GitHub Issue 正文。',
        state: number === 2 ? 'closed' : 'open',
        html_url: 'https://github.com/' + owner + '/' + repo + '/issues/' + number,
        labels: number === 12 ? []
          : number === 13 ? [{ name: 'channel:discussion' }, { name: 'channel:other' }]
          : [{ name: number === 4 ? 'status:todo' :
            number === 14 ? 'channel:unknown' : 'channel:discussion' }],
        comments: data(owner, repo, number).length, created_at: '2026-10-20T00:00:00Z',
        user: { login: 'fixture-author' }, extra_field: 'preserved raw Issue field',
        ...(number === 3 ? { pull_request: { url: 'https://api.github.com/...' } } : {}),
      }
      return issue
    },
    async getConfig(owner, repo, signal) {
      await wait(signal)
      if (owner === 'sample-no-config') {
        throw new IssueRequestError('Fixture repository config missing', 422)
      }
      if (owner === 'sample-bad-config') return 'namespaces:\n  channel: [invalid'
      if (owner !== 'sample' || repo !== 'repo') {
        throw new IssueRequestError('Fixture config not found', 404)
      }
      return 'namespaces:\n  channel:\n    - discussion\n'
    },
    async getComments(owner, repo, number, page, signal) {
      await wait(signal)
      if (!fixtureOwners.includes(owner) || repo !== 'repo') {
        throw new IssueRequestError('Fixture 404', 404)
      }
      const items = data(owner, repo, number).slice((page - 1) * 100, page * 100)
      return { items, hasMore: page * 100 < data(owner, repo, number).length }
    },
    async getSession(signal) { await wait(signal); return loggedIn },
    async verify(owner, repo, signal) {
      await wait(signal)
      if (!loggedIn) throw new IssueRequestError('Fixture OAuth required', 401, true)
      return { user: { id: 1, login: 'fixture-user' },
        repository: { full_name: owner + '/' + repo, accessible: true,
          permissions: { admin: false, maintain: false, push: false, triage: false, pull: true } } }
    },
    async postComment(owner, repo, number, body, signal) {
      await wait(signal)
      if (!loggedIn) throw new IssueRequestError('Fixture OAuth required', 401, true)
      if (body.includes('FAIL_POST')) throw new IssueRequestError('Fixture write rejected', 403)
      const item = comment(9000 + data(owner, repo, number).length, body,
        owner, repo, number)
      data(owner, repo, number).push(item)
      return item
    },
  }
}

/** @summary Register fixture navigation and a control to unload only the Issue-detail plugin. */
export function createIssueFixtureControls(unload: () => void) {
  return {
    name: 'issue-fixture-controls',
    inject: ['reactUI'],
    apply(ctx: Context) {
      function Controls() {
        return <section className={styles.controls}>
          <h1>Issue 详情独立 Playground 测试</h1>
          <p>以下所有 Issue、OAuth 状态及评论均由内存替身提供，不执行任何远端写入。</p>
          <ul>{[
            [1, 'Open + Labour 格式'], [2, 'Closed Issue'], [3, 'Pull Request 404'],
            [4, '仅其他标签：普通 Issue 可读'], [5, '429 限流'], [6, '502 上游失败'],
            [7, '403 权限'], [8, '404 不存在'], [9, '102 条评论分页'],
            [10, '重复 Commit 冲突'], [11, '异步竞态（缓慢响应）'],
            [12, '无标签普通 Issue'], [13, '多个频道标签普通 Issue'],
            [14, '未配置的频道标签普通 Issue'],
          ].map(([n, label]) => <li key={n}><Link
            to={'/sample/repo/issues/' + n + '?issueFixture=1' +
              (new URLSearchParams(window.location.search).get('fixtureAuth') === '1' ? '&fixtureAuth=1' : '')}>
              #{n} {label}</Link></li>)}
            <li><Link to="/sample-no-config/repo/issues/1?issueFixture=1">
              缺少 Config 的普通 Issue</Link></li>
            <li><Link to="/sample-bad-config/repo/issues/1?issueFixture=1">
              无效 Config 的普通 Issue</Link></li>
            <li><Link to="/other/repo/issues/1?issueFixture=1">
              切换至其他仓库：404</Link></li>
          </ul>
          <button type="button" onClick={unload}>卸载 Issue 详情插件</button>
          <p>卸载后访问以上链接应进入共享 Router 的 404；刷新页面可重新装配。</p>
        </section>
      }
      ctx.effect(() => ctx.reactUI.registerPage({
        id: 'issue-fixture-controls', path: '/__issue-fixture', Component: Controls,
      }))
    },
  }
}
