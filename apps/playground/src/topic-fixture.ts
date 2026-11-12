import type { TopicPageApi, TopicSnapshot, TopicProjectsPage, TopicRoute,
  ReportIssue } from '../../../plugins/topic-page/src/service'

const project = (name: string) => ({
  full_name: name, name: name.split('/')[1], owner: name.split('/')[0],
  description: '受控公开 GitHub Topic 项目', html_url: 'https://github.com/' + name,
  stargazers_count: 1, language: 'TypeScript',
})
const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
  const t = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 25)
  function cancel() { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
  signal.addEventListener('abort', cancel, { once: true })
})

/** @summary Exercise Topic pagination, whitelist, search-window and report failures entirely in memory. */
export function createTopicFixtureService(query: URLSearchParams): TopicPageApi {
  const mode = query.get('topicCase') || 'ready'
  const authenticated = query.get('fixtureAuth') === '1'
  const routeCheck = (route: TopicRoute) => {
    if (route.owner !== 'sample' || route.repo !== 'repo') throw Object.assign(
      new Error('Fixture repository not found'), { status: 404, stage: 'repository' })
  }
  return {
    reportAvailable: true, // fixture only; production adapter remains disabled.
    async getSnapshot(route, signal): Promise<TopicSnapshot> {
      await wait(signal); routeCheck(route)
      if (['missing', 'readme-error', 'report-fail', 'report-success'].includes(mode)) {
        throw Object.assign(new Error('Fixture README 读取失败'), { status: 502, stage: 'readme' })
      }
      if (mode === 'bad-config') throw Object.assign(
        new Error('Fixture Topic Config 无效'), { status: 422, stage: 'config' })
      return {
        repository: { owner: 'sample', name: 'repo',
          full_name: 'sample/repo', html_url: 'https://github.com/sample/repo' },
        readme: '封面说明（必须排除）\n# Topic 样例活动\n第一段简介\n第二段简介\nemail: team@example.org\ndatetime: 2026-11-12\n',
        coverUrl: null,
        config: { topic: 'labourchain', whitelist: mode !== 'no-whitelist' },
        allowedRepositories: Array.from({ length: 12 }, (_, i) => 'member/project-' + (i + 1)),
      }
    },
    async getProjects(route, page, signal): Promise<TopicProjectsPage> {
      await wait(signal); routeCheck(route)
      if (mode === 'rate-limit' && page === 2) throw Object.assign(
        new Error('Fixture rate-limited'), { status: 429, stage: 'topic-search' })
      if (mode === 'window') return {
        page, perPage: 30, totalCount: 1500, hasNext: false, windowExhausted: true,
        items: [project('member/project-1')],
      }
      if (mode === 'empty') return { page, perPage: 30, totalCount: 0,
        hasNext: false, windowExhausted: false, items: [] }
      return {
        page, perPage: 30, totalCount: 60, hasNext: page < 2,
        windowExhausted: false,
        items: page === 1 ? [
          project('other/blocked'), project('member/project-1'),
          project('MEMBER/PROJECT-1'), project('sample/repo'),
        ] : Array.from({ length: 11 }, (_, i) => project('member/project-' + (i + 2))),
      }
    },
    async getSession(signal) { await wait(signal); return authenticated },
    async submitReport(_route: TopicRoute, _report: ReportIssue, signal) {
      await wait(signal)
      if (mode === 'report-fail') throw Object.assign(
        new Error('Fixture 403：提交失败，请检查仓库权限'), { status: 403, stage: 'report' })
      return 'https://github.com/sample/repo/issues/77'
    },
  }
}
