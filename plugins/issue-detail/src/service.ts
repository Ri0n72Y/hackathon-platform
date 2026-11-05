export type GithubIssue = {
  number: number; title: string; body: string | null; state: string; html_url: string;
  labels: Array<string | { name: string }>; comments: number;
  user?: { login: string }; created_at?: string; updated_at?: string;
  closed_at?: string | null; locked?: boolean; pull_request?: unknown;
  [field: string]: unknown
}
export type GithubComment = {
  id: number; body: string; html_url: string; created_at: string;
  user?: { login: string }; [field: string]: unknown
}
export type GithubVerification = {
  user: { id: number; login: string }
  repository: { full_name: string; accessible: boolean;
    permissions: { admin: boolean; maintain: boolean; push: boolean;
      triage: boolean; pull: boolean } | null }
}
export class IssueRequestError extends Error {
  constructor(message: string, readonly status: number, readonly relogin = false) { super(message) }
}
export interface IssueDetailApi {
  getIssue(owner: string, repo: string, number: number, signal: AbortSignal): Promise<GithubIssue>
  getConfig(owner: string, repo: string, signal: AbortSignal): Promise<string>
  getComments(owner: string, repo: string, number: number, page: number,
    signal: AbortSignal): Promise<{ items: GithubComment[]; hasMore: boolean }>
  getSession(signal: AbortSignal): Promise<boolean>
  verify(owner: string, repo: string, signal: AbortSignal): Promise<GithubVerification>
  postComment(owner: string, repo: string, number: number, body: string,
    signal: AbortSignal): Promise<GithubComment>
}

/** @summary Fetch full GitHub objects and route-specific OAuth state through Vercel Functions. */
export class IssueDetailService implements IssueDetailApi {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async read(path: string, signal: AbortSignal, init: RequestInit = {}) {
    const response = await this.fetcher(path, { ...init, signal, cache: 'no-store',
      credentials: 'same-origin' })
    let body: unknown
    try { body = await response.json() }
    catch { throw new IssueRequestError('Invalid server response', 502) }
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'error' in body &&
        typeof body.error === 'string' ? body.error : 'HTTP ' + response.status
      const relogin = Boolean(body && typeof body === 'object' && 'relogin' in body &&
        body.relogin === true)
      throw new IssueRequestError(message, response.status, relogin)
    }
    return { body, response }
  }

  private query(owner: string, repo: string, number?: number, page?: number) {
    const q = new URLSearchParams({ owner, repo })
    if (number !== undefined) q.set('number', String(number))
    if (page !== undefined) q.set('page', String(page))
    return '?' + q
  }

  async getIssue(owner: string, repo: string, number: number, signal: AbortSignal) {
    return (await this.read('/api/issue-detail' + this.query(owner, repo, number), signal))
      .body as GithubIssue
  }

  async getConfig(owner: string, repo: string, signal: AbortSignal) {
    const { body } = await this.read('/api/issue-config' + this.query(owner, repo), signal)
    const content = body as { encoding?: string; content?: string }
    if (content.encoding !== 'base64' || typeof content.content !== 'string') {
      throw new IssueRequestError('Invalid repository configuration encoding', 422)
    }
    try {
      const bytes = Uint8Array.from(atob(content.content.replace(/\s/g, '')), c => c.charCodeAt(0))
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch { throw new IssueRequestError('Repository configuration cannot be decoded', 422) }
  }

  async getComments(owner: string, repo: string, number: number, page: number, signal: AbortSignal) {
    const { body, response } = await this.read('/api/issue-comments' +
      this.query(owner, repo, number, page), signal)
    if (!Array.isArray(body)) throw new IssueRequestError('Invalid comments page', 502)
    return { items: body as GithubComment[],
      hasMore: /<[^>]+>;\s*rel="next"/.test(response.headers.get('link') || '') }
  }

  async getSession(signal: AbortSignal) {
    const { body } = await this.read('/api/github-session', signal)
    return (body as { authenticated?: boolean }).authenticated === true
  }

  async verify(owner: string, repo: string, signal: AbortSignal) {
    return (await this.read('/api/github-verify' + this.query(owner, repo), signal))
      .body as GithubVerification
  }

  async postComment(owner: string, repo: string, number: number, body: string, signal: AbortSignal) {
    const result = await this.read('/api/github-issue-comment', signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
      body: JSON.stringify({ owner, repo, number, body }),
    })
    const comment = (result.body as { comment?: GithubComment }).comment
    if (!comment || !Number.isSafeInteger(comment.id)) {
      throw new IssueRequestError('GitHub comment response is invalid', 502)
    }
    return comment
  }
}
