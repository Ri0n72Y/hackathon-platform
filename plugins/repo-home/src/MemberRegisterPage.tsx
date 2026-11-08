import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { validateMemberInput } from './domain.mjs'
import { readDisplayBranch, RepoHomeError, type MemberCapability, type MemberSubmitResult,
  type RepoHomeApi } from './service'
import styles from './RepoHome.module.css'
type Fields = { name: string; githubUsername: string; role: string; bio: string; avatarUrl: string;
  links: Array<{ label: string; url: string }> }
const initial = (): Fields => ({ name: '', githubUsername: '', role: '', bio: '', avatarUrl: '',
  links: [{ label: '', url: '' }, { label: '', url: '' }, { label: '', url: '' }] })
/** @summary Preserve a member draft while verifying the OAuth operator and Bot delivery mode. */
export default function MemberRegisterPage({ api }: { api: RepoHomeApi }) {
  const { owner = '', repo = '' } = useParams<'owner' | 'repo'>()
  const base = '/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
  const branch = readDisplayBranch(owner, repo)
  const login = '/api/github-login?return_to=' + encodeURIComponent(base + '/members/register')
  const [fields, setFields] = useState<Fields>(initial)
  const [capability, setCapability] = useState<MemberCapability | null>(null)
  const [authStatus, setAuthStatus] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<MemberSubmitResult | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setCapability(null); setAuthStatus(null); setError('')
    void api.getCapability(owner, repo, branch, controller.signal).then(value => {
      if (!controller.signal.aborted) setCapability(value)
    }).catch(e => {
      if (controller.signal.aborted) return
      setAuthStatus(e instanceof RepoHomeError ? e.status : 502)
      setError(e instanceof Error ? e.message : '权限验证失败')
    })
    return () => controller.abort()
  }, [api, owner, repo, branch, revision])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!capability || pending) return
    let member
    try { member = validateMemberInput(fields) }
    catch (e) { setError(e instanceof Error ? e.message : '资料无效'); return }
    const controller = new AbortController()
    setPending(true); setError(''); setResult(null)
    try { setResult(await api.register(owner, repo, branch, member, controller.signal)) }
    catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请重试')
      if (e instanceof RepoHomeError && e.status === 401) setAuthStatus(401)
    } finally { setPending(false) }
  }
  const change = (key: keyof Omit<Fields,'links'>, value: string) =>
    setFields(old => ({ ...old, [key]: value }))
  return <section className={styles.page}>
    <p><Link to={base}>项目</Link> / <Link to={base + '/members'}>团队成员</Link> / 添加成员</p>
    <h1>添加团队成员</h1>
    <p className={styles.muted}>目标：{owner}/{repo} · 提交到 <strong>{branch}</strong></p>
    {authStatus === null && !capability && <p role="status">正在验证操作者和仓库写权限…</p>}
    {error && <p role="alert">{error}</p>}
    {authStatus === 401 && <a href={login}>登录 GitHub 后返回此表单</a>}
    {authStatus !== null && authStatus !== 401 && <button type="button"
      onClick={() => setRevision(n => n + 1)}>重新检查权限</button>}
    {capability && <><p>GitHub 操作者：<strong>@{capability.user.login}</strong>。由 LabourChain Bot
      {capability.mode === 'pr' ? ' 创建维护 PR，待审核合并后生效。' : ' 提交 Commit。'}</p>
      <form className={styles.memberForm} onSubmit={submit}>
        <label>姓名（必填）<input required value={fields.name} maxLength={60}
          onChange={e => change('name', e.target.value)} /></label>
        <label>GitHub 用户名（选填）<input value={fields.githubUsername} maxLength={39}
          onChange={e => change('githubUsername', e.target.value)} /></label>
        <label>项目角色（选填）<input value={fields.role} maxLength={40}
          onChange={e => change('role', e.target.value)} /></label>
        <label>个人介绍（纯文本，选填）<textarea value={fields.bio} maxLength={280}
          onChange={e => change('bio', e.target.value)} rows={4} /></label>
        <label>HTTPS 头像 URL（选填）<input type="url" value={fields.avatarUrl}
          onChange={e => change('avatarUrl', e.target.value)} /></label>
        <fieldset><legend>个人链接（最多三条，选填）</legend>
          {fields.links.map((link, index) => <div className={styles.linkFields} key={index}>
            <label>链接 {index + 1} 名称<input value={link.label} maxLength={24}
              onChange={e => setFields(old => ({ ...old, links: old.links.map((v, i) =>
                i === index ? { ...v, label: e.target.value } : v) }))} /></label>
            <label>HTTPS URL<input type="url" value={link.url}
              onChange={e => setFields(old => ({ ...old, links: old.links.map((v, i) =>
                i === index ? { ...v, url: e.target.value } : v) }))} /></label>
          </div>)}
        </fieldset>
        <div className={styles.actions}><button type="submit" disabled={pending}>
          {pending ? '正在提交…' : '提交成员资料'}</button><Link to={base + '/members'}>取消</Link></div>
      </form></>}
    {result && <p role="status">{result.status === 'pending_pr' ?
      '维护 PR 已创建，合并前成员列表保持不变。' : '成员资料 Commit 已提交，请刷新成员列表。'}
      <a href={result.url} target="_blank" rel="noopener noreferrer">查看 GitHub {result.status === 'pending_pr' ? 'PR' : 'Commit'}</a>
      <Link to={base + '/members'}>查看成员</Link>
    </p>}
  </section>
}
