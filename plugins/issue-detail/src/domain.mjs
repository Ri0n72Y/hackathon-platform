/** @summary Parse the explicitly declared channel namespace without an extra YAML dependency. */
export function parseIssueLabels(config) {
  if (typeof config !== 'string' || config.length > 250000 || /\t/.test(config)) {
    throw new Error('Invalid repository configuration')
  }
  const lines = config.replace(/\r\n/g, '\n').split('\n'), headers = []
  let namespaces = false
  for (let index = 0; index < lines.length; index++) {
    const source = lines[index].replace(/\s+#.*$/, '')
    const indent = source.match(/^ */)[0].length, value = source.trim()
    if (indent === 0 && /^namespaces:\s*$/.test(value)) namespaces = true
    else if (indent === 0 && value && !value.startsWith('#')) namespaces = false
    if ((indent === 0 || (indent === 2 && namespaces)) && /^channel:\s*(.*)$/.test(value)) {
      headers.push({ index, indent, inline: value.slice(value.indexOf(':') + 1).trim() })
    }
  }
  if (headers.length > 1) throw new Error('Ambiguous channel configuration')
  if (!headers.length) return []
  const { index, indent, inline } = headers[0], values = []
  function add(raw) {
    let value = raw.trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value) } catch { throw new Error('Invalid channel label') }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/''/g, "'")
    }
    if (value.startsWith('channel:')) value = value.slice(8)
    if (!/^[a-z\d][a-z\d._-]{0,99}$/i.test(value)) throw new Error('Invalid channel label')
    values.push('channel:' + value.toLowerCase())
  }
  if (inline === '[]') return []
  if (inline) {
    if (!/^\[.*\]$/.test(inline)) throw new Error('Unsupported channel configuration')
    const inside = inline.slice(1, -1).trim()
    if (inside) inside.split(',').forEach(add)
  } else {
    for (let at = index + 1; at < lines.length; at++) {
      const line = lines[at].replace(/\s+#.*$/, '')
      if (!line.trim() || line.trim().startsWith('#')) continue
      const depth = line.match(/^ */)[0].length
      if (depth <= indent) break
      if (depth !== indent + 2) continue
      const value = line.trim()
      if (value.startsWith('- ')) {
        const entry = value.slice(2).trim()
        const named = /^(?:name|label|value):\s*(.+)$/.exec(entry)
        add(named ? named[1] : entry)
      } else {
        const key = /^([a-z\d._-]+):(?:\s*.*)?$/i.exec(value)
        if (!key) throw new Error('Unsupported channel configuration')
        add(key[1])
      }
    }
  }
  return [...new Set(values)]
}

/** @summary Accept Open and Closed Issues with exactly one configured channel label; reject PRs. */
export function validIssueForPage(issue, allowedLabels) {
  if (!issue || !Number.isSafeInteger(issue.number) || issue.number <= 0 ||
      issue.pull_request || !['open', 'closed'].includes(issue.state)) return false
  const assigned = (Array.isArray(issue.labels) ? issue.labels : [])
    .map(item => typeof item === 'string' ? item : item?.name)
    .filter(item => typeof item === 'string' && item.toLowerCase().startsWith('channel:'))
  return assigned.length === 1 && allowedLabels.includes(assigned[0].toLowerCase())
}

export function validIssueTarget(owner, repo, number) {
  return typeof owner === 'string' && /^[a-z\d-]{1,39}$/i.test(owner) &&
    !owner.startsWith('-') && !owner.endsWith('-') &&
    typeof repo === 'string' && /^[a-z\d._-]{1,100}$/i.test(repo) &&
    repo !== '.' && repo !== '..' &&
    typeof number === 'string' && /^[1-9]\d*$/.test(number) &&
    Number.isSafeInteger(Number(number))
}

function scalar(value) {
  const source = value.trim()
  if (source.startsWith('"') && source.endsWith('"')) {
    try { return JSON.parse(source) } catch { return null }
  }
  if (source.startsWith("'") && source.endsWith("'")) return source.slice(1, -1).replace(/''/g, "'")
  if (!source || source === '[]' || source === '{}' || source === '~') return null
  return source
}
const SHA = /^[a-f\d]{40}$/i
const RFC3339 = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/

/** @summary Parse one complete fenced YAML labour block according to MVP §9.4. */
export function parseLabourComment(body) {
  if (typeof body !== 'string') return null
  const match = /^```(?:yaml|yml)\s*\n([\s\S]*?)\n```\s*$/i.exec(body.trim())
  if (!match) return null
  const lines = match[1].replace(/\r\n/g, '\n').split('\n')
  if (!lines.length || lines[0] !== 'labour:') return null
  const result = {}, allowed = new Set(['work', 'commits', 'outcome', 'hr', 'start-end'])
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const header = /^  ([a-z-]+):(?:\s*(.*))?$/.exec(lines[i])
    if (!header || !allowed.has(header[1]) || Object.hasOwn(result, header[1])) return null
    const key = header[1], value = (header[2] || '').trim()
    if (value === '|') {
      if (!['work', 'outcome'].includes(key)) return null
      const chunks = []
      while (i + 1 < lines.length &&
        (!lines[i + 1].trim() || lines[i + 1].startsWith('    '))) {
        i++
        chunks.push(lines[i].trim() ? lines[i].slice(4) : '')
      }
      result[key] = chunks.join('\n').trimEnd()
    } else if (key === 'commits' && !value) {
      const items = []
      while (i + 1 < lines.length && /^    - /.test(lines[i + 1])) {
        i++
        const item = scalar(lines[i].slice(6))
        if (typeof item !== 'string' || !SHA.test(item)) return null
        items.push(item.toLowerCase())
      }
      if (!items.length || new Set(items).size !== items.length) return null
      result.commits = items
    } else if (key === 'start-end' && !value) {
      const times = {}
      while (i + 1 < lines.length && /^    (start|end): /.test(lines[i + 1])) {
        i++
        const p = /^    (start|end): (.+)$/.exec(lines[i])
        if (Object.hasOwn(times, p[1])) return null
        times[p[1]] = scalar(p[2])
      }
      if (typeof times.start !== 'string' || typeof times.end !== 'string' ||
        ![times.start, times.end].every(t => RFC3339.test(t) && Number.isFinite(Date.parse(t))) ||
        Date.parse(times.end) < Date.parse(times.start)) return null
      result['start-end'] = times
    } else if (['work', 'outcome', 'hr'].includes(key)) {
      result[key] = scalar(value)
    } else return null
  }
  if (typeof result.work !== 'string' || !result.work.trim() ||
      typeof result.hr !== 'string') return null
  const hrs = /^~(\d+(?:\.\d+)?)(?:h)?$/.exec(result.hr)
  if (!hrs) return null
  const hours = Number(hrs[1])
  if (!Number.isSafeInteger(hours * 2) || hours <= 0) return null
  return { work: result.work, hours, outcome: result.outcome || null,
    commits: result.commits || [], startEnd: result['start-end'] || null }
}

/** @summary Separate discussion and labour records; flag cross-record SHA conflicts. */
export function summarizeIssueComments(comments, complete) {
  const records = [], discussion = [], invalidCandidates = [], seenIds = new Set()
  for (const comment of comments) {
    if (!comment || !Number.isSafeInteger(comment.id) || seenIds.has(comment.id)) continue
    seenIds.add(comment.id)
    const parsed = parseLabourComment(comment.body)
    if (parsed) records.push({ ...parsed, comment, conflicted: false })
    else {
      discussion.push(comment)
      if (typeof comment.body === 'string' &&
          /```(?:yaml|yml)\s*\nlabour:/i.test(comment.body)) invalidCandidates.push(comment.id)
    }
  }
  const owners = new Map()
  for (const record of records) for (const sha of record.commits) {
    const others = owners.get(sha) || []
    others.push(record)
    owners.set(sha, others)
  }
  const conflicts = [...owners].filter(([, owners]) => owners.length > 1).map(([sha]) => sha)
  for (const sha of conflicts) for (const record of owners.get(sha)) record.conflicted = true
  const hours = records.filter(record => !record.conflicted)
    .reduce((sum, record) => sum + record.hours, 0)
  return { records, discussion, invalidCandidates, conflicts, hours,
    complete: Boolean(complete) && !invalidCandidates.length && !conflicts.length }
}

/** @summary Format a labour registration as a standards-conforming Issue comment. */
export function formatLabourComment({ work, hr, outcome = '', commits = [], start = '', end = '' }) {
  if (typeof work !== 'string' || !work.trim() || typeof hr !== 'number' ||
      hr <= 0 || !Number.isSafeInteger(hr * 2) ||
      typeof outcome !== 'string' || !Array.isArray(commits) ||
      commits.some(sha => typeof sha !== 'string' || !SHA.test(sha)) ||
      new Set(commits.map(sha => sha.toLowerCase())).size !== commits.length ||
      ((start || end) && (!start || !end || !RFC3339.test(start) || !RFC3339.test(end) ||
        !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) ||
        Date.parse(end) < Date.parse(start)))) throw new Error('Invalid labour record')
  const block = value => value.trim().split(/\r?\n/).map(line => '    ' + line).join('\n')
  const lines = ['```yaml', 'labour:', '  work: |', block(work)]
  if (commits.length) lines.push('  commits:', ...commits.map(sha => '    - ' + sha.toLowerCase()))
  if (outcome.trim()) lines.push('  outcome: |', block(outcome))
  lines.push('  hr: ~' + hr + 'h')
  if (start && end) lines.push('  start-end:', '    start: "' + start + '"',
    '    end: "' + end + '"')
  return lines.join('\n') + '\n```'
}
