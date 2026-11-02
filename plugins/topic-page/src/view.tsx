import type { FormEvent } from "react";
import type { TopicPageError, TopicRepository, TopicSnapshot } from "./service";
import {
  TopicPageError as ErrorView,
  TopicPageHead,
  TopicPageLoading,
  TopicPageProjectCard,
  TopicPageReportDialog,
} from "./components";
import styles from "./topic-page.module.css";

export type TopicPageViewProps = {
  snapshot: TopicSnapshot | null;
  projects: TopicRepository[];
  loading: boolean;
  error: TopicPageError | null;
  report: {
    open: boolean;
    title: string;
    body: string;
    pending: boolean;
    message: string;
    url: string;
  };
  canReport: boolean;
  onRetry: () => void;
  onOpenReport: () => void;
  onCloseReport: () => void;
  onReportTitleChange: (value: string) => void;
  onReportBodyChange: (value: string) => void;
  onSubmitReport: (event: FormEvent<HTMLFormElement>) => void;
};

/** @summary Compose the pure TopicPage presentation from container props. */
export function TopicPageView(props: TopicPageViewProps) {
  return (
    <main className={styles.page}>
      {props.snapshot && <TopicPageHead snapshot={props.snapshot} />}
      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>COMMUNITY PROJECTS</span>
            <h2>参与项目</h2>
          </div>
          <span className={styles.count}>{props.projects.length} 个项目</span>
        </div>
        {props.loading && <TopicPageLoading />}
        {props.error && (
          <ErrorView
            error={props.error}
            onRetry={props.onRetry}
            onReport={props.canReport ? props.onOpenReport : undefined}
            reportUrl={props.report.url}
            reportError={props.report.message}
          />
        )}
        {!props.loading && !props.error && props.projects.length === 0 && (
          <div className={styles.empty}>
            当前 Topic 下还没有符合配置的项目。
          </div>
        )}
        {!props.loading && !props.error && props.projects.length > 0 && (
          <div className={styles.grid}>
            {props.projects.map((project) => (
              <TopicPageProjectCard key={project.full_name} project={project} />
            ))}
          </div>
        )}
      </section>
      {props.report.open && (
        <TopicPageReportDialog
          title={props.report.title}
          body={props.report.body}
          pending={props.report.pending}
          onTitleChange={props.onReportTitleChange}
          onBodyChange={props.onReportBodyChange}
          onCancel={props.onCloseReport}
          onSubmit={props.onSubmitReport}
        />
      )}
    </main>
  );
}
