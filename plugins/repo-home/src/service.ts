import type { Member } from './domain.mjs'
export type Team = { state: 'ready' | 'empty' | 'missing' | 'invalid' | 'error'; members: Member[]; error?: string; sha?: string | null }
export type RepoHomeData = {
  repository: { full_name: string; name: string; description: string | null; html_url: string; default_branch: string }
  branch: string
  readme: { state: 'ready' | 'missing' | 'error'; content?: string; path?: string; error?: string }
  team: Team
}
export type RepoFeedIssue = { id: number; number: number; state: string; title: string; body: string | null;
  html_url: string; updated_at: string; user?: { login: string } | null; pull_request?: unknown }
export type RepoFeedPage = { page: number; items: RepoFeedIssue[]; hasMore: boolean }
export type MemberCapability = { user: { login: string; id: number }; branch: string; protected: boolean; mode: 'pr' | 'commit' }
export type MemberSubmitResult = { status: 'committed' | 'pending_pr'; url: string; sha: string; requestedBy: string }
export class RepoHomeError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export interface RepoHomeApi {
  getHome(owner: string, repo: string, branch: string, signal: AbortSignal): Promise<RepoHomeData>
  getFeed(owner: string, repo: string, page: number, signal: AbortSignal, labelFilter?: string[]): Promise<RepoFeedPage>
  getCapability(owner: string, repo: string, branch: string, signal: AbortSignal): Promise<MemberCapability>
  register(owner: string, repo: string, branch: string, member: Omit<Member,'id'>,
    signal: AbortSignal): Promise<MemberSubmitResult>
}
export function displayBranchKey(owner: string, repo: string) {
  return 'labourchain:display-branch:' + owner.toLowerCase() + '/' + repo.toLowerCase()
}
export function readDisplayBranch(owner: string, repo: string) {
  try { return localStorage.getItem(displayBranchKey(owner, repo)) || 'main' }
  catch { return 'main' }
}
/** @summary Relay project, feed and registration requests with abort and same-origin credentials. */
export class RepoHomeService implements RepoHomeApi {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  private async read(url: string, signal: AbortSignal, init: RequestInit = {}) {
    const response = await this.fetcher(url, { ...init, signal, credentials: 'same-origin', cache: 'no-store' })
    let data: unknown
    try { data = await response.json() } catch { throw new RepoHomeError('服务端响应格式无效', 502) }
    if (!response.ok) {
      const error = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error : 'HTTP ' + response.status
      throw new RepoHomeError(error, response.status)
    }
    return data
  }
  private params(owner: string, repo: string, additional: Record<string,string> = {}) {
    return new URLSearchParams({ owner, repo, ...additional }).toString()
  }
  async getHome(owner: string, repo: string, branch: string, signal: AbortSignal) {
    return await this.read('/api/repo-home?' + this.params(owner, repo, { branch }), signal) as RepoHomeData
  }
  async getFeed(owner: string, repo: string, page: number, signal: AbortSignal, labelFilter: string[] = []) {
    const query: Record<string,string> = { page: String(page) }
    if (labelFilter.length) query.labels = labelFilter.join(',')
    return await this.read('/api/repo-feed?' + this.params(owner, repo, query), signal) as RepoFeedPage
  }
  async getCapability(owner: string, repo: string, branch: string, signal: AbortSignal) {
    return await this.read('/api/repo-member-permission?' + this.params(owner, repo, { branch }),
      signal) as MemberCapability
  }
  async register(owner: string, repo: string, branch: string, member: Omit<Member,'id'>,
    signal: AbortSignal) {
    return await this.read('/api/repo-member-register', signal, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
      body: JSON.stringify({ owner, repo, branch, member }),
    }) as MemberSubmitResult
  }
}
