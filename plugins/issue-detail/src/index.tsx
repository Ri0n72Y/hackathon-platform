import type { Context } from '@deepseek-ai/cordis'
import { lazy, Suspense } from 'react'
import { IssueDetailService, type IssueDetailApi } from './service'

const IssueDetailPage = lazy(() => import('./IssueDetailPage'))

/** @summary Register a lazy, independently removable Issue detail page in the shared UI host. */
export function createIssueDetailPlugin(service: IssueDetailApi = new IssueDetailService()) {
  return {
    name: 'issue-detail',
    inject: ['reactUI'],
    apply(ctx: Context) {
      function IssueDetailEntry() {
        return <Suspense fallback={<p role="status">正在加载 Issue 页面…</p>}>
          <IssueDetailPage service={service} />
        </Suspense>
      }
      ctx.effect(() => ctx.reactUI.registerPage({
        id: 'issue-detail',
        path: '/:owner/:repo/issues/:number',
        Component: IssueDetailEntry,
      }))
    },
  }
}
