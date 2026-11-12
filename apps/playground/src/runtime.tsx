import { Context } from '@deepseek-ai/cordis'
import { ReactUIService } from '../../../plugins/react-ui/src/index'
import { RepoIssuesService } from '../../../plugins/repo-issues/src/index'
import { repoPanel } from '../../../plugins/repo-panel/src/index'
import { repoHome, createRepoHomePlugin } from '../../../plugins/repo-home/src/index'
import { repoConfig, createRepoConfigPlugin } from '../../../plugins/repo-config/src/index'
import { createIssueDetailPlugin } from '../../../plugins/issue-detail/src/index'

/** @summary Assemble ordinary routes or independently test Repo Home and Config with controlled fixtures. */
export async function startRuntime() {
  const ctx = new Context()
  const fibers: Array<{ dispose(): Promise<void> }> = []
  const dispose = async () => { while (fibers.length) await fibers.pop()!.dispose() }
  try {
    const uiFiber = ctx.plugin(ReactUIService)
    fibers.push(uiFiber); await uiFiber
    const query = new URLSearchParams(window.location.search)
    const isolated = query.get('repoOnly') === '1' || query.get('repoFixture') === '1' ||
      query.get('configFixture') === '1'
    if (!isolated) {
      const issuesFiber = ctx.plugin(RepoIssuesService)
      fibers.push(issuesFiber); await issuesFiber
      const panelFiber = ctx.plugin(repoPanel)
      fibers.push(panelFiber); await panelFiber
    }
    const homePlugin = query.get('repoFixture') === '1'
      ? createRepoHomePlugin((await import('./repo-fixture')).createRepoFixtureService(query))
      : repoHome
    const homeFiber = ctx.plugin(homePlugin)
    fibers.push(homeFiber); await homeFiber

    const configPlugin = query.get('configFixture') === '1'
      ? createRepoConfigPlugin((await import('./config-fixture')).createRepoConfigFixtureService(query))
      : repoConfig
    const configFiber = ctx.plugin(configPlugin)
    fibers.push(configFiber); await configFiber

    if (!isolated) {
      if (query.get('issueFixture') === '1') {
        const { createIssueFixtureService, createIssueFixtureControls } = await import('./issue-fixture')
        const detailFiber = ctx.plugin(createIssueDetailPlugin(
          createIssueFixtureService(query.get('fixtureAuth') === '1')))
        fibers.push(detailFiber); await detailFiber
        const controlsFiber = ctx.plugin(createIssueFixtureControls(() => {
          void detailFiber.dispose().catch(console.error)
        }))
        fibers.push(controlsFiber); await controlsFiber
      } else {
        const detailFiber = ctx.plugin(createIssueDetailPlugin())
        fibers.push(detailFiber); await detailFiber
      }
    }
    if (query.get('routeFixture') === '1') {
      const { createRouteFixture } = await import('./route-fixture')
      let fixtureFiber: { dispose(): Promise<void> } | undefined
      const fiber = ctx.plugin(createRouteFixture(() => {
        void fixtureFiber?.dispose().catch(console.error)
      }))
      fixtureFiber = fiber; fibers.push(fiber); await fiber
    }
    return { ui: ctx.reactUI, dispose }
  } catch (error) { await dispose(); throw error }
}
