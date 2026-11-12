import type { FormEvent } from 'react'
import styles from './topic-page.module.css'

export type TopicReportDialogProps = {
  title: string; body: string; pending: boolean; checking: boolean;
  uncertain: boolean; message: string;
  writeEnabled: boolean; githubNewIssueUrl: string; loginUrl: string;
  onTitleChange(value: string): void; onBodyChange(value: string): void;
  onCancel(): void; onConfirmUnknown(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}

/** @summary Keep draft and submission failures visible inside the accessible report editor. */
export default function TopicReportDialog(props: TopicReportDialogProps) {
  return <div className={styles.dialogBackdrop}>
    <section className={styles.dialog} role="dialog" aria-modal="true"
      aria-labelledby="topic-report-heading">
      <h2 id="topic-report-heading">向当前仓库提交错误报告</h2>
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
        {props.checking && <p role="status" className={styles.reportWarning}>
          正在以当前 GitHub 登录身份核查公开仓库与 Issues 创建权限…
        </p>}
        {!props.writeEnabled && !props.checking && !props.uncertain &&
          <p role="status" className={styles.reportWarning}>
            当前不能确认写入权限。可保留草稿并在 GitHub 手动提交。
          </p>}
        {props.uncertain && <div role="status" className={styles.reportWarning}>
          <p>之前的创建结果未知，禁止自动重复提交。请先打开 GitHub Issues 核对是否已有该报告。</p>
          <button type="button" onClick={props.onConfirmUnknown} disabled={props.pending}>
            我已在 GitHub 核查，允许再次提交
          </button>
        </div>}
        <p className={styles.note}>请检查报告内容是否包含个人信息。系统不会主动加入令牌、Cookie 或服务端配置。</p>
        <div className={styles.errorActions}>
          <button type="button" onClick={props.onCancel} disabled={props.pending}>关闭</button>
          <button type="submit" disabled={props.pending || !props.writeEnabled}>
            {props.pending ? '提交中…' : '确认提交 Issue'}
          </button>
          {!props.writeEnabled && !props.checking && !props.uncertain &&
            <a href={props.loginUrl}>重新登录 GitHub</a>}
          <a href={props.githubNewIssueUrl} target="_blank" rel="noopener noreferrer">
            在 GitHub 手动提交
          </a>
        </div>
      </form>
    </section>
  </div>
}
