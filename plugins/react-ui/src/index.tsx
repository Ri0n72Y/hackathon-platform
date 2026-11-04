import { Service, type Context } from '@deepseek-ai/cordis'
import { useSyncExternalStore, type ComponentType } from 'react'
import { Link, useRoutes } from 'react-router'
import styles from './App.module.css'

type Registration = { id: string; Component: ComponentType }
export type PageRegistration = Registration & { path: string }
type UIRegistration = Registration | PageRegistration

declare module '@deepseek-ai/cordis' {
  interface Context {
    reactUI: ReactUIService
  }
}

/** @summary Own the Cordis UI registry and publish stable snapshots for React subscribers. */
export class ReactUIService extends Service {
  private registry = new Map<string, UIRegistration>()
  private listeners = new Set<() => void>()
  private snapshot: UIRegistration[] = []

  constructor(ctx: Context) {
    super(ctx, 'reactUI')
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  register(id: string, Component: ComponentType) {
    return this.add({ id, Component })
  }

  registerPage(entry: PageRegistration) {
    if (!entry.path.startsWith('/') || entry.path === '/*' ||
      entry.path === '/api' || entry.path.startsWith('/api/')) {
      throw new Error('invalid page path: ' + entry.path)
    }
    if ([...this.registry.values()].some(current =>
      'path' in current && current.path === entry.path)) {
      throw new Error('duplicate page path: ' + entry.path)
    }
    return this.add(entry)
  }

  private add(entry: UIRegistration) {
    if (!entry.id.trim()) throw new Error('empty UI id')
    if (this.registry.has(entry.id)) throw new Error('duplicate UI: ' + entry.id)
    this.registry.set(entry.id, entry)
    this.publish()
    return () => {
      if (this.registry.get(entry.id) === entry) {
        this.registry.delete(entry.id)
        this.publish()
      }
    }
  }

  private publish() {
    this.snapshot = [...this.registry.values()]
    this.listeners.forEach(listener => listener())
  }
}

/** @summary Explain unmatched paths, including routes removed when a plugin unloads. */
function NotFound() {
  return <section className={styles.notFound}>
    <h1>页面不存在或暂未提供</h1>
    <p>此 URL 没有可用页面。对应插件可能尚未装配或已卸载。</p>
    <Link to="/">返回 Playground</Link>
  </section>
}

/** @summary Match plugin-registered pages inside the application's single React Router. */
export function App({ ui }: { ui: ReactUIService }) {
  const entries = useSyncExternalStore(ui.subscribe, ui.getSnapshot)
  const routes = entries.flatMap(entry => 'path' in entry
    ? [{ path: entry.path, element: <entry.Component key={entry.id} /> }]
    : [])
  const page = useRoutes([...routes, { path: '*', element: <NotFound /> }])
  return <main>{page}</main>
}
