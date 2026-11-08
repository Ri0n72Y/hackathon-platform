/** @summary Validate a v1 member file without silently repairing manual data. */
export function parseTeamFile(text) {
  if (text === null) return { state: 'missing', members: [] }
  let data
  try { data = JSON.parse(text) } catch { return { state: 'invalid', members: [], error: '成员 JSON 格式无效' } }
  if (!data || Array.isArray(data) || data.version !== 1 || !Array.isArray(data.members)) return { state: 'invalid', members: [], error: '需要 version: 1 与 members 数组' }
  const ids = new Set(), logins = new Set()
  for (const m of data.members) {
    if (!m || typeof m !== 'object' || Array.isArray(m) ||
        typeof m.id !== 'string' || !m.id.trim() || ids.has(m.id) ||
        typeof m.name !== 'string' || !m.name.trim() || m.name.trim().length > 60 ||
        (m.role !== undefined && (typeof m.role !== 'string' || m.role.length > 40)) ||
        (m.bio !== undefined && (typeof m.bio !== 'string' || m.bio.length > 280)) ||
        (m.githubUsername !== undefined && !validLogin(m.githubUsername)) ||
        (m.avatarUrl !== undefined && !safeHttps(m.avatarUrl)) ||
        (m.links !== undefined && (!Array.isArray(m.links) || m.links.length > 3 ||
          m.links.some(l => !l || typeof l.label !== 'string' || !l.label.trim() ||
            l.label.length > 24 || !safeHttps(l.url))))) {
      return { state: 'invalid', members: [], error: '成员字段无效或 ID 重复' }
    }
    ids.add(m.id)
    if (m.githubUsername) {
      const login = m.githubUsername.toLowerCase()
      if (logins.has(login)) return { state: 'invalid', members: [], error: 'GitHub 用户名重复' }
      logins.add(login)
    }
  }
  return { state: data.members.length ? 'ready' : 'empty', members: data.members }
}
export function safeHttps(value) {
  if (typeof value !== 'string' || value.length > 2048) return false
  try { const u = new URL(value); return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password }
  catch { return false }
}
export function validLogin(value) {
  return typeof value === 'string' && value.length <= 39 &&
    /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value) && !value.includes('--')
}
/** @summary Normalize registration input and reject unsafe optional fields. */
export function validateMemberInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('资料格式无效')
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const role = typeof raw.role === 'string' ? raw.role.trim() : ''
  const bio = typeof raw.bio === 'string' ? raw.bio.trim() : ''
  const githubUsername = typeof raw.githubUsername === 'string' ? raw.githubUsername.trim() : ''
  const avatarUrl = typeof raw.avatarUrl === 'string' ? raw.avatarUrl.trim() : ''
  if (!name || name.length > 60 || role.length > 40 || bio.length > 280 ||
    (githubUsername && !validLogin(githubUsername)) || (avatarUrl && !safeHttps(avatarUrl))) throw Error('成员字段超长或格式无效')
  if (raw.links !== undefined && !Array.isArray(raw.links)) throw Error('链接格式无效')
  if ((raw.links || []).length > 3) throw Error('最多三条链接')
  const links = (raw.links || []).map(l => ({ label: typeof l?.label === 'string' ? l.label.trim() : '',
    url: typeof l?.url === 'string' ? l.url.trim() : '' })).filter(l => l.label || l.url)
  if (links.some(l => !l.label || l.label.length > 24 || !safeHttps(l.url))) throw Error('链接必须有名称及 HTTPS URL')
  return { name, ...(role ? { role } : {}), ...(bio ? { bio } : {}),
    ...(githubUsername ? { githubUsername } : {}), ...(avatarUrl ? { avatarUrl } : {}),
    ...(links.length ? { links } : {}) }
}
/** @summary Append to the latest file preserving its order, failing on duplicate login or invalid file. */
export function appendMemberFile(text, input, id) {
  const parsed = parseTeamFile(text)
  if (parsed.state === 'invalid') throw Error(parsed.error)
  if (parsed.members.some(m => m.id === id)) throw Error('成员 ID 冲突')
  if (input.githubUsername && parsed.members.some(m =>
    m.githubUsername?.toLowerCase() === input.githubUsername.toLowerCase())) throw Error('GitHub 用户名已经登记')
  return JSON.stringify({ version: 1, members: [...parsed.members, { id, ...input }] }, null, 2) + '\n'
}
/** @summary Use README prose only when the repository description is absent. */
export function summarizeReadme(markdown, repoName) {
  if (typeof markdown !== 'string') return ''
  let fenced = false, toc = false
  const parts = []
  for (const source of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    let s = source.trim()
    if (/^(?:\x60{3,}|~{3,})/.test(s)) { fenced = !fenced; continue }
    if (fenced || !s || /^<|^!\[|^\[!\[|^\|/.test(s) ||
      /^[-*]\s*\[|^\d+\.\s*\[/.test(s) || /^[-*=]{3,}$/.test(s)) continue
    const h = /^#{1,6}\s+(.+)$/.exec(s)
    if (h) {
      const title = h[1].replace(/[*_\x60]/g, '').trim()
      if (title.toLowerCase() === repoName.toLowerCase()) continue
      toc = /^(contents?|table of contents|目录|导航|索引)$/i.test(title)
      continue
    }
    if (toc || /^(?:[-*+]|\d+\.)\s/.test(s) || /^\[[^\]]+\]:/.test(s) ||
      /^https?:\/\//.test(s)) continue
    s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/(\*\*|__|~~|\x60)/g, '').replace(/[*_]/g, '')
    if (s.trim()) parts.push(s.trim())
    if (parts.join(' ').length > 450) break
  }
  return parts.join(' ').slice(0, 450)
}

/** @summary Build a token-boundary Markdown prefix so collapsed media and links remain renderable. */
export function previewMarkdown(body, budget = 280) {
  if (typeof body !== 'string' || !body) return ''
  const tokens = body.match(/(!\[[^\]\n]*\]\([^\s)\n]+\)|@\[video\]\([^\s)\n]+\)|\[[^\]\n]+\]\([^\s)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\x60[^\x60\n]+\x60|\*[^*\n]+\*|_[^_\n]+_|[^\s!@\[\]*_~\x60]+|[ \t]+|\n+|.)/g) || []
  const limit = Math.max(100, budget)
  let result = '', used = 0
  for (const token of tokens) {
    // Media height consumes preview space even when its URL is only a few characters.
    const cost = token.startsWith('![') && /^\!\[[^\]]*\]\(/.test(token) ? 115 :
      token.startsWith('@[video](') ? 75 :
      token.startsWith('\n') ? Math.max(14, token.length * 8) :
      [...token].reduce((total, char) => total + (/[\u2e80-\uffff]/.test(char) ? 2 : 1), 0)
    if (used + cost > limit) {
      // Long unbroken prose (common in Chinese) must not bypass the first-token budget.
      // Never split structured Markdown tokens: doing so can expose partial markup or URLs.
      if (/^[^\\s!@\\[\\]*_~\x60]+$/.test(token)) {
        for (const char of token) {
          const width = /[\\u2e80-\\uffff]/.test(char) ? 2 : 1
          if (used + width > limit) break
          result += char
          used += width
        }
      } else if (!result.trim() && !/^[ \\t\\n]+$/.test(token)) {
        // The leading standalone Markdown/media token is atomic and remains intact.
        result += token
      }
      break
    }
    result += token
    used += cost
  }
  const truncated = result.length < body.length
  return result.trimEnd() + (truncated ? '\n\n…' : '')
}

/** @summary Separate registration state by repository identity and selected display branch. */
export function memberRegistrationScope(owner, repo, branch) {
  return JSON.stringify([owner.toLowerCase(), repo.toLowerCase(), branch])
}
