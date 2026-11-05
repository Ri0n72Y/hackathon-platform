import type { Context } from '@deepseek-ai/cordis'
import { useState, useSyncExternalStore } from 'react'
import { Link, useParams } from 'react-router'
import type { ReactUIService } from '../../../plugins/react-ui/src/index'
import styles from './route-fixture.module.css'

/** @summary Exercise dynamic page and component registration in the controlled Playground. */
function RouteFixturePage({ ui, onUnload }: { ui: ReactUIService; onUnload: () => void }) {
  const { owner, repo } = useParams<'owner' | 'repo'>()
  const [feedback, setFeedback] = useState('')
  const entries = useSyncExternalStore(ui.subscribe, ui.getSnapshot)
  const Badge = entries.find(entry => entry.id === 'route-fixture.badge' && !('path' in entry))?.Component

  function checkConflict(kind: 'id' | 'path') {
    try {
      const unregister = ui.registerPage({
        id: kind === 'id' ? 'route-fixture.page' : 'route-fixture.other',
        path: kind === 'path' ? '/__route-test/:owner/:repo' : '/__route-test/conflict',
        Component: () => null,
      })
      unregister()
      setFeedback('失败：重复注册被意外接受')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '未知注册错误')
    }
  }

  return <section className={styles.page}>
    <h1>Playground 路由测试插件</h1>
    <p>URL 参数：{owner}/{repo}</p>
    {Badge && <Badge />}
    <nav className={styles.links} aria-label="路由测试导航">
      <Link to="/__route-test/example/second?routeFixture=1">切换 URL 参数</Link>
      <Link to="/?routeFixture=1">返回根页面</Link>
    </nav>
    <div className={styles.actions}>
      <button type="button" onClick={() => checkConflict('id')}>测试重复 ID</button>
      <button type="button" onClick={() => checkConflict('path')}>测试重复路径</button>
      <button type="button" onClick={onUnload}>卸载测试插件</button>
    </div>
    {feedback && <p role="status">{feedback}</p>}
  </section>
}

/** @summary Supply an opt-in route fixture with Cordis-owned cleanup. */
export function createRouteFixture(onUnload: () => void) {
  return {
    name: 'route-fixture',
    inject: ['reactUI'],
    apply(ctx: Context) {
      const ui = ctx.reactUI
      function FixtureEntry() {
        return <RouteFixturePage ui={ui} onUnload={onUnload} />
      }
      function FixtureBadge() {
        return <p role="status">非页面组件已通过 reactUI.register 获取。</p>
      }
      ctx.effect(() => ui.register('route-fixture.badge', FixtureBadge))
      ctx.effect(() => ui.registerPage({
        id: 'route-fixture.page', path: '/__route-test/:owner/:repo', Component: FixtureEntry,
      }))
    },
  }
}
