const MAX_CONFIG_LENGTH = 256 * 1024
const NAMESPACE = /^[a-z][a-z0-9._-]{0,49}$/i
const VALUE = /^[a-z0-9][a-z0-9._-]{0,99}$/i

/** @summary Suggest the MVP's base namespaces without writing a repository file. */
export function defaultConfigPreview() {
  return 'namespaces:\n' +
    '  status:\n    - todo\n    - doing\n    - review\n    - done\n    - archived\n' +
    '  channel:\n    - wishlist\n'
}

function scalar(source) {
  const text = source.trim()
  let value
  if (text.startsWith('"') && text.endsWith('"')) {
    try { value = JSON.parse(text) } catch { throw Error('Invalid quoted label') }
  } else if (text.startsWith("'") && text.endsWith("'")) {
    value = text.slice(1, -1).replace(/''/g, "'")
  } else {
    value = text
  }
  if (typeof value !== 'string') throw Error('Invalid scalar')
  return value
}

function labelFor(namespace, source) {
  const value = scalar(source)
  const prefix = namespace + ':'
  const suffix = value.toLowerCase().startsWith(prefix) ? value.slice(prefix.length) : value
  if (suffix.includes(':') || !VALUE.test(suffix)) throw Error('Unsupported label')
  return prefix + suffix.toLowerCase()
}

/**
 * @summary Validate a deliberately small, fail-closed YAML namespace-list subset.
 * An unknown document is never interpreted as an empty namespace or deletion permission.
 */
export function parseConfigNamespaces(text) {
  if (text === null) return { state: 'config_missing', defaultPreview: defaultConfigPreview() }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CONFIG_LENGTH ||
    /(?:\t|\r(?!\n)|[\u0000-\u0008\u000b-\u000c\u000e-\u001f])/.test(text)) {
    return { state: 'invalid_config', error: 'Configuration encoding or size is unsupported' }
  }
  try {
    const namespaces = new Map()
    let root = false, current = null, entries = null, block = false
    for (const source of text.replace(/\r\n/g, '\n').split('\n')) {
      if (!source.trim() || /^\s*#/.test(source)) continue
      // Inline comments, YAML anchors, maps, aliases and nested objects are not yet approved.
      if (source.includes('\t') || source.includes('#')) throw Error('Unsupported YAML syntax')
      const depth = (source.match(/^ */) || [''])[0].length
      const line = source.trim()
      if (depth === 0) {
        if (root || line !== 'namespaces:') throw Error('Unsupported root')
        root = true
        continue
      }
      if (!root) throw Error('Missing namespaces root')
      if (depth === 2) {
        if (block && entries.length === 0) throw Error('Null list is not an empty list')
        const index = line.indexOf(':')
        const name = line.slice(0, index).toLowerCase()
        if (index < 1 || !NAMESPACE.test(name) || namespaces.has(name)) {
          throw Error('Invalid or repeated namespace')
        }
        const tail = line.slice(index + 1).trim()
        entries = []
        namespaces.set(name, entries)
        current = name
        block = tail === ''
        if (!block) {
          if (!/^\[.*\]$/.test(tail)) throw Error('Expected label list')
          const inside = tail.slice(1, -1).trim()
          if (inside) {
            for (const item of inside.split(',')) entries.push(labelFor(name, item))
          }
        }
      } else if (depth === 4) {
        if (!current || !block || !line.startsWith('- ') || line.length <= 2) {
          throw Error('Unsupported namespace list item')
        }
        entries.push(labelFor(current, line.slice(2)))
      } else {
        throw Error('Unsupported indentation')
      }
    }
    if (!root || namespaces.size === 0 || (block && entries.length === 0)) {
      throw Error('No complete namespace list')
    }
    for (const values of namespaces.values()) {
      if (new Set(values).size !== values.length) throw Error('Duplicate namespace label')
    }
    return { state: 'ready', namespaces: Object.fromEntries(namespaces) }
  } catch {
    return { state: 'invalid_config', error: 'Unsupported or malformed YAML namespace list' }
  }
}

function labelName(label) {
  const name = typeof label === 'string' ? label : label?.name
  if (typeof name !== 'string' || !name.trim() || name.length > 100) {
    throw Error('Invalid GitHub Label snapshot')
  }
  return name
}

/**
 * @summary Build a read-only, complete-snapshot diff; never delete Label definitions or edit PRs.
 * A missing/invalid Config and incomplete pagination authorize no Label operations.
 */
export function planLabelChanges(config, labels, issues, { complete = false } = {}) {
  const noPlan = state => ({
    state, createLabels: [], removeIssueLabels: [], impact: { definitions: 0, issues: 0, removals: 0 },
    hasChanges: false, requiresConfirmation: false,
  })
  if (config?.state !== 'ready') return noPlan(config?.state === 'config_missing' ?
    'config_missing' : 'invalid_config')
  if (!complete) return noPlan('snapshot_incomplete')
  if (!Array.isArray(labels) || !Array.isArray(issues)) throw Error('Incomplete GitHub snapshot')

  const managed = Object.entries(config.namespaces || {})
  if (!managed.length || managed.some(([name, values]) =>
    !NAMESPACE.test(name) || !Array.isArray(values) ||
    values.some(value => typeof value !== 'string' || !value.startsWith(name + ':')))) {
    throw Error('Invalid normalized configuration')
  }
  const defined = new Set(labels.map(label => labelName(label).toLowerCase()))
  const valid = new Set(managed.flatMap(([, values]) => values))
  const createLabels = [...valid].filter(name => !defined.has(name))
    .sort().map(name => ({ name }))

  const removeIssueLabels = []
  const seen = new Set()
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') throw Error('Invalid Issue snapshot')
    if (issue.pull_request != null) continue
    if (!Number.isSafeInteger(issue.number) || issue.number < 1 ||
      !['open', 'closed'].includes(issue.state) || !Array.isArray(issue.labels) ||
      seen.has(issue.number)) throw Error('Incomplete or repeated Issue snapshot')
    seen.add(issue.number)
    const removals = []
    for (const item of issue.labels) {
      const label = labelName(item)
      const lower = label.toLowerCase()
      const managedNamespace = managed.find(([name]) => lower.startsWith(name + ':'))
      if (managedNamespace && !valid.has(lower) && !removals.some(x => x.toLowerCase() === lower)) {
        removals.push(label)
      }
    }
    if (removals.length) removeIssueLabels.push({ number: issue.number, labels: removals })
  }
  removeIssueLabels.sort((a, b) => a.number - b.number)
  const removals = removeIssueLabels.reduce((n, issue) => n + issue.labels.length, 0)
  return {
    state: createLabels.length || removals ? 'changes' : 'no_changes',
    createLabels, removeIssueLabels,
    impact: { definitions: createLabels.length, issues: removeIssueLabels.length, removals },
    hasChanges: Boolean(createLabels.length || removals),
    // Until policy is decided, every destructive association change needs explicit review.
    requiresConfirmation: removals > 0,
  }
}
