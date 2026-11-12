import test from 'node:test'
import assert from 'node:assert/strict'
import { createRepoChannelsHandler } from '../api/_repo-channels.mjs'
import { IssueAccessError } from '../api/_issue-access.mjs'
import { selectChannelIssues, channelTargetKey } from '../plugins/channel/src/domain.mjs'
import { parseConfigNamespaces } from '../plugins/repo-config/src/domain.mjs'
import { validIssueForPage, summarizeIssueComments } from '../plugins/issue-detail/src/domain.mjs'
import { loadIssueContent } from '../plugins/issue-detail/src/load-issue.mjs'

const HEAD = 'a'.repeat(40)
const CONFIG_SHA = 'b'.repeat(40)
const ROOT = '/repos/octocat/demo'
const CONFIG = 'namespaces:\n  channel: [discussion, wishlist]\n  status: [todo]\n'
const cfgFile = source => ({
  type: 'file', encoding: 'base64',
  size: Buffer.byteLength(source), sha: CONFIG_SHA,
  content: Buffer.from(source).toString('base64'),
})
const item = (number, channels, opts = {}) => ({
  id: number + 1000,
  number,
  title: 'Issue #' + number,
  state: opts.state || 'open',
  labels: channels.map(name => ({ name })),
  html_url: 'https://github.com/octocat/demo/issues/' + number,
  user: { login: 'author' },
  comments: 2,
  created_at: opts.createdAt || '2026-11-01T00:00:00Z',
  ...(opts.pr ? { pull_request: { url: 'https://api.github.com/...' } } : {}),
})

function mockSource(options = {}) {
  const calls = []
  const pages = options.pages || [[item(1, ['channel:discussion'])]]
  const read = async (_access, path, missing = false) => {
    calls.push(path)
    const url = new URL('https://api.github.com' + path)
    if (url.pathname === ROOT + '/branches/main') {
      if (options.noMain) throw new IssueAccessError('main missing', 404)
      return { data: { name: 'main', commit: { sha: HEAD } } }
    }
    if (url.pathname === ROOT + '/contents/labourchain.config.yaml') {
      assert.equal(url.searchParams.get('ref'), 'main')
      return options.config === null ? null : {
        data: cfgFile(options.config ?? CONFIG),
      }
    }
    if (url.pathname === ROOT + '/issues') {
      assert.equal(url.searchParams.get('state'), 'open')
      assert.equal(url.searchParams.get('sort'), 'created')
      assert.equal(url.searchParams.get('direction'), 'desc')
      assert.equal(url.searchParams.get('per_page'), '100')
      const page = Number(url.searchParams.get('page'))
      if (options.failPage === page) throw new IssueAccessError('GitHub API limit', 429)
      const data = pages[page - 1] || []
      return { data, link: page < pages.length ?
        '<https://api.github.com' + ROOT + '/issues?page=' + (page + 1) + '>; rel="next"' : '' }
    }
    throw new Error('Unexpected GitHub path: ' + path)
  }
  return {
    calls, read,
    handler: createRepoChannelsHandler({
      accessFactory: async (owner, repo) => {
        assert.equal(owner, 'octocat')
        assert.equal(repo, 'demo')
        return { token: 'readonly-fixture' }
      }, read, maxPages: options.maxPages || 10,
    }),
  }
}
const request = () => new Request('https://labour.test/api/repo-channels?owner=octocat&repo=demo')

test('#28 selects newest valid Open Issue per configured channel; never selects PR or ambiguous tags', () => {
  const config = parseConfigNamespaces(CONFIG)
  assert.equal(config.state, 'ready')
  const choices = selectChannelIssues(config, [
    item(1, ['channel:discussion'], { createdAt: '2026-11-01T00:00:00Z' }),
    item(2, ['channel:discussion'], { createdAt: '2026-11-04T00:00:00Z' }),
    item(3, ['channel:discussion'], { createdAt: '2026-11-08T00:00:00Z', state: 'closed' }),
    item(4, ['channel:discussion'], { createdAt: '2026-11-09T00:00:00Z', pr: true }),
    item(5, ['channel:discussion', 'channel:unknown'], { createdAt: '2026-11-10T00:00:00Z' }),
    item(6, ['channel:unknown'], { createdAt: '2026-11-11T00:00:00Z' }),
    item(7, ['channel:wishlist'], { createdAt: '2026-11-02T00:00:00Z' }),
  ])
  assert.deepEqual(choices.map(c => [c.label, c.issue?.number]),
    [['channel:discussion', 2], ['channel:wishlist', 7]])
})

test('#28 uses creation time, not updated time or fetched order; empty channel remains visible', () => {
  const config = parseConfigNamespaces(CONFIG)
  const old = item(9, ['channel:discussion'], { createdAt: '2026-11-01T00:00:00Z' })
  old.updated_at = '2026-11-12T00:00:00Z'
  const recent = item(8, ['CHANNEL:DISCUSSION'], { createdAt: '2026-11-08T00:00:00Z' })
  const choices = selectChannelIssues(config, [recent, old])
  assert.equal(choices[0].issue.number, 8)
  assert.equal(choices[1].issue, null)
})

test('#28 duplicate Issue and ambiguous creation metadata fail closed', () => {
  const config = parseConfigNamespaces(CONFIG)
  assert.throws(() => selectChannelIssues(config,
    [item(1, ['channel:discussion']), item(1, ['channel:discussion'])]), /Duplicate/)
  assert.throws(() => selectChannelIssues(config,
    [item(1, ['channel:discussion'], { createdAt: 'invalid' })]), /metadata/)
  assert.equal(validIssueForPage(item(10, [], { state: 'closed' })), true)
  assert.equal(validIssueForPage(item(11, ['channel:discussion'], { pr: true })), false)
})

test('#28 public API reads only main Config and complete Open Issue pagination', async () => {
  const mock = mockSource({ pages: [
    [item(1, ['channel:discussion'], { createdAt: '2026-11-01T00:00:00Z' })],
    [item(2, ['channel:discussion'], { createdAt: '2026-11-02T00:00:00Z' }),
      item(3, ['channel:wishlist'])],
  ] })
  const response = await mock.handler.fetch(request())
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.state, 'ready')
  assert.equal(data.branch, 'main')
  assert.equal(data.headSha, HEAD)
  assert.equal(data.pages, 2)
  assert.equal(data.scannedIssues, 3)
  assert.deepEqual(data.channels.map(c => c.issue.number), [2, 3])
  assert.ok(mock.calls.some(p => p.endsWith('ref=main')))
})

test('#28 config missing and malformed YAML never scan GitHub Issues', async () => {
  for (const config of [null, 'namespaces:\n  channel:[]\n',
    'namespaces:\n  channel: [discussion]\n  unknown: [\n']) {
    const mock = mockSource({ config })
    const response = await mock.handler.fetch(request())
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.state, config === null ? 'config_missing' : 'invalid_config')
    assert.deepEqual(data.channels, [])
    assert.ok(!mock.calls.some(p => p.includes('/issues?')))
  }
})

test('#28 missing or empty channel Namespace has no Channel entries', async () => {
  for (const config of ['namespaces:\n  status: [todo]\n',
    'namespaces:\n  channel: []\n']) {
    const mock = mockSource({ config })
    const response = await mock.handler.fetch(request())
    const data = await response.json()
    assert.equal(data.state, 'no_channels')
    assert.deepEqual(data.channels, [])
    assert.equal(mock.calls.filter(p => p.includes('/issues?')).length, 0)
  }
})

test('#28 missing main does not fallback to repository default branch', async () => {
  const mock = mockSource({ noMain: true })
  const response = await mock.handler.fetch(request())
  assert.equal((await response.json()).state, 'sync_branch_missing')
  assert.equal(mock.calls.some(p => p.includes('/contents/')), false)
})

test('#28 pagination limit never publishes a potentially incorrect channel winner', async () => {
  const mock = mockSource({ maxPages: 1, pages: [
    [item(1, ['channel:discussion'])],
    [item(2, ['channel:discussion'], { createdAt: '2026-11-09T00:00:00Z' })],
  ] })
  const response = await mock.handler.fetch(request())
  const data = await response.json()
  assert.equal(data.state, 'snapshot_incomplete')
  assert.deepEqual(data.channels, [])
  assert.match(data.error, /分页/)
  assert.equal(mock.calls.filter(p => p.includes('/issues?')).length, 1)
})

test('#28 API preserves 429/permission failures, blocks POST and non-main branch', async () => {
  const mock = mockSource({ failPage: 1 })
  const response = await mock.handler.fetch(request())
  assert.equal(response.status, 429)
  assert.match((await response.json()).error, /GitHub API limit/)
  const method = await mock.handler.fetch(new Request(request().url, { method: 'POST' }))
  assert.equal(method.status, 405)
  const wrong = await mock.handler.fetch(new Request(request().url + '&branch=feature'))
  assert.equal(wrong.status, 400)
  assert.equal(mock.calls.some(p => p.includes('feature')), false)
})

test('#28 Channel identity isolates A/B routes without ambiguous slash keys', () => {
  assert.notEqual(channelTargetKey('octocat', 'a'), channelTargetKey('octocat', 'b'))
  assert.notEqual(channelTargetKey('a/b', 'c'), channelTargetKey('a', 'b/c'))
  assert.equal(channelTargetKey('octocat', 'a'), channelTargetKey('octocat', 'a'))
})

test('#28 Channel Labour summary uses the selected Issue only, same existing Issue parser', async () => {
  const labour = hours => '\`\`\`yaml\nlabour:\n  work: 实现频道\n  hr: ~' + hours + 'h\n\`\`\`'
  const service = {
    async getIssue(_owner, _repo, number) {
      assert.equal(number, 12)
      return item(12, ['channel:discussion'])
    },
    async getComments(_owner, _repo, number, page) {
      assert.equal(number, 12)
      assert.equal(page, 1)
      return { items: [
        { id: 1, body: labour(1.5) },
        { id: 2, body: '普通讨论' },
        { id: 3, body: labour(0.5) },
      ], hasMore: false }
    },
  }
  const loaded = await loadIssueContent(service, 'octocat', 'demo', 12, new AbortController().signal)
  const sum = summarizeIssueComments(loaded.first.items, !loaded.first.hasMore)
  assert.equal(sum.hours, 2)
  assert.equal(sum.records.length, 2)
  assert.equal(sum.discussion.length, 1)
  assert.equal(sum.complete, true)
  // Unrelated Issue comments are not passed to loadIssueContent or the summary.
  assert.equal(loaded.issue.number, 12)
})
