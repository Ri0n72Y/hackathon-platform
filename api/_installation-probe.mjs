import { sign } from 'node:crypto'

const GH = 'https://api.github.com'
const HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'LabourChain-installation-probe',
}

export class ProbeError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

export function validRepository(owner, repo) {
  return typeof owner === 'string' && /^[a-z\d-]{1,39}$/i.test(owner) &&
    !owner.startsWith('-') && !owner.endsWith('-') &&
    typeof repo === 'string' && /^[a-z\d._-]{1,100}$/i.test(repo) &&
    repo !== '.' && repo !== '..'
}

export function appJwt(env = process.env, timestamp = Date.now()) {
  const id = env.GITHUB_APP_ID || env.GITHUB_APP_CLIENT_ID
  const pem = env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!id || !pem || !/^(?:\d+|Iv\d+\.[a-z\d]+)$/i.test(id)) {
    throw new ProbeError('GitHub App credentials are not configured', 503)
  }
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(timestamp / 1000)
  const input = encode({ alg: 'RS256', typ: 'JWT' }) + '.' +
    encode({ iss: id, iat: now - 60, exp: now + 540 })
  try {
    return input + '.' + sign('RSA-SHA256', Buffer.from(input), pem).toString('base64url')
  } catch {
    throw new ProbeError('GitHub App private key is invalid', 503)
  }
}

async function query(path, { token, fetcher }) {
  let response
  try {
    response = await fetcher(GH + path, {
      headers: { ...HEADERS, ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new ProbeError('GitHub verification is temporarily unavailable', 502)
  }
  if (response.status === 200) {
    try { return { status: 200, data: await response.json() } }
    catch { throw new ProbeError('Invalid GitHub response', 502) }
  }
  if (response.status === 404) return { status: 404 }
  if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
    throw new ProbeError('Repository path has changed; use its current GitHub URL', 409)
  }
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    throw new ProbeError('GitHub API rate limit reached', 503)
  }
  if (response.status === 429 || response.status >= 500) {
    throw new ProbeError('GitHub verification is temporarily unavailable', 503)
  }
  throw new ProbeError('GitHub verification failed', 502)
}

function managementUrl(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.origin !== 'https://github.com' || url.username || url.password ||
        url.search || url.hash ||
        !/^\/(?:settings|organizations\/[a-z\d-]{1,39}\/settings)\/installations\/\d+\/?$/i.test(url.pathname)) return null
    return url.href
  } catch { return null }
}

function installUrl(slug) {
  return typeof slug === 'string' && /^[a-z\d-]{1,100}$/i.test(slug) ?
    'https://github.com/apps/' + slug + '/installations/new' : null
}

function checkedInstallation(installation, account) {
  if (!Number.isSafeInteger(installation?.id) || installation.id <= 0 ||
      installation.account?.login?.toLowerCase() !== account.toLowerCase()) {
    throw new ProbeError('Invalid GitHub installation response')
  }
  return installation
}

/** Read-only experiment: decide which GitHub-owned installation action is needed. */
export async function inspectInstallation({ owner, repo, env = process.env, fetcher = fetch }) {
  if (!validRepository(owner, repo)) throw new ProbeError('Invalid repository', 400)
  const path = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
  // MVP only supports public repositories; never use App credentials to expose private metadata.
  const metadata = await query(path, { fetcher })
  if (metadata.status === 404) return { state: 'repository_unavailable' }
  const repository = metadata.data
  if (repository.private === true) return { state: 'repository_unavailable' }
  if (repository.private !== false || typeof repository.full_name !== 'string' ||
      repository.full_name.toLowerCase() !== (owner + '/' + repo).toLowerCase() ||
      !Number.isSafeInteger(repository.id) ||
      repository.owner?.login?.toLowerCase() !== owner.toLowerCase() ||
      !['User', 'Organization'].includes(repository.owner?.type)) {
    throw new ProbeError('Repository metadata is invalid or not public', 502)
  }
  const fullName = repository.full_name
  const account = repository.owner.login
  const prefix = { repository: fullName, account, account_type: repository.owner.type }
  const jwt = appJwt(env)
  const repoInstallation = await query(path + '/installation', { token: jwt, fetcher })
  if (repoInstallation.status === 200) {
    const installation = checkedInstallation(repoInstallation.data, account)
    if (installation.suspended_at) return { ...prefix, state: 'installation_suspended' }
    return { ...prefix, state: 'connected' }
  }

  // A repository-level 404 does not prove that the account has no installation.
  const accountPath = repository.owner.type === 'Organization' ?
    '/orgs/' + encodeURIComponent(account) + '/installation' :
    '/users/' + encodeURIComponent(account) + '/installation'
  const accountInstallation = await query(accountPath, { token: jwt, fetcher })
  if (accountInstallation.status === 200) {
    const installation = checkedInstallation(accountInstallation.data, account)
    if (installation.suspended_at) return { ...prefix, state: 'installation_suspended' }
    return {
      ...prefix, state: 'needs_repository_authorization',
      action_url: managementUrl(installation.html_url),
    }
  }
  // Prefer a configured slug. If missing, obtain it from the authenticated App API.
  let slug = env.GITHUB_APP_SLUG
  if (!installUrl(slug)) {
    const app = await query('/app', { token: jwt, fetcher })
    if (app.status !== 200) throw new ProbeError('GitHub App information unavailable')
    slug = app.data?.slug
  }
  const actionUrl = installUrl(slug)
  if (!actionUrl) throw new ProbeError('GitHub App install URL unavailable', 503)
  return { ...prefix, state: 'needs_installation', action_url: actionUrl }
}


/** @summary Resolve a public repository's current App installation without exposing its ID to callers. */
export async function resolveInstalledRepository({ owner, repo, env = process.env, fetcher = fetch }) {
  if (!validRepository(owner, repo)) throw new ProbeError('Invalid repository', 400)
  const path = '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
  const rateAwareQuery = async (target, options) => {
    try { return await query(target, options) }
    catch (error) {
      if (error instanceof ProbeError && error.message === 'GitHub API rate limit reached') {
        throw new ProbeError(error.message, 429)
      }
      throw error
    }
  }
  const metadata = await rateAwareQuery(path, { fetcher })
  if (metadata.status === 404) throw new ProbeError('Public repository not found', 404)
  const target = metadata.data
  if (target?.private !== false || !Number.isSafeInteger(target.id) ||
      target.owner?.login?.toLowerCase() !== owner.toLowerCase() ||
      target.full_name?.toLowerCase() !== (owner + '/' + repo).toLowerCase() ||
      !['User', 'Organization'].includes(target.owner?.type)) {
    if (target?.private === true) throw new ProbeError('Public repository not found', 404)
    throw new ProbeError('Invalid public repository metadata', 502)
  }
  const jwt = appJwt(env)
  const result = await rateAwareQuery(path + '/installation', { token: jwt, fetcher })
  if (result.status === 404) throw new ProbeError('Repository is not authorized for this App', 403)
  const installation = checkedInstallation(result.data, target.owner.login)
  if (installation.suspended_at) throw new ProbeError('Repository App installation is suspended', 403)
  return { installationId: installation.id, repositoryId: target.id, jwt }
}
