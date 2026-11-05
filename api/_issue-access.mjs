import { ProbeError, resolveInstalledRepository, validRepository } from './_installation-probe.mjs'

const GH = 'https://api.github.com'
const HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'LabourChain-IssueDetail' }

export class IssueAccessError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

function upstreamStatus(response) {
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') return 429
  if ([400, 401, 403, 404, 409, 410, 422, 429].includes(response.status)) return response.status
  return response.status >= 500 ? 503 : 502
}

function upstreamMessage(status) {
  if (status === 429) return 'GitHub API rate limit reached'
  if (status === 403) return 'GitHub App lacks permission for this repository'
  if (status === 404) return 'Repository or Issue not found'
  if (status === 401) return 'GitHub App authorization expired'
  if (status === 503 || status === 502) return 'GitHub is temporarily unavailable'
  return 'GitHub request failed'
}

export function issueError(error) {
  const status = error instanceof ProbeError || error instanceof IssueAccessError
    ? error.status : 502
  return Response.json({ error: error instanceof ProbeError || error instanceof IssueAccessError
    ? error.message : 'Issue service temporarily unavailable' },
    { status, headers: { 'Cache-Control': 'no-store' } })
}

async function makeRequest(fetcher, url, init) {
  try {
    return await fetcher(url, { ...init, redirect: 'manual',
      signal: AbortSignal.timeout(10000) })
  } catch {
    throw new IssueAccessError('GitHub request could not be completed', 502)
  }
}

/** @summary Validate the public repository and obtain a short-lived repository-scoped read token. */
export async function issueReadAccess({ owner, repo, env = process.env, fetcher = fetch }) {
  const resolved = await resolveInstalledRepository({ owner, repo, env, fetcher })
  const response = await makeRequest(fetcher,
    GH + '/app/installations/' + resolved.installationId + '/access_tokens', {
      method: 'POST',
      headers: { ...HEADERS, Authorization: 'Bearer ' + resolved.jwt,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ repository_ids: [resolved.repositoryId],
        permissions: { issues: 'read', contents: 'read', metadata: 'read' } }),
    })
  if (response.status !== 201) {
    const status = upstreamStatus(response)
    throw new IssueAccessError(upstreamMessage(status), status)
  }
  let result
  try { result = await response.json() }
  catch { throw new IssueAccessError('Invalid GitHub App token response') }
  if (typeof result?.token !== 'string' || !result.token) {
    throw new IssueAccessError('Invalid GitHub App token response')
  }
  return { token: result.token, fetcher }
}

/** @summary Relay the unchanged GitHub resource and pagination headers through the trusted Function. */
export async function issueGitHubGet(access, path) {
  const response = await makeRequest(access.fetcher, GH + path, {
    headers: { ...HEADERS, Authorization: 'Bearer ' + access.token },
  })
  if (!response.ok) {
    const status = upstreamStatus(response)
    throw new IssueAccessError(upstreamMessage(status), status)
  }
  let data
  try { data = await response.json() }
  catch { throw new IssueAccessError('Invalid GitHub response') }
  return { data, link: response.headers.get('link') || '' }
}

export function issueQuery(request, { number = false, pagination = false } = {}) {
  const p = new URL(request.url).searchParams
  const owner = p.get('owner'), repo = p.get('repo'), n = p.get('number')
  if (!validRepository(owner, repo) || (number && (!/^[1-9]\d*$/.test(n || '') ||
      !Number.isSafeInteger(Number(n))))) {
    throw new IssueAccessError('Invalid repository or Issue number', 400)
  }
  let page = 1
  if (pagination) {
    const raw = p.get('page') || '1'
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) ||
        Number(raw) > 100000) throw new IssueAccessError('Invalid comments page', 400)
    page = Number(raw)
  }
  return { owner, repo, number: Number(n), page }
}

export function issueResponse(data, link = '') {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  if (link) headers.set('Link', link)
  return Response.json(data, { headers })
}
