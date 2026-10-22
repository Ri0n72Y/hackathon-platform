import { Context } from '@deepseek-ai/cordis'
import { ReactUIService } from '../../../plugins/react-ui/src/index'
import { RepoIssuesService } from '../../../plugins/repo-issues/src/index'
import { repoPanel } from '../../../plugins/repo-panel/src/index'

/** @summary Assemble the Cordis services and Issues UI plugin. */
export async function startRuntime() {
  const ctx = new Context()
  try {
    await ctx.plugin(ReactUIService)
    await ctx.plugin(RepoIssuesService)
    await ctx.plugin(repoPanel)
    void ctx.repoIssues.refresh()
    return { ui: ctx.reactUI, dispose: () => ctx.dispose() }
  } catch (error) {
    await ctx.dispose()
    throw error
  }
}
