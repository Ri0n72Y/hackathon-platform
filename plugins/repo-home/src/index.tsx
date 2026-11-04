import type { Context } from '@deepseek-ai/cordis'
import { Link, useParams } from 'react-router'
import styles from './RepoHomePlaceholder.module.css'

/** @summary Identify a project solely from URL parameters without requesting repository data. */
export function RepoHomePlaceholder() {
  const { owner, repo } = useParams<'owner' | 'repo'>()
  const valid = !!owner && !!repo && owner.toLowerCase() !== 'api' && /^[A-Za-z0-9-]+$/.test(owner) && /^[A-Za-z0-9._-]+$/.test(repo)

  return <section className={styles.page}>
    <Link to="/">返回 Playground</Link>
    {valid ? <>
      <h1>{owner}/{repo}</h1>
      <p>项目主页占位页面</p>
      <p role="status">数据与 Installation 验证尚未接入。</p>
      <p>仓库标识仅来自当前 URL；不表示仓库存在、已授权或已加载成功。</p>
    </> : <>
      <h1>仓库 URL 参数无效</h1>
      <p role="alert">请使用 /owner/repo 形式的有效仓库路径。</p>
    </>}
  </section>
}

/** @summary Register the project home placeholder as a standalone Cordis page plugin. */
export const repoHome = {
  name: 'repo-home',
  inject: ['reactUI'],
  apply(ctx: Context) {
    ctx.effect(() => ctx.reactUI.registerPage({
      id: 'repo-home', path: '/:owner/:repo', Component: RepoHomePlaceholder,
    }))
  },
}
