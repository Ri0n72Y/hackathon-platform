import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validIssueForPage, validChannelIssue, summarizeIssueComments } from '../plugins/issue-detail/src/domain.mjs'
import { loadIssueContent } from '../plugins/issue-detail/src/load-issue.mjs'

const issue = (number = 1, labels = [], state = 'open') => ({
  number, title: 'Issue ' + number, state, labels, comments: 1,
})
const labour = id => ({ id, body: '```yaml\nlabour:\n  work: issue record\n  hr: ~0.5\n```' })

function fakeApi(value, options = {}) {
  const calls = []
  const service = {
    async getIssue(owner, repo, number, signal) {
      calls.push('issue:' + owner + '/' + repo + '/' + number)
      if (signal.aborted) throw new Error('aborted')
      if (options.fail) throw options.fail
      return { ...value }
    },
    async getComments(owner, repo, number, page, signal) {
      calls.push('comments:' + owner + '/' + repo + '/' + number + '/' + page)
      if (signal.aborted) throw new Error('aborted')
      return { items: [labour(number)], hasMore: false }
    },
    async getConfig() {
      calls.push('config')
      if (options.badConfig) return 'namespaces:\n  channel: [invalid'
      throw Object.assign(new Error('Missing repository config'), { status: 422 })
    },
  }
  return { service, calls }
}

test('domain TypeScript declarations preserve separate Issue and Channel contracts', () => {
  const declarations = readFileSync(new URL('../plugins/issue-detail/src/domain.d.mts',
    import.meta.url), 'utf8')
  assert.match(declarations,
    /export function validIssueForPage\(issue: unknown\): boolean/)
  assert.match(declarations,
    /export function validChannelIssue\(issue: unknown, allowedLabels: string\[\]\): boolean/)
})

test('universal validity accepts ordinary, multiple-Channel and Open/Closed Issues', () => {
  for (const labels of [[], ['status:todo'], [{ name: 'channel:discussion' }],
    [{ name: 'channel:discussion' }, { name: 'channel:other' }],
    [{ name: 'channel:unconfigured' }]]) {
    for (const state of ['open', 'closed']) {
      assert.equal(validIssueForPage(issue(1, labels, state)), true)
    }
  }
  assert.equal(validIssueForPage(issue(1, [], 'draft')), false)
  assert.equal(validIssueForPage({ ...issue(), pull_request: {} }), false)
  assert.equal(validIssueForPage(null), false)
  assert.equal(validIssueForPage(issue(0)), false)
  assert.equal(validIssueForPage(issue(1.5)), false)
})

test('independent Channel membership keeps configured single-label validation', () => {
  const allowed = ['channel:discussion']
  assert.equal(validChannelIssue(issue(1, [{ name: 'channel:discussion' }]), allowed), true)
  assert.equal(validChannelIssue(issue(1, []), allowed), false)
  assert.equal(validChannelIssue(issue(1, [{ name: 'channel:other' }]), allowed), false)
  assert.equal(validChannelIssue(issue(1, ['channel:discussion', 'channel:other']), allowed), false)
  assert.equal(validChannelIssue({ ...issue(), pull_request: {} }, allowed), false)
})

test('generic Issue read never calls Config for missing or malformed Config', async () => {
  for (const options of [{}, { badConfig: true }]) {
    for (const labels of [[], ['status:todo'], ['channel:discussion'],
      ['channel:discussion', 'channel:other']]) {
      const { service, calls } = fakeApi(issue(28, labels), options)
      const loaded = await loadIssueContent(service, 'sample', 'repo', 28, new AbortController().signal)
      assert.equal(loaded.issue.number, 28)
      assert.equal(loaded.first.items.length, 1)
      assert.deepEqual(calls, ['issue:sample/repo/28', 'comments:sample/repo/28/1'])
    }
  }
})

test('wrong number, Pull Request and unsupported state do not request comments', async () => {
  for (const object of [issue(99), { ...issue(28), pull_request: {} }, issue(28, [], 'draft')]) {
    const { service, calls } = fakeApi(object)
    assert.equal(await loadIssueContent(service, 'sample', 'repo', 28,
      new AbortController().signal), null)
    assert.deepEqual(calls, ['issue:sample/repo/28'])
  }
})

test('GitHub errors preserve 404, 403, 429 and 502 without Config conversion', async () => {
  for (const status of [404, 403, 429, 502]) {
    const failure = Object.assign(new Error('GitHub error'), { status })
    const { service, calls } = fakeApi(issue(), { fail: failure })
    await assert.rejects(loadIssueContent(service, 'sample', 'repo', 1,
      new AbortController().signal), error => error === failure)
    assert.deepEqual(calls, ['issue:sample/repo/1'])
  }
})

test('cross-repository route switch aborts old read and isolates new target', async () => {
  const controller = new AbortController()
  const delayed = {
    getIssue(_owner, _repo, _number, signal) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
      })
    },
    getComments() { throw new Error('old target comments must not be requested') },
    getConfig() { throw new Error('config must not be requested') },
  }
  const pending = loadIssueContent(delayed, 'old-owner', 'old-repo', 1, controller.signal)
  controller.abort()
  await assert.rejects(pending, /request aborted/)
  const { service, calls } = fakeApi(issue(2))
  const latest = await loadIssueContent(service, 'new-owner', 'new-repo', 2,
    new AbortController().signal)
  assert.equal(latest.issue.number, 2)
  assert.deepEqual(calls, ['issue:new-owner/new-repo/2', 'comments:new-owner/new-repo/2/1'])
})

test('Labour summary remains limited to the selected Issue', async () => {
  const first = fakeApi(issue(1)), second = fakeApi(issue(2))
  const a = await loadIssueContent(first.service, 'sample', 'repo', 1, new AbortController().signal)
  const b = await loadIssueContent(second.service, 'sample', 'repo', 2, new AbortController().signal)
  assert.equal(summarizeIssueComments(a.first.items, true).hours, 0.5)
  assert.equal(summarizeIssueComments(b.first.items, true).hours, 0.5)
  assert.notEqual(a.first.items[0].id, b.first.items[0].id)
})
