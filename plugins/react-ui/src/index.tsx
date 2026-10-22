import { Service, type Context } from '@deepseek-ai/cordis'
import { useSyncExternalStore, type ComponentType } from 'react'

type Registration = { id: string; Component: ComponentType }

declare module '@deepseek-ai/cordis' {
  interface Context {
    reactUI: ReactUIService
  }
}

/** @summary Own the Cordis UI registry and notify the React shell when it changes. */
export class ReactUIService extends Service {
  private registry = new Map<string, ComponentType>()
  private listeners = new Set<() => void>()
  private snapshot: Registration[] = []

  constructor(ctx: Context) {
    super(ctx, 'reactUI')
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  register(id: string, Component: ComponentType) {
    if (this.registry.has(id)) throw new Error('duplicate UI: ' + id)
    this.registry.set(id, Component)
    this.publish()
    return () => {
      if (this.registry.get(id) === Component) {
        this.registry.delete(id)
        this.publish()
      }
    }
  }

  private publish() {
    this.snapshot = [...this.registry].map(([id, Component]) => ({ id, Component }))
    this.listeners.forEach(listener => listener())
  }
}

/** @summary Render the Cordis-provided UI components in one React tree. */
export function App({ ui }: { ui: ReactUIService }) {
  const entries = useSyncExternalStore(ui.subscribe, ui.getSnapshot)
  return <main>{entries.map(({ id, Component }) => <Component key={id} />)}</main>
}
