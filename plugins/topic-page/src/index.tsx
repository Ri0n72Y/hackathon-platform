import { Service, type Context } from '@deepseek-ai/cordis'
import { useEffect, useMemo, useState } from 'react'
import styles from './topic-page.module.css'

export type TopicRoute = { owner: string; repo: string }
export type TopicRepository = { full_name: string; name: string; owner?: string; description: string; html_url: string; stargazers_count: number; language?: string }
export type TopicSnapshot = { repository: { owner: string; name: string; full_name: string; html_url: string }; readme: string; coverUrl: string; config: { topic: string; whitelist: boolean }; allowedRepositories: string[] }

declare module '@deepseek-ai/cordis' { interface Context { topicPage: TopicPageService } }

export class TopicPageService extends Service {
  constructor(ctx: Context) { super(ctx, 'topicPage') }
  async getSnapshot(route: TopicRoute): Promise<TopicSnapshot> { return this.read('/api/topic-page?owner=' + encodeURIComponent(route.owner) + '&repo=' + encodeURIComponent(route.repo)) }
  async getProjects(route: TopicRoute, page: number): Promise<{ page: number; totalCount: number; hasNext: boolean; items: TopicRepository[] }> { return this.read('/api/topic-projects?owner=' + encodeURIComponent(route.owner) + '&repo=' + encodeURIComponent(route.repo) + '&page=' + page) }
  private async read(url: string) {
    const response = await fetch(url, { cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw Object.assign(new Error(body.error || 'HTTP ' + response.status), { stage: body.stage, status: body.status || response.status, retryable: body.retryable !== false })
    return body
  }
}

function routeFromPathname(): TopicRoute | null {
  const match = location.pathname.match(/^\/topic\/([^/]+)\/([^/]+)\/?$/)
  return match && /^[a-z\d-]{1,39}$/i.test(match[1]) && /^[a-z\d._-]{1,100}$/i.test(match[2]) ? { owner: decodeURIComponent(match[1]), repo: decodeURIComponent(match[2]) } : null
}

function readmeTitle(readme: string) { return readme.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Topic Page' }
function readmeBody(readme: string) { return readme.replace(/^#\s+.+$/m, '').trim() }

function TopicPageHead({ snapshot }: { snapshot: TopicSnapshot }) {
  return <section className={styles.headCard}>
    {snapshot.coverUrl && <img src={snapshot.coverUrl} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />}
    <div className={styles.headCopy}><span className={styles.eyebrow}>TOPIC / {snapshot.config.topic}</span><h1>{readmeTitle(snapshot.readme)}</h1><p>{readmeBody(snapshot.readme) || '从 GitHub Topic 聚合参与项目。'}</p><a href={snapshot.repository.html_url} target="_blank" rel="noreferrer">查看官方仓库 ↗</a></div>
  </section>
}

function TopicPageProjectCard({ project }: { project: TopicRepository }) {
  return <article className={styles.projectCard}><div className={styles.projectMark}>{project.name.slice(0, 1).toUpperCase()}</div><div className={styles.projectContent}><div className={styles.cardMeta}>{project.language || '项目'} <span>★ {project.stargazers_count}</span></div><h3>{project.name}</h3><p>{project.description || '暂无项目简介'}</p><a href={project.html_url} target="_blank" rel="noreferrer">打开 GitHub ↗</a></div></article>
}

function TopicPageLoading() { return <div className={styles.grid}>{[1, 2, 3].map(i => <div className={styles.skeleton} key={i} />)}</div> }

function TopicPageContainer({ service }: { service: TopicPageService }) {
  const route = useMemo(routeFromPathname, [])
  const [snapshot, setSnapshot] = useState<TopicSnapshot | null>(null)
  const [projects, setProjects] = useState<TopicRepository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error & { stage?: string; status?: number } | null>(null)
  const [session, setSession] = useState<'checking' | 'connected' | 'anonymous'>('checking')
  const [reportUrl, setReportUrl] = useState('')
  const [page, setPage] = useState(1)
  const load = () => {
    if (!route) return
    setLoading(true); setError(null); setSnapshot(null); setProjects([]); setPage(1)
    void (async () => {
      try {
        const meta = await service.getSnapshot(route); setSnapshot(meta)
        const next: TopicRepository[] = []; const seen = new Set<string>(); let current = 1; let hasNext = true
        while (hasNext && next.length < 10) {
          const result = await service.getProjects(route, current)
          for (const item of result.items) { const key = item.full_name.toLowerCase(); if ((!meta.config.whitelist || meta.allowedRepositories.includes(key)) && !seen.has(key) && key !== meta.repository.full_name.toLowerCase()) { seen.add(key); next.push(item) } }
          hasNext = result.hasNext; current += 1; setPage(current - 1)
        }
        setProjects(next); setLoading(false)
      } catch (cause) { setError(cause as Error & { stage?: string; status?: number }); setLoading(false) }
    })()
  }
  useEffect(load, [route?.owner, route?.repo])
  if (!route) return <main className={styles.page}><div className={styles.error}><h1>TopicPage 地址无效</h1><p>请使用 /topic/&lt;owner&gt;/&lt;repository&gt;/</p></div></main>
  useEffect(() => { void fetch('/api/github-session', { cache: 'no-store' }).then(r => r.ok ? r.json() : { authenticated: false }).then(d => setSession(d.authenticated ? 'connected' : 'anonymous')).catch(() => setSession('anonymous')) }, [])
  async function reportError() {
    if (!route || !error || session !== 'connected') return
    const title = `[TopicPage] ${error.stage || '加载'}失败：${route.owner}/${route.repo}`
    const body = `页面路由：/topic/${route.owner}/${route.repo}/\n阶段：${error.stage || 'unknown'}\nHTTP：${error.status || 'unknown'}\n说明：${error.message}\n时间：${new Date().toISOString()}`
    if (!window.confirm('将错误摘要提交为 Issue？不会包含 Token、Cookie 或响应头。')) return
    const response = await fetch('/api/github-issue-create', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' }, body: JSON.stringify({ owner: route.owner, repo: route.repo, title, body }) })
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || '提交失败'); setReportUrl(data.issue.html_url)
  }
  return <main className={styles.page}>{snapshot && <TopicPageHead snapshot={snapshot} />}<section className={styles.section}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>COMMUNITY PROJECTS</span><h2>参与项目</h2></div><span className={styles.count}>{projects.length} 个项目</span></div>{loading && <TopicPageLoading />}{error && <div className={styles.error}><h2>暂时无法加载项目</h2><p>{error.message}{error.status ? `（HTTP ${error.status}）` : ''}</p><p className={styles.note}>阶段：{error.stage || 'unknown'} · 请求时间：{new Date().toLocaleString()}</p><button onClick={load}>重新加载</button>{session === 'connected' && <button onClick={() => void reportError()}>提交问题到该仓库</button>}{reportUrl && <p><a href={reportUrl} target="_blank" rel="noreferrer">Issue 已创建，打开查看 ↗</a></p>}</div>}{!loading && !error && projects.length === 0 && <div className={styles.empty}>当前 Topic 下还没有符合配置的项目。</div>}{!loading && !error && projects.length > 0 && <div className={styles.grid}>{projects.map(project => <TopicPageProjectCard key={project.full_name} project={project} />)}</div>}{!loading && !error && page >= 34 && <p className={styles.note}>已达到 GitHub 查询上限。</p>}</section></main>
}

export const topicPage = { name: 'topic-page', inject: ['reactUI', 'topicPage'], apply(ctx: Context) { const service = ctx.topicPage; ctx.effect(() => ctx.reactUI.register('topic-page', () => <TopicPageContainer service={service} />)) } }
