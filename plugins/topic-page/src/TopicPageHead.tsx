import { readmeFields } from './domain.mjs'
import type { TopicSnapshot } from './service'
import styles from './topic-page.module.css'

/** @summary Display only README content following the first H1 and footer metadata at card bottom. */
export default function TopicPageHead({ snapshot }: { snapshot: TopicSnapshot }) {
  const { title, description, email, datetime } = readmeFields(snapshot.readme)
  return <header className={styles.headCard}>
    {snapshot.coverUrl && <img src={snapshot.coverUrl} alt=""
      onError={e => { e.currentTarget.hidden = true }}/>}
    <div className={styles.headCopy}>
      <span className={styles.eyebrow}>TOPIC / {snapshot.config.topic}</span>
      <h1>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
      <p className={styles.sourceHint}>公开 GitHub Topic 候选，未核验 LabourChain Installation。</p>
      <a href={snapshot.repository.html_url} target="_blank" rel="noopener noreferrer">
        查看官方仓库
      </a>
      {(email || datetime) && <footer className={styles.headMeta}>
        {email && <span>邮箱：{email}</span>}
        {datetime && <span>时间：{datetime}</span>}
      </footer>}
    </div>
  </header>
}
