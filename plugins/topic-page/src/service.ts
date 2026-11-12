export type TopicRoute = { owner: string; repo: string }
export type TopicRepository = {
  full_name: string; name: string; owner: string | null;
  description: string; html_url: string; stargazers_count: number;
  language: string | null
}
export type TopicSnapshot = {
  repository: { owner: string; name: string; full_name: string; html_url: string }
  readme: string; coverUrl: string | null;
  config: { topic: string; whitelist: boolean };
  allowedRepositories: string[]
}
export type TopicProjectsPage = {
  page: number; perPage: number; totalCount: number;
  hasNext: boolean; windowExhausted: boolean; items: TopicRepository[]
}
export type TopicPageError = Error & { stage?: string; status?: number; retryable?: boolean; observedAt?: string; outcomeUnknown?: boolean }
export type ReportIssue = { title: string; body: string }
export interface TopicPageApi {
  readonly reportAvailable: boolean
  getSnapshot(route: TopicRoute, signal: AbortSignal): Promise<TopicSnapshot>
  getProjects(route: TopicRoute, page: number, signal: AbortSignal): Promise<TopicProjectsPage>
  getSession(signal: AbortSignal): Promise<boolean>
  getReportTarget(route: TopicRoute, signal: AbortSignal): Promise<string>
  submitReport(route: TopicRoute, report: ReportIssue, proof: string, signal: AbortSignal): Promise<string>
}
/** @summary Read public Topics and use only the current user's OAuth session for confirmed reports. */
export class TopicPageService implements TopicPageApi {
  readonly reportAvailable = true
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  private async read<T>(url: string, signal: AbortSignal): Promise<T> {
    const response = await this.fetcher(url, { cache: 'no-store', signal,
      credentials: 'same-origin' })
    let body: any
    try { body = await response.json() }
    catch { throw Object.assign(new Error('TopicPage API 响应无效'),
      { stage: 'source', status: 502 }) }
    if (!response.ok) throw Object.assign(new Error(body?.error || 'HTTP ' + response.status), {
      stage: body?.stage || 'source', status: response.status,
      retryable: body?.retryable !== false,
    })
    return body as T
  }
  getSnapshot(route: TopicRoute, signal: AbortSignal) {
    return this.read<TopicSnapshot>('/api/topic-page?' +
      new URLSearchParams(route).toString(), signal)
  }
  getProjects(route: TopicRoute, page: number, signal: AbortSignal) {
    return this.read<TopicProjectsPage>('/api/topic-projects?' +
      new URLSearchParams({ ...route, page: String(page) }), signal)
  }
  async getSession(signal: AbortSignal) {
    const data = await this.read<{ authenticated?: boolean }>('/api/github-session', signal)
    return data.authenticated === true
  }
  async getReportTarget(route: TopicRoute, signal: AbortSignal): Promise<string> {
    const data = await this.read<{ proof?: string; state?: string }>(
      '/api/topic-report?' + new URLSearchParams(route), signal)
    if (data.state !== 'ready' || typeof data.proof !== 'string' || !data.proof) {
      throw Object.assign(new Error('报告仓库权限核查失败，请重新登录或检查仓库权限'),
        { status: 403, stage: 'permission' })
    }
    return data.proof
  }
  async submitReport(route: TopicRoute, report: ReportIssue,
    proof: string, signal: AbortSignal): Promise<string> {
    // A single user-confirmed POST. Never automatically retry an uncertain write.
    let response: Response
    try {
      response = await this.fetcher('/api/topic-report', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal,
        headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
        body: JSON.stringify({ ...route, title: report.title, body: report.body,
          confirmed: true, proof }),
      })
    } catch {
      throw Object.assign(new Error(
        '创建结果未知；请先到 GitHub 检查是否已创建 Issue，再决定是否重试'),
        { status: 502, stage: 'report', outcomeUnknown: true })
    }
    let payload: any
    try { payload = await response.json() }
    catch {
      throw Object.assign(new Error(
        'GitHub 写入响应无法核实；请先到 GitHub 检查，避免重复创建'),
        { status: 502, stage: 'report', outcomeUnknown: true })
    }
    if (!response.ok) throw Object.assign(new Error(payload?.error ||
      '创建 Issue 失败，HTTP ' + response.status), {
      status: response.status, stage: 'report',
      outcomeUnknown: payload?.outcomeUnknown === true,
    })
    const value = payload?.issue?.html_url
    const id = payload?.issue?.number
    let safe = false
    if (typeof value === 'string' && Number.isSafeInteger(id) && id > 0) {
      try {
        const url = new URL(value)
        safe = url.protocol === 'https:' && url.hostname === 'github.com' &&
          !url.search && !url.hash && url.pathname.toLowerCase() ===
            ('/' + route.owner + '/' + route.repo + '/issues/' + id).toLowerCase()
      } catch { safe = false }
    }
    if (response.status !== 201 || payload?.state !== 'created' || !safe) {
      throw Object.assign(new Error(
        'Issue 已提交，但 GitHub 返回的创建结果无法确认；请先核查再重试'),
        { status: 502, stage: 'report', outcomeUnknown: true })
    }
    return value as string
  }
}
