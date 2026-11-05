import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { CommentItemView, IssueDetailViewActions, IssueDetailViewModel, IssueTab,
  LabourField, LabourItemView, PermissionView, FormNotice } from './view-model'
import styles from './IssueDetailView.module.css'

type Props = { model: IssueDetailViewModel; actions: IssueDetailViewActions }

/** @summary Resolve keyboard navigation inside the two-tab Issue view. */
export function issueTabForKey(current: IssueTab, key: string): IssueTab | null {
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    return current === 'discussion' ? 'labour' : 'discussion'
  }
  if (key === 'Home') return 'discussion'
  if (key === 'End') return 'labour'
  return null
}

function PermissionHint({ permission }: { permission: PermissionView }) {
  if (permission.allowed) return <p className={styles.permission}>已通过 OAuth 与仓库范围检查；最终写入以 GitHub 返回结果为准。</p>
  return <p className={styles.permission} role={permission.state === 'error' ? 'alert' : 'status'}>
    {permission.reason}
    {permission.loginHref && <> · <a href={permission.loginHref}>{permission.loginText}</a></>}
  </p>
}

function FormFeedback({ notice, kind }: { notice: FormNotice | null; kind: 'comment' | 'labour' }) {
  if (!notice || notice.kind !== kind) return null
  return <p className={notice.tone === 'error' ? styles.error : styles.success}
    role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.message}</p>
}

function DiscussionView({ model, actions }: Props) {
  const issue = model.issue!
  const form = model.form
  return <>
    <h2>讨论</h2>
    <ul className={styles.list}>{issue.discussion.comments.map((item: CommentItemView) =>
      <li key={item.id} className={styles.listItem}>
        <article>
          <p className={styles.meta}>{item.author} · {item.time}
            {item.sourceUrl && <> · <a href={item.sourceUrl} target="_blank" rel="noreferrer">GitHub 来源</a></>}
          </p>
          <div className={styles.body}>{item.body}</div>
        </article>
      </li>)}</ul>
    {!issue.discussion.comments.length && <p>{issue.discussion.emptyText}</p>}
    <form className={styles.composer} onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      actions.onSubmitComment()
    }}>
      <h3>参与讨论</h3>
      <label>评论内容（Markdown）
        <textarea rows={5} maxLength={20000} value={form.draft}
          onChange={event => actions.onCommentChange(event.target.value)} />
      </label>
      <div className={styles.formActions}>
        <button type="submit" disabled={!form.permission.allowed || form.pending || !form.draft.trim()}>
          {form.pending && form.pendingKind === 'comment' ? '提交中…' : '确认以 GitHub 身份评论'}
        </button>
        {form.pending && form.pendingKind === 'comment' && <span role="status">正在提交评论，请勿重复操作。</span>}
      </div>
      <PermissionHint permission={form.permission}/>
      <FormFeedback notice={form.notice} kind="comment"/>
    </form>
  </>
}

function LabourHistoryView({ model, actions }: Props) {
  const issue = model.issue!
  const form = model.form
  const update = (field: LabourField, value: string) => actions.onLabourChange(field, value)
  return <>
    <h2>当前 Issue 劳动历史</h2>
    <p className={styles.meta}>仅展示本 Issue 中可识别的结构化登记；没有可靠 Issue 关联的独立 Commit 不计入。</p>
    <ul className={styles.list}>{issue.labour.records.map((item: LabourItemView) =>
      <li key={item.id} className={styles.listItem}>
        <article className={styles.record}>
          <p className={styles.meta}>{item.author} · GitHub 评论时间 {item.time}
            {item.sourceUrl && <> · <a href={item.sourceUrl} target="_blank" rel="noreferrer">原始劳动评论</a></>}
          </p>
          <div className={styles.body}>{item.work}</div>
          <p>主观估时：{item.hours} 小时
            {item.conflicted && <span className={styles.warning}> · Commit 冲突，暂不计入总数</span>}
          </p>
          {item.outcome && <p className={styles.body}>成果：{item.outcome}</p>}
          <p className={styles.meta}>劳动发生时间：{item.occurrence}</p>
          {item.commits.map(commit => <p key={commit.sha} className={styles.commit}>
            Commit：<a href={commit.href} target="_blank" rel="noreferrer">{commit.sha}</a>
          </p>)}
        </article>
      </li>)}</ul>
    {!issue.labour.records.length && <p>{issue.labour.emptyText}</p>}
    {issue.labour.invalidCount > 0 && <p className={styles.warning} role="status">
      {issue.labour.invalidCount} 条候选劳动评论格式无效，仍保留在普通讨论中；统计不能视为完整。
    </p>}
    <form className={styles.composer} onSubmit={(event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      actions.onSubmitLabour()
    }}>
      <h3>登记劳动记录</h3>
      <label>工作内容（必填）
        <textarea rows={4} required value={form.labour.work}
          onChange={event => update('work', event.target.value)}/>
      </label>
      <label>主观估时 / 小时（0.5 递增）
        <input type="number" required min="0.5" step="0.5" value={form.labour.hours}
          onChange={event => update('hours', event.target.value)}/>
      </label>
      <label>成果（可选）
        <textarea rows={3} value={form.labour.outcome}
          onChange={event => update('outcome', event.target.value)}/>
      </label>
      <label>关联 Commit SHA（可选；逗号或换行分隔）
        <textarea rows={3} value={form.labour.commits}
          onChange={event => update('commits', event.target.value)}/>
      </label>
      <label>开始时间（可选）
        <input type="datetime-local" value={form.labour.start}
          onChange={event => update('start', event.target.value)}/>
      </label>
      <label>结束时间（可选；与开始时间成对）
        <input type="datetime-local" value={form.labour.end}
          onChange={event => update('end', event.target.value)}/>
      </label>
      <div className={styles.formActions}>
        <button type="submit" disabled={!form.permission.allowed || form.pending || !form.labour.work.trim()}>
          {form.pending && form.pendingKind === 'labour' ? '提交中…' : '确认登记到 GitHub 评论'}
        </button>
        {form.pending && form.pendingKind === 'labour' && <span role="status">正在提交劳动记录，请勿重复操作。</span>}
      </div>
      <PermissionHint permission={form.permission}/>
      <FormFeedback notice={form.notice} kind="labour"/>
    </form>
  </>
}

/** @summary Render Issue identity, conversation and labour forms from typed props, without business dependencies. */
export default function IssueDetailView({ model, actions }: Props) {
  const [tab, setTab] = useState<IssueTab>('discussion')
  const baseId = useId()
  const discussionTab = useRef<HTMLButtonElement>(null)
  const labourTab = useRef<HTMLButtonElement>(null)
  const tabId = (name: IssueTab) => baseId + '-tab-' + name
  const panelId = (name: IssueTab) => baseId + '-panel-' + name

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = issueTabForKey(tab, event.key)
    if (!next) return
    event.preventDefault()
    setTab(next)
    ;(next === 'discussion' ? discussionTab : labourTab).current?.focus()
  }

  return <div className={styles.page}>
    <nav className={styles.top} aria-label="Issue 导航">
      <a href={model.navigation.homeHref}>Playground</a>
      <a href={model.navigation.repositoryHref}>返回仓库页</a>
    </nav>
    {model.load.phase === 'loading' && <p role="status">正在读取 GitHub Issue、配置与评论…</p>}
    {model.load.phase === 'error' && <section className={styles.errorPanel}>
      <h1>{model.load.statusCode === 404 ? '404 · Issue 不存在' : 'Issue 无法加载'}</h1>
      <p role="alert">{model.load.error}（HTTP {model.load.statusCode}）</p>
      <button type="button" onClick={actions.onRetry}>重试读取</button>
    </section>}
    {model.load.phase === 'ready' && model.issue && <>
      <header className={styles.context}>
        <p className={styles.meta}>{model.navigation.repository} · #{model.issue.number} · {model.issue.state}</p>
        <h1>{model.issue.title}</h1>
        <p className={styles.meta}>创建者：{model.issue.author} · 创建于 {model.issue.created}
          {model.issue.sourceUrl && <> · <a href={model.issue.sourceUrl}
            target="_blank" rel="noreferrer">GitHub 原文</a></>}
        </p>
        <section className={styles.summary} aria-label="最近劳动成果与工时摘要">
          <div className={styles.summaryPart}>
            <h2>最近已登记成果</h2>
            {model.issue.labourSummary.outcome ? <>
              <p className={styles.body}>{model.issue.labourSummary.outcome.text}</p>
              <p className={styles.meta}>登记者：{model.issue.labourSummary.outcome.author}
                {' · '}{model.issue.labourSummary.outcome.time}
                {model.issue.labourSummary.outcome.sourceUrl && <> · <a
                  href={model.issue.labourSummary.outcome.sourceUrl} target="_blank" rel="noreferrer">来源</a></>}
              </p>
            </> : <p className={styles.meta}>{model.issue.labourSummary.outcomeEmptyText}</p>}
          </div>
          <div className={styles.summaryPart}>
            <h2>已登记主观工时</h2>
            <p className={styles.hours}><strong>{model.issue.labourSummary.hours}</strong> 小时</p>
            <p className={model.issue.labourSummary.complete ? styles.meta : styles.warning}
              role="status">{model.issue.labourSummary.statusText}</p>
          </div>
        </section>
        <section className={styles.issueBody} aria-label="Issue 正文">
          <h2>话题背景</h2>
          <div className={styles.body}>{model.issue.body}</div>
        </section>
      </header>
      <section className={styles.readStatus} aria-label="读取状态">
        <div className={styles.readActions}>
          <p>已读取 {model.issue.pagination.loaded} / {model.issue.pagination.expected} 条 GitHub 评论。
            {' '}{model.issue.pagination.complete ? '已取得全部评论。' : '评论可能未全部取得。'}
          </p>
          <button type="button" onClick={actions.onRefresh} disabled={model.form.pending}
            aria-label="从 GitHub 重新加载此 Issue">刷新 Issue 与评论</button>
        </div>
        <p className={styles.meta}>本次从服务器读取：{model.issue.pagination.lastRead}。
          GitHub Issue 更新时间：{model.issue.updated}。页面不会自动实时更新。</p>
        {model.issue.pagination.warnings.length > 0 &&
          <ul className={styles.warnings}>{model.issue.pagination.warnings.map(message =>
            <li key={message}>{message}</li>)}</ul>}
        {model.issue.pagination.hasMore && <button type="button"
          disabled={model.issue.pagination.fetchingMore} onClick={actions.onLoadMore}>
          {model.issue.pagination.fetchingMore ? '加载中…' : '加载下一页评论'}
        </button>}
        {model.issue.pagination.error && <p className={styles.error} role="alert">
          分页失败：{model.issue.pagination.error}。
          <button type="button" onClick={actions.onLoadMore}>重试本页</button>
        </p>}
      </section>
      <div className={styles.tabs} role="tablist" aria-label="Issue 内容">
        <button ref={discussionTab} id={tabId('discussion')} role="tab" type="button"
          aria-controls={panelId('discussion')} aria-selected={tab === 'discussion'}
          tabIndex={tab === 'discussion' ? 0 : -1}
          onClick={() => setTab('discussion')} onKeyDown={onTabKeyDown}>讨论</button>
        <button ref={labourTab} id={tabId('labour')} role="tab" type="button"
          aria-controls={panelId('labour')} aria-selected={tab === 'labour'}
          tabIndex={tab === 'labour' ? 0 : -1}
          onClick={() => setTab('labour')} onKeyDown={onTabKeyDown}>劳动历史</button>
      </div>
      <section role="tabpanel" id={panelId('discussion')} aria-labelledby={tabId('discussion')}
        tabIndex={0} hidden={tab !== 'discussion'} className={styles.tabpanel}>
        <DiscussionView model={model} actions={actions}/>
      </section>
      <section role="tabpanel" id={panelId('labour')} aria-labelledby={tabId('labour')}
        tabIndex={0} hidden={tab !== 'labour'} className={styles.tabpanel}>
        <LabourHistoryView model={model} actions={actions}/>
      </section>
    </>}
  </div>
}
