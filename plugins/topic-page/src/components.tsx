import { type FormEvent } from "react";
import type { TopicPageError, TopicRepository, TopicSnapshot } from "./service";
import styles from "./topic-page.module.css";

function readmeFields(readme: string) {
  const lines = readme.replace(/\r\n?/g, "\n").split("\n");
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line));
  const title =
    titleIndex >= 0
      ? lines[titleIndex].replace(/^#\s+/, "").trim()
      : "Topic Page";
  const metadata = new Map<string, string>();
  const descriptionLines = lines.filter((line, index) => {
    const match = line.match(/^\s*(email|datetime):\s*(.*?)\s*$/i);
    if (match) {
      metadata.set(match[1].toLowerCase(), match[2].trim());
      return false;
    }
    return index !== titleIndex;
  });
  return {
    title,
    description: descriptionLines.join("\n").trim(),
    email: metadata.get("email") || "",
    datetime: metadata.get("datetime") || "",
  };
}

/** @summary Render README title, plain text description, optional metadata and repository cover. */
export function TopicPageHead({ snapshot }: { snapshot: TopicSnapshot }) {
  const { title, description, email, datetime } = readmeFields(snapshot.readme);
  return (
    <section className={styles.headCard}>
      {snapshot.coverUrl && (
        <img
          src={snapshot.coverUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className={styles.headCopy}>
        <span className={styles.eyebrow}>TOPIC / {snapshot.config.topic}</span>
        <h1>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
        {(email || datetime) && (
          <footer className={styles.headMeta}>
            {email && <span>邮箱：{email}</span>}
            {datetime && <span>时间：{datetime}</span>}
          </footer>
        )}
        <a href={snapshot.repository.html_url} target="_blank" rel="noreferrer">
          查看官方仓库 ↗
        </a>
      </div>
    </section>
  );
}

/** @summary Render one GitHub repository as a TopicPage project card. */
export function TopicPageProjectCard({
  project,
}: {
  project: TopicRepository;
}) {
  return (
    <article className={styles.projectCard}>
      <div className={styles.projectMark}>
        {project.name.slice(0, 1).toUpperCase()}
      </div>
      <div className={styles.projectContent}>
        <div className={styles.cardMeta}>
          {project.language || "项目"} <span>★ {project.stargazers_count}</span>
        </div>
        <h3>{project.name}</h3>
        <p>{project.description || "暂无项目简介"}</p>
        <a href={project.html_url} target="_blank" rel="noreferrer">
          打开 GitHub ↗
        </a>
      </div>
    </article>
  );
}

/** @summary Render the loading state for TopicPage project cards. */
export function TopicPageLoading() {
  return (
    <div className={styles.grid}>
      {[1, 2, 3].map((item) => (
        <div className={styles.skeleton} key={item} />
      ))}
    </div>
  );
}

/** @summary Render a retryable TopicPage failure with safe diagnostic details. */
export function TopicPageError({
  error,
  onRetry,
  onReport,
  reportUrl,
  reportError,
}: {
  error: TopicPageError;
  onRetry: () => void;
  onReport?: () => void;
  reportUrl: string;
  reportError: string;
}) {
  return (
    <div className={styles.error}>
      <h2>暂时无法加载项目</h2>
      <p>
        {error.message}
        {error.status ? `（HTTP ${error.status}）` : ""}
      </p>
      <p className={styles.note}>
        阶段：{error.stage || "unknown"} · 请求时间：
        {new Date().toLocaleString()}
      </p>
      <div className={styles.errorActions}>
        <button type="button" onClick={onRetry}>
          重新加载
        </button>
        {onReport && (
          <button type="button" onClick={onReport}>
            提交问题到该仓库
          </button>
        )}
      </div>
      {reportError && (
        <p role="alert" className={styles.errorText}>
          {reportError}
        </p>
      )}
      {reportUrl && (
        <p>
          <a href={reportUrl} target="_blank" rel="noreferrer">
            Issue 已创建，打开查看 ↗
          </a>
        </p>
      )}
    </div>
  );
}

/** @summary Render the editable confirmation dialog for a public error report. */
export function TopicPageReportDialog({
  title,
  body,
  pending,
  onTitleChange,
  onBodyChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  body: string;
  pending: boolean;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <form className={styles.dialog} onSubmit={onSubmit}>
        <h2>提交错误报告</h2>
        <label>
          标题
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            maxLength={256}
            required
          />
        </label>
        <label>
          内容
          <textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            maxLength={20000}
            rows={8}
            required
          />
        </label>
        <p className={styles.note}>
          不会提交 Token、Cookie、响应头或服务端环境变量。
        </p>
        <div className={styles.errorActions}>
          <button type="button" onClick={onCancel} disabled={pending}>
            取消
          </button>
          <button type="submit" disabled={pending}>
            {pending ? "提交中…" : "确认提交"}
          </button>
        </div>
      </form>
    </div>
  );
}
