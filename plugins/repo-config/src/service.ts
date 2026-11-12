export type ConfigLabelPlan = {
  createLabels: Array<{ name: string }>
  removeIssueLabels: Array<{ number: number; labels: string[] }>
  impact: { definitions: number; issues: number; removals: number }
  hasChanges: boolean
  requiresConfirmation: boolean
}
export type ConfigCapability = {
  state: string
  user?: { login: string; id: number }
  userPermissions?: { pull: boolean; triage: boolean; push: boolean; maintain: boolean; admin: boolean }
  appPermissions?: Record<string, string>
  protectedBranch?: boolean
  branchHead?: string
  canSaveConfig?: boolean
  canCreateLabels?: boolean
  canRemoveLabels?: boolean
  missingAppPermissions?: string[]
  error?: string
}
export type ConfigSnapshot = {
  state: string
  branch?: string
  headSha?: string
  fileSha?: string | null
  configText?: string | null
  config?: { state: string; defaultPreview?: string; error?: string; namespaces?: Record<string, string[]> }
  snapshotId?: string
  counts?: { labels: number; issueObjects: number }
  plan?: ConfigLabelPlan | null
  capability?: ConfigCapability
  prUrl?: string
  error?: string
}
export type ConfigActionResult = {
  state: string
  error?: string
  prUrl?: string
  prNumber?: number
  branch?: string
  branchUrl?: string
  commitSha?: string
  fileSha?: string
  headSha?: string
  requestedBy?: string
  createdLabels?: string[]
  removedAssociations?: number | Array<{ number: number; label: string }>
  failed?: Array<{ kind: string; error: string; name?: string; number?: number; label?: string; retryAfter?: string | null }>
  pending?: unknown
  retryAfter?: string | null
  noChanges?: boolean
  reconciled?: boolean
}
export class RepoConfigError extends Error {
  constructor(message: string, readonly status: number, readonly state = 'error') {
    super(message)
  }
}
export interface RepoConfigApi {
  get(owner: string, repo: string, signal: AbortSignal): Promise<ConfigSnapshot>
  save(owner: string, repo: string, content: string, expectedHeadSha: string,
    expectedFileSha: string | null, signal: AbortSignal): Promise<ConfigActionResult>
  sync(owner: string, repo: string, previewId: string, confirmRemovals: boolean,
    signal: AbortSignal): Promise<ConfigActionResult>
}

/** @summary Call the protected Config API with same-origin credentials and structured error states. */
export class RepoConfigService implements RepoConfigApi {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async request<T>(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(url, {
      ...init, signal, credentials: 'same-origin', cache: 'no-store',
    })
    let data: unknown
    try { data = await response.json() }
    catch { throw new RepoConfigError('服务端响应格式无效', 502) }
    if (!response.ok) {
      const value = data && typeof data === 'object' ? data as Record<string, unknown> : {}
      throw new RepoConfigError(
        typeof value.error === 'string' ? value.error : 'HTTP ' + response.status,
        response.status,
        typeof value.state === 'string' ? value.state : 'error',
      )
    }
    return data as T
  }

  private params(owner: string, repo: string) {
    return new URLSearchParams({ owner, repo }).toString()
  }

  get(owner: string, repo: string, signal: AbortSignal) {
    return this.request<ConfigSnapshot>('/api/repo-config?' + this.params(owner, repo), signal)
  }

  save(owner: string, repo: string, content: string, expectedHeadSha: string,
    expectedFileSha: string | null, signal: AbortSignal) {
    return this.request<ConfigActionResult>('/api/repo-config', signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
      body: JSON.stringify({ action: 'save_config', owner, repo, branch: 'main',
        content, expectedHeadSha, expectedFileSha }),
    })
  }

  sync(owner: string, repo: string, previewId: string, confirmRemovals: boolean,
    signal: AbortSignal) {
    return this.request<ConfigActionResult>('/api/repo-config', signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
      body: JSON.stringify({ action: 'sync_labels', owner, repo, branch: 'main',
        previewId, confirmRemovals }),
    })
  }
}
