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
export type TopicPageError = Error & { stage?: string; status?: number; retryable?: boolean }
export type ReportIssue = { title: string; body: string }
export interface TopicPageApi {
  readonly reportAvailable: boolean
  getSnapshot(route: TopicRoute, signal: AbortSignal): Promise<TopicSnapshot>
  getProjects(route: TopicRoute, page: number, signal: AbortSignal): Promise<TopicProjectsPage>
  getSession(signal: AbortSignal): Promise<boolean>
  submitReport(route: TopicRoute, report: ReportIssue, signal: AbortSignal): Promise<string>
}
/** @summary Transport anonymous public Topic metadata and explicit session status without unsafe writes. */
export class TopicPageService implements TopicPageApi {
  readonly reportAvailable = false
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
  async submitReport(_route: TopicRoute, _report: ReportIssue, _signal: AbortSignal): Promise<string> {
    // The old #35 write endpoint bypasses current main's installation/CSRF policy.
    // No browser-side fallback or Bot credentials are permitted before explicit review.
    throw Object.assign(new Error('站内创建错误 Issue 的授权链路尚待审批；请复制草稿在 GitHub 手动提交'), {
      status: 503, stage: 'report',
    })
  }
}
