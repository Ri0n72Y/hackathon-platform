import { createHash } from 'node:crypto'
import { issueReadAccess, IssueAccessError } from './_issue-access.mjs'
import { paramsFor, pathFor, readRepo } from './_repo-home-access.mjs'
import { parseConfigNamespaces, planLabelChanges } from '../plugins/repo-config/src/domain.mjs'

const NEXT = /<[^>]+>;\s*rel="next"/
const SHA = /^[a-f0-9]{40}$/i

/** @summary Decode only a complete, bounded UTF-8 GitHub Contents response. */
export function decodeConfigFile(data) {
  if (data?.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' ||
    !Number.isSafeInteger(data.size) || data.size < 0 || data.size > 256 * 1024 ||
    typeof data.sha !== 'string' || !SHA.test(data.sha)) return null
  const raw = data.content.replace(/\s/g, '')
  if (!/^(?:[a-z\d+/]{4})*(?:[a-z\d+/]{2}==|[a-z\d+/]{3}=)?$/i.test(raw)) return null
  const bytes = Buffer.from(raw, 'base64')
  if (bytes.length !== data.size || bytes.toString('base64') !== raw) return null
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { return null }
}

async function readPages(access, base, query, read, maxPages) {
  const items = []
  for (let page = 1; page <= maxPages; page++) {
    const separator = query ? '&' : '?'
    const result = await read(access, base + query + separator + 'per_page=100&page=' + page)
    if (!Array.isArray(result?.data)) throw new IssueAccessError('Invalid GitHub pagination data', 502)
    items.push(...result.data)
    const hasNext = NEXT.test(result.link || '')
    if (!hasNext) return { items, complete: true }
    if (result.data.length === 0) throw new IssueAccessError('Empty GitHub page with next cursor', 502)
  }
  return { items: [], complete: false }
}

function snapshotId(headSha, fileSha, labels, issues) {
  const relevantLabels = labels.map(item => String(item?.name || '').toLowerCase()).sort()
  const relevantIssues = issues.map(issue => ({
    number: issue.number,
    state: issue.state,
    isPullRequest: issue.pull_request != null,
    labels: (Array.isArray(issue.labels) ? issue.labels : [])
      .map(item => String(item?.name || '').toLowerCase()).sort(),
  })).sort((a, b) => a.number - b.number)
  const value = JSON.stringify({ headSha, fileSha, labels: relevantLabels, issues: relevantIssues })
  return createHash('sha256').update(value).digest('hex')
}

/**
 * @summary Read public, installed repository Config and complete Label/Issue snapshots.
 * This helper is read-only; the write handler must independently re-read before every mutation.
 */
export async function readRepoConfigPreview({
  owner, repo, syncBranch = 'main', maxPages = 10,
  accessFactory = issueReadAccess, read = readRepo,
}) {
  const url = new URL('https://preview.local/')
  url.searchParams.set('owner', owner)
  url.searchParams.set('repo', repo)
  url.searchParams.set('branch', syncBranch)
  const target = paramsFor({ url: url.href })
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    throw new IssueAccessError('Invalid read-only pagination limit', 400)
  }
  const branch = target.branch
  const base = pathFor(owner, repo)
  const access = await accessFactory({ owner, repo })
  const metadata = await read(access, base)
  if (metadata?.data?.private !== false ||
    metadata.data.full_name?.toLowerCase() !== (owner + '/' + repo).toLowerCase()) {
    throw new IssueAccessError('Installed public repository metadata is invalid', 404)
  }

  let selected
  try { selected = await read(access, base + '/branches/' + encodeURIComponent(branch)) }
  catch (error) {
    if (error?.status === 404) return { state: 'sync_branch_missing', branch, canApply: false }
    throw error
  }
  if (selected?.data?.name !== branch || !SHA.test(selected.data.commit?.sha || '')) {
    throw new IssueAccessError('Invalid synchronization branch metadata', 502)
  }
  const headSha = selected.data.commit.sha
  const source = await read(access, base + '/contents/labourchain.config.yaml?ref=' +
    encodeURIComponent(branch), true)
  const fileSha = source?.data?.sha || null
  if (!source) return {
    state: 'config_missing', branch, headSha, fileSha: null, configText: null,
    canApply: false, config: parseConfigNamespaces(null), plan: null,
  }
  const configText = decodeConfigFile(source.data)
  const config = parseConfigNamespaces(configText === null ? '' : configText)
  if (config.state !== 'ready') return {
    state: 'invalid_config', branch, headSha, fileSha, configText, config,
    plan: null, canApply: false,
  }

  const labels = await readPages(access, base + '/labels', '', read, maxPages)
  if (!labels.complete) return {
    state: 'snapshot_incomplete', branch, headSha, fileSha, configText,
    config, plan: null, canApply: false,
  }
  const issues = await readPages(access, base + '/issues', '?state=all', read, maxPages)
  if (!issues.complete) return {
    state: 'snapshot_incomplete', branch, headSha, fileSha, configText,
    config, plan: null, canApply: false,
  }
  const plan = planLabelChanges(config, labels.items, issues.items, { complete: true })
  return {
    state: plan.state, branch, headSha, fileSha, configText,
    snapshotId: snapshotId(headSha, fileSha, labels.items, issues.items),
    counts: { labels: labels.items.length, issueObjects: issues.items.length },
    plan, canApply: false,
  }
}
