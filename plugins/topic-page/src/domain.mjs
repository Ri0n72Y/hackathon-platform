const OWNER = /^[a-z\d-]{1,39}$/i
const REPO = /^[a-z\d._-]{1,100}$/i
const NAME = /^[a-z\d][a-z\d._-]{0,99}$/i
const TOPIC = /^[a-z\d][a-z\d-]{0,49}$/i

/** @summary Check a public TopicPage source name before it reaches GitHub. */
export function validTopicRepository(owner, repo) {
  return typeof owner === 'string' && OWNER.test(owner) &&
    !owner.startsWith('-') && !owner.endsWith('-') &&
    typeof repo === 'string' && REPO.test(repo) && repo !== '.' && repo !== '..'
}
function scalar(text) {
  const value = text.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    const decoded = JSON.parse(value)
    if (typeof decoded !== 'string') throw Error('Unsupported YAML scalar')
    return decoded
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  if (!value || /[:#\[\]{}]/.test(value)) throw Error('Unsupported YAML scalar')
  return value
}
/** @summary Parse only the approved scalar fields in topics.config.yaml and projects/*.yaml. */
export function parseTopicYaml(source, kind = 'config') {
  if (typeof source !== 'string' || source.length > 64 * 1024 ||
      /[\t\r](?!\n)|[\u0000-\u0008\u000b-\u001f]/.test(source)) {
    throw Error('Unsupported Topic YAML encoding')
  }
  const fields = {}
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue
    // Topic v1 uses flat scalars only; no implicit object mapping or YAML tags.
    const match = /^([a-z]+):\s+(.+?)\s*$/i.exec(raw)
    if (!match) throw Error('Unsupported Topic YAML mapping')
    const key = match[1].toLowerCase()
    if (!['topic', 'whitelist', 'repository'].includes(key) ||
        Object.hasOwn(fields, key)) throw Error('Unexpected Topic YAML field')
    if (key === 'whitelist') {
      if (!['true', 'false'].includes(match[2])) throw Error('Invalid whitelist boolean')
      fields[key] = match[2] === 'true'
    } else {
      fields[key] = scalar(match[2])
    }
  }
  if (kind === 'project') {
    if (Object.keys(fields).length !== 1 || typeof fields.repository !== 'string' ||
        !/^[a-z\d-]{1,39}\/[a-z\d._-]{1,100}$/i.test(fields.repository)) {
      throw Error('Invalid project repository declaration')
    }
    const [owner, repo] = fields.repository.split('/')
    if (!validTopicRepository(owner, repo)) throw Error('Invalid project repository')
    return { repository: owner.toLowerCase() + '/' + repo.toLowerCase() }
  }
  if (Object.keys(fields).some(k => !['topic', 'whitelist'].includes(k)) ||
      typeof fields.topic !== 'string' || !TOPIC.test(fields.topic)) {
    throw Error('topics.config.yaml requires a valid topic')
  }
  return { topic: fields.topic.toLowerCase(), whitelist: fields.whitelist !== false }
}
/** @summary Extract README description only after the first H1, preserving plain-text newlines. */
export function readmeFields(readme) {
  const lines = String(readme || '').replace(/\r\n?/g, '\n').split('\n')
  const titleAt = lines.findIndex(line => /^#\s+/.test(line))
  const title = titleAt < 0 ? 'Topic Page' : lines[titleAt].replace(/^#\s+/, '').trim()
  const meta = {}
  const description = (titleAt < 0 ? [] : lines.slice(titleAt + 1)).filter(line => {
    const match = /^\s*(email|datetime):\s*(.*?)\s*$/i.exec(line)
    if (!match) return true
    meta[match[1].toLowerCase()] = match[2].trim()
    return false
  }).join('\n').trim()
  return { title, description, email: meta.email || '', datetime: meta.datetime || '' }
}
/** @summary Distinguish accessible GitHub Search window exhaustion from true end-of-results. */
export function accumulateTopicProjects(meta, pages, minimum = 10) {
  const seen = new Set(), items = [], allowed = new Set(
    (meta.allowedRepositories || []).map(name => name.toLowerCase()))
  let ended = false, windowExhausted = false
  for (const page of pages) {
    if (!page || !Array.isArray(page.items)) throw Error('Malformed Topic Search page')
    for (const project of page.items) {
      if (!project || typeof project.full_name !== 'string' ||
          typeof project.html_url !== 'string') continue
      const name = project.full_name.toLowerCase()
      if (seen.has(name) || name === meta.repository.full_name.toLowerCase() ||
          meta.config.whitelist && !allowed.has(name)) continue
      seen.add(name)
      items.push(project)
    }
    if (!page.hasNext) {
      ended = true
      windowExhausted = Boolean(page.windowExhausted)
      break
    }
    if (items.length >= minimum) break
  }
  return { items, ended, windowExhausted }
}
export const topicTargetKey = (owner, repo) => JSON.stringify([owner, repo])
