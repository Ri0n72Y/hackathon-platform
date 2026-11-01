const API = 'https://api.github.com'

export function validRepo(owner, repo) {
  return /^[a-z\d-]{1,39}$/i.test(owner || '') && /^[a-z\d._-]{1,100}$/i.test(repo || '')
}

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function github(path) {
  const response = await fetch(API + path, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LabourChain-TopicPage' },
    signal: AbortSignal.timeout(10000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.message || 'GitHub API ' + response.status)
    error.status = response.status
    throw error
  }
  return body
}

export function repoPath(owner, repo, suffix = '') {
  return '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + suffix
}

export function parseYaml(source) {
  const result = {}
  for (const line of String(source || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/)
    if (!match || match[1].startsWith('#')) continue
    let value = match[2].replace(/^['"]|['"]$/g, '')
    if (value === 'true') value = true
    if (value === 'false') value = false
    result[match[1]] = value
  }
  return result
}

export async function content(owner, repo, path) {
  const data = await github(repoPath(owner, repo, '/contents/' + path))
  if (Array.isArray(data) || typeof data.content !== 'string') throw new Error('文件内容格式异常：' + path)
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
}

export function errorResponse(error, stage) {
  const status = Number(error?.status)
  const code = status === 403 ? 429 : status === 404 ? 404 : 502
  return json({ error: error?.message || 'GitHub 请求失败', stage, status: status || null, retryable: code !== 404 }, code)
}
