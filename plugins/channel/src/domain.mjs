const LABEL_PREFIX = 'channel:'

function labelText(item) {
  return typeof item === 'string' ? item : item?.name
}

/** @summary Select exactly one newest Open GitHub Issue per configured Channel label. */
export function selectChannelIssues(config, issues) {
  if (config?.state !== 'ready' || !config.namespaces ||
      !Array.isArray(config.namespaces.channel) || !Array.isArray(issues)) {
    throw new Error('Invalid Channel selection input')
  }
  const configured = config.namespaces.channel
  const selected = new Map()
  const allowed = new Set(configured)
  const seen = new Set()
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') throw new Error('Invalid GitHub Issue page')
    if (issue.pull_request != null) continue
    if (!Number.isSafeInteger(issue.number) || issue.number < 1 ||
        !['open', 'closed'].includes(issue.state) || !Array.isArray(issue.labels)) {
      throw new Error('Invalid GitHub Issue snapshot')
    }
    if (seen.has(issue.number)) throw new Error('Duplicate Issue across pagination')
    seen.add(issue.number)
    if (issue.state !== 'open') continue
    const channelTags = issue.labels.map(labelText).filter(name =>
      typeof name === 'string' && name.toLowerCase().startsWith(LABEL_PREFIX))
    // A second channel:* tag invalidates membership, even when not configured.
    if (channelTags.length !== 1) continue
    const channel = channelTags[0].toLowerCase()
    if (!allowed.has(channel)) continue
    const time = Date.parse(issue.created_at)
    if (!Number.isFinite(time) || typeof issue.title !== 'string' ||
        typeof issue.html_url !== 'string' || !Number.isSafeInteger(issue.comments) ||
        issue.comments < 0) throw new Error('Channel Issue metadata is invalid')
    const current = selected.get(channel)
    if (!current || time > current.time ||
        (time === current.time && issue.number > current.issue.number)) {
      selected.set(channel, { time, issue: {
        number: issue.number,
        title: issue.title,
        createdAt: issue.created_at,
        comments: issue.comments,
        author: typeof issue.user?.login === 'string' ? issue.user.login : null,
      } })
    }
  }
  return configured.map(label => ({
    label, name: label.slice(LABEL_PREFIX.length),
    issue: selected.get(label)?.issue || null,
  }))
}

/** @summary Encode repository route identity without slash-concatenation collisions. */
export function channelTargetKey(owner, repo) {
  return JSON.stringify([owner, repo])
}
