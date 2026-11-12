import type { TopicRepository } from './service'
import styles from './topic-page.module.css'

/** @summary Render one public Topic Search candidate without implying app installation. */
export default function TopicProjectCard({ project }: { project: TopicRepository }) {
  return <article className={styles.projectCard}>
    <span className={styles.projectMark} aria-hidden="true">
      {project.name.slice(0, 1).toUpperCase()}
    </span>
    <div className={styles.projectContent}>
      <p className={styles.cardMeta}>{project.language || 'GitHub 项目'}
        <span>★ {project.stargazers_count}</span></p>
      <h3>{project.name}</h3>
      <p>{project.description || '暂无项目简介'}</p>
      <a href={project.html_url} target="_blank" rel="noopener noreferrer">打开 GitHub</a>
    </div>
  </article>
}
