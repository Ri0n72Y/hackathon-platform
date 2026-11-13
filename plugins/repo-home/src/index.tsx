import type { Context } from '@deepseek-ai/cordis'
import { lazy, Suspense, type ComponentType } from 'react'
import { useParams } from 'react-router'
import { memberRegistrationScope } from './domain.mjs'
import type { RepoHomeTheme } from './RepoHomePage'
import { RepoHomeService, readDisplayBranch, type RepoHomeApi } from './service'
const RepoHomePage = lazy(() => import('./RepoHomePage'))
const MembersPage = lazy(() => import('./MembersPage'))
const MemberRegisterPage = lazy(() => import('./MemberRegisterPage'))
/** @summary Remount the registration draft whenever its trusted repository/branch target changes. */
function ScopedMemberRegisterPage({ api }: { api: RepoHomeApi }) {
  const { owner = '', repo = '' } = useParams<'owner' | 'repo'>()
  const scope = memberRegistrationScope(owner, repo, readDisplayBranch(owner, repo))
  return <MemberRegisterPage key={scope} api={api} />
}
/** @summary Register the independently testable Repo homepage, team listing and registration routes. */
export function createRepoHomePlugin(api: RepoHomeApi = new RepoHomeService(),
  options: { theme?: RepoHomeTheme } = {}) {
  return { name: 'repo-home', inject: ['reactUI'], apply(ctx: Context) {
    const register = (id: string, path: string, Component: ComponentType<{ api: RepoHomeApi }>) => {
      function Entry() {
        return <Suspense fallback={<p role="status">正在加载项目页面…</p>}><Component api={api} /></Suspense>
      }
      ctx.effect(() => ctx.reactUI.registerPage({ id, path, Component: Entry }))
    }
    const HomeWithVisualTheme = ({ api }: { api: RepoHomeApi }) =>
      <RepoHomePage api={api} theme={options.theme} />
    register('repo-home', '/:owner/:repo', HomeWithVisualTheme)
    register('repo-home-members', '/:owner/:repo/members', MembersPage)
    register('repo-home-register', '/:owner/:repo/members/register', ScopedMemberRegisterPage)
  } }
}
export const repoHome = createRepoHomePlugin()
