import type { Context } from '@deepseek-ai/cordis'
import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { ChannelService, type ChannelApi } from './service'
import { channelTargetKey } from './domain.mjs'

const ChannelPage = lazy(() => import('./ChannelPage'))

/** @summary Register independently removable Channel selection in the shared UI host. */
export function createChannelPlugin(api: ChannelApi = new ChannelService()) {
  return {
    name: 'channel',
    inject: ['reactUI'],
    apply(ctx: Context) {
      function ChannelEntry() {
        const { owner = '', repo = '' } = useParams<'owner' | 'repo'>()
        return <Suspense fallback={<p role="status">正在加载频道页面…</p>}>
          <ChannelPage key={channelTargetKey(owner, repo)} owner={owner}
            repo={repo} api={api} />
        </Suspense>
      }
      ctx.effect(() => ctx.reactUI.registerPage({
        id: 'channel', path: '/:owner/:repo/channels', Component: ChannelEntry,
      }))
    },
  }
}
export const channel = createChannelPlugin()
