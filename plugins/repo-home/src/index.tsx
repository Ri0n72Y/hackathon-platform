import type { Context } from '@deepseek-ai/cordis'
import { lazy, Suspense } from 'react'
import { RepoHomeService, type RepoHomeApi } from './service'
const RepoHomePage = lazy(() => import('./RepoHomePage'))
const MembersPage = lazy(() => import('./MembersPage'))
const MemberRegisterPage = lazy(() => import('./MemberRegisterPage'))
/** @summary Register the independently testable Repo homepage, team listing and registration routes. */
export function createRepoHomePlugin(api: RepoHomeApi = new RepoHomeService()) {
  return { name: 'repo-home', inject: ['reactUI'], apply(ctx: Context) {
    const register = (id: string, path: string, Component: typeof RepoHomePage) => {
      function Entry() {
        return <Suspense fallback={<p role="status">正在加载项目页面…</p>}><Component api={api} /></Suspense>
      }
      ctx.effect(() => ctx.reactUI.registerPage({ id, path, Component: Entry }))
    }
    register('repo-home', '/:owner/:repo', RepoHomePage)
    register('repo-home-members', '/:owner/:repo/members', MembersPage)
    register('repo-home-register', '/:owner/:repo/members/register', MemberRegisterPage)
  } }
}
export const repoHome = createRepoHomePlugin()
