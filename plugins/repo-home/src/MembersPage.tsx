import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { readDisplayBranch, type RepoHomeApi, type RepoHomeData, type MemberCapability } from './service'
import { MemberProfile, TeamStatus } from './Team'
import styles from './RepoHome.module.css'
/** @summary Read the selected branch team file and display cards in its exact stored order. */
export default function MembersPage({ api }: { api: RepoHomeApi }) {
  const { owner = '', repo = '' } = useParams<'owner' | 'repo'>()
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<RepoHomeData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [capability, setCapability] = useState<MemberCapability | null>(null)
  const [permissionError, setPermissionError] = useState('')
  const branch = readDisplayBranch(owner, repo)
  const base = '/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
  const login = '/api/github-login?return_to=' + encodeURIComponent(base + '/members/register')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(''); setData(null); setCapability(null); setPermissionError('')
    void api.getHome(owner, repo, branch, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result)
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    void api.getCapability(owner, repo, branch, controller.signal).then(value => {
      if (!controller.signal.aborted) setCapability(value)
    }).catch(e => { if (!controller.signal.aborted) setPermissionError(e instanceof Error ? e.message : '无法验证权限') })
    return () => controller.abort()
  }, [api, owner, repo, branch, revision])
  return <section className={styles.page}>
    <p><Link to={base}>项目主页</Link> / 团队成员</p>
    <div className={styles.sectionHead}><h1>团队成员 {data?.team.state === 'ready' || data?.team.state === 'empty'
      ? '(' + data.team.members.length + ')' : ''}</h1>
      {capability ? <Link to={base + '/members/register'}>添加成员</Link> :
        <a href={login}>登录后添加成员</a>}
    </div>
    {capability && <p className={styles.muted}>已验证操作者 @{capability.user.login}，目标分支 {branch}</p>}
    {permissionError && <p className={styles.muted}>{permissionError}</p>}
    {loading && <p role="status">正在读取成员文件…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setRevision(n => n + 1)}>重试</button></p>}
    {data && <TeamStatus team={data.team} base={base} onRetry={() => setRevision(n => n + 1)} />}
    {data?.team.state === 'ready' && <div className={styles.memberGrid}>
      {data.team.members.map(member => <article className={styles.memberCard} key={member.id}>
        <MemberProfile member={member} />
      </article>)}
    </div>}
  </section>
}
