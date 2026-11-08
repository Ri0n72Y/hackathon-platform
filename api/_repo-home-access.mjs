import { issueReadAccess, IssueAccessError, issueError } from './_issue-access.mjs'
import { validRepository, isGitHubRateLimited } from './_installation-probe.mjs'
import { parseTeamFile } from '../plugins/repo-home/src/domain.mjs'
export { issueError }
export const pathFor = (owner, repo) => '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)
export function paramsFor(request, pagination = false) {
  const p = new URL(request.url).searchParams, owner = p.get('owner'), repo = p.get('repo')
  const branch = p.get('branch') || 'main'
  if (!validRepository(owner, repo) || branch.length > 180 ||
    !/^[a-z\d][a-z\d._/-]*$/i.test(branch) || branch.includes('..') ||
    branch.includes('//') || branch.endsWith('/') || branch.endsWith('.lock')) {
    throw new IssueAccessError('仓库或展示分支参数无效', 400)
  }
  const raw = p.get('page') || '1'
  if (pagination && (!/^[1-9]\d*$/.test(raw) || Number(raw) > 100000)) throw new IssueAccessError('分页参数无效', 400)
  return { owner, repo, branch, page: pagination ? Number(raw) : 1 }
}
export const accessFor = (owner, repo) => issueReadAccess({ owner, repo })
export async function repoFetch(fetcher, token, path, init = {}, missing = false) {
  let response
  try {
    response = await fetcher('https://api.github.com' + path, {
      ...init, redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LabourChain-RepoHome',
        Authorization: 'Bearer ' + token, ...init.headers },
    })
  } catch { throw new IssueAccessError('GitHub 网络请求失败', 502) }
  if (response.status === 404 && missing) return null
  if (!response.ok) {
    const limited = await isGitHubRateLimited(response)
    const status = limited ? 429 : response.status === 404 ? 404 : response.status === 401 ? 401 :
      response.status === 403 ? 403 : response.status === 409 ? 409 : response.status === 422 ? 422 : 502
    let explanation = ''
    if ([403, 409, 422].includes(status)) {
      try {
        const details = await response.clone().json()
        if (typeof details?.message === 'string') explanation = details.message.trim().slice(0, 180)
      } catch { /* Upstream may not return a JSON error body. */ }
    }
    const title = status === 422 ? 'GitHub 校验失败（422）' :
      status === 409 ? 'GitHub 写入冲突（409）' :
      status === 403 ? 'GitHub 权限或分支规则拒绝请求（403）' :
      'GitHub 仓库 API 拒绝请求（' + status + '）'
    throw new IssueAccessError(limited ? 'GitHub API 已限流' :
      title + (explanation ? '：' + explanation : ''), status)
  }
  try { return { data: await response.json(), link: response.headers.get('link') || '' } }
  catch { throw new IssueAccessError('GitHub 返回了无效 JSON', 502) }
}
export async function readRepo(access, path, missing = false) {
  return repoFetch(access.fetcher, access.token, path, {}, missing)
}
export async function readText(access, path) {
  const result = await readRepo(access, path, true)
  if (!result) return null
  const d = result.data
  if (d.type !== 'file' || d.encoding !== 'base64' || typeof d.content !== 'string' ||
    !Number.isFinite(d.size) || d.size > 1024 * 1024) throw new IssueAccessError('GitHub 文件格式或大小无效', 422)
  return { text: Buffer.from(d.content.replace(/\s/g, ''), 'base64').toString('utf8'),
    path: d.path, sha: d.sha }
}
export async function readTeam(access, base, branch) {
  try {
    const data = await readText(access, base + '/contents/team-member.json?ref=' + encodeURIComponent(branch))
    return { ...parseTeamFile(data?.text ?? null), sha: data?.sha || null }
  } catch (error) { return { state: 'error', members: [], error: error.message || '成员文件读取失败' } }
}
export function reply(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}
