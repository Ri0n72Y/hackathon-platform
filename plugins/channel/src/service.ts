export type ChannelIssue = {
  number: number
  title: string
  createdAt: string
  comments: number
  author: string | null
}
export type ChannelChoice = {
  label: string
  name: string
  issue: ChannelIssue | null
}
export type ChannelSnapshot = {
  state: 'ready' | 'config_missing' | 'invalid_config' | 'no_channels' |
    'sync_branch_missing' | 'snapshot_incomplete'
  branch: 'main'
  channels: ChannelChoice[]
  headSha?: string
  pages?: number
  scannedIssues?: number
  error?: string
}
export class ChannelRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export interface ChannelApi {
  getChannels(owner: string, repo: string, signal: AbortSignal): Promise<ChannelSnapshot>
}

/** @summary Load one installed public repository's main-only Channel choices. */
export class ChannelService implements ChannelApi {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async getChannels(owner: string, repo: string, signal: AbortSignal) {
    const params = new URLSearchParams({ owner, repo })
    const response = await this.fetcher('/api/repo-channels?' + params, {
      signal, credentials: 'same-origin', cache: 'no-store',
    })
    let body: unknown
    try { body = await response.json() }
    catch { throw new ChannelRequestError('Channel 服务响应无效', 502) }
    if (!response.ok) {
      const value = body && typeof body === 'object' && 'error' in body &&
        typeof body.error === 'string' ? body.error : 'HTTP ' + response.status
      throw new ChannelRequestError(value, response.status)
    }
    if (!body || typeof body !== 'object' || !('channels' in body) ||
        !Array.isArray(body.channels) || !('state' in body) ||
        !['ready', 'config_missing', 'invalid_config', 'no_channels',
          'sync_branch_missing', 'snapshot_incomplete'].includes(String(body.state))) {
      throw new ChannelRequestError('Channel 服务数据不完整', 502)
    }
    return body as ChannelSnapshot
  }
}
