import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RepoIssuesService } from '../../repo-issues/src/index'

/** @summary Display the repositories and Issues exposed by the repository service. */
export function RepoPanel({ service }: { service: RepoIssuesService }) {
  const s = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const [session, setSession] = useState<'checking' | 'connected' | 'anonymous'>('checking')

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/github-session', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Session check failed')
        return (await response.json()) as { authenticated: boolean }
      })
      .then(data => {
        if (!controller.signal.aborted) setSession(data.authenticated === true ? 'connected' : 'anonymous')
      })
      .catch(() => {
        if (!controller.signal.aborted) setSession('anonymous')
      })
    return () => controller.abort()
  }, [])
  return <div className="shell">
    <header><h1>LabourChain · Issues</h1><div className="actions">
      {session === 'connected'
        ? <span className="session-status">GitHub 会话已建立</span>
        : session === 'checking'
          ? <span className="session-status">检查登录状态…</span>
          : <a className="login" href="/api/github-login">GitHub 登录</a>}
      <button disabled={s.loading} onClick={() => void service.refresh()}>刷新</button>
    </div></header>
    <p>已安装授权的公开 GitHub 仓库（只读）</p>
    <label>仓库 <select value={s.selected} disabled={s.loading || !s.repos.length} onChange={e => void service.select(e.target.value)}>
      <option value="">选择仓库</option>
      {s.repos.map(repo => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
    </select></label>
    {s.loading && <p role="status">加载中…</p>}
    {s.error && <p role="alert">读取失败：{s.error}</p>}
    {!s.loading && !s.error && <>
      <h2>Open Issues ({s.issues.length})</h2>
      <ul>{s.issues.map(issue => <li key={issue.number}>
        <span>#{issue.number}</span>
        <a href={issue.html_url} target="_blank" rel="noreferrer">{issue.title}</a>
        <small>{issue.comments} comments</small>
      </li>)}</ul>
      {!s.issues.length && <p>暂无 Issue。</p>}
    </>}
    <footer>Issue 仍通过 GitHub App 安装权限只读；登录仅验证用户 OAuth 会话。</footer>
  </div>
}

/** @summary Contribute the Issues panel while both Cordis services are available. */
export const repoPanel = {
  name: 'repo-panel',
  inject: ['reactUI', 'repoIssues'],
  apply(ctx: Context) {
    const service = ctx.repoIssues
    function RepoPanelEntry() {
      return <RepoPanel service={service} />
    }
    ctx.effect(() => ctx.reactUI.register('repo-panel', RepoPanelEntry))
  },
}
