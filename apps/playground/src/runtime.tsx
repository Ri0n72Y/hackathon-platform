import { Context } from '@deepseek-ai/cordis'
import { ReactUIService } from '../../../plugins/react-ui/src/index'
import { RepoIssuesService } from '../../../plugins/repo-issues/src/index'
import { repoPanel } from '../../../plugins/repo-panel/src/index'

/** @summary Assemble the Cordis services and Issues UI plugin. */
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
    void ctx.repoIssues.refresh()
    return { ui: ctx.reactUI, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
