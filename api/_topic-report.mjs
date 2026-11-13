import { createHash } from 'node:crypto'
import { oauthConfig, readSession, oauthHeaders, seal, unseal } from './_oauth.mjs'
import { validTopicRepository } from '../plugins/topic-page/src/domain.mjs'
import { resolveInstalledRepository, ProbeError } from './_installation-probe.mjs'

const GH = 'https://api.github.com'
const MAX_BYTES = 128 * 1024
const REPORT_TTL_MS = 10 * 60 * 1000
const SECRET_CONTENT = /(?:\bauthorization\s*:|\bcookie\s*:|\bBearer\s+\S+|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}|__Host-lc-(?:oauth|session)|GITHUB_(?:APP_PRIVATE_KEY|APP_CLIENT_SECRET|OAUTH_COOKIE_KEY))/i

function reply(body, status = 200) {
  return Response.json(body, { status, headers: oauthHeaders() })
}
function targetPath(owner, repo) {
  return '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
}
function loginFingerprint(token) {
  return createHash('sha256').update('topic-report:user:' + token).digest('hex')
}
function validationError(message, status = 400) {
  return reply({ error: message, state: 'rejected' }, status)
}
function githubFailure(response, stage) {
  const code = response.status
  const limited = code === 429 || code === 403 && (
    response.headers.get('x-ratelimit-remaining') === '0' ||
    response.headers.has('retry-after'))
  const retryAfter = response.headers.get('retry-after')
  const errors = {
    401: 'GitHub 用户授权已过期，请重新登录',
    403: stage === 'installation' ?
      '无法确认当前用户与 GitHub App 的共同仓库授权；请检查 App 安装和用户权限' :
      '当前用户缺少此仓库的 Issues 写权限；请检查仓库协作者权限和 OAuth 授权',
    404: '公开仓库不存在或当前用户不可访问',
    410: '此仓库未启用 GitHub Issues',
    422: 'GitHub 拒绝报告内容，请检查标题与正文',
  }
  const message = limited ? 'GitHub 请求受限流控制，请稍后重试' :
    errors[code] || 'GitHub ' + stage + ' HTTP ' + code
  return reply({ state: 'rejected', stage, error: message,
    outcomeUnknown: stage === 'create_issue' && code >= 500,
    ...(retryAfter && /^\d{1,6}$/.test(retryAfter) ? { retryAfter } : {}),
  }, limited ? 429 : [401, 403, 404, 410, 422].includes(code) ? code : 502)
}
async function userGithub(fetcher, path, token, init = {}) {
  return fetcher(GH + path, {
    ...init, redirect: 'manual',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LabourChain-TopicReport',
      Authorization: 'Bearer ' + token,
      ...init.headers,
    },
    signal: AbortSignal.timeout(10000),
  })
}
/** @summary Verify the exact public target is accessible to this App and this OAuth user. */
async function allowedInstallation({ fetcher, token, owner, repo, installationResolver }) {
  let installation
  try {
    // The resolver uses the current App JWT solely to verify installation access.
    // It never produces a token suitable for a report write.
    installation = await installationResolver({ owner, repo, fetcher })
  } catch (error) {
    if (error instanceof ProbeError && [403, 404].includes(error.status)) {
      return { error: reply({ state: 'rejected', stage: 'installation',
        error: '此公开仓库不在当前 GitHub App 授权范围内；请在 GitHub 手动提交 Issue' }, 403) }
    }
    return { error: reply({ state: 'rejected', stage: 'installation',
      error: error instanceof ProbeError && error.status === 429 ?
        'GitHub App 安装权限核查遇到限流，请稍后重试' :
        'GitHub App 安装权限核查暂不可用，无法安全创建 Issue' },
      error instanceof ProbeError && error.status === 429 ? 429 : 502) }
  }
  if (!Number.isSafeInteger(installation?.installationId) ||
      installation.installationId <= 0 ||
      !Number.isSafeInteger(installation?.repositoryId) ||
      installation.repositoryId <= 0) {
    return { error: validationError('GitHub App 安装授权证明无效', 502) }
  }
  const expected = (owner + '/' + repo).toLowerCase()
  const id = installation.installationId
  // GitHub App user tokens are scoped to the intersection of App installation
  // access and user access. Check the actual user-visible installation list.
  for (let page = 1; page <= 10; page++) {
    let response
    try {
      response = await userGithub(fetcher, '/user/installations/' + id +
        '/repositories?per_page=100&page=' + page, token)
    } catch {
      return { error: reply({ state: 'rejected', stage: 'installation',
        error: 'GitHub 用户与 App 权限交集核查失败，请稍后重试' }, 502) }
    }
    if (response.status === 404) {
      return { error: reply({ state: 'rejected', stage: 'installation',
        error: '当前用户无权通过此 App 访问目标仓库；可在 GitHub 手动提交' }, 403) }
    }
    if (!response.ok) return { error: githubFailure(response, 'installation') }
    let data
    try { data = await response.json() } catch {
      return { error: validationError('GitHub 安装仓库列表响应不可解析', 502) }
    }
    if (!Number.isSafeInteger(data?.total_count) || data.total_count < 0 ||
        !Array.isArray(data.repositories) || data.repositories.length > 100) {
      return { error: validationError('GitHub 安装仓库列表响应不完整', 502) }
    }
    if (data.repositories.some(item =>
      item?.id === installation.repositoryId &&
      item?.private === false &&
      item?.full_name?.toLowerCase() === expected)) return { authorized: true }
    if (data.repositories.length < 100 && page * 100 >= data.total_count) {
      return { error: reply({ state: 'rejected', stage: 'installation',
        error: '目标仓库不在当前用户可访问的 App 安装仓库列表中；请在 GitHub 手动提交' }, 403) }
    }
  }
  return { error: validationError('GitHub 安装仓库列表超出安全核验上限', 502) }
}

async function allowedRepository({ fetcher, token, owner, repo }) {
  let response
  try { response = await userGithub(fetcher, targetPath(owner, repo), token) }
  catch { return { error: reply({ state: 'rejected', stage: 'permission',
    error: 'GitHub 仓库权限检查未能完成，请稍后再试' }, 502) } }
  if (!response.ok) return { error: githubFailure(response, 'permission') }
  let data
  try { data = await response.json() } catch {
    return { error: validationError('GitHub 仓库权限响应无效', 502) }
  }
  if (data?.private !== false || typeof data.full_name !== 'string' ||
      data.full_name.toLowerCase() !== (owner + '/' + repo).toLowerCase()) {
    return { error: validationError('仅允许当前页面匹配的公开 GitHub 仓库', 403) }
  }
  if (data.has_issues !== true) {
    return { error: validationError('目标仓库没有启用 Issues', 410) }
  }
  const p = data.permissions
  if (!p || ![p.triage, p.push, p.maintain, p.admin].some(x => x === true)) {
    return { error: validationError(
      '无法确认当前 GitHub 用户拥有目标仓库的 Issues 创建权限；请检查用户和 OAuth 授权',
      403) }
  }
  return { repository: data }
}
function validIssueCreated(data, owner, repo) {
  if (!Number.isSafeInteger(data?.number) || data.number < 1 ||
      typeof data.html_url !== 'string') return null
  try {
    const value = new URL(data.html_url)
    if (value.protocol !== 'https:' || value.hostname !== 'github.com' ||
        value.username || value.password || value.search || value.hash ||
        value.pathname.toLowerCase() !== ('/' + owner + '/' + repo +
          '/issues/' + data.number).toLowerCase()) return null
    return value.href
  } catch { return null }
}

/** @summary Let one GitHub OAuth user explicitly confirm a Topic error Issue without an App/Bot write fallback. */
export function createTopicReportEndpoint({
  fetcher = fetch, configReader = oauthConfig, sessionReader = readSession,
  clock = Date.now, installationResolver = resolveInstalledRepository,
} = {}) {
  return {
    async fetch(request) {
      if (!['GET', 'POST'].includes(request.method)) return validationError('Method not allowed', 405)
      let config
      try { config = configReader() } catch {
        return validationError('GitHub 登录尚未配置', 503)
      }
      if (new URL(request.url).origin !== config.origin ||
          request.headers.get('sec-fetch-site') === 'cross-site') {
        return validationError('来源校验失败', 403)
      }
      if (request.method === 'POST') {
        if (request.headers.get('origin') !== config.origin ||
            request.headers.get('x-labourchain-write') !== '1') {
          return validationError('写入需要同源请求和明确确认标记', 403)
        }
        if (!/^application\/json(?:\s*;|$)/i.test(
          request.headers.get('content-type') || '')) {
          return validationError('Only application/json is accepted', 415)
        }
        const length = Number(request.headers.get('content-length') || 0)
        if (!Number.isFinite(length) || length < 0 || length > MAX_BYTES) {
          return validationError('请求内容过长', 413)
        }
      }
      let session
      try { session = sessionReader(request) } catch {
        return validationError('GitHub 登录不可用', 503)
      }
      if (!session || typeof session.token !== 'string' || !session.token) {
        return reply({ state: 'rejected', error: '请先登录 GitHub', relogin: true }, 401)
      }

      let target
      if (request.method === 'GET') {
        const params = new URL(request.url).searchParams
        target = { owner: params.get('owner'), repo: params.get('repo') }
      } else {
        let raw, data
        try {
          raw = await request.text()
          if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return validationError('请求内容过长', 413)
          data = JSON.parse(raw)
        } catch { return validationError('请求必须是合法 JSON', 400) }
        if (!data || typeof data !== 'object' || Array.isArray(data) ||
            Object.keys(data).some(k =>
              !['owner', 'repo', 'title', 'body', 'confirmed', 'proof'].includes(k))) {
          return validationError('报告字段无效', 400)
        }
        target = data
        if (data.confirmed !== true || typeof data.title !== 'string' ||
            !data.title.trim() || data.title.length > 256 || /[\r\n]/.test(data.title) ||
            typeof data.body !== 'string' || !data.body.trim() ||
            data.body.length > 20000 || typeof data.proof !== 'string') {
          return validationError('请先确认报告，并提供有效标题、正文与目标凭证', 400)
        }
        if (SECRET_CONTENT.test(data.title) || SECRET_CONTENT.test(data.body)) {
          return validationError('报告包含疑似 Token、Cookie 或服务器机密字段，请移除后再提交', 422)
        }
        if (data.proof.length > 2000) return validationError('目标凭证无效', 403)
      }
      const { owner, repo } = target
      if (!validTopicRepository(owner, repo)) return validationError('仓库参数无效', 400)
      if (request.method === 'POST') {
        const source = request.headers.get('referer')
        if (source) {
          let referer
          try { referer = new URL(source) } catch {
            return validationError('报告页面来源无效', 403)
          }
          if (referer.origin !== config.origin ||
              referer.pathname.replace(/\/$/, '').toLowerCase() !==
                ('/topic/' + owner + '/' + repo).toLowerCase()) {
            return validationError('报告目标与当前 Topic 页面不一致', 403)
          }
        }
        const proof = unseal(target.proof, 'topic-report-target', config.key)
        if (!proof || proof.exp <= clock() ||
            proof.target !== (owner + '/' + repo).toLowerCase() ||
            proof.actor !== loginFingerprint(session.token)) {
          return validationError('报告目标确认已过期或不匹配，请重新打开报告弹窗', 403)
        }
      }

      const installed = await allowedInstallation({
        fetcher, token: session.token, owner, repo, installationResolver,
      })
      if (installed.error) return installed.error
      const access = await allowedRepository({ fetcher, token: session.token, owner, repo })
      if (access.error) return access.error
      if (request.method === 'GET') {
        const proof = seal({
          target: (owner + '/' + repo).toLowerCase(),
          actor: loginFingerprint(session.token), exp: clock() + REPORT_TTL_MS,
        }, 'topic-report-target', config.key)
        return reply({ state: 'ready', proof, target: owner + '/' + repo })
      }

      let response
      try {
        response = await userGithub(fetcher, targetPath(owner, repo) + '/issues',
          session.token, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: target.title.trim(), body: target.body }),
          })
      } catch {
        return reply({ state: 'unknown', stage: 'create_issue', outcomeUnknown: true,
          error: '提交结果未知：请先到 GitHub 检查是否已创建 Issue，核实后再决定是否重试' },
        502)
      }
      if (response.status !== 201) return githubFailure(response, 'create_issue')
      let issue
      try { issue = await response.json() } catch {
        return reply({ state: 'unknown', stage: 'create_issue', outcomeUnknown: true,
          error: 'GitHub 可能已创建 Issue，但响应不可解析；请先到 GitHub 核查' }, 502)
      }
      const url = validIssueCreated(issue, owner, repo)
      if (!url) return reply({ state: 'unknown', stage: 'create_issue',
        outcomeUnknown: true, error: 'GitHub 已返回创建响应，但 Issue 地址无法确认；请到 GitHub 核查' },
      502)
      return reply({ state: 'created', issue: { number: issue.number, html_url: url } }, 201)
    },
  }
}
export default createTopicReportEndpoint()
