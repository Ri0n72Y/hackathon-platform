import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import { formatLabourComment, parseIssueLabels, summarizeIssueComments,
  validIssueForPage, validIssueTarget } from './domain.mjs'
import { IssueRequestError, type GithubComment, type GithubIssue,
  type IssueDetailApi } from './service'
import IssueDetailView from './IssueDetailView'
import type { FormNotice, IssueDetailViewActions, IssueDetailViewModel,
  LabourDraft, LabourField, PermissionView } from './view-model'

type Load = {
  key: string; loading: boolean; issue: GithubIssue | null; comments: GithubComment[];
  page: number; hasMore: boolean; fetchingMore: boolean;
  lastRead: string; error: { message: string; status: number } | null; pageError: string
}
const empty: Load = { key: '', loading: true, issue: null, comments: [], page: 0, hasMore: false,
  fetchingMore: false, lastRead: '', error: null, pageError: '' }
type Auth = {
  key: string; status: 'checking' | 'anonymous' | 'authorized' | 'denied' | 'error'; message: string
}
const initialLabour: LabourDraft = { work: '', hours: '0.5', outcome: '',
  commits: '', start: '', end: '' }

function safeGitHubUrl(value: unknown): string | null {
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

/** @summary Orchestrate URL-bound Issue requests, OAuth checks and writes; prepare data for the pure View. */
export default function IssueDetailPage({ service }: { service: IssueDetailApi }) {
  const { owner, repo, number } = useParams<'owner' | 'repo' | 'number'>()
  const location = useLocation()
  const [state, setState] = useState<Load>(empty)
  const [auth, setAuth] = useState<Auth>({ key: '', status: 'checking', message: '' })
  const [reload, setReload] = useState(0)
  const [draft, setDraft] = useState('')
  const [labour, setLabour] = useState<LabourDraft>(initialLabour)
  const [pendingKind, setPendingKind] = useState<'comment' | 'labour' | null>(null)
  const [notice, setNotice] = useState<FormNotice | null>(null)
  const revision = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const valid = validIssueTarget(owner, repo, number)
  const numberValue = Number(number)
  const target = (owner || '') + '/' + (repo || '')
  const routeKey = target + '/issues/' + (number || '')

  useEffect(() => {
    setNotice(null)
  }, [routeKey])

  useEffect(() => {
    const current = ++revision.current
    const abort = new AbortController()
    controller.current = abort
    setState({ ...empty, key: routeKey })
    setPendingKind(null)
    if (!valid || !owner || !repo) {
      setState({ ...empty, key: routeKey, loading: false,
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
        setState({ key: routeKey, loading: false, issue, comments: uniqueComments(first.items),
          page: 1, hasMore: first.hasMore, fetchingMore: false,
          lastRead: new Date().toISOString(), error: null, pageError: '' })
      } catch (error) {
        if (current !== revision.current || abort.signal.aborted) return
        setState({ ...empty, key: routeKey, loading: false, error: asIssueError(error) })
      }
    })()
    return () => { abort.abort(); revision.current++ }
  }, [service, owner, repo, number, valid, numberValue, routeKey, reload])

  useEffect(() => {
    const abort = new AbortController()
    setAuth({ key: routeKey, status: 'checking', message: '' })
    if (!valid || !owner || !repo) return () => abort.abort()
    void (async () => {
      try {
        if (!await service.getSession(abort.signal)) {
          if (!abort.signal.aborted) setAuth({ key: routeKey, status: 'anonymous', message: '' })
          return
        }
        const verified = await service.verify(owner, repo, abort.signal)
        if (!abort.signal.aborted) setAuth(verified.repository.accessible
          ? { key: routeKey, status: 'authorized',
            message: 'GitHub OAuth 身份与 App 仓库范围已验证。' }
          : { key: routeKey, status: 'denied',
            message: '当前 OAuth 用户不能通过 App 访问此仓库。' })
      } catch (error) {
        if (!abort.signal.aborted) setAuth({
          key: routeKey, status: 'error', message: asIssueError(error).message,
        })
      }
    })()
    return () => abort.abort()
  }, [service, owner, repo, valid, routeKey])

  const issue = state.key === routeKey && !state.loading ? state.issue : null
  const completePages = Boolean(issue && !state.hasMore && !state.pageError &&
    state.comments.length >= issue.comments)
  const summary = useMemo(() => summarizeIssueComments(
    state.key === routeKey ? state.comments : [], completePages),
  [state.key, state.comments, routeKey, completePages])
  const authStatus = auth.key === routeKey ? auth.status : 'checking'
  const canWrite = authStatus === 'authorized' && Boolean(issue)
  const loginUrl = '/api/github-login?return_to=' + encodeURIComponent(location.pathname)

  const permission: PermissionView = {
    state: authStatus,
    allowed: canWrite,
    reason: authStatus === 'checking' ? '正在确认 GitHub OAuth 身份与仓库访问权限。'
      : authStatus === 'anonymous' ? '匿名用户只能阅读，发表评论或登记劳动需登录 GitHub。'
      : authStatus === 'denied' ? '当前 OAuth 用户未获此仓库的 App 授权，不能提交。'
      : authStatus === 'error' ? '无法确认写入权限：' + auth.message + '。'
      : canWrite ? '' : '当前 Issue 尚未成功加载，暂不能提交。',
    loginHref: authStatus === 'anonymous' || authStatus === 'denied' ||
      authStatus === 'error' ? loginUrl : null,
    loginText: authStatus === 'anonymous' ? 'GitHub 登录' : '重新授权',
  }

  async function loadMore() {
    if (!valid || !owner || !repo || !issue || !state.hasMore || state.fetchingMore) return
    const current = revision.current
    setState(previous => ({ ...previous, fetchingMore: true, pageError: '' }))
    try {
      const next = await service.getComments(owner, repo, numberValue, state.page + 1,
        controller.current?.signal || new AbortController().signal)
      if (current !== revision.current) return
      setState(previous => ({ ...previous, fetchingMore: false, page: previous.page + 1,
        comments: uniqueComments([...previous.comments, ...next.items]),
        lastRead: new Date().toISOString(), hasMore: next.hasMore, pageError: '' }))
    } catch (error) {
      if (current === revision.current) setState(previous => ({
        ...previous, fetchingMore: false, pageError: asIssueError(error).message,
      }))
    }
  }

  async function submit(body: string, kind: 'comment' | 'labour') {
    if (!canWrite || pendingKind || !owner || !repo || !valid || !body.trim() ||
        body.length > 20000 || !window.confirm('确认以当前 GitHub OAuth 用户身份发表这条' +
          (kind === 'labour' ? '劳动记录' : '评论') + '？')) return
    const current = revision.current
    setPendingKind(kind)
    setNotice(null)
    try {
      const response = await service.postComment(owner, repo, numberValue, body,
        controller.current?.signal || new AbortController().signal)
      if (current !== revision.current) return
      if (kind === 'comment') setDraft('')
      else setLabour(previous => ({ ...initialLabour, hours: previous.hours }))
      setNotice({ kind, tone: 'success',
        message: 'GitHub 已确认发表：评论 #' + response.id + '。正在重新读取 Issue 与评论。' })
      setReload(value => value + 1)
    } catch (error) {
      if (current === revision.current) setNotice({ kind, tone: 'error',
        message: asIssueError(error).message +
          '。如提交状态未知，请先在 GitHub 检查，避免重复发表。' })
    } finally {
      if (current === revision.current) setPendingKind(null)
    }
  }

  function submitLabour() {
    try {
      const shas = labour.commits.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
      const toRfc3339 = (value: string) => value ? new Date(value).toISOString() : ''
      const body = formatLabourComment({ work: labour.work, hr: Number(labour.hours),
        outcome: labour.outcome, commits: shas,
        start: toRfc3339(labour.start), end: toRfc3339(labour.end) })
      void submit(body, 'labour')
    } catch {
      setNotice({ kind: 'labour', tone: 'error',
        message: '劳动记录不符合 §9.4：请检查工作内容、0.5 小时步长、完整 Commit SHA 和起止时间。' })
    }
  }

  const warnings: string[] = []
  if (issue && state.hasMore) warnings.push('还有未加载的评论。当前统计不能视为完整。')
  if (issue && state.comments.length < issue.comments) {
    warnings.push('GitHub 评论数量尚未核对完毕。')
  }
  if (summary.invalidCandidates.length) warnings.push('存在格式无效的候选劳动记录。')
  if (summary.conflicts.length) warnings.push('存在重复关联 Commit 的劳动记录，冲突记录暂不计入总数。')

  const latestOutcome = [...summary.records].filter(record => !record.conflicted && record.outcome)
    .sort((a, b) => (Date.parse(b.comment.created_at) || 0) -
      (Date.parse(a.comment.created_at) || 0))[0]
  const model: IssueDetailViewModel = {
    routeKey,
    navigation: { homeHref: '/', repositoryHref: '/' + target, repository: target },
    load: {
      phase: state.key !== routeKey || state.loading ? 'loading'
        : state.error ? 'error' : 'ready',
      error: state.key === routeKey ? state.error?.message || null : null,
      statusCode: state.key === routeKey ? state.error?.status || null : null,
    },
    issue: issue ? {
      number: issue.number, title: issue.title, state: issue.state === 'open' ? 'Open' : 'Closed',
      author: issue.user?.login || '未知', created: issue.created_at || '未知',
      body: issue.body || '（无正文）', sourceUrl: safeGitHubUrl(issue.html_url),
      updated: issue.updated_at || '未知',
      labourSummary: {
        hours: summary.hours, complete: summary.complete,
        statusText: summary.complete
          ? '已读取全部评论；仅合计无冲突的有效主观登记工时。'
          : '仅为已读取评论中的无冲突主观登记工时，非完整汇总。',
        outcome: latestOutcome ? {
          text: latestOutcome.outcome!, author: latestOutcome.comment.user?.login || '未知',
          time: latestOutcome.comment.created_at,
          sourceUrl: safeGitHubUrl(latestOutcome.comment.html_url),
        } : null,
        outcomeEmptyText: summary.complete
          ? '当前 Issue 没有已登记的有效成果。'
          : '目前已读取的记录中暂无可确认的成果；评论尚可能不完整。',
      },
      pagination: {
        loaded: state.comments.length, expected: issue.comments, hasMore: state.hasMore,
        fetchingMore: state.fetchingMore, error: state.pageError, lastRead: state.lastRead,
        warnings, complete: completePages,
      },
      discussion: {
        comments: summary.discussion.map(item => ({
          id: item.id, author: item.user?.login || '未知', time: item.created_at,
          body: item.body || '（空评论）', sourceUrl: safeGitHubUrl(item.html_url),
        })),
        emptyText: completePages
          ? '当前 Issue 没有普通讨论评论。'
          : '已读取的评论中尚无普通讨论；还有评论可能未取得。',
      },
      labour: {
        records: summary.records.map(record => ({
          id: record.comment.id, author: record.comment.user?.login || '未知',
          time: record.comment.created_at, work: record.work, hours: record.hours,
          outcome: record.outcome, conflicted: record.conflicted,
          occurrence: record.startEnd
            ? record.startEnd.start + ' — ' + record.startEnd.end : '未登记',
          sourceUrl: safeGitHubUrl(record.comment.html_url),
          commits: record.commits.map(sha => ({
            sha, href: 'https://github.com/' + target + '/commit/' + sha,
          })),
        })),
        emptyText: completePages
          ? '当前 Issue 没有有效 Labour Record 登记。'
          : '已读取的评论中尚无有效劳动记录；仍有评论可能未取得。',
        invalidCount: summary.invalidCandidates.length,
      },
    } : null,
    form: { draft, labour, pending: Boolean(pendingKind), pendingKind,
      notice, permission },
  }

  const actions: IssueDetailViewActions = {
    onRetry: () => setReload(value => value + 1),
    onRefresh: () => { if (!pendingKind) setReload(value => value + 1) },
    onLoadMore: () => { void loadMore() },
    onCommentChange: setDraft,
    onLabourChange: (field: LabourField, value: string) => {
      setLabour(previous => ({ ...previous, [field]: value }))
    },
    onSubmitComment: () => { void submit(draft, 'comment') },
    onSubmitLabour: submitLabour,
  }
  return <IssueDetailView key={routeKey} model={model} actions={actions}/>
}
