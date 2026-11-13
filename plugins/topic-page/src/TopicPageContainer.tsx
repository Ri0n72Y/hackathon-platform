import { useEffect, useRef, useState, type FormEvent } from 'react'
import { validTopicRepository, loadTopicProjectCandidates } from './domain.mjs'
import type { TopicPageApi, TopicRoute, TopicPageError, TopicRepository,
  TopicSnapshot } from './service'
import TopicPageView from './TopicPageView'

type ReadState = {
  snapshot: TopicSnapshot | null; projects: TopicRepository[];
  loading: boolean; error: TopicPageError | null; windowExhausted: boolean
}
type ReportState = {
  open: boolean; title: string; body: string; pending: boolean;
  checking: boolean; uncertain: boolean; proof: string;
  message: string; url: string
}
const EMPTY_REPORT: ReportState = {
  open: false, title: '', body: '', pending: false, checking: false,
  uncertain: false, proof: '', message: '', url: '',
}
function asError(value: unknown, stage = 'source'): TopicPageError {
  if (value instanceof Error) return Object.assign(value,
    { stage: (value as TopicPageError).stage || stage,
      observedAt: new Date().toISOString() })
  return Object.assign(new Error('TopicPage 请求失败'),
    { stage, status: 502, observedAt: new Date().toISOString() })
}

/** @summary Load public Topic results and orchestrate an explicitly confirmed user OAuth Issue report. */
export default function TopicPageContainer({ owner, repo, api }: {
  owner: string; repo: string; api: TopicPageApi
}) {
  const route: TopicRoute = { owner, repo }
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<ReadState>({
    snapshot: null, projects: [], loading: true, error: null, windowExhausted: false,
  })
  const [authenticated, setAuthenticated] = useState(false)
  const [report, setReport] = useState<ReportState>(EMPTY_REPORT)
  const writeAbort = useRef<AbortController | null>(null)
  const proofAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    setState({ snapshot: null, projects: [], loading: true,
      error: null, windowExhausted: false })
    if (!validTopicRepository(owner, repo)) {
      setState({ snapshot: null, projects: [], loading: false,
        error: Object.assign(new Error('TopicPage URL 仓库参数无效'),
          { stage: 'route', status: 400, observedAt: new Date().toISOString() }),
        windowExhausted: false })
      return () => abort.abort()
    }
    void (async () => {
      let meta: TopicSnapshot | null = null
      let projects: TopicRepository[] = []
      try {
        meta = await api.getSnapshot(route, abort.signal)
        if (abort.signal.aborted) return
        setState(prev => ({ ...prev, snapshot: meta }))
        const result = await loadTopicProjectCandidates(meta, page =>
          api.getProjects(route, page, abort.signal), abort.signal)
        if (abort.signal.aborted) return
        projects = result.items as TopicRepository[]
        setState({ snapshot: meta, projects, loading: false,
          error: null, windowExhausted: result.windowExhausted })
      } catch (error) {
        if (!abort.signal.aborted) setState({
          snapshot: meta, projects, loading: false,
          error: asError(error), windowExhausted: false,
        })
      }
    })()
    return () => abort.abort()
  }, [api, owner, repo, revision])

  useEffect(() => {
    const abort = new AbortController()
    void api.getSession(abort.signal).then(connected => {
      if (!abort.signal.aborted) setAuthenticated(connected)
    }).catch(() => {
      if (!abort.signal.aborted) setAuthenticated(false)
    })
    return () => abort.abort()
  }, [api, owner, repo])

  useEffect(() => () => {
    writeAbort.current?.abort()
    proofAbort.current?.abort()
  }, [])

  async function checkReportTarget() {
    proofAbort.current?.abort()
    const controller = new AbortController()
    proofAbort.current = controller
    setReport(prev => ({ ...prev, checking: true, proof: '',
      message: prev.uncertain ? prev.message : '' }))
    try {
      const proof = await api.getReportTarget(route, controller.signal)
      if (!controller.signal.aborted) setReport(prev => ({
        ...prev, checking: false, proof,
      }))
    } catch (error) {
      if (!controller.signal.aborted) setReport(prev => ({
        ...prev, checking: false, proof: '',
        message: asError(error, 'permission').message +
          '。当前报告草稿已保留；可在 GitHub 手动创建 Issue。',
      }))
    }
  }
  function openReport() {
    if (!authenticated || !state.error) return
    const issueError = state.error
    const stage = issueError.stage || 'source'
    setReport(prev => ({
      open: true, pending: false, checking: true,
      uncertain: prev.uncertain, proof: '', url: prev.url,
      message: prev.uncertain ?
        '上次提交结果未知。请先在 GitHub 检查是否已创建，再确认允许重试。' : '',
      title: prev.uncertain ? prev.title :
        '[TopicPage] ' + stage + ' 失败：' + owner + '/' + repo,
      body: prev.uncertain ? prev.body :
        '页面：/topic/' + owner + '/' + repo + '\n阶段：' + stage +
        '\nHTTP：' + (issueError.status || 'unknown') +
        '\n说明：' + issueError.message.slice(0, 600) +
        '\n时间：' + new Date().toISOString(),
    }))
    void checkReportTarget()
  }
  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (writeAbort.current || !api.reportAvailable || !authenticated || report.pending || report.checking ||
        report.uncertain || !report.proof || !report.title.trim() ||
        !report.body.trim()) return
    const controller = new AbortController()
    writeAbort.current = controller
    setReport(prev => ({ ...prev, pending: true, message: '' }))
    try {
      const url = await api.submitReport(route,
        { title: report.title, body: report.body }, report.proof, controller.signal)
      if (!controller.signal.aborted) setReport(prev =>
        ({ ...prev, open: false, pending: false, proof: '', url }))
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = asError(error, 'report')
        setReport(prev => ({
          ...prev, pending: false, uncertain: failure.outcomeUnknown === true,
          proof: failure.outcomeUnknown ? '' : prev.proof,
          message: failure.message + (failure.outcomeUnknown ?
            '。请在 GitHub 核查后，明确点击“已核查，允许再次提交”。' :
            '。草稿已保留，请修改或稍后重试。'),
        }))
      }
    } finally {
      if (writeAbort.current === controller) writeAbort.current = null
    }
  }
  function acknowledgeUnknown() {
    // Explicit user click only. This rechecks authority; it NEVER replays the POST.
    setReport(prev => ({ ...prev, uncertain: false, proof: '', message: '' }))
    void checkReportTarget()
  }
  return <TopicPageView owner={owner} repo={repo}
    snapshot={state.snapshot} projects={state.projects} loading={state.loading}
    error={state.error} windowExhausted={state.windowExhausted}
    report={report} canReport={authenticated && Boolean(state.error)}
    writeEnabled={api.reportAvailable && !!report.proof &&
      !report.uncertain && !report.checking}
    onRetry={() => setRevision(n => n + 1)}
    onOpenReport={openReport}
    onCloseReport={() => {
      proofAbort.current?.abort()
      if (!report.pending) setReport(prev => ({ ...prev, open: false, checking: false }))
    }}
    onConfirmUnknown={acknowledgeUnknown}
    onReportTitleChange={title => setReport(prev => ({ ...prev, title }))}
    onReportBodyChange={body => setReport(prev => ({ ...prev, body }))}
    onSubmitReport={event => { void submitReport(event) }}/>
}
