import { validTopicRepository, parseTopicYaml } from '../plugins/topic-page/src/domain.mjs'

const GH = 'https://api.github.com'
export class TopicFetchError extends Error {
  constructor(message, status = 502, stage = 'source') {
    super(message); this.status = status; this.stage = stage
  }
}
const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export { reply }
export function requireTopicTarget(request, page = false) {
  const search = new URL(request.url).searchParams
  const owner = search.get('owner'), repo = search.get('repo')
  if (!validTopicRepository(owner, repo)) throw new TopicFetchError(
    'TopicPage 路由的仓库参数无效', 400, 'route')
  if (!page) return { owner, repo }
  const raw = search.get('page') || '1'
  if (!/^[1-9]\d*$/.test(raw) || +raw > 34) throw new TopicFetchError(
    'GitHub Topic Search 仅支持 1000 条可访问结果', 400, 'topic-search')
  return { owner, repo, page: Number(raw) }
}
export function repoPath(owner, repo, suffix = '') {
  return '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + suffix
}
/** @summary Fetch public GitHub resources with bounded timeouts and explicit rate-limit errors. */
export async function github(path, { fetcher = fetch, stage = 'source' } = {}) {
  let response
  try {
    response = await fetcher(GH + path, { redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'LabourChain-TopicPage' } })
  } catch { throw new TopicFetchError('GitHub 网络请求未完成', 502, stage) }
  const limited = response.status === 429 ||
    response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0'
  if (!response.ok) throw new TopicFetchError(
    limited ? 'GitHub API 限流，请稍后重试' : 'GitHub API HTTP ' + response.status,
    limited ? 429 : [400, 401, 403, 404, 422].includes(response.status) ?
      response.status : 502, stage)
  try { return await response.json() }
  catch { throw new TopicFetchError('GitHub 返回无效 JSON', 502, stage) }
}
export function encodedContent(value, stage) {
  if (!value || Array.isArray(value) || value.type !== 'file' ||
      value.encoding !== 'base64' || typeof value.content !== 'string' ||
      !Number.isInteger(value.size) || value.size > 1024 * 1024) {
    throw new TopicFetchError('仓库文件内容格式无效', 422, stage)
  }
  return Buffer.from(value.content.replace(/\s/g, ''), 'base64').toString('utf8')
}
export async function content(owner, repo, file, args = {}) {
  const pieces = file.split('/').map(encodeURIComponent).join('/')
  return encodedContent(await github(repoPath(owner, repo, '/contents/' + pieces),
    { ...args, stage: args.stage || 'source' }), args.stage || 'source')
}
export async function topicConfig(owner, repo, args) {
  const text = await content(owner, repo, 'topics.config.yaml', { ...args, stage: 'config' })
  try { return parseTopicYaml(text) }
  catch { throw new TopicFetchError('topics.config.yaml 格式或字段无效', 422, 'config') }
}
export async function publicRepository(owner, repo, args) {
  const repository = await github(repoPath(owner, repo),
    { ...args, stage: 'repository' })
  if (repository?.private !== false || typeof repository.full_name !== 'string') {
    throw new TopicFetchError('仅支持公开 GitHub 仓库', 404, 'repository')
  }
  return repository
}
export function topicError(error) {
  return reply({
    error: error instanceof TopicFetchError ? error.message : 'TopicPage 服务不可用',
    stage: error instanceof TopicFetchError ? error.stage : 'source',
    retryable: !(error instanceof TopicFetchError && [400, 404, 422].includes(error.status)),
  }, error instanceof TopicFetchError ? error.status : 502)
}
