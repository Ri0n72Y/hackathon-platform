import { Context } from '@deepseek-ai/cordis'
import { ReactUIService } from '../../../plugins/react-ui/src/index'
import { RepoIssuesService } from '../../../plugins/repo-issues/src/index'
import { repoPanel } from '../../../plugins/repo-panel/src/index'
import { TopicPageService, topicPage } from '../../../plugins/topic-page/src/index'

/** @summary Assemble either the existing Issues playground or the standalone TopicPage playground. */
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
    if (/^\/topic\/[^/]+\/[^/]+\/?$/.test(location.pathname)) {
      const topicFiber = ctx.plugin(TopicPageService)
      fibers.push(topicFiber)
      await topicFiber
      const topicUiFiber = ctx.plugin(topicPage)
      fibers.push(topicUiFiber)
      await topicUiFiber
    } else {
      const issuesFiber = ctx.plugin(RepoIssuesService)
      fibers.push(issuesFiber)
      await issuesFiber
      const panelFiber = ctx.plugin(repoPanel)
      fibers.push(panelFiber)
      await panelFiber
      void ctx.repoIssues.refresh()
    }
    return { ui: ctx.reactUI, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
