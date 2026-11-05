import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { formatLabourComment, parseIssueLabels, summarizeIssueComments,
  validIssueForPage, validIssueTarget } from './domain.mjs'
import { IssueRequestError, type GithubComment, type GithubIssue,
  type IssueDetailApi } from './service'
import styles from './IssueDetailPage.module.css'

type Load = {
  loading: boolean; issue: GithubIssue | null; comments: GithubComment[];
  page: number; hasMore: boolean; fetchingMore: boolean;
  error: { message: string; status: number } | null; pageError: string
}
const empty: Load = { loading: true, issue: null, comments: [], page: 0, hasMore: false,
  fetchingMore: false, error: null, pageError: '' }
type Auth = { status: 'checking' | 'anonymous' | 'authorized' | 'denied' | 'error'; message: string }

function safeGitHubUrl(value: unknown) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.origin === 'https://github.com' && !url.username && !url.password
      ? url.href : null
  } catch { return null }
}
function asIssueError(error: unknown) {
  return error instanceof IssueRequestError
    ? { message: error.message, status: error.status }
    : { message: error instanceof Error ? error.message : '请求失败', status: 502 }
}
function uniqueComments(items: GithubComment[]) {
  const seen = new Set<number>()
  return items.filter(item => Number.isSafeInteger(item.id) &&
    (!seen.has(item.id) && Boolean(seen.add(item.id))))
}

/** @summary Load and validate the URL-selected Issue, preserving pagination and OAuth permissions. */
export default function IssueDetailPage({ service }: { service: IssueDetailApi }) {
  const { owner, repo, number } = useParams<'owner' | 'repo' | 'number'>()
  const location = useLocation()
  const [state, setState] = useState<Load>(empty)
  const [auth, setAuth] = useState<Auth>({ status: 'checking', message: '' })
  const [tab, setTab] = useState<'discussion' | 'labour'>('discussion')
  const [reload, setReload] = useState(0)
  const [draft, setDraft] = useState('')
  const [work, setWork] = useState('')
  const [hours, setHours] = useState('0.5')
  const [outcome, setOutcome] = useState('')
  const [commits, setCommits] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')
  const [writeError, setWriteError] = useState('')
  const revision = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const valid = validIssueTarget(owner, repo, number)
  const numberValue = Number(number)
  const target = (owner || '') + '/' + (repo || '')

  useEffect(() => {
    setTab('discussion')
    setNotice('')
  }, [owner, repo, number])

  useEffect(() => {
    const current = ++revision.current
    const abort = new AbortController()
    controller.current = abort
    setState({ ...empty })
    setWriteError('')
    setPending(false)
    if (!valid || !owner || !repo) {
      setState({ ...empty, loading: false,
        error: { message: '无效的 Issue URL', status: 404 } })
      return () => { abort.abort(); revision.current++ }
    }
    void (async () => {
      try {
        const [issue, config] = await Promise.all([
          service.getIssue(owner, repo, numberValue, abort.signal),
          service.getConfig(owner, repo, abort.signal),
        ])
        let labels: string[]
        try { labels = parseIssueLabels(config) }
        catch { throw new IssueRequestError('仓库配置无法解析，不能确认有效频道 Issue', 422) }
        if (issue.number !== numberValue || !validIssueForPage(issue, labels)) {
          throw new IssueRequestError('该地址不是有效的频道 Issue', 404)
        }
        const first = await service.getComments(owner, repo, numberValue, 1, abort.signal)
        if (current !== revision.current || abort.signal.aborted) return
        setState({ loading: false, issue, comments: uniqueComments(first.items),
          page: 1, hasMore: first.hasMore, fetchingMore: false, error: null, pageError: '' })
      } catch (error) {
        if (current !== revision.current || abort.signal.aborted) return
        setState({ ...empty, loading: false, error: asIssueError(error) })
      }
    })()
    return () => { abort.abort(); revision.current++ }
  }, [service, owner, repo, number, valid, numberValue, reload])

  useEffect(() => {
    const abort = new AbortController()
    setAuth({ status: 'checking', message: '' })
    if (!valid || !owner || !repo) return () => abort.abort()
    void (async () => {
      try {
        if (!await service.getSession(abort.signal)) {
          if (!abort.signal.aborted) setAuth({ status: 'anonymous', message: '' })
          return
        }
        const verified = await service.verify(owner, repo, abort.signal)
        if (!abort.signal.aborted) setAuth(verified.repository.accessible
          ? { status: 'authorized', message: 'GitHub OAuth 身份及 App 仓库范围已验证；写入仍由 GitHub 最终授权。' }
          : { status: 'denied', message: '当前 OAuth 用户不能通过 App 访问此仓库。' })
      } catch (error) {
        if (!abort.signal.aborted) setAuth({ status: 'error', message: asIssueError(error).message })
      }
    })()
    return () => abort.abort()
  }, [service, owner, repo, valid])

  const completePages = Boolean(state.issue && !state.hasMore && !state.pageError &&
    state.comments.length >= state.issue.comments)
  const summary = useMemo(() =>
    summarizeIssueComments(state.comments, completePages), [state.comments, completePages])
  const canWrite = auth.status === 'authorized' && Boolean(state.issue)
  const loginUrl = '/api/github-login?return_to=' + encodeURIComponent(location.pathname)

  async function loadMore() {
    if (!valid || !owner || !repo || !state.issue || !state.hasMore || state.fetchingMore) return
    const current = revision.current
    setState(previous => ({ ...previous, fetchingMore: true, pageError: '' }))
    try {
      const next = await service.getComments(owner, repo, numberValue, state.page + 1,
        controller.current?.signal || new AbortController().signal)
      if (current !== revision.current) return
      setState(previous => ({ ...previous, fetchingMore: false, page: previous.page + 1,
        comments: uniqueComments([...previous.comments, ...next.items]),
        hasMore: next.hasMore, pageError: '' }))
    } catch (error) {
      if (current === revision.current) setState(previous => ({
        ...previous, fetchingMore: false, pageError: asIssueError(error).message,
      }))
    }
  }

  async function submit(body: string, kind: 'comment' | 'labour') {
    if (!canWrite || pending || !owner || !repo || !valid || !body.trim() ||
        body.length > 20000 || !window.confirm('确认以当前 GitHub OAuth 用户身份发表这条' +
          (kind === 'labour' ? '劳动记录' : '评论') + '？')) return
    const current = revision.current
    setPending(true)
    setWriteError('')
    setNotice('')
    try {
      const response = await service.postComment(owner, repo, numberValue, body,
        controller.current?.signal || new AbortController().signal)
      if (current !== revision.current) return
      if (kind === 'comment') setDraft('')
      else { setWork(''); setOutcome(''); setCommits(''); setStart(''); setEnd('') }
      setNotice('GitHub 已确认发表：评论 #' + response.id + '。正在重新加载 Issue。')
      setReload(value => value + 1)
    } catch (error) {
      if (current === revision.current) setWriteError(asIssueError(error).message +
        '。如返回状态未知，请先在 GitHub 检查，以免重复提交。')
    } finally {
      if (current === revision.current) setPending(false)
    }
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit(draft, 'comment')
  }
  function submitLabour(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const shas = commits.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
      const toRfc3339 = (value: string) => value ? new Date(value).toISOString() : ''
      const body = formatLabourComment({ work, hr: Number(hours), outcome, commits: shas,
        start: toRfc3339(start), end: toRfc3339(end) })
      void submit(body, 'labour')
    } catch {
      setWriteError('劳动记录不符合 §9.4：请检查工作内容、0.5 小时步长、完整 Commit SHA 和起止时间。')
    }
  }

  return <div className={styles.page}>
    <nav className={styles.top} aria-label="Issue 导航">
      <Link to="/">Playground</Link>
      <Link to={'/' + target}>返回仓库页</Link>
    </nav>
    {state.loading && <p role="status">正在读取 GitHub Issue、配置与评论…</p>}
    {state.error && <section className={styles.panel}>
      <h1>{state.error.status === 404 ? '404 · Issue 不存在' : 'Issue 无法加载'}</h1>
      <p role="alert">{state.error.message}（HTTP {state.error.status}）</p>
      <button className={styles.action} type="button" onClick={() => setReload(i => i + 1)}>
        重试读取
      </button>
    </section>}
    {state.issue && <>
      <header className={styles.panel}>
        <p className={styles.meta}>{target} · #{state.issue.number} · {state.issue.state === 'open' ? 'Open' : 'Closed'}</p>
        <h1>{state.issue.title}</h1>
        <p className={styles.meta}>创建者：{state.issue.user?.login || '未知'} ·
          创建于 {state.issue.created_at || '未知'}
          {safeGitHubUrl(state.issue.html_url) && <> · <a href={safeGitHubUrl(state.issue.html_url)!}
            rel="noreferrer" target="_blank">GitHub 原文</a></>}
        </p>
        <div className={styles.body}>{state.issue.body || '（无正文）'}</div>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Issue 内容">
        <button type="button" role="tab" aria-selected={tab === 'discussion'}
          onClick={() => setTab('discussion')}>讨论</button>
        <button type="button" role="tab" aria-selected={tab === 'labour'}
          onClick={() => setTab('labour')}>劳动历史</button>
      </div>
      {!summary.complete && <p role="status" className={styles.warning}>
        当前资料尚不能视为完整：{state.hasMore ? '还有未加载的评论。' : ''}
        {state.pageError ? '分页失败：' + state.pageError + '。' : ''}
        {state.comments.length < state.issue.comments ? '评论数量尚未核对完毕。' : ''}
        {summary.invalidCandidates.length ? '有格式无效的劳动评论。' : ''}
        {summary.conflicts.length ? '有重复关联的 Commit 待处理。' : ''}
      </p>}
      <p className={styles.meta}>已加载 {state.comments.length} / {state.issue.comments} 条 GitHub 评论。
        {state.hasMore && <button className={styles.action} type="button"
          disabled={state.fetchingMore} onClick={() => void loadMore()}>
          {state.fetchingMore ? '加载中…' : '加载下一页评论'}
        </button>}
        {state.pageError && <button className={styles.action} type="button"
          onClick={() => void loadMore()}>重试分页</button>}
      </p>
      {tab === 'discussion' ? <section className={styles.panel} aria-label="普通讨论">
        <h2>讨论</h2>
        <ul className={styles.list}>{summary.discussion.map(comment => <li key={comment.id}>
          <article>
            <p className={styles.meta}>{comment.user?.login || '未知'} · {comment.created_at}
              {safeGitHubUrl(comment.html_url) && <> · <a
                href={safeGitHubUrl(comment.html_url)!} target="_blank" rel="noreferrer">来源</a></>}
            </p>
            <div className={styles.body}>{comment.body || '（空评论）'}</div>
          </article>
        </li>)}</ul>
        {!summary.discussion.length && <p>当前已加载的评论中没有普通讨论。</p>}
        <form className={styles.form} onSubmit={submitComment}>
          <label>发表评论（Markdown）
            <textarea rows={5} maxLength={20000} value={draft}
              onChange={e => setDraft(e.target.value)} />
          </label>
          <button type="submit" disabled={!canWrite || pending || !draft.trim()}>
            {pending ? '提交中…' : '确认以 GitHub 身份评论'}
          </button>
        </form>
      </section> : <section className={styles.panel} aria-label="当前 Issue 劳动历史">
        <h2>当前 Issue 劳动历史</h2>
        <p><strong>{summary.hours} 小时</strong> · {summary.complete
          ? '已读取评论中的无冲突主观登记工时（完整）'
          : '仅为已读取且无冲突的主观登记工时，非完整汇总'}</p>
        <p className={styles.meta}>没有可靠关联到当前 Issue 的独立 Commit 不参与统计；不扫描全仓库提交。</p>
        <ul className={styles.list}>{summary.records.map(record => <li key={record.comment.id}
          className={styles.record}>
          <p className={styles.meta}>{record.comment.user?.login || '未知'} · GitHub 提交时间
            {record.comment.created_at}
            {safeGitHubUrl(record.comment.html_url) && <> · <a
              href={safeGitHubUrl(record.comment.html_url)!} target="_blank" rel="noreferrer">原始劳动评论</a></>}
          </p>
          <div className={styles.body}>{record.work}</div>
          <p>主观估时：{record.hours} 小时 {record.conflicted && <span className={styles.warning}>
            · Commit 冲突，暂不计入汇总</span>}</p>
          {record.outcome && <p className={styles.body}>成果：{record.outcome}</p>}
          <p className={styles.meta}>劳动发生时间：{record.startEnd
            ? record.startEnd.start + ' — ' + record.startEnd.end : '未登记'}</p>
          {record.commits.map(sha => <p className={styles.commit} key={sha}>
            Commit：<a href={'https://github.com/' + target + '/commit/' + sha}
              target="_blank" rel="noreferrer">{sha}</a>
          </p>)}
        </li>)}</ul>
        {!summary.records.length && <p>当前已加载的评论中没有有效劳动记录。</p>}
        {summary.invalidCandidates.length > 0 && <p className={styles.warning}>
          {summary.invalidCandidates.length} 条候选劳动评论格式无效，按普通讨论保留；完整统计不可确认。</p>}
        <form className={styles.form} onSubmit={submitLabour}>
          <h3>登记劳动记录</h3>
          <label>工作内容（必填）<textarea rows={4} required value={work}
            onChange={e => setWork(e.target.value)} /></label>
          <label>主观估时 / 小时（0.5 递增）
            <input required type="number" min="0.5" step="0.5" value={hours}
              onChange={e => setHours(e.target.value)} />
          </label>
          <label>成果（可选）<textarea rows={3} value={outcome}
            onChange={e => setOutcome(e.target.value)} /></label>
          <label>关联 Commit SHA（可选；逗号或换行分隔）
            <textarea rows={3} value={commits} onChange={e => setCommits(e.target.value)} />
          </label>
          <label>开始时间（可选）<input type="datetime-local" value={start}
            onChange={e => setStart(e.target.value)} /></label>
          <label>结束时间（可选；与开始时间成对）<input type="datetime-local" value={end}
            onChange={e => setEnd(e.target.value)} /></label>
          <button type="submit" disabled={!canWrite || pending || !work.trim()}>
            {pending ? '提交中…' : '确认登记到 GitHub 评论'}
          </button>
        </form>
      </section>}
      {auth.status === 'checking' && <p role="status">正在检查 GitHub OAuth 身份…</p>}
      {auth.status === 'anonymous' && <p>匿名公开只读。<a href={loginUrl}>
        使用 GitHub OAuth 登录后申请评论权限</a></p>}
      {(auth.status === 'denied' || auth.status === 'error') &&
        <p role="alert" className={styles.warning}>{auth.message} · <a href={loginUrl}>重新授权</a></p>}
      {auth.status === 'authorized' && <p className={styles.meta}>{auth.message}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {writeError && <p role="alert" className={styles.error}>{writeError}</p>}
    </>}
  </div>
}
