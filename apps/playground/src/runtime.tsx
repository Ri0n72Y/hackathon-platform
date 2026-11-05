import { Context } from '@deepseek-ai/cordis'
import { ReactUIService } from '../../../plugins/react-ui/src/index'
import { RepoIssuesService } from '../../../plugins/repo-issues/src/index'
import { repoPanel } from '../../../plugins/repo-panel/src/index'
import { repoHome } from '../../../plugins/repo-home/src/index'

/** @summary Assemble the Cordis services and independently removable page plugins. */
export async function startRuntime() {
  const ctx = new Context()
  const fibers: Array<{ dispose(): Promise<void> }> = []
  const dispose = async () => {
    while (fibers.length) await fibers.pop()!.dispose()
  }

  try {
    const uiFiber = ctx.plugin(ReactUIService)
    fibers.push(uiFiber)
    await uiFiber
    const issuesFiber = ctx.plugin(RepoIssuesService)
    fibers.push(issuesFiber)
    await issuesFiber
    const panelFiber = ctx.plugin(repoPanel)
    fibers.push(panelFiber)
    await panelFiber
    const homeFiber = ctx.plugin(repoHome)
    fibers.push(homeFiber)
    await homeFiber

    // Opt-in, controlled Playground route fixture; not a production project page.
    if (new URLSearchParams(window.location.search).get('routeFixture') === '1') {
      const { createRouteFixture } = await import('./route-fixture')
      let fixtureFiber: { dispose(): Promise<void> } | undefined
      const fiber = ctx.plugin(createRouteFixture(() => {
        void fixtureFiber?.dispose().catch(console.error)
      }))
      fixtureFiber = fiber
      fibers.push(fiber)
      await fiber
    }

    void ctx.repoIssues.refresh()
    return { ui: ctx.reactUI, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
