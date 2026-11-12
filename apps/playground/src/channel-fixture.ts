import { ChannelRequestError, type ChannelApi, type ChannelSnapshot } from
  '../../../plugins/channel/src/service'

const selectedIssue = {
  number: 1, title: 'Channel fixture：讨论与劳动记录',
  createdAt: '2026-11-10T09:00:00Z', comments: 4, author: 'fixture-author',
}
const CHANNELS = [
  { label: 'channel:discussion', name: 'discussion', issue: selectedIssue },
  { label: 'channel:wishlist', name: 'wishlist', issue: null },
]

/** @summary Supply isolated, abortable Channel data without touching GitHub or Vercel. */
export function createChannelFixtureService(query: URLSearchParams): ChannelApi {
  const mode = query.get('channelCase') || 'ready'
  return {
    async getChannels(owner, repo, signal): Promise<ChannelSnapshot> {
      // Let target switches exercise the same AbortSignal contract as production.
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
        const timeout = setTimeout(() => {
          signal.removeEventListener('abort', cancel)
          resolve()
        }, mode === 'slow' ? 400 : 25)
        function cancel() {
          clearTimeout(timeout)
          reject(new DOMException('Aborted', 'AbortError'))
        }
        signal.addEventListener('abort', cancel, { once: true })
      })
      if (owner !== 'sample' || repo !== 'repo') {
        throw new ChannelRequestError('Fixture: 仓库不可访问（HTTP 403）', 403)
      }
      if (mode === 'denied') {
        throw new ChannelRequestError('Fixture: GitHub App 未安装于当前仓库', 403)
      }
      if (mode === 'failure') {
        throw new ChannelRequestError('Fixture: GitHub API 429 限流', 429)
      }
      const state = mode === 'missing' ? 'config_missing' :
        mode === 'invalid' ? 'invalid_config' :
          mode === 'no-channels' ? 'no_channels' :
            mode === 'incomplete' ? 'snapshot_incomplete' : 'ready'
      return {
        state, branch: 'main', headSha: 'a'.repeat(40),
        channels: state === 'ready' ? mode === 'empty'
          ? CHANNELS.map(item => ({ ...item, issue: null })) : CHANNELS : [],
        pages: 2, scannedIssues: 120,
        ...(state === 'snapshot_incomplete' ? {
          error: 'Fixture: 分页超过上限，禁止选择不完整的最新 Issue',
        } : {}),
      }
    },
  }
}
