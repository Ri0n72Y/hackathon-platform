import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultConfigPreview, parseConfigNamespaces, planLabelChanges } from
  '../plugins/repo-config/src/domain.mjs'
import { readRepoConfigPreview } from '../api/_repo-config-preview.mjs'

const CONFIG = 'namespaces:\n  status:\n    - todo\n    - done\n  foo: []\n'
const SHA = 'a'.repeat(40)
const FILE_SHA = 'b'.repeat(40)
const issue = (number, labels, state = 'open', extra = {}) =>
  ({ number, labels: labels.map(name => ({ name })), state, ...extra })

function mockRead(options = {}) {
  const calls = []
  const branch = options.branch || 'main'
  const configText = options.configText ?? CONFIG
  const file = { type: 'file', path: 'labourchain.config.yaml', encoding: 'base64',
    sha: FILE_SHA, size: Buffer.byteLength(configText),
    content: Buffer.from(configText, 'utf8').toString('base64') }
  const labelPages = options.labelPages || [[{ name: 'status:todo' }, { name: 'foo:unused' }]]
  const issuePages = options.issuePages || [[issue(1, ['status:obsolete', 'foo:unused', 'foobar:legacy'])]]
  const accessFactory = async ({ owner, repo }) => {
    calls.push('access:' + owner + '/' + repo)
    if (options.denyAccess) throw Object.assign(Error('Not installed'), { status: 403 })
    return { token: 'repository-scoped-read-token' }
  }
  const read = async (_access, path, missing = false) => {
    calls.push(path)
    const url = new URL('https://api.github.com' + path)
    const pathname = url.pathname
    if (pathname === '/repos/octocat/demo') return {
      data: { private: options.private || false, full_name: 'octocat/demo' } }
    if (pathname === '/repos/octocat/demo/branches/' + encodeURIComponent(branch)) {
      if (options.missingBranch) throw Object.assign(Error('Branch not found'), { status: 404 })
      return { data: { name: branch, commit: { sha: SHA } } }
    }
    if (pathname === '/repos/octocat/demo/contents/labourchain.config.yaml') {
      if (options.missingConfig) {
        assert.equal(missing, true)
        return null
      }
      assert.equal(url.searchParams.get('ref'), branch)
      return { data: options.invalidFile ? { ...file, content: 'NOT-BASE64' } : file }
    }
    if (pathname === '/repos/octocat/demo/labels' ||
      pathname === '/repos/octocat/demo/issues') {
      if (options.errorStatus && pathname.endsWith('/issues')) {
        throw Object.assign(Error('Upstream failure'), { status: options.errorStatus })
      }
      const group = pathname.endsWith('/labels') ? labelPages : issuePages
      const page = Number(url.searchParams.get('page'))
      assert.equal(url.searchParams.get('per_page'), '100')
      if (pathname.endsWith('/issues')) assert.equal(url.searchParams.get('state'), 'all')
      assert.ok(page > 0 && page <= group.length)
      return { data: group[page - 1], link: page < group.length ?
        '<https://api.github.com/next>; rel="next"' : '' }
    }
    throw Error('Unexpected read path ' + path)
  }
  return { accessFactory, read, calls }
}

test('#47 Config parsing distinguishes absent, empty, managed, and default suggested values', () => {
  const missing = parseConfigNamespaces(null)
  assert.equal(missing.state, 'config_missing')
  assert.match(missing.defaultPreview, /wishlist/)
  const parsed = parseConfigNamespaces(CONFIG)
  assert.equal(parsed.state, 'ready')
  assert.deepEqual(parsed.namespaces.status, ['status:todo', 'status:done'])
  assert.deepEqual(parsed.namespaces.foo, [])
  assert.deepEqual(parseConfigNamespaces(CONFIG.replace(/\n/g, '\r\n')).namespaces, parsed.namespaces)
  assert.ok(defaultConfigPreview().includes('  status:'))
  assert.deepEqual(parseConfigNamespaces('namespaces:\n  channel: [wishlist, channel:general]\n')
    .namespaces.channel, ['channel:wishlist', 'channel:general'])
})

test('#47 malformed, ambiguous or unsupported YAML fails closed', () => {
  for (const source of [
    'namespaces:\n  foo:', 'namespaces:\n  foo: [a]\n  foo: []',
    'namespaces:\n  foo: [a, a]', 'namespaces:\n  foo: &shared [a]',
    'namespaces:\n  foo:\n    - *shared', 'namespaces:\n  foo: [a]\nother: x',
    'namespaces:\n  foo: [a]\n  foobar: [foo:bad]',
    'namespaces:\n  foo: [a\n', 'namespaces:\n  foo:\n    - a\n      bad: value',
    '---\nnamespaces:\n  foo: []', 'namespaces:\n  foo: []\n  bar:',
    'namespaces:\n  foo: [a]\n  foo: [b]', 'namespaces:\n  foo: [] #comment',
  ]) {
    assert.equal(parseConfigNamespaces(source).state, 'invalid_config', source)
  }
  assert.equal(parseConfigNamespaces('x'.repeat(300000)).state, 'invalid_config')
})

test('#47 B1: block mapping rejects missing separation after namespace colon', () => {
  for (const source of [
    'namespaces:\n  foo:[]\n',
    'namespaces:\n  foo:[bar]\n',
    'namespaces:\n  foo:[bar, baz]\n',
    'namespaces:\n  foo:[]\n  status: [todo]\n',
    'namespaces:\n  status: [todo]\n  foo:[]\n',
    'namespaces:\n  foo:\u00a0[]\n',
  ]) {
    const parsed = parseConfigNamespaces(source)
    assert.equal(parsed.state, 'invalid_config', source)
    const plan = planLabelChanges(parsed, [{ name: 'foo:obsolete' }],
      [issue(1, ['foo:obsolete'])], { complete: true })
    assert.equal(plan.hasChanges, false)
    assert.deepEqual(plan.removeIssueLabels, [])
  }
  const accepted = parseConfigNamespaces('namespaces:\n  foo: []\n')
  assert.equal(accepted.state, 'ready')
  assert.deepEqual(accepted.namespaces.foo, [])
  assert.deepEqual(planLabelChanges(accepted, [{ name: 'foo:obsolete' }],
    [issue(1, ['foo:obsolete'])], { complete: true }).removeIssueLabels,
  [{ number: 1, labels: ['foo:obsolete'] }])
  assert.deepEqual(parseConfigNamespaces('namespaces:\n  foo: [bar]\n').namespaces.foo,
    ['foo:bar'])
})

test('#47 full namespace-prefix matching never touches foobar or unmanaged tags; PRs excluded', () => {
  const parsed = parseConfigNamespaces(CONFIG)
  const labels = ['status:todo', 'foo:unused', 'foobar:legacy'].map(name => ({ name }))
  const issues = [
    issue(1, ['status:obsolete', 'foo:unused', 'foobar:legacy', 'channel:other']),
    issue(2, ['status:done', 'foo:orphan'], 'closed'),
    issue(3, ['foo:unused'], 'open', { pull_request: { url: 'https://example.test/pr' } }),
  ]
  const result = planLabelChanges(parsed, labels, issues, { complete: true })
  assert.equal(result.state, 'changes')
  assert.deepEqual(result.createLabels, [{ name: 'status:done' }])
  assert.deepEqual(result.removeIssueLabels, [
    { number: 1, labels: ['status:obsolete', 'foo:unused'] },
    { number: 2, labels: ['foo:orphan'] },
  ])
  assert.deepEqual(result.impact, { definitions: 1, issues: 2, removals: 3 })
  assert.equal(result.requiresConfirmation, true)
})

test('#47 missing namespace means no management; empty namespace schedules removal', () => {
  const bare = parseConfigNamespaces('namespaces:\n  status: [todo]\n')
  const explicit = parseConfigNamespaces('namespaces:\n  status: [todo]\n  foo: []\n')
  const issues = [issue(1, ['foo:obsolete', 'foobar:still-there'])]
  assert.deepEqual(planLabelChanges(bare, [], issues, { complete: true }).removeIssueLabels, [])
  assert.deepEqual(planLabelChanges(explicit, [], issues, { complete: true }).removeIssueLabels,
    [{ number: 1, labels: ['foo:obsolete'] }])
})

test('#47 no changes is idempotent and never schedules deleting existing Label definitions', () => {
  const ready = parseConfigNamespaces(CONFIG)
  const labels = [{ name: 'status:todo' }, { name: 'status:done' },
    { name: 'foo:unused' }, { name: 'foobar:legacy' }]
  const issues = [issue(1, ['status:todo', 'foobar:legacy'])]
  const plan = planLabelChanges(ready, labels, issues, { complete: true })
  assert.equal(plan.state, 'no_changes')
  assert.equal(plan.hasChanges, false)
  assert.deepEqual(plan.createLabels, [])
  assert.deepEqual(plan.removeIssueLabels, [])
  assert.equal('deleteDefinitions' in plan, false)
})

test('#47 incomplete pagination and invalid snapshots cannot yield a deletion plan', () => {
  const parsed = parseConfigNamespaces('namespaces:\n  foo: []\n')
  const issueOne = issue(1, ['foo:orphan'])
  const result = planLabelChanges(parsed, [{ name: 'foo:orphan' }], [issueOne])
  assert.equal(result.state, 'snapshot_incomplete')
  assert.deepEqual(result.removeIssueLabels, [])
  assert.equal(planLabelChanges(parseConfigNamespaces(null), [], [issueOne],
    { complete: true }).state, 'config_missing')
  assert.equal(planLabelChanges(parseConfigNamespaces('broken'), [], [issueOne],
    { complete: true }).state, 'invalid_config')
  assert.throws(() => planLabelChanges(parsed, [], [issueOne, issueOne],
    { complete: true }), /repeated/)
  assert.throws(() => planLabelChanges(parsed, [], [issue(1, ['bad'], 'draft')],
    { complete: true }), /Incomplete/)
})

test('#47 read-only installed-repository snapshot returns provenance and exact diff', async () => {
  const mock = mockRead()
  const result = await readRepoConfigPreview({
    owner: 'octocat', repo: 'demo', accessFactory: mock.accessFactory, read: mock.read })
  assert.equal(result.state, 'changes')
  assert.equal(result.branch, 'main')
  assert.equal(result.headSha, SHA)
  assert.equal(result.fileSha, FILE_SHA)
  assert.equal(result.canApply, false)
  assert.deepEqual(result.plan.createLabels, [{ name: 'status:done' }])
  assert.deepEqual(result.plan.removeIssueLabels,
    [{ number: 1, labels: ['status:obsolete', 'foo:unused'] }])
  assert.ok(mock.calls.includes('access:octocat/demo'))
  assert.ok(mock.calls.some(call => call.includes('contents/labourchain.config.yaml?ref=main')))
  assert.ok(!mock.calls.some(call => /\/(pulls|labels\/[^/?]+)$/.test(call)))
})

test('#47 absent Config offers default preview but cannot trigger sync', async () => {
  const mock = mockRead({ missingConfig: true })
  const result = await readRepoConfigPreview({ owner: 'octocat', repo: 'demo',
    accessFactory: mock.accessFactory, read: mock.read })
  assert.equal(result.state, 'config_missing')
  assert.match(result.config.defaultPreview, /channel:/)
  assert.equal(result.canApply, false)
  assert.equal(result.plan, null)
  assert.ok(!mock.calls.some(path => path.includes('/issues?')))
})

test('#47 corrupted file and invalid YAML never enumerate issues/labels or apply', async () => {
  for (const opts of [{ invalidFile: true }, { configText: 'namespaces:\n  foo: [' }]) {
    const mock = mockRead(opts)
    const result = await readRepoConfigPreview({ owner: 'octocat', repo: 'demo',
      accessFactory: mock.accessFactory, read: mock.read })
    assert.equal(result.state, 'invalid_config')
    assert.equal(result.plan, null)
    assert.ok(!mock.calls.some(path => path.includes('/labels?') || path.includes('/issues?')))
  }
})

test('#47 B1: malformed mapping cannot trigger Label/Issue enumeration or diff', async () => {
  for (const configText of [
    'namespaces:\n  foo:[]\n',
    'namespaces:\n  foo:[bar]\n',
    'namespaces:\n  status: [todo]\n  foo:[]\n',
  ]) {
    const mock = mockRead({
      configText,
      labelPages: [[{ name: 'foo:obsolete' }]],
      issuePages: [[issue(1, ['foo:obsolete'])]],
    })
    const preview = await readRepoConfigPreview({
      owner: 'octocat', repo: 'demo',
      accessFactory: mock.accessFactory, read: mock.read,
    })
    assert.equal(preview.state, 'invalid_config', configText)
    assert.equal(preview.config.state, 'invalid_config')
    assert.equal(preview.plan, null)
    assert.equal(preview.canApply, false)
    assert.ok(mock.calls.some(path => path.includes('/contents/labourchain.config.yaml')))
    assert.ok(!mock.calls.some(path => path.includes('/labels?') || path.includes('/issues?')))
  }
})

test('#47 absent main stops without selecting another branch; explicit branch is independent', async () => {
  const missing = mockRead({ missingBranch: true })
  const stopped = await readRepoConfigPreview({ owner: 'octocat', repo: 'demo',
    accessFactory: missing.accessFactory, read: missing.read })
  assert.equal(stopped.state, 'sync_branch_missing')
  assert.equal(stopped.canApply, false)
  assert.ok(!missing.calls.some(path => path.includes('contents/')))
  const explicit = mockRead({ branch: 'maint/config' })
  const selected = await readRepoConfigPreview({ owner: 'octocat', repo: 'demo',
    syncBranch: 'maint/config', accessFactory: explicit.accessFactory, read: explicit.read })
  assert.equal(selected.branch, 'maint/config')
  assert.ok(explicit.calls.some(path => path.includes('branches/maint%2Fconfig')))
})

test('#47 incomplete Label/Issue pages, authorization failures and GitHub errors fail closed', async () => {
  for (const option of [
    { labelPages: [[{ name: 'foo:old' }], [{ name: 'status:todo' }]] },
    { issuePages: [[issue(1, ['foo:old'])], [issue(2, ['foo:old'])]] },
  ]) {
    const mock = mockRead(option)
    const result = await readRepoConfigPreview({
      owner: 'octocat', repo: 'demo', maxPages: 1,
      accessFactory: mock.accessFactory, read: mock.read })
    assert.equal(result.state, 'snapshot_incomplete')
    assert.equal(result.canApply, false)
    assert.equal(result.plan, null)
  }
  const denied = mockRead({ denyAccess: true })
  await assert.rejects(readRepoConfigPreview({ owner: 'octocat', repo: 'demo',
    accessFactory: denied.accessFactory, read: denied.read }), error => error.status === 403)
  assert.deepEqual(denied.calls, ['access:octocat/demo'])
  const limited = mockRead({ errorStatus: 429 })
  await assert.rejects(readRepoConfigPreview({ owner: 'octocat', repo: 'demo',
    accessFactory: limited.accessFactory, read: limited.read }), error => error.status === 429)
  await assert.rejects(readRepoConfigPreview({ owner: 'bad/name', repo: 'demo',
    accessFactory: limited.accessFactory, read: limited.read }), error => error.status === 400)
})

test('#47 pagination reads all pages and excludes Pull Requests in the final diff', async () => {
  const mock = mockRead({
    labelPages: [[{ name: 'status:todo' }], [{ name: 'foo:unused' }]],
    issuePages: [[issue(1, ['foo:old'])],
      [issue(2, ['foo:ignored'], 'open', { pull_request: { url: 'https://github.com/pr' } })]],
  })
  const snapshot = await readRepoConfigPreview({
    owner: 'octocat', repo: 'demo', accessFactory: mock.accessFactory, read: mock.read })
  assert.equal(snapshot.state, 'changes')
  assert.deepEqual(snapshot.plan.removeIssueLabels, [{ number: 1, labels: ['foo:old'] }])
  assert.deepEqual(snapshot.counts, { labels: 2, issueObjects: 2 })
  assert.equal(mock.calls.filter(path => path.includes('/issues?')).length, 2)
})
