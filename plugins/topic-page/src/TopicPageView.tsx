import type { FormEvent } from 'react'
import TopicPageHead from './TopicPageHead'
import TopicProjectCard from './TopicProjectCard'
import TopicStatus from './TopicStatus'
import TopicReportDialog from './TopicReportDialog'
import type { TopicPageError, TopicRepository, TopicSnapshot } from './service'
import styles from './topic-page.module.css'

export type TopicPageViewProps = {
  owner: string; repo: string; snapshot: TopicSnapshot | null;
  projects: TopicRepository[]; loading: boolean;
  error: TopicPageError | null; windowExhausted: boolean;
  report: { open: boolean; title: string; body: string; pending: boolean;
    checking: boolean; uncertain: boolean; message: string; url: string };
  writeEnabled: boolean; canReport: boolean;
  onRetry(): void; onOpenReport(): void; onCloseReport(): void;
  onConfirmUnknown(): void;
  onReportTitleChange(value: string): void; onReportBodyChange(value: string): void;
  onSubmitReport(event: FormEvent<HTMLFormElement>): void;
}

/** @summary Render Topic projects, explicit search bounds and an editable report without business fetches. */
export default function TopicPageView(props: TopicPageViewProps) {
  const githubIssuesUrl = 'https://github.com/' + encodeURIComponent(props.owner) + '/' +
    encodeURIComponent(props.repo) + '/issues'
  const base = githubIssuesUrl + '/new'
  const login = '/api/github-login?return_to=' + encodeURIComponent(
    '/topic/' + props.owner + '/' + props.repo)
  return <div className={styles.page}>
    {props.snapshot && <TopicPageHead snapshot={props.snapshot}/>}
    <section className={styles.section} aria-labelledby="topic-projects-heading">
      <div className={styles.sectionHeading}>
        <div><span className={styles.eyebrow}>PUBLIC GITHUB TOPIC</span>
          <h2 id="topic-projects-heading">参与项目</h2></div>
        <span className={styles.count}>{props.projects.length} 个候选项目</span>
      </div>
      <TopicStatus loading={props.loading} error={props.error}
        windowExhausted={props.windowExhausted} count={props.projects.length}
        onRetry={props.onRetry}
        onReport={props.canReport ? props.onOpenReport : undefined}
        reportUrl={props.report.url}
        loginUrl={login}/>
      {!props.loading && !props.error && props.projects.length === 0 &&
        <div className={styles.empty}>当前可访问搜索范围没有符合配置的项目。</div>}
      {props.projects.length > 0 && <div className={styles.grid}>
        {props.projects.map(project => <TopicProjectCard
          key={project.full_name.toLowerCase()} project={project}/>)}
      </div>}
    </section>
    {props.report.open && <TopicReportDialog
      title={props.report.title} body={props.report.body}
      pending={props.report.pending} checking={props.report.checking}
      uncertain={props.report.uncertain} message={props.report.message}
      writeEnabled={props.writeEnabled} githubNewIssueUrl={base}
      githubIssuesUrl={githubIssuesUrl} loginUrl={login}
      onTitleChange={props.onReportTitleChange} onBodyChange={props.onReportBodyChange}
      onCancel={props.onCloseReport} onConfirmUnknown={props.onConfirmUnknown}
      onSubmit={props.onSubmitReport}/>}
  </div>
}
