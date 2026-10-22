import { Service, type Context } from '@deepseek-ai/cordis'

export type Repo = { owner: string; name: string; full_name: string }
export type Issue = { number: number; title: string; html_url: string; comments: number }
export type State = { repos: Repo[]; selected: string; issues: Issue[]; loading: boolean; error: string }

declare module '@deepseek-ai/cordis' {
  interface Context {
    repoIssues: RepoIssuesService
  }
}

/** @summary Fetch installed repositories and their Issues as an observable Cordis service. */
export class RepoIssuesService extends Service {
  private listeners = new Set<() => void>()
  private revision = 0
  private snapshot: State = { repos: [], selected: '', issues: [], loading: true, error: '' }

  constructor(ctx: Context) {
    super(ctx, 'repoIssues')
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(next: State) {
    this.snapshot = next
    this.listeners.forEach(listener => listener())
  }

  private async read(url: string) {
    const response = await fetch(url)
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'HTTP ' + response.status)
    return body
  }

  async select(fullName: string) {
    const repo = this.snapshot.repos.find(item => item.full_name === fullName)
    if (!repo) return
    const current = ++this.revision
    this.publish({ ...this.snapshot, selected: fullName, loading: true, error: '', issues: [] })
    try {
      const data = await this.read('/api/issues?owner=' + encodeURIComponent(repo.owner) + '&repo=' + encodeURIComponent(repo.name))
      if (current === this.revision) {
        this.publish({ ...this.snapshot, issues: data.issues, loading: false })
      }
    } catch (error) {
      if (current === this.revision) this.publish({ ...this.snapshot, loading: false, error: String(error) })
    }
  }

  async refresh() {
    const current = ++this.revision
    this.publish({ ...this.snapshot, loading: true, error: '' })
    try {
      const data = await this.read('/api/repos')
      if (current !== this.revision) return
      const repos = data.repositories as Repo[]
      const selected = repos.some(repo => repo.full_name === this.snapshot.selected)
        ? this.snapshot.selected : (repos[0]?.full_name || '')
      this.publish({ ...this.snapshot, repos, selected, issues: [], loading: false })
      if (selected) await this.select(selected)
    } catch (error) {
      if (current === this.revision) this.publish({ ...this.snapshot, loading: false, error: String(error) })
    }
  }
}
