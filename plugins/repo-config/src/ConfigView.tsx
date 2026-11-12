import type { FormEvent } from 'react'
import { Link } from 'react-router'
import type { ConfigActionResult, ConfigSnapshot } from './service'
import styles from './ConfigPage.module.css'

const stateText: Record<string, string> = {
  config_missing: '尚未初始化配置',
  invalid_config: '配置格式无效',
  sync_branch_missing: 'main 分支不存在',
  snapshot_incomplete: 'GitHub 数据读取不完整',
  sync_pending: '等待手动同步 Labels',
  ready: '配置与 Labels 已一致',
  awaiting_pr_merge: '等待维护 PR 合并',
  partial_failure: '部分操作失败',
  stale_preview: '预览已过期',
  protection_unknown: '无法确认分支保护规则',
  app_permission_missing: 'GitHub App 权限不足',
  user_permission_missing: '当前用户权限不足',
}
const shaText = (value?: string | null) => value ? value.slice(0, 12) : '无'

type Props = {
  owner: string
  repo: string
  base: string
  login: string
  snapshot: ConfigSnapshot | null
  content: string
  loading: boolean
  busy: boolean
  error: string
  result: ConfigActionResult | null
  confirmRemovals: boolean
  validationState: string
  editorEnabled: boolean
  canSave: boolean
  canSync: boolean
  dirty: boolean
  onRefresh(): void
  onContentChange(value: string): void
  onConfirmRemovalsChange(value: boolean): void
  onSave(event: FormEvent<HTMLFormElement>): void
  onSync(): void
}

/** @summary Render Config state and controls from props; business state and requests live in ConfigPage. */
export default function ConfigView(props: Props) {
  const { owner, repo, base, login, snapshot, content, loading, busy, error,
    result, confirmRemovals, validationState, editorEnabled, canSave, canSync, dirty,
    onRefresh, onContentChange, onConfirmRemovalsChange, onSave, onSync } = props
  const capability = snapshot?.capability
  const plan = snapshot?.plan || null
  const state = snapshot?.state || 'loading'
  return <section className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="面包屑">
      <Link to={base}>项目主页</Link><span aria-hidden="true">/</span><span>仓库配置</span>
    </nav>
    <header className={styles.header}>
      <p className={styles.eyebrow}>{owner}/{repo}</p>
      <h1>仓库配置与 Labels</h1>
      <p>配置同步分支固定为 <strong>main</strong>。Config 提交与 Label 同步分开执行。</p>
    </header>

    {loading && <p role="status">正在读取 main、Config 与 Label 差异…</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {snapshot && <section className={styles.panel} aria-labelledby="state-heading">
      <div className={styles.panelHead}>
        <div><h2 id="state-heading">当前状态</h2>
          <p className={styles.state}>{stateText[state] || state}</p></div>
        <button type="button" onClick={onRefresh} disabled={loading || busy}>重新读取</button>
      </div>
      <dl className={styles.metadata}>
        <div><dt>同步分支</dt><dd>main</dd></div>
        <div><dt>HEAD</dt><dd><code>{shaText(snapshot.headSha)}</code></dd></div>
        <div><dt>Config Blob</dt><dd><code>{shaText(snapshot.fileSha)}</code></dd></div>
        {snapshot.counts && <div><dt>快照</dt><dd>{snapshot.counts.labels} Labels · {snapshot.counts.issueObjects} Issue API 对象</dd></div>}
      </dl>
      {capability?.state === 'unauthenticated' &&
        <p>公开只读预览可用。登录 GitHub 后，服务端会验证当前用户和 App 权限。</p>}
      {capability?.state === 'unauthenticated' && <a href={login}>登录 GitHub</a>}
      {capability?.error && <p className={styles.error}>{capability.error}</p>}
      {capability?.user && <p>当前 OAuth 操作者：<strong>@{capability.user.login}</strong>
        {capability.protectedBranch ? ' · main 受保护，Config 将通过维护 PR 提交。' : ' · main 未检测到保护规则。'}</p>}
      {capability?.missingAppPermissions && capability.missingAppPermissions.length > 0 &&
        <p>App Installation 缺少权限：{capability.missingAppPermissions.join('、')}</p>}
      {capability?.state === 'sync_branch_missing' &&
        <p className={styles.error}>main 不存在。系统不会回退到默认分支或展示分支。</p>}
    </section>}

    {snapshot?.state === 'awaiting_pr_merge' && <section className={styles.panel}>
      <h2>等待 GitHub 审核与合并</h2>
      <p>Config 已提交到维护分支。合并前不会修改仓库 Labels。</p>
      {snapshot.prUrl && <a href={snapshot.prUrl} target="_blank" rel="noopener noreferrer">查看维护 Pull Request</a>}
      <button type="button" onClick={onRefresh} disabled={loading || busy}>合并后重新检查 main</button>
    </section>}

    {snapshot?.state === 'invalid_config' && <section className={styles.panel}>
      <h2>配置无法安全解析</h2>
      <p>当前 v1 仅接受已实现并经过校验的 namespaces 列表。未知字段或不支持的 YAML 不会被静默删除或覆盖。</p>
      {snapshot.configText != null && <pre className={styles.raw}>{snapshot.configText}</pre>}
    </section>}

    {snapshot && editorEnabled && <section className={styles.panel}>
      <h2>labourchain.config.yaml</h2>
      <p>文件固定在仓库根目录。编辑后先校验，再提交到 main 或创建维护 PR。</p>
      <form onSubmit={onSave}>
        <label className={styles.editorLabel} htmlFor="repo-config-source">Config YAML</label>
        <textarea id="repo-config-source" className={styles.editor}
          value={content} onChange={event => onContentChange(event.target.value)}
          spellCheck={false} maxLength={262144} rows={18} disabled={busy || !editorEnabled} />
        {validationState === 'invalid_config' &&
          <p className={styles.error} role="alert">YAML 不符合当前 v1 Schema。请修正格式；不支持的字段不会被覆盖。</p>}
        {validationState === 'ready' &&
          <p className={styles.success}>当前 v1 namespaces 结构校验通过。</p>}
        {!capability?.canSaveConfig &&
          <p>需要 GitHub App Contents: write，以及当前 OAuth 用户的仓库 Write、Maintain 或 Admin 权限；受保护分支还需要 Pull requests: write。</p>}
        <div className={styles.actions}>
          <button type="submit" disabled={!canSave || busy}>
            {busy ? '正在提交…' : snapshot.state === 'config_missing' ? '初始化并提交 Config' : '提交 Config 变更'}
          </button>
          {snapshot.state === 'config_missing' && <span>默认配置仅为编辑建议，不会自动写入。</span>}
          {snapshot.state !== 'config_missing' && !dirty && <span>配置没有未提交的本地修改。</span>}
        </div>
      </form>
    </section>}

    {snapshot?.state === 'sync_pending' && plan && <section className={styles.panel}>
      <h2>Label 同步预览</h2>
      <p>以下差异来自 main 当前生效的 Config。同步必须由用户单独触发。</p>
      <dl className={styles.impact}>
        <div><dt>待创建仓库 Label</dt><dd>{plan.impact.definitions}</dd></div>
        <div><dt>受影响普通 Issue</dt><dd>{plan.impact.issues}</dd></div>
        <div><dt>待移除标签关联</dt><dd>{plan.impact.removals}</dd></div>
      </dl>
      {plan.createLabels.length > 0 && <div className={styles.planGroup}>
        <h3>创建缺失的 Label 定义</h3>
        <ul>{plan.createLabels.map(item => <li key={item.name}><code>{item.name}</code></li>)}</ul>
        <p>每个新建 Label 使用独立随机 HEX 颜色；已有 Label 元数据不会修改。</p>
      </div>}
      {plan.removeIssueLabels.length > 0 && <div className={styles.planGroup}>
        <h3>清理普通 Issue 上的无效关联</h3>
        <ul>{plan.removeIssueLabels.map(item => <li key={item.number}>
          <strong>Issue #{item.number}</strong> — {item.labels.map(name => <code key={name}>{name}</code>)}
        </li>)}</ul>
        <label className={styles.confirm}>
          <input type="checkbox" checked={confirmRemovals}
            onChange={event => onConfirmRemovalsChange(event.target.checked)} disabled={busy} />
          我已检查上述清理清单，确认移除这些普通 Issue 标签关联。
        </label>
      </div>}
      {!capability?.canCreateLabels && plan.createLabels.length > 0 &&
        <p>当前 OAuth 用户或 App Installation 不具备创建仓库 Label 定义的权限。</p>}
      {!capability?.canRemoveLabels && plan.removeIssueLabels.length > 0 &&
        <p>当前 OAuth 用户或 App Installation 不具备清理 Issue 标签关联的权限。</p>}
      <div className={styles.actions}>
        <button type="button" onClick={onSync} disabled={!canSync || busy}>
          {busy ? '正在同步…' : '确认并执行 Label 同步'}
        </button>
        <span>执行前会重新读取 main、Config SHA、Labels 和 Issues；快照变化时要求重新确认。</span>
      </div>
    </section>}

    {snapshot?.state === 'ready' && <section className={styles.panel}>
      <h2>Label 状态已一致</h2>
      <p>当前完整快照没有待创建的仓库 Label，也没有受管普通 Issue 标签清理项。</p>
    </section>}

    {snapshot?.state === 'snapshot_incomplete' &&
      <p className={styles.error}>GitHub Labels 或 Issues 分页未完整读取。本次不生成同步计划，也不允许写入。</p>}
    {result && <section className={styles.panel} aria-live="polite">
      <h2>最近一次操作</h2>
      <p>{stateText[result.state] || result.state}</p>
      {result.prUrl && <a href={result.prUrl} target="_blank" rel="noopener noreferrer">查看维护 PR</a>}
      {result.branchUrl && <a href={result.branchUrl} target="_blank" rel="noopener noreferrer">查看维护分支</a>}
      {result.commitSha && <p>Commit：<code>{shaText(result.commitSha)}</code></p>}
      {result.error && <p className={styles.error}>{result.error}</p>}
      {result.createdLabels && result.createdLabels.length > 0 &&
        <p>已创建 Label：{result.createdLabels.join('、')}</p>}
      {Array.isArray(result.removedAssociations) &&
        <p>已清理标签关联：{result.removedAssociations.length}</p>}
      {result.failed && result.failed.length > 0 &&
        <ul>{result.failed.map((item, index) => <li key={index}>{item.kind}：{item.error}
          {item.retryAfter ? ' · Retry-After ' + item.retryAfter : ''}</li>)}</ul>}
    </section>}
  </section>
}
