import type { FormEvent } from 'react'
import styles from './topic-page.module.css'

export type TopicReportDialogProps = {
  title: string; body: string; pending: boolean; message: string;
  writeEnabled: boolean; githubNewIssueUrl: string;
  onTitleChange(value: string): void; onBodyChange(value: string): void;
  onCancel(): void; onSubmit(event: FormEvent<HTMLFormElement>): void;
}

/** @summary Keep draft and submission failures visible inside the accessible report editor. */
export default function TopicReportDialog(props: TopicReportDialogProps) {
  return <div className={styles.dialogBackdrop}>
    <section className={styles.dialog} role="dialog" aria-modal="true"
      aria-labelledby="topic-report-heading">
      <h2 id="topic-report-heading">错误报告草稿</h2>
      <form onSubmit={props.onSubmit}>
        <label>标题
          <input autoFocus required maxLength={256} value={props.title}
            onChange={e => props.onTitleChange(e.target.value)}/>
        </label>
        <label>正文
          <textarea required rows={8} maxLength={20000} value={props.body}
            onChange={e => props.onBodyChange(e.target.value)}/>
        </label>
        {props.message && <p role="alert" className={styles.errorText}>{props.message}</p>}
        {!props.writeEnabled && <p role="status" className={styles.reportWarning}>
          站内 Issue 提交尚未获得写入权限方案批准。请复制编辑后的报告，
          再在 GitHub 手动创建 Issue；本页面不会自动写入仓库。
        </p>}
        <p className={styles.note}>请检查报告内容是否包含个人信息。系统不会主动加入令牌、Cookie 或服务端配置。</p>
        <div className={styles.errorActions}>
          <button type="button" onClick={props.onCancel} disabled={props.pending}>关闭</button>
          <button type="submit" disabled={props.pending || !props.writeEnabled}>
            {props.pending ? '提交中…' : '确认提交 Issue'}
          </button>
          <a href={props.githubNewIssueUrl} target="_blank" rel="noopener noreferrer">
            在 GitHub 手动提交
          </a>
        </div>
      </form>
    </section>
  </div>
}
