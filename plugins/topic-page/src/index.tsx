import type { Context } from '@deepseek-ai/cordis'
import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { TopicPageService, type TopicPageApi } from './service'
import { topicTargetKey } from './domain.mjs'

const TopicPageContainer = lazy(() => import('./TopicPageContainer'))

/** @summary Register TopicPage as an independent route in the existing shared Router. */
export function createTopicPagePlugin(api: TopicPageApi = new TopicPageService()) {
  return {
    name: 'topic-page',
    inject: ['reactUI'],
    apply(ctx: Context) {
      function TopicEntry() {
        const { owner = '', repo = '' } = useParams<'owner' | 'repo'>()
        return <Suspense fallback={<p role="status">正在加载 TopicPage…</p>}>
          <TopicPageContainer key={topicTargetKey(owner, repo)} owner={owner}
            repo={repo} api={api}/>
        </Suspense>
      }
      ctx.effect(() => ctx.reactUI.registerPage({
        id: 'topic-page', path: '/topic/:owner/:repo', Component: TopicEntry,
      }))
    },
  }
}
export const topicPage = createTopicPagePlugin()
