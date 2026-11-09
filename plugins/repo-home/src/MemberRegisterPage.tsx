import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { safeHttps, validLogin, validateMemberInput } from './domain.mjs'
import { readDisplayBranch, RepoHomeError, type MemberCapability, type MemberSubmitResult,
  type RepoHomeApi } from './service'
import styles from './RepoHome.module.css'
type Fields = { name: string; githubUsername: string; role: string; bio: string; avatarUrl: string;
  links: Array<{ label: string; url: string }> }
const initial = (): Fields => ({ name: '', githubUsername: '', role: '', bio: '', avatarUrl: '',
  links: [{ label: '', url: '' }, { label: '', url: '' }, { label: '', url: '' }] })
type FieldKey = keyof Omit<Fields, 'links'> | `links.${number}.label` | `links.${number}.url`
type FieldErrors = Partial<Record<FieldKey, string>>

/** @summary Map existing domain field constraints to actionable form errors without weakening API validation. */
export function validateVisibleFields(fields: Fields): FieldErrors {
  const errors: FieldErrors = {}
  const name = fields.name.trim()
  if (!name || name.length > 60) errors.name = '请输入 1–60 字符的姓名。'
  if (fields.githubUsername.trim() && !validLogin(fields.githubUsername.trim())) {
    errors.githubUsername = 'GitHub 用户名不符合 1–39 字符格式。'
  }
  if (fields.role.trim().length > 40) errors.role = '项目角色不能超过 40 字符。'
  if (fields.bio.trim().length > 280) errors.bio = '个人介绍不能超过 280 字符。'
  if (fields.avatarUrl.trim() && !safeHttps(fields.avatarUrl.trim())) {
    errors.avatarUrl = '头像需要有效的 HTTPS URL。'
  }
  for (const [index, link] of fields.links.entries()) {
    const label = link.label.trim(), url = link.url.trim()
    if (!label && !url) continue
    if (!label || label.length > 24) {
      errors[`links.${index}.label`] = '链接名称需填写 1–24 字符。'
    }
    if (!safeHttps(url)) errors[`links.${index}.url`] = '请输入有效的 HTTPS URL。'
  }
  return errors
}
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
  const [submitAttempted, setSubmitAttempted] = useState(false)
  // After the first submit, diagnostics follow current field values.
  const fieldErrors: FieldErrors = submitAttempted ? validateVisibleFields(fields) : {}
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<MemberSubmitResult | null>(null)
  const [revision, setRevision] = useState(0)
  const pendingController = useRef<AbortController | null>(null)
  useEffect(() => {
    setFields(initial()); setSubmitAttempted(false); setResult(null); setPending(false); setError('')
  }, [owner, repo, branch])
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
    return () => {
      controller.abort()
      pendingController.current?.abort()
      pendingController.current = null
    }
  }, [api, owner, repo, branch, revision])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!capability || pending) return
    setSubmitAttempted(true)
    const first = Object.keys(validateVisibleFields(fields))[0] as FieldKey | undefined
    if (first) {
      setError('')
      fieldRefs.current[first]?.focus()
      return
    }
    setSubmitAttempted(false)
    let member
    try { member = validateMemberInput(fields) }
    catch (e) { setError(e instanceof Error ? e.message : '资料无效'); return }
    const controller = new AbortController()
    pendingController.current = controller
    setPending(true); setError(''); setResult(null)
    try {
      const saved = await api.register(owner, repo, branch, member, controller.signal)
      if (!controller.signal.aborted) setResult(saved)
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : '提交失败，请重试')
        if (e instanceof RepoHomeError && e.status === 401) { setAuthStatus(401); setCapability(null) }
      }
    } finally {
      if (pendingController.current === controller) pendingController.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }
  function change(key: keyof Omit<Fields, 'links'>, value: string) {
    setFields(previous => ({ ...previous, [key]: value }))
  }
  function changeLink(index: number, key: 'label' | 'url', value: string) {
    setFields(previous => ({ ...previous, links: previous.links.map((entry, i) =>
      i === index ? { ...entry, [key]: value } : entry) }))
  }
  return <section className={styles.page}>
    <p><Link to={base}>项目</Link> / <Link to={base + '/members'}>团队成员</Link> / 添加成员</p>
    <h1>添加团队成员</h1>
    <p className={styles.muted}>目标：{owner}/{repo} · 提交到 <strong>{branch}</strong></p>
    {authStatus === null && !capability && <p role="status">正在验证操作者和仓库写权限…</p>}
    {error && <p role="alert">{error}</p>}
    {submitAttempted && Object.keys(fieldErrors).length > 0 &&
      <p role="alert">请修正标记的字段后重新提交。</p>}
    {authStatus === 401 && <a href={login}>登录 GitHub 后返回此表单</a>}
    {authStatus !== null && authStatus !== 401 && <button type="button"
      onClick={() => setRevision(n => n + 1)}>重新检查权限</button>}
    {capability && <><p>GitHub 操作者：<strong>@{capability.user.login}</strong>。由 LabourChain Bot
      {capability.mode === 'pr' ? ' 创建维护 PR，待审核合并后生效。' : ' 提交 Commit。'}</p>
      <form className={styles.memberForm} onSubmit={submit} noValidate>
        <label>姓名（必填）<input required value={fields.name} maxLength={60}
          ref={node => { fieldRefs.current.name = node }}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? 'member-error-name' : undefined}
          onChange={e => change('name', e.target.value)} />
          {fieldErrors.name && <small id="member-error-name" className={styles.fieldError}>{fieldErrors.name}</small>}
        </label>
        <label>GitHub 用户名（选填）<input value={fields.githubUsername} maxLength={39}
          ref={node => { fieldRefs.current.githubUsername = node }}
          aria-invalid={Boolean(fieldErrors.githubUsername)}
          aria-describedby={fieldErrors.githubUsername ? 'member-error-github' : undefined}
          onChange={e => change('githubUsername', e.target.value)} />
          {fieldErrors.githubUsername && <small id="member-error-github" className={styles.fieldError}>{fieldErrors.githubUsername}</small>}
        </label>
        <label>项目角色（选填）<input value={fields.role} maxLength={40}
          ref={node => { fieldRefs.current.role = node }}
          aria-invalid={Boolean(fieldErrors.role)}
          aria-describedby={fieldErrors.role ? 'member-error-role' : undefined}
          onChange={e => change('role', e.target.value)} />
          {fieldErrors.role && <small id="member-error-role" className={styles.fieldError}>{fieldErrors.role}</small>}
        </label>
        <label>个人介绍（纯文本，选填）<textarea value={fields.bio} maxLength={280}
          ref={node => { fieldRefs.current.bio = node }}
          aria-invalid={Boolean(fieldErrors.bio)}
          aria-describedby={fieldErrors.bio ? 'member-error-bio' : undefined}
          onChange={e => change('bio', e.target.value)} rows={4} />
          {fieldErrors.bio && <small id="member-error-bio" className={styles.fieldError}>{fieldErrors.bio}</small>}
        </label>
        <label>HTTPS 头像 URL（选填）<input type="url" value={fields.avatarUrl}
          ref={node => { fieldRefs.current.avatarUrl = node }}
          aria-invalid={Boolean(fieldErrors.avatarUrl)}
          aria-describedby={fieldErrors.avatarUrl ? 'member-error-avatar' : undefined}
          onChange={e => change('avatarUrl', e.target.value)} />
          {fieldErrors.avatarUrl && <small id="member-error-avatar" className={styles.fieldError}>{fieldErrors.avatarUrl}</small>}
        </label>
        <fieldset><legend>个人链接（最多三条，选填）</legend>
          {fields.links.map((link, index) => {
            const labelKey = `links.${index}.label` as const
            const urlKey = `links.${index}.url` as const
            return <div className={styles.linkFields} key={index}>
              <label>链接 {index + 1} 名称<input value={link.label} maxLength={24}
                ref={node => { fieldRefs.current[labelKey] = node }}
                aria-invalid={Boolean(fieldErrors[labelKey])}
                aria-describedby={fieldErrors[labelKey] ? `member-error-link-${index}-label` : undefined}
                onChange={e => changeLink(index, 'label', e.target.value)} />
                {fieldErrors[labelKey] && <small className={styles.fieldError} id={`member-error-link-${index}-label`}>
                  {fieldErrors[labelKey]}</small>}
              </label>
              <label>HTTPS URL<input type="url" value={link.url}
                ref={node => { fieldRefs.current[urlKey] = node }}
                aria-invalid={Boolean(fieldErrors[urlKey])}
                aria-describedby={fieldErrors[urlKey] ? `member-error-link-${index}-url` : undefined}
                onChange={e => changeLink(index, 'url', e.target.value)} />
                {fieldErrors[urlKey] && <small className={styles.fieldError} id={`member-error-link-${index}-url`}>
                  {fieldErrors[urlKey]}</small>}
              </label>
            </div>
          })}
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
