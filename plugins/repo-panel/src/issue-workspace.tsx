import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Issue, Repo } from '../../repo-issues/src/index'

type Comment = {
  id: number
  body: string
  html_url: string
  created_at: string
  user: { login: string }
}
type Detail = {
  issue: {
    number: number
    title: string
    body: string
    html_url: string
    state: string
    comments: number
    user: { login: string }
  }
  comments: Comment[]
}
type Notice = { text: string; url?: string; relogin?: boolean; error?: boolean }

async function readJson(response: Response) {
  const data = await response.json() as Record<string, any>
  if (!response.ok) throw Object.assign(new Error(String(data.error || 'HTTP ' + response.status)), {
    relogin: data.relogin === true,
  })
  return data
}

/** @summary Manually browse and write Issues with visible, user-confirmed actions. */
export function IssueWorkspace({ repo, issues, loggedIn }: {
  repo: Repo
  issues: Issue[]
  loggedIn: boolean
}) {
  const [opened, setOpened] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [reply, setReply] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const revision = useRef(0)

  useEffect(() => () => { revision.current++ }, [])

  const qs = (number: number) => new URLSearchParams({
    owner: repo.owner, repo: repo.name, number: String(number),
  }).toString()

  async function openIssue(number: number) {
    if (pending) return
    const current = ++revision.current
    setCreating(false)
    setOpened(number)
    setDetail(null)
    setReply('')
    setNotice(null)
    setLoading(true)
    try {
      const response = await fetch('/api/github-issue?' + qs(number), { cache: 'no-store' })
      const data = await readJson(response) as Detail
      if (revision.current === current) setDetail(data)
    } catch (error) {
      if (revision.current === current) setNotice({ text: String(error instanceof Error ? error.message : error), error: true })
    } finally {
      if (revision.current === current) setLoading(false)
    }
  }

  function switchToCreate() {
    if (pending) return
    revision.current++
    setLoading(false)
    setOpened(null)
    setDetail(null)
    setNotice(null)
    setCreating(value => !value)
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || !loggedIn || !title.trim() || title.length > 256 ||
        description.length > 20000 || !window.confirm('确认以你的 GitHub 身份创建此 Issue？')) return
    setPending(true)
    setNotice(null)
    const current = revision.current
    try {
      const response = await fetch('/api/github-issue-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
        body: JSON.stringify({ owner: repo.owner, repo: repo.name, title: title.trim(), body: description }),
      })
      const data = await readJson(response) as { issue: { number: number; html_url: string } }
      if (revision.current === current) {
        setNotice({ text: 'Issue #' + data.issue.number + ' 创建成功。可点击链接查看，或手动刷新列表。', url: data.issue.html_url })
        setCreating(false)
        setTitle('')
        setDescription('')
      }
    } catch (error) {
      if (revision.current === current) setNotice({
        text: error instanceof Error ? error.message : String(error),
        relogin: Boolean((error as { relogin?: boolean })?.relogin), error: true,
      })
    } finally {
      if (revision.current === current) setPending(false)
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail || pending || !loggedIn || !reply.trim() || reply.length > 20000 ||
        !window.confirm('确认以你的 GitHub 身份发表此评论？')) return
    const current = revision.current
    const number = detail.issue.number
    setPending(true)
    setNotice(null)
    try {
      const response = await fetch('/api/github-issue-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
        body: JSON.stringify({ owner: repo.owner, repo: repo.name, number, body: reply }),
      })
      const data = await readJson(response) as { comment: Comment }
      if (current === revision.current) {
        setDetail(previous => previous && previous.issue.number === number
          ? { issue: { ...previous.issue, comments: previous.issue.comments + 1 },
            comments: [...previous.comments, data.comment] } : previous)
        setReply('')
        setNotice({ text: '评论发表成功。', url: data.comment.html_url })
      }
    } catch (error) {
      if (current === revision.current) setNotice({
        text: error instanceof Error ? error.message : String(error),
        relogin: Boolean((error as { relogin?: boolean })?.relogin), error: true,
      })
    } finally {
      if (current === revision.current) setPending(false)
    }
  }

  return <section className="issue-workspace">
    <div className="issue-toolbar">
      <h2>Open Issues ({issues.length})</h2>
      <button disabled={!loggedIn || pending} onClick={switchToCreate}>
        {creating ? '取消创建' : '新建 Issue'}
      </button>
    </div>
    {!loggedIn && <p className="note">登录 GitHub 后可以创建 Issue 和发表评论；浏览不需要登录。</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'} className={notice.error ? 'error-message' : 'success-message'}>
      {notice.text}
      {notice.url && <> <a href={notice.url} target="_blank" rel="noreferrer">在 GitHub 查看</a></>}
      {notice.relogin && <> <a href="/api/github-login">重新登录</a></>}
    </p>}
    {creating && <form className="editor" onSubmit={event => void submitIssue(event)}>
      <h3>创建 Issue · {repo.full_name}</h3>
      <label>标题 <input required maxLength={256} value={title}
        onChange={event => setTitle(event.target.value)} placeholder="简要描述问题或任务"/></label>
      <label>正文（支持 Markdown） <textarea rows={7} maxLength={20000}
        value={description} onChange={event => setDescription(event.target.value)}
        placeholder="详细内容"/></label>
      <button type="submit" disabled={pending || !title.trim()}>
        {pending ? '创建中…' : '确认创建 Issue'}
      </button>
    </form>}
    <ul className="issue-list">{issues.map(issue => <li key={issue.number}>
      <button type="button" disabled={pending} className={opened === issue.number ? 'issue-open selected' : 'issue-open'}
        onClick={() => void openIssue(issue.number)}>
        #{issue.number} · {issue.title}
      </button>
      <small>{issue.comments} comments</small>
      <a href={issue.html_url} target="_blank" rel="noreferrer">GitHub</a>
    </li>)}</ul>
    {!issues.length && <p>暂无 Open Issue。</p>}
    {opened !== null && !creating && <section className="issue-detail">
      <div className="issue-toolbar"><h3>Issue #{opened}</h3>
        <button type="button" disabled={pending || loading} onClick={() => void openIssue(opened)}>重新加载</button>
      </div>
      {loading && <p role="status">正在加载 Issue 详情…</p>}
      {detail && <>
        <h3>{detail.issue.title}</h3>
        <p className="note">由 {detail.issue.user.login} 创建 · {detail.issue.state} ·
          <a href={detail.issue.html_url} target="_blank" rel="noreferrer"> GitHub 原文</a></p>
        <div className="issue-body">{detail.issue.body || '（无正文）'}</div>
        <h4>评论（显示 {detail.comments.length} / {detail.issue.comments}）</h4>
        {detail.comments.map(item => <article key={item.id} className="issue-comment">
          <div className="comment-meta">{item.user.login} · {item.created_at}
            {' · '}<a href={item.html_url} target="_blank" rel="noreferrer">GitHub</a></div>
          <div className="issue-body">{item.body}</div>
        </article>)}
        {detail.issue.comments > 100 && <p className="note">目前仅加载前 100 条评论，其他评论请到 GitHub 查看。</p>}

        {loggedIn ? <form className="editor" onSubmit={event => void submitComment(event)}>
          <label>发表评论（支持 Markdown）<textarea rows={5} maxLength={20000}
            value={reply} onChange={event => setReply(event.target.value)}
            placeholder="输入评论内容"/></label>
          <button type="submit" disabled={pending || !reply.trim()}>
            {pending ? '提交中…' : '确认发表评论'}
          </button>
        </form> : <p className="note">登录 GitHub 后可以发表评论。</p>}
      </>}
    </section>}
  </section>
}
