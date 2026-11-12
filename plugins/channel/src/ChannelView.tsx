import { Link } from 'react-router'
import type { ChannelSnapshot } from './service'
import styles from './ChannelView.module.css'

type Props = {
  owner: string
  repo: string
  loading: boolean
  snapshot: ChannelSnapshot | null
  error: string
  onRetry(): void
}
const stateText: Record<string, string> = {
  config_missing: '仓库 main 尚无 labourchain.config.yaml。请先初始化配置。',
  invalid_config: 'main 的配置无法安全解析，暂不显示任何频道。',
  sync_branch_missing: '仓库 main 分支不存在，频道无法读取。',
  no_channels: 'main 配置没有启用 channel Namespace 或有效频道标签。',
  snapshot_incomplete: 'GitHub Open Issue 分页不完整，无法确定最新有效频道。',
}
function issueUrl(owner: string, repo: string, number: number) {
  return '/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) +
    '/issues/' + number
}

/** @summary Display one repository's Channel selection with existing Issue detail navigation. */
export default function ChannelView({ owner, repo, loading, snapshot, error, onRetry }: Props) {
  const base = '/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
  return <section className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="频道导航">
      <Link to={base}>项目主页</Link><span aria-hidden="true">/</span><span>频道</span>
    </nav>
    <header>
      <p className={styles.eyebrow}>{owner}/{repo}</p>
      <h1>项目频道</h1>
      <p>频道来自 <code>main</code> 的有效 <code>channel:*</code> 配置，每个频道只选择最新创建的有效 Open Issue。</p>
    </header>
    <div className={styles.actions}>
      <button type="button" disabled={loading} onClick={onRetry}>从 GitHub 重新读取</button>
      {snapshot?.headSha && <span>Config 分支 HEAD：<code>{snapshot.headSha.slice(0, 12)}</code></span>}
    </div>
    {loading && <p role="status">正在读取频道配置与 GitHub Open Issues…</p>}
    {error && <p className={styles.error} role="alert">读取失败：{error}</p>}
    {!loading && snapshot && snapshot.state !== 'ready' &&
      <section className={styles.notice} role="status">
        <h2>频道暂不可用</h2>
        <p>{stateText[snapshot.state] || snapshot.state}</p>
        {snapshot.error && <p>{snapshot.error}</p>}
        {snapshot.state === 'config_missing' && <Link to={base + '/config'}>查看配置初始化</Link>}
      </section>}
    {!loading && snapshot?.state === 'ready' && <>
      <p className={styles.meta}>配置频道 {snapshot.channels.length} 个；
        已完整检查 {snapshot.scannedIssues ?? 0} 个 GitHub Open Issue 对象。
        频道 Issue 以 GitHub 创建时间为准。</p>
      <ul className={styles.grid}>
        {snapshot.channels.map(channel => <li className={styles.card} key={channel.label}>
          <h2>{channel.name}</h2>
          <p className={styles.label}><code>{channel.label}</code></p>
          {channel.issue ? <>
            <p className={styles.status}>当前频道 · Issue #{channel.issue.number}</p>
            <h3><Link to={issueUrl(owner, repo, channel.issue.number)}>
              {channel.issue.title}</Link></h3>
            <p className={styles.meta}>作者：{channel.issue.author || '未知'} ·
              创建时间：{channel.issue.createdAt} · 评论：{channel.issue.comments}</p>
            <p>本频道的讨论和劳动历史由该 Issue 详情提供，工时仅汇总该 Issue 中的有效结构化评论。</p>
            <Link className={styles.enter} to={issueUrl(owner, repo, channel.issue.number)}>
              进入频道 Issue
            </Link>
          </> : <p className={styles.empty}>当前标签没有有效的 Open Channel Issue；
            不会使用 Closed Issue 或 PR 替代。</p>}
        </li>)}
      </ul>
    </>}
    <p className={styles.footnote}>普通 Open/Closed Issue 均可通过既有 Issue 详情直接访问；
      频道标签只影响频道入口，不决定普通 Issue 的读取权限。</p>
  </section>
}
