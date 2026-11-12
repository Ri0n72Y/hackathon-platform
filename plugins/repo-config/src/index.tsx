import type { Context } from '@deepseek-ai/cordis'
import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { configTargetKey } from './target-key.mjs'
import { RepoConfigService, type RepoConfigApi } from './service'

const ConfigPage = lazy(() => import('./ConfigPage'))

/** @summary Register the independently testable repository Config maintenance route. */
export function createRepoConfigPlugin(api: RepoConfigApi = new RepoConfigService()) {
  return {
    name: 'repo-config',
    inject: ['reactUI'],
    apply(ctx: Context) {
      function Entry() {
        const { owner = '', repo = '' } = useParams<'owner' | 'repo'>()
        // The route host key is stable; remount the stateful Control on parameter changes.
        return <Suspense fallback={<p role="status">正在加载仓库配置…</p>}>
          <ConfigPage key={configTargetKey(owner, repo)}
            api={api} owner={owner} repo={repo} />
        </Suspense>
      }
      ctx.effect(() => ctx.reactUI.registerPage({
        id: 'repo-config',
        path: '/:owner/:repo/config',
        Component: Entry,
      }))
    },
  }
}
export const repoConfig = createRepoConfigPlugin()
