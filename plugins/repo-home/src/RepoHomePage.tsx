import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { summarizeReadme } from './domain.mjs'
import type { RepoHomeApi, RepoHomeData, RepoFeedIssue } from './service'
import { readDisplayBranch, displayBranchKey } from './service'
import { TeamStrip, TeamStatus } from './Team'
import { RepoIssueActivityCard } from './RepoIssueActivityCard'
import styles from './RepoHome.module.css'

const valid = (owner?: string, repo?: string) => !!owner && !!repo &&
  /^[a-z\d-]{1,39}$/i.test(owner) && /^[a-z\d._-]{1,100}$/i.test(repo)
const errorText = (e: unknown) => e instanceof Error ? e.message : '网络请求失败'

/** @summary Orchestrate independent hero/team loading and one-at-a-time cancellable issue pagination. */
export default function RepoHomePage({ api }: { api: RepoHomeApi }) {
  const { owner = '', repo = '' } = useParams<'owner' | 'repo'>()
  const [branch, setBranch] = useState(() => readDisplayBranch(owner, repo))
  const [draft, setDraft] = useState(branch)
  const [data, setData] = useState<RepoHomeData | null>(null)
  const [homeError, setHomeError] = useState('')
  const [homeLoading, setHomeLoading] = useState(true)
  const [items, setItems] = useState<RepoFeedIssue[]>([])
  const [feedError, setFeedError] = useState('')
  const [feedLoading, setFeedLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [generation, setGeneration] = useState(0)
  const nextPage = useRef(1), pendingPage = useRef<AbortController | null>(null), stopped = useRef(false)
  const controllers = useRef<Set<AbortController>>(new Set())
  const sentinel = useRef<HTMLDivElement>(null)
  const key = owner + '/' + repo

  useEffect(() => {
    setBranch(readDisplayBranch(owner, repo))
    setDraft(readDisplayBranch(owner, repo))
  }, [key])
  useEffect(() => {
    const controller = new AbortController()
    setHomeLoading(true); setHomeError(''); setData(null)
    if (valid(owner, repo)) {
      void api.getHome(owner, repo, branch, controller.signal).then(result => {
        if (controller.signal.aborted) return
        setData(result)
        try { localStorage.setItem(displayBranchKey(owner, repo), branch) } catch { /* optional preference */ }
      }).catch(e => { if (!controller.signal.aborted) setHomeError(errorText(e)) })
        .finally(() => { if (!controller.signal.aborted) setHomeLoading(false) })
    } else { setHomeLoading(false); setHomeError('仓库 URL 参数无效') }
    return () => controller.abort()
  }, [api, owner, repo, branch, generation])

  const loadPage = useCallback(async () => {
    if (!valid(owner, repo) || pendingPage.current || stopped.current) return
    const page = nextPage.current
    const controller = new AbortController()
    pendingPage.current = controller
    controllers.current.add(controller)
    setFeedLoading(true); setFeedError('')
    try {
      const result = await api.getFeed(owner, repo, page, controller.signal, [])
      if (controller.signal.aborted) return
      if (result.page !== page || !Array.isArray(result.items)) throw Error('分页响应无效')
      setItems(current => {
        const ids = new Set(current.map(i => i.id))
        return [...current, ...result.items.filter(i => !i.pull_request && !ids.has(i.id) && ids.add(i.id))]
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      })
      nextPage.current = page + 1
      setHasMore(result.hasMore)
      if (!result.hasMore) stopped.current = true
    } catch (e) {
      if (!controller.signal.aborted) { stopped.current = true; setFeedError(errorText(e)) }
    } finally {
      controllers.current.delete(controller)
      if (pendingPage.current === controller) pendingPage.current = null
      if (!controller.signal.aborted) setFeedLoading(false)
    }
  }, [api, owner, repo])

  useEffect(() => {
    controllers.current.forEach(c => c.abort()); controllers.current.clear()
    pendingPage.current = null; stopped.current = false; nextPage.current = 1
    setItems([]); setHasMore(true); setFeedError(''); setFeedLoading(false)
    void loadPage()
    return () => { controllers.current.forEach(c => c.abort()); controllers.current.clear(); stopped.current = true }
  }, [loadPage, generation])

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore || !!feedError || feedLoading) return
    let timeout: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(x => x.isIntersecting)) {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => { void loadPage() }, 200)
      }
    }, { rootMargin: '400px 0px' })
    observer.observe(node)
    return () => { observer.disconnect(); if (timeout) clearTimeout(timeout) }
  }, [hasMore, feedError, feedLoading, items.length, loadPage])

  function refresh() {
    controllers.current.forEach(c => c.abort()); controllers.current.clear()
    pendingPage.current = null; stopped.current = false
    setGeneration(value => value + 1)
  }
  const base = '/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
  const readmeUrl = data?.readme.state === 'ready' && data.readme.path
    ? 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
      '/blob/' + encodeURIComponent(data.branch) + '/' + data.readme.path.split('/').map(encodeURIComponent).join('/')
    : ''
  const description = data?.repository.description?.trim() ||
    (data?.readme.state === 'ready' ? summarizeReadme(data.readme.content || '', data.repository.name) : '')
  return <section className={styles.page}>
    <p><Link to="/">平台首页</Link></p>
    {homeLoading && <p role="status">正在读取项目介绍与团队…</p>}
    {homeError && <p role="alert">{homeError} <button type="button" onClick={() => setGeneration(n => n + 1)}>重试介绍</button></p>}
    {data && <header className={styles.hero}>
      <p className={styles.eyebrow}>{data.repository.full_name}</p>
      <h1>{data.repository.name}</h1>
      {description ? <p className={styles.intro}>{description}</p> :
        <p className={styles.muted}>暂无项目简介。</p>}
      <div className={styles.actions}>
        {readmeUrl && <a href={readmeUrl} target="_blank" rel="noopener noreferrer">完整 README</a>}
        <a href={data.repository.html_url} target="_blank" rel="noopener noreferrer">GitHub 仓库</a>
        <Link to={base + '/config'}>仓库配置与 Labels</Link>
      </div>
      {data.readme.state === 'error' && <p role="status">README 读取失败：{data.readme.error} <button type="button" onClick={() => setGeneration(n => n + 1)}>重试</button></p>}
      <form className={styles.branch} onSubmit={e => { e.preventDefault(); if (draft.trim()) setBranch(draft.trim()) }}>
        <label htmlFor="home-branch">展示分支</label>
        <input id="home-branch" value={draft} onChange={e => setDraft(e.target.value)} maxLength={180} />
        <button type="submit">应用分支</button>
      </form>
    </header>}
    <section className={styles.section} aria-labelledby="team-heading">
      <div className={styles.sectionHead}><h2 id="team-heading">团队成员</h2><Link to={base + '/members'}>查看全部成员</Link></div>
      {data ? <TeamStatus team={data.team} base={base} branch={branch}
        onRetry={() => setGeneration(n => n + 1)} /> : !homeLoading && <p>团队信息不可用。</p>}
      {data?.team.state === 'ready' && <TeamStrip members={data.team.members} base={base} />}
    </section>
    <section className={styles.section} aria-labelledby="feed-heading">
      <div className={styles.sectionHead}><h2 id="feed-heading">Repo Issue 动态</h2>
        <button type="button" onClick={refresh}>刷新动态</button></div>
      <div className={styles.feed}>{items.map(issue => <RepoIssueActivityCard
        key={issue.id} issue={issue} base={base} />)}</div>
      {items.length === 0 && !feedLoading && !feedError && !hasMore && <p>暂无 Issue 动态。</p>}
      {feedError && <p role="alert">动态读取失败：{feedError} <button type="button" onClick={() => { stopped.current = false; setFeedError(''); void loadPage() }}>重试本页</button></p>}
      {feedLoading && <p role="status">正在加载 Issue…</p>}
      {!feedLoading && !feedError && hasMore && <button type="button" onClick={() => void loadPage()}>加载更多</button>}
      {!hasMore && <p className={styles.muted}>已加载全部 Issue</p>}
      <div ref={sentinel} aria-hidden="true" />
    </section>
  </section>
}
