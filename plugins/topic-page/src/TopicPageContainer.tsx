import { useEffect, useRef, useState, type FormEvent } from 'react'
import { validTopicRepository, accumulateTopicProjects } from './domain.mjs'
import type { TopicPageApi, TopicRoute, TopicPageError, TopicRepository,
  TopicSnapshot } from './service'
import TopicPageView from './TopicPageView'

type ReadState = {
  snapshot: TopicSnapshot | null; projects: TopicRepository[];
  loading: boolean; error: TopicPageError | null; windowExhausted: boolean;
}
type ReportState = {
  open: boolean; title: string; body: string; pending: boolean;
  message: string; url: string;
}
const EMPTY_REPORT: ReportState = {
  open: false, title: '', body: '', pending: false, message: '', url: '',
}
function asError(value: unknown, stage = 'source'): TopicPageError {
  if (value instanceof Error) return Object.assign(value,
    { stage: (value as TopicPageError).stage || stage })
  return Object.assign(new Error('TopicPage 读取失败'), { stage, status: 502 })
}

/** @summary Load Topic source and filter consecutive Search pages until 10 eligible projects or termination. */
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
  const reportAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    setState({ snapshot: null, projects: [], loading: true,
      error: null, windowExhausted: false })
    if (!validTopicRepository(owner, repo)) {
      setState({ snapshot: null, projects: [], loading: false,
        error: Object.assign(new Error('TopicPage URL 仓库参数无效'),
          { stage: 'route', status: 400 }), windowExhausted: false })
      return () => abort.abort()
    }
    void (async () => {
      let meta: TopicSnapshot | null = null
      let projects: TopicRepository[] = []
      try {
        meta = await api.getSnapshot(route, abort.signal)
        if (abort.signal.aborted) return
        setState(prev => ({ ...prev, snapshot: meta }))
        const pages = []
        for (let page = 1; page <= 34 && !abort.signal.aborted; page++) {
          const found = await api.getProjects(route, page, abort.signal)
          if (abort.signal.aborted) return
          if (found.page !== page || !Array.isArray(found.items) ||
              (found.hasNext && page === 34)) throw Object.assign(
            new Error('GitHub Search 分页响应不一致'), { stage: 'topic-search', status: 502 })
          pages.push(found)
          const summary = accumulateTopicProjects(meta, pages)
          projects = summary.items as TopicRepository[]
          if (summary.ended || projects.length >= 10) {
            setState({ snapshot: meta, projects, loading: false,
              error: null, windowExhausted: summary.windowExhausted })
            return
          }
        }
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
    void api.getSession(abort.signal).then(result => {
      if (!abort.signal.aborted) setAuthenticated(result)
    }).catch(() => {
      if (!abort.signal.aborted) setAuthenticated(false)
    })
    return () => abort.abort()
  }, [api, owner, repo])

  useEffect(() => () => { reportAbort.current?.abort() }, [])

  function openReport() {
    if (!authenticated || !state.error) return
    const stage = state.error.stage || 'source'
    setReport({
      open: true, pending: false, message: '', url: '',
      title: '[TopicPage] ' + stage + ' 失败：' + owner + '/' + repo,
      body: '页面：/topic/' + owner + '/' + repo + '\n阶段：' + stage +
        '\nHTTP：' + (state.error.status || 'unknown') +
        '\n说明：' + state.error.message.slice(0, 600) +
        '\n时间：' + new Date().toISOString(),
    })
  }
  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!api.reportAvailable || !authenticated || report.pending ||
        !report.title.trim() || !report.body.trim()) return
    const controller = new AbortController()
    reportAbort.current = controller
    setReport(prev => ({ ...prev, pending: true, message: '' }))
    try {
      const url = await api.submitReport(route, { title: report.title, body: report.body },
        controller.signal)
      if (!controller.signal.aborted) setReport(prev =>
        ({ ...prev, open: false, pending: false, url }))
    } catch (error) {
      if (!controller.signal.aborted) setReport(prev => ({
        ...prev, pending: false, message: asError(error, 'report').message +
          '。草稿已保留，请检查后再试。',
      }))
    }
  }
  return <TopicPageView owner={owner} repo={repo}
    snapshot={state.snapshot} projects={state.projects} loading={state.loading}
    error={state.error} windowExhausted={state.windowExhausted}
    report={report} canReport={authenticated && Boolean(state.error)}
    writeEnabled={api.reportAvailable}
    onRetry={() => setRevision(n => n + 1)}
    onOpenReport={openReport}
    onCloseReport={() => { reportAbort.current?.abort()
      setReport(prev => ({ ...prev, open: false, pending: false })) }}
    onReportTitleChange={title => setReport(prev => ({ ...prev, title }))}
    onReportBodyChange={body => setReport(prev => ({ ...prev, body }))}
    onSubmitReport={event => { void submitReport(event) }}/>
}
