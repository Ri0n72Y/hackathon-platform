import { randomBytes, randomUUID } from 'node:crypto'
import { readSession } from './_oauth.mjs'
import { resolveInstalledRepository, isGitHubRateLimited } from './_installation-probe.mjs'
import { writeContext } from './_issue-interaction.mjs'
import { IssueAccessError, issueReadAccess } from './_issue-access.mjs'
import { paramsFor, pathFor, reply } from './_repo-home-access.mjs'
import { readRepoConfigPreview, decodeConfigFile } from './_repo-config-preview.mjs'
import { parseConfigNamespaces } from '../plugins/repo-config/src/domain.mjs'

const GH = 'https://api.github.com'
const HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'LabourChain-RepoConfig',
}
const SHA = /^[a-f0-9]{40}$/i
const CONFIG_PATH = '/contents/labourchain.config.yaml'
const MAX_CONFIG_BYTES = 256 * 1024
const NEXT = /<[^>]+>;\s*rel="next"/

function deny(message, status = 400, state = 'error') {
  const error = new IssueAccessError(message, status)
  error.state = state
  throw error
}

/** @summary Send a bounded GitHub request and retain rate-limit and uncertain-write metadata. */
async function githubRequest(fetcher, token, path, init = {}, missing = false) {
  const method = (init.method || 'GET').toUpperCase()
  let response
  try {
    response = await fetcher(GH + path, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: { ...HEADERS, Authorization: 'Bearer ' + token, ...init.headers },
    })
  } catch {
    const error = new IssueAccessError('GitHub 网络请求中断；写入结果需要重新读取确认', 502)
    error.unknownResult = method !== 'GET'
    throw error
  }
  if (response.status === 404 && missing) return null
  if (!response.ok) {
    const limited = await isGitHubRateLimited(response)
    const status = limited ? 429 :
      [400, 401, 403, 404, 409, 410, 422].includes(response.status) ? response.status :
        response.status >= 500 ? 503 : 502
    let detail = ''
    if ([403, 409, 422].includes(status)) {
      try {
        const data = await response.clone().json()
        if (typeof data?.message === 'string') detail = data.message.trim().slice(0, 180)
      } catch { /* GitHub may return an empty error body. */ }
    }
    const message = status === 401 ? 'GitHub OAuth 授权已失效，请重新登录' :
      status === 403 ? 'GitHub 拒绝此操作，请检查用户角色和 App Installation 权限' :
        status === 404 ? 'GitHub 仓库、分支或资源不存在' :
          status === 409 ? 'GitHub 写入冲突，请重新读取后重试' :
            status === 422 ? 'GitHub 校验失败' :
              status === 429 ? 'GitHub API 已限流，请稍后重新读取' :
                'GitHub 请求失败（HTTP ' + status + ')'
    const error = new IssueAccessError(message + (detail ? '：' + detail : ''), status)
    error.retryAfter = response.headers.get('retry-after') ||
      (limited ? response.headers.get('x-ratelimit-reset') : null)
    error.unknownResult = method !== 'GET' && (status === 502 || status === 503)
    throw error
  }
  let data = null
  if (response.status !== 204) {
    try { data = await response.json() }
    catch { throw new IssueAccessError('GitHub 返回了无效 JSON', 502) }
  }
  return { data, link: response.headers.get('link') || '', headers: response.headers }
}

/** @summary Resolve the OAuth actor, target repository role and actual App Installation permissions. */
async function inspectActor({ owner, repo, token, fetcher, resolve = resolveInstalledRepository }) {
  const installed = await resolve({ owner, repo, fetcher })
  const user = (await githubRequest(fetcher, token, '/user')).data
  if (!Number.isSafeInteger(user?.id) || !/^[a-z\d-]{1,39}$/i.test(user.login || '')) {
    deny('OAuth 用户身份验证失败', 401, 'unauthenticated')
  }

  const expected = (owner + '/' + repo).toLowerCase()
  let target = null
  for (let page = 1; page <= 5; page++) {
    const result = await githubRequest(fetcher, token,
      '/user/installations/' + installed.installationId +
      '/repositories?per_page=100&page=' + page)
    if (!Array.isArray(result.data?.repositories)) {
      deny('GitHub 用户 Installation 仓库权限响应无效', 502, 'permission_check_failed')
    }
    target = result.data.repositories.find(item =>
      item.full_name?.toLowerCase() === expected && item.private === false) || null
    if (target) break
    if (result.data.repositories.length < 100) break
    if (page === 5) deny('用户 Installation 仓库列表超出验证上限', 409, 'permission_check_failed')
  }
  if (!target) {
    deny('当前 OAuth 用户没有此 Installation 仓库的访问授权', 403, 'user_permission_missing')
  }

  const app = (await githubRequest(fetcher, installed.jwt,
    '/app/installations/' + installed.installationId)).data
  if (app?.id !== installed.installationId ||
      !app.permissions || typeof app.permissions !== 'object') {
    deny('无法核实 GitHub App Installation 实际授予的权限', 502, 'permission_check_failed')
  }
  const p = target.permissions || {}
  const userPermissions = {
    pull: p.pull === true,
    triage: p.triage === true,
    push: p.push === true,
    maintain: p.maintain === true,
    admin: p.admin === true,
  }
  const canPush = userPermissions.push || userPermissions.maintain || userPermissions.admin
  const canTriage = userPermissions.triage || canPush
  return {
    ...installed,
    user: { login: user.login, id: user.id },
    userPermissions,
    canPush,
    canTriage,
    appPermissions: app.permissions,
  }
}

/** @summary Read all effective rules for a branch; incomplete results never authorize direct writes. */
async function readBranchRules({ owner, repo, branch, token, fetcher }) {
  const base = pathFor(owner, repo)
  const rules = []
  for (let page = 1; page <= 5; page++) {
    const result = await githubRequest(fetcher, token,
      base + '/rules/branches/' + encodeURIComponent(branch) +
      '?per_page=100&page=' + page)
    if (!Array.isArray(result.data) ||
        result.data.some(rule => !rule || typeof rule.type !== 'string')) {
      deny('无法完整验证目标分支的有效 Rulesets', 502, 'protection_unknown')
    }
    rules.push(...result.data)
    if (!NEXT.test(result.link)) return rules
    if (result.data.length === 0) deny('GitHub Rulesets 分页响应不完整', 502, 'protection_unknown')
  }
  deny('目标分支 Rulesets 超出核查上限', 409, 'protection_unknown')
}

/** @summary Verify main, effective branch rules and permissions required for Config Commit/PR. */
async function inspectConfigCapability({ owner, repo, token, fetcher, resolve }) {
  const actor = await inspectActor({ owner, repo, token, fetcher, resolve })
  const base = pathFor(owner, repo)
  let branch
  try {
    branch = await githubRequest(fetcher, token, base + '/branches/main')
  } catch (error) {
    if (error.status === 404) {
      return { state: 'sync_branch_missing', user: actor.user,
        userPermissions: actor.userPermissions, appPermissions: actor.appPermissions,
        canSaveConfig: false, canCreateLabels: false, canRemoveLabels: false }
    }
    throw error
  }
  if (branch.data?.name !== 'main' || !SHA.test(branch.data?.commit?.sha || '')) {
    deny('GitHub main 分支元数据无效', 502, 'protection_unknown')
  }
  let rules
  try {
    rules = await readBranchRules({ owner, repo, branch: 'main', token, fetcher })
  } catch (error) {
    if (error.status === 429 || error.status === 401) throw error
    deny('无法读取 main 的有效 Rulesets；为避免绕过保护，已停止 Config 写入',
      error.status || 502, 'protection_unknown')
  }
  const protectedBranch = branch.data.protected === true ||
    rules.some(rule => rule.type === 'pull_request')
  const app = actor.appPermissions
  const appCanContents = app.contents === 'write'
  const appCanIssues = app.issues === 'write'
  const appCanPullRequests = app.pull_requests === 'write'
  const missingAppPermissions = []
  if (!appCanContents) missingAppPermissions.push('Contents: write')
  if (protectedBranch && !appCanPullRequests) missingAppPermissions.push('Pull requests: write')
  if (!appCanIssues) missingAppPermissions.push('Issues: write')
  return {
    state: 'ready',
    user: actor.user,
    userPermissions: actor.userPermissions,
    appPermissions: app,
    protectedBranch,
    branchHead: branch.data.commit.sha,
    canSaveConfig: actor.canPush && appCanContents &&
      (!protectedBranch || appCanPullRequests),
    canCreateLabels: actor.canPush && appCanIssues,
    canRemoveLabels: actor.canTriage && appCanIssues,
    missingAppPermissions,
  }
}

async function readCurrentConfig({ owner, repo, token, fetcher, branch = 'main' }) {
  const base = pathFor(owner, repo)
  let selected
  try {
    selected = await githubRequest(fetcher, token,
      base + '/branches/' + encodeURIComponent(branch))
  } catch (error) {
    if (error.status === 404) return { state: 'sync_branch_missing', branch }
    throw error
  }
  if (selected.data?.name !== branch || !SHA.test(selected.data?.commit?.sha || '')) {
    deny('GitHub 配置同步分支元数据无效', 502, 'protection_unknown')
  }
  const headSha = selected.data.commit.sha
  const source = await githubRequest(fetcher, token,
    base + CONFIG_PATH + '?ref=' + encodeURIComponent(branch), {}, true)
  if (!source) return {
    state: 'config_missing', branch, headSha, fileSha: null, content: null,
    config: parseConfigNamespaces(null),
  }
  const content = decodeConfigFile(source.data)
  if (content === null) return {
    state: 'invalid_config', branch, headSha, fileSha: source.data?.sha || null,
    content: null, config: parseConfigNamespaces(''),
  }
  const config = parseConfigNamespaces(content)
  if (config.state !== 'ready') return {
    state: 'invalid_config', branch, headSha, fileSha: source.data.sha, content, config,
  }
  return { state: 'ready', branch, headSha, fileSha: source.data.sha, content, config }
}

function comparePreview(body, current) {
  const expectedHead = body.expectedHeadSha
  const expectedFile = body.expectedFileSha ?? null
  return SHA.test(expectedHead || '') &&
    (expectedFile === null || SHA.test(expectedFile || '')) &&
    expectedHead === current.headSha && expectedFile === current.fileSha
}

function normalizedText(value) {
  return value.replace(/\r\n/g, '\n')
}

async function putConfig({ owner, repo, token, fetcher, branch, current, content, login }) {
  const body = {
    message: 'chore(config): update LabourChain config (by @' + login + ')',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    ...(current.fileSha ? { sha: current.fileSha } : {}),
  }
  const result = await githubRequest(fetcher, token, pathFor(owner, repo) + CONFIG_PATH, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!SHA.test(result.data?.commit?.sha || '') ||
      !SHA.test(result.data?.content?.sha || '')) {
    deny('GitHub Config Commit 返回无效', 502, 'partial_failure')
  }
  return { commitSha: result.data.commit.sha, fileSha: result.data.content.sha }
}

async function findExistingPullRequest({ owner, repo, branch, token, fetcher }) {
  const query = new URLSearchParams({
    state: 'open', head: owner + ':' + branch, base: 'main', per_page: '100',
  })
  const result = await githubRequest(fetcher, token,
    pathFor(owner, repo) + '/pulls?' + query.toString())
  if (!Array.isArray(result.data)) return null
  const pr = result.data.find(item => item.base?.ref === 'main' &&
    item.head?.ref === branch &&
    item.head?.repo?.full_name?.toLowerCase() === (owner + '/' + repo).toLowerCase())
  return pr?.html_url ? { url: pr.html_url, number: pr.number } : null
}

/** @summary Commit Config as the OAuth user, using a maintenance PR whenever main is protected. */
async function saveConfig({ body, token, fetcher, resolve }) {
  if (typeof body.content !== 'string' ||
      Buffer.byteLength(body.content, 'utf8') > MAX_CONFIG_BYTES) {
    deny('Config 内容无效或超过 256 KiB', 413, 'invalid_config')
  }
  const content = normalizedText(body.content)
  const parsed = parseConfigNamespaces(content)
  if (parsed.state !== 'ready') {
    deny('Config YAML 不符合当前 v1 命名空间 Schema；未知字段不会被覆盖',
      422, 'invalid_config')
  }
  const capability = await inspectConfigCapability({
    owner: body.owner, repo: body.repo, token, fetcher, resolve,
  })
  if (capability.state === 'sync_branch_missing') {
    deny('配置同步分支 main 不存在；不会回退到其他分支', 409, 'sync_branch_missing')
  }
  if (!capability.canSaveConfig) {
    const appMissing = capability.appPermissions?.contents !== 'write' ||
      (capability.protectedBranch && capability.appPermissions?.pull_requests !== 'write')
    const message = appMissing
      ? 'GitHub App Installation 缺少 Config 写入所需权限：' +
        (capability.missingAppPermissions || []).filter(item =>
          item === 'Contents: write' || item === 'Pull requests: write').join('、')
      : '当前 OAuth 用户没有目标仓库的 Config 写入权限'
    deny(message, 403, appMissing ? 'app_permission_missing' : 'user_permission_missing')
  }

  const current = await readCurrentConfig({
    owner: body.owner, repo: body.repo, token, fetcher, branch: 'main',
  })
  if (current.state === 'sync_branch_missing') {
    deny('配置同步分支 main 不存在；不会回退到其他分支', 409, 'sync_branch_missing')
  }
  if (current.state === 'invalid_config') {
    deny('当前 Config 无法安全解析；不会覆盖未知或无效内容', 422, 'invalid_config')
  }
  if (!comparePreview(body, current)) {
    deny('main 或 Config 文件已变化，请重新读取并确认后再提交', 409, 'stale_preview')
  }
  if (current.state === 'ready' && normalizedText(current.content) === content) {
    return { state: 'ready', noChanges: true, branch: 'main', headSha: current.headSha,
      fileSha: current.fileSha, requestedBy: capability.user.login }
  }

  const base = pathFor(body.owner, body.repo)
  if (capability.protectedBranch) {
    const branch = 'labourchain/config-' + randomUUID()
    let branchRules
    try {
      branchRules = await readBranchRules({
        owner: body.owner, repo: body.repo, branch, token, fetcher,
      })
    } catch (error) {
      if (error.status === 429 || error.status === 401) throw error
      deny('无法验证维护分支的有效 Rulesets；为避免绕过保护，已停止写入',
        error.status || 502, 'protection_unknown')
    }
    if (branchRules.some(rule => rule.type === 'pull_request')) {
      deny('维护分支也受 Pull Request 规则保护，无法安全直接写入；请调整分支规则后重试',
        409, 'protection_unknown')
    }
    try {
      await githubRequest(fetcher, token, base + '/git/refs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: current.headSha }),
      })
    } catch (error) {
      try {
        const existing = await githubRequest(fetcher, token,
          base + '/git/ref/heads/' + encodeURIComponent(branch), {}, true)
        if (existing?.data?.object?.sha !== current.headSha) {
          return { state: 'partial_failure', error: error.message,
            branchUrl: 'https://github.com/' + body.owner + '/' + body.repo + '/tree/' + branch }
        }
      } catch {
        return { state: 'partial_failure', error: error.message }
      }
    }

    let saved
    try {
      saved = await putConfig({ owner: body.owner, repo: body.repo, token, fetcher,
        branch, current, content, login: capability.user.login })
    } catch (error) {
      let reconciled = null
      try {
        reconciled = await readCurrentConfig({
          owner: body.owner, repo: body.repo, token, fetcher, branch,
        })
      } catch { /* The commit result remains unknown. */ }
      if (reconciled?.state !== 'ready' ||
          normalizedText(reconciled.content) !== content) {
        return { state: 'partial_failure', error: error.message,
          branchUrl: 'https://github.com/' + body.owner + '/' + body.repo + '/tree/' + branch }
      }
      saved = { commitSha: reconciled.headSha, fileSha: reconciled.fileSha }
    }
    const written = await readCurrentConfig({
      owner: body.owner, repo: body.repo, token, fetcher, branch,
    })
    if (written.state !== 'ready' || written.fileSha !== saved.fileSha ||
        normalizedText(written.content) !== content) {
      return { state: 'partial_failure', error: '维护分支 Config 写入后复核不一致',
        branchUrl: 'https://github.com/' + body.owner + '/' + body.repo + '/tree/' + branch }
    }

    try {
      const created = await githubRequest(fetcher, token, base + '/pulls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'chore(config): maintain LabourChain config',
          body: 'Requested by @' + capability.user.login +
            '\n\nThis PR updates the repository root labourchain.config.yaml. ' +
            'Review and merge manually. Label synchronization remains a separate explicit action.',
          head: branch,
          base: 'main',
          draft: false,
        }),
      })
      if (!created.data?.html_url || !Number.isSafeInteger(created.data?.number)) {
        deny('GitHub Pull Request 响应无效', 502, 'partial_failure')
      }
      return { state: 'awaiting_pr_merge', prUrl: created.data.html_url,
        prNumber: created.data.number, branch, commitSha: saved.commitSha,
        fileSha: saved.fileSha, requestedBy: capability.user.login }
    } catch (error) {
      try {
        const existing = await findExistingPullRequest({
          owner: body.owner, repo: body.repo, branch, token, fetcher,
        })
        if (existing) return { state: 'awaiting_pr_merge', prUrl: existing.url,
          prNumber: existing.number, branch, commitSha: saved.commitSha,
          fileSha: saved.fileSha, requestedBy: capability.user.login }
      } catch { /* The PR creation result remains unknown. */ }
      return { state: 'partial_failure', error: 'Config 已提交到维护分支，但 PR 状态未确认：' +
        error.message, branchUrl: 'https://github.com/' + body.owner + '/' + body.repo +
          '/tree/' + branch, commitSha: saved.commitSha }
    }
  }

  let saved
  try {
    saved = await putConfig({ owner: body.owner, repo: body.repo, token, fetcher,
      branch: 'main', current, content, login: capability.user.login })
  } catch (error) {
    let reconciled = null
    try {
      reconciled = await readCurrentConfig({
        owner: body.owner, repo: body.repo, token, fetcher, branch: 'main',
      })
    } catch { /* The write result remains unknown. */ }
    if (reconciled?.state === 'ready' && normalizedText(reconciled.content) === content) {
      return { state: 'sync_pending', commitSha: reconciled.headSha,
        fileSha: reconciled.fileSha, requestedBy: capability.user.login, reconciled: true }
    }
    deny(error.message + '；请重新读取 main，禁止盲目重复提交', error.status || 502,
      error.status === 409 || error.status === 422 ? 'stale_preview' : 'partial_failure')
  }
  const verified = await readCurrentConfig({
    owner: body.owner, repo: body.repo, token, fetcher, branch: 'main',
  })
  if (verified.state !== 'ready' || verified.fileSha !== saved.fileSha ||
      normalizedText(verified.content) !== content) {
    return { state: 'partial_failure', error: 'Commit 已返回，但 main 当前 Config 与提交内容不一致；请重新读取',
      commitSha: saved.commitSha, fileSha: saved.fileSha }
  }
  return { state: 'sync_pending', commitSha: saved.commitSha,
    fileSha: saved.fileSha, headSha: verified.headSha, requestedBy: capability.user.login }
}

async function readSnapshot({ owner, repo, token, fetcher, accessFactory }) {
  return readRepoConfigPreview({
    owner, repo, syncBranch: 'main', maxPages: 10,
    accessFactory: accessFactory || (async () => ({ token, fetcher })),
    read: async (access, path, missing = false) =>
      githubRequest(fetcher, access.token || token, path, {}, missing),
  })
}

async function verifyMainUnchanged({ owner, repo, token, fetcher, headSha, fileSha }) {
  const current = await readCurrentConfig({ owner, repo, token, fetcher, branch: 'main' })
  return (current.state === 'ready' || current.state === 'config_missing') &&
    current.headSha === headSha && current.fileSha === fileSha
}

async function reconcileLabel({ owner, repo, token, fetcher, name }) {
  const found = await githubRequest(fetcher, token,
    pathFor(owner, repo) + '/labels/' + encodeURIComponent(name), {}, true)
  return Boolean(found?.data?.name)
}

async function reconcileIssueLabel({ owner, repo, token, fetcher, number, name }) {
  try {
    const result = await githubRequest(fetcher, token,
      pathFor(owner, repo) + '/issues/' + number)
    if (result.data?.pull_request || !Array.isArray(result.data?.labels)) return false
    return !result.data.labels.some(label =>
      typeof label?.name === 'string' && label.name.toLowerCase() === name.toLowerCase())
  } catch (error) {
    if (error.status === 404) return true
    throw error
  }
}

/** @summary Apply only a confirmed, current Label plan and reconcile uncertain writes from GitHub. */
async function syncLabels({ body, token, fetcher, resolve, accessFactory }) {
  if (typeof body.previewId !== 'string' || !/^[a-f0-9]{64}$/.test(body.previewId)) {
    deny('同步预览标识无效，请重新读取', 400, 'stale_preview')
  }
  const actor = await inspectActor({
    owner: body.owner, repo: body.repo, token, fetcher, resolve,
  })
  const preview = await readSnapshot({
    owner: body.owner, repo: body.repo, token, fetcher, accessFactory,
  })
  if (preview.state === 'sync_branch_missing') {
    deny('配置同步分支 main 不存在；不会回退到其他分支', 409, 'sync_branch_missing')
  }
  if (preview.state === 'config_missing' || preview.state === 'invalid_config' ||
      preview.state === 'snapshot_incomplete' || !preview.plan) {
    deny('当前 Config 或 GitHub 快照无法安全同步：' + preview.state, 409, preview.state)
  }
  if (preview.snapshotId !== body.previewId) {
    deny('Config、main、Labels 或 Issue 已变化，请重新读取并再次确认', 409, 'stale_preview')
  }
  const plan = preview.plan
  if (!plan.hasChanges) {
    return { state: 'ready', plan, createdLabels: [], removedAssociations: 0 }
  }
  if (actor.appPermissions.issues !== 'write') {
    deny('GitHub App Installation 缺少 Issues: write 权限', 403, 'app_permission_missing')
  }
  if (plan.createLabels.length && !actor.canPush) {
    deny('当前 OAuth 用户需要仓库 Write、Maintain 或 Admin 权限才能创建 Label 定义',
      403, 'user_permission_missing')
  }
  if (plan.removeIssueLabels.length && !actor.canTriage) {
    deny('当前 OAuth 用户需要仓库 Triage 或更高权限才能清理 Issue 标签关联',
      403, 'user_permission_missing')
  }
  if (plan.requiresConfirmation && body.confirmRemovals !== true) {
    deny('清理受管 Issue 标签前必须明确确认影响范围', 400, 'confirmation_required')
  }

  const createdLabels = []
  const removedAssociations = []
  const failed = []
  const base = pathFor(body.owner, body.repo)

  for (const label of plan.createLabels) {
    try {
      const existing = await githubRequest(fetcher, token,
        base + '/labels/' + encodeURIComponent(label.name), {}, true)
      if (existing) continue
      const color = randomBytes(3).toString('hex')
      await githubRequest(fetcher, token, base + '/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: label.name, color }),
      })
      createdLabels.push(label.name)
    } catch (error) {
      try {
        if (await reconcileLabel({ owner: body.owner, repo: body.repo,
          token, fetcher, name: label.name })) {
          createdLabels.push(label.name)
          continue
        }
      } catch { /* The create result remains unknown. */ }
      failed.push({ kind: 'create_label', name: label.name, error: error.message,
        retryAfter: error.retryAfter || null })
      return { state: 'partial_failure', createdLabels, removedAssociations,
        failed, pending: plan.removeIssueLabels }
    }
  }

  if (!(await verifyMainUnchanged({
    owner: body.owner, repo: body.repo, token, fetcher,
    headSha: preview.headSha, fileSha: preview.fileSha,
  }))) {
    return { state: 'partial_failure', createdLabels, removedAssociations,
      failed: [{ kind: 'stale_main', error: 'main 或 Config 在 Label 创建后发生变化' }],
      pending: plan.removeIssueLabels }
  }

  let processed = 0
  for (const group of plan.removeIssueLabels) {
    for (const name of group.labels) {
      try {
        let current
        try {
          current = await githubRequest(fetcher, token, base + '/issues/' + group.number)
        } catch (error) {
          if (error.status === 404) continue
          throw error
        }
        if (current.data?.pull_request || !Array.isArray(current.data?.labels)) continue
        const present = current.data.labels.some(label =>
          typeof label?.name === 'string' && label.name.toLowerCase() === name.toLowerCase())
        if (!present) continue
        await githubRequest(fetcher, token, base + '/issues/' + group.number +
          '/labels/' + encodeURIComponent(name), { method: 'DELETE' })
        removedAssociations.push({ number: group.number, label: name })
      } catch (error) {
        try {
          if (await reconcileIssueLabel({
            owner: body.owner, repo: body.repo, token, fetcher,
            number: group.number, name,
          })) {
            removedAssociations.push({ number: group.number, label: name })
            continue
          }
        } catch { /* The delete result remains unknown. */ }
        failed.push({ kind: 'remove_issue_label', number: group.number,
          label: name, error: error.message, retryAfter: error.retryAfter || null })
        return { state: 'partial_failure', createdLabels, removedAssociations,
          failed, pending: plan.removeIssueLabels.slice(plan.removeIssueLabels.indexOf(group)) }
      }
      processed++
      if (processed % 10 === 0 && !(await verifyMainUnchanged({
        owner: body.owner, repo: body.repo, token, fetcher,
        headSha: preview.headSha, fileSha: preview.fileSha,
      }))) {
        failed.push({ kind: 'stale_main', error: 'main 或 Config 在同步过程中发生变化' })
        return { state: 'partial_failure', createdLabels, removedAssociations,
          failed, pending: plan.removeIssueLabels.slice(plan.removeIssueLabels.indexOf(group)) }
      }
    }
  }

  let final
  try {
    final = await readSnapshot({
      owner: body.owner, repo: body.repo, token, fetcher, accessFactory,
    })
  } catch (error) {
    return { state: 'partial_failure', createdLabels, removedAssociations,
      failed: [{ kind: 'final_verification', error: error.message }],
      pending: null }
  }
  if (final.state === 'no_changes') {
    return { state: 'ready', createdLabels,
      removedAssociations: removedAssociations.length,
      headSha: final.headSha, fileSha: final.fileSha, plan: final.plan }
  }
  return { state: 'partial_failure', createdLabels, removedAssociations,
    failed: [{ kind: 'final_verification', error: '重新读取后仍存在待同步差异：' + final.state }],
    pending: final.plan }
}

function errorResponse(error) {
  const status = error instanceof IssueAccessError ? error.status : 502
  const state = error.state || (status === 401 ? 'unauthenticated' :
    status === 403 ? 'permission_denied' :
      status === 409 ? 'stale_preview' : 'error')
  return reply({ state, error: error.message || 'Config 服务暂时不可用',
    retryAfter: error.retryAfter || null }, status)
}

function mainTarget(request) {
  const url = new URL(request.url)
  if (url.searchParams.has('branch') && url.searchParams.get('branch') !== 'main') {
    deny('Config 同步分支固定为 main', 400, 'invalid_target')
  }
  url.searchParams.set('branch', 'main')
  return paramsFor({ url: url.href })
}

/** @summary Expose public Config preview and OAuth-only Config/Label writes through one route. */
export function createRepoConfigHandler(deps = {}) {
  const fetcher = deps.fetcher || fetch
  const resolve = deps.resolveInstalledRepository || resolveInstalledRepository
  const readSessionFn = deps.readSession || readSession
  const writeContextFn = deps.writeContext || writeContext
  const previewAccessFactory = deps.previewAccessFactory ||
    (args => issueReadAccess({ ...args, fetcher }))
  const previewRead = deps.previewRead || (async (access, path, missing = false) =>
    githubRequest(fetcher, access.token, path, {}, missing))

  async function get(request) {
    const { owner, repo } = mainTarget(request)
    const snapshot = await readRepoConfigPreview({
      owner, repo, syncBranch: 'main', maxPages: 10,
      accessFactory: previewAccessFactory, read: previewRead,
    })
    let capability = { state: 'unauthenticated', canSaveConfig: false,
      canCreateLabels: false, canRemoveLabels: false }
    let session = null
    try { session = readSessionFn(request) } catch { /* Public preview remains available. */ }
    if (session?.token) {
      try {
        capability = await inspectConfigCapability({
          owner, repo, token: session.token, fetcher, resolve,
        })
      } catch (error) {
        capability = { state: error.state || 'error', error: error.message || '权限验证失败',
          canSaveConfig: false, canCreateLabels: false, canRemoveLabels: false }
      }
    }
    const state = snapshot.state === 'changes' ? 'sync_pending' :
      snapshot.state === 'no_changes' ? 'ready' : snapshot.state
    return reply({ ...snapshot, state, capability })
  }

  async function post(request) {
    const context = await writeContextFn(request, { dynamicInstallation: true })
    if (context.error) return context.error
    const { body, token } = context
    if (body.branch != null && body.branch !== 'main') {
      deny('Config 同步分支固定为 main', 400, 'invalid_target')
    }
    if (body.action === 'save_config') {
      return reply(await saveConfig({ body, token, fetcher, resolve }))
    }
    if (body.action === 'sync_labels') {
      return reply(await syncLabels({ body, token, fetcher, resolve,
        accessFactory: deps.syncAccessFactory }))
    }
    deny('Config 操作类型无效', 400, 'invalid_action')
  }

  return {
    async fetch(request) {
      try {
        if (request.method === 'GET') return await get(request)
        if (request.method === 'POST') return await post(request)
        return reply({ state: 'error', error: 'Method not allowed' }, 405)
      } catch (error) { return errorResponse(error) }
    },
  }
}

export default createRepoConfigHandler()
