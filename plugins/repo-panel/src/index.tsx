import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { RepoIssuesService } from '../../repo-issues/src/index'
import { IssueWorkspace } from './issue-workspace'

type PermissionFlags = { admin: boolean; maintain: boolean; push: boolean; triage: boolean; pull: boolean }
type VerificationResult = {
  user: { id: number; login: string }
  repository: { full_name: string; accessible: boolean; permissions: PermissionFlags | null }
}
type Verification = { status: 'idle' | 'loading' | 'success' | 'error'; data?: VerificationResult; message?: string; relogin?: boolean }

/** @summary Display the repositories and Issues exposed by the repository service. */
export function RepoPanel({ service }: { service: RepoIssuesService }) {
  const s = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const [session, setSession] = useState<'checking' | 'connected' | 'anonymous'>('checking')
  const [verification, setVerification] = useState<Verification>({ status: 'idle' })
  const verifyRevision = useRef(0)

  function selectRepo(fullName: string) {
    verifyRevision.current++
    setVerification({ status: 'idle' })
    void service.select(fullName)
  }

  async function verifyUserAndRepo() {
    const repo = s.repos.find(item => item.full_name === s.selected)
    if (!repo || session !== 'connected') return
    const revision = ++verifyRevision.current
    setVerification({ status: 'loading' })
    try {
      const params = new URLSearchParams({ owner: repo.owner, repo: repo.name })
      const response = await fetch('/api/github-verify?' + params, { cache: 'no-store' })
      const body = await response.json()
      if (revision !== verifyRevision.current) return
      if (!response.ok) {
        setVerification({ status: 'error', message: body.error || '验证失败',
          relogin: body.relogin === true })
        return
      }
      setVerification({ status: 'success', data: body as VerificationResult })
    } catch {
      if (revision === verifyRevision.current) {
        setVerification({ status: 'error', message: '网络请求失败' })
      }
    }
  }

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
    return () => { controller.abort(); verifyRevision.current++ }
  }, [])
  return <div className="shell">
    <header><h1>LabourChain · Issues</h1><div className="actions">
      {session === 'connected'
        ? <span className="session-status">GitHub 会话已建立</span>
        : session === 'checking'
          ? <span className="session-status">检查登录状态…</span>
          : <a className="login" href="/api/github-login">GitHub 登录</a>}
      <button disabled={s.loading} onClick={() => {
        verifyRevision.current++
        setVerification({ status: 'idle' })
        void service.refresh()
      }}>刷新</button>
    </div></header>
    <p>已安装授权的公开 GitHub 仓库（只读）</p>
    <label>仓库 <select value={s.selected} disabled={s.loading || !s.repos.length} onChange={e => selectRepo(e.target.value)}>
      <option value="">选择仓库</option>
      {s.repos.map(repo => <option key={repo.full_name} value={repo.full_name}>{repo.full_name}</option>)}
    </select></label>
    {session === 'connected' && <section className="verification">
      <button disabled={!s.selected || verification.status === 'loading'}
        onClick={() => void verifyUserAndRepo()}>验证 GitHub 身份与仓库权限</button>
      {verification.status === 'loading' && <p role="status">正在向 GitHub 验证…</p>}
      {verification.status === 'error' && <p role="alert">验证失败：{verification.message}
        {verification.relogin && <> · <a href="/api/github-login">重新登录</a></>}</p>}
      {verification.status === 'success' && verification.data && <div role="status">
        <p>GitHub 用户：{verification.data.user.login}（ID {verification.data.user.id}）</p>
        <p>仓库 {verification.data.repository.full_name}：
          {verification.data.repository.accessible ? '当前用户可通过 App 访问' : '当前用户无法通过 App 访问'}</p>
        {verification.data.repository.permissions && <p>GitHub 返回的仓库权限：
          {(['admin', 'maintain', 'push', 'triage', 'pull'] as const)
            .filter(key => verification.data!.repository.permissions?.[key])
            .join('、') || '无已知权限'}</p>}
        <small>此处只验证读取和 GitHub 返回的权限信息，不代表 Issue 写入已经授权或测试。</small>
      </div>}
    </section>}
    {s.loading && <p role="status">加载中…</p>}
    {s.error && <p role="alert">读取失败：{s.error}</p>}
    {!s.loading && !s.error && <>
      {s.repos.find(repo => repo.full_name === s.selected) && <IssueWorkspace
        key={s.selected}
        repo={s.repos.find(repo => repo.full_name === s.selected)!}
        issues={s.issues}
        loggedIn={session === 'connected'} />}
    </>}
    <footer>Issue 读取使用安装授权；创建和评论使用已登录的 GitHub 用户身份，不使用 Bot 写入。</footer>
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
