import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { Issue, Repo } from '../../repo-issues/src/index'
import styles from './IssueWorkspace.module.css'

type Notice = { text: string; url?: string; relogin?: boolean; error?: boolean }

/** @summary Keep the existing Issue creation demo while navigating to independent Issue pages. */
export function IssueWorkspace({ repo, issues, loggedIn }: {
  repo: Repo; issues: Issue[]; loggedIn: boolean
}) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !loggedIn || !title.trim() || title.length > 256 ||
        description.length > 20000 ||
        !window.confirm('确认以你的 GitHub 身份创建此 Issue？')) return
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/github-issue-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
        body: JSON.stringify({ owner: repo.owner, repo: repo.name, title: title.trim(), body: description }),
      })
      const data = await response.json() as { error?: string; relogin?: boolean;
        issue?: { number: number; html_url: string } }
      if (!response.ok || !data.issue) throw Object.assign(
        new Error(data.error || 'HTTP ' + response.status), { relogin: data.relogin })
      setNotice({ text: 'Issue #' + data.issue.number + ' 创建成功。请手动刷新列表。',
        url: data.issue.html_url })
      setCreating(false)
      setTitle('')
      setDescription('')
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : String(error), error: true,
        relogin: Boolean((error as { relogin?: boolean })?.relogin) })
    } finally { setPending(false) }
  }

  return <section className={styles.workspace}>
    <header className={styles.toolbar}>
      <h2>Open Issues ({issues.length})</h2>
      <button type="button" disabled={!loggedIn || pending}
        onClick={() => setCreating(value => !value)}>
        {creating ? '取消创建' : '新建 Issue'}
      </button>
    </header>
    {!loggedIn && <p>可匿名阅读已授权公开仓库；创建 Issue 需要 GitHub OAuth 登录。</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}
      {notice.url && <> · <a href={notice.url} target="_blank" rel="noreferrer">在 GitHub 查看</a></>}
      {notice.relogin && <> · <a href="/api/github-login">重新登录</a></>}
    </p>}
    {creating && <form className={styles.form} onSubmit={event => void submitIssue(event)}>
      <h3>创建 Issue · {repo.full_name}</h3>
      <label>标题 <input required maxLength={256} value={title}
        onChange={e => setTitle(e.target.value)} /></label>
      <label>正文 <textarea rows={6} maxLength={20000} value={description}
        onChange={e => setDescription(e.target.value)} /></label>
      <button type="submit" disabled={pending || !title.trim()}>
        {pending ? '创建中…' : '确认创建 Issue'}
      </button>
    </form>}
    <ul className={styles.list}>{issues.map(issue => <li key={issue.number}>
      <Link to={'/' + repo.owner + '/' + repo.name + '/issues/' + issue.number}>
        #{issue.number} · {issue.title}
      </Link>
      <small>{issue.comments} comments</small>
      <a href={issue.html_url} target="_blank" rel="noreferrer">GitHub</a>
    </li>)}</ul>
    {!issues.length && <p>暂无 Open Issue。</p>}
  </section>
}
