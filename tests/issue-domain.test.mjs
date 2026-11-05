import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLabourComment, formatLabourComment, summarizeIssueComments,
  parseIssueLabels, validIssueTarget, validIssueForPage } from '../plugins/issue-detail/src/domain.mjs'

const sha = 'a'.repeat(40)
const labour = (hours, tail = '') => '```yaml\nlabour:\n  work: 测试工时\n  hr: ~' +
  hours + tail + '\n```'
const comment = (id, body) => ({ id, body, created_at: '2026-11-01T00:00:00Z',
  html_url: 'https://github.com/example/repo/issues/1#issuecomment-' + id,
  user: { login: 'worker' } })

test('§9.4 accepts with and without h as numeric hours for 0.5 steps', () => {
  for (const hours of [0.5, 1, 1.5, 3]) {
    assert.equal(parseLabourComment(labour(hours))?.hours, hours)
    assert.equal(parseLabourComment(labour(hours, 'h'))?.hours, hours)
  }
  const result = summarizeIssueComments([comment(1, labour(0.5)),
    comment(2, labour(1, 'h')), comment(3, labour(1.5))], true)
  assert.equal(result.hours, 3)
  assert.equal(result.complete, true)
  assert.equal(result.discussion.length, 0)
})

test('§9.4 multiline work, outcome, commits and RFC 3339 timestamps round-trip', () => {
  const body = formatLabourComment({ work: '第一行\n第二行', hr: 1.5,
    outcome: '结果已验证', commits: [sha], start: '2026-10-22T09:00:00Z',
    end: '2026-10-22T11:00:00Z' })
  assert.deepEqual(parseLabourComment(body), { work: '第一行\n第二行', hours: 1.5,
    outcome: '结果已验证', commits: [sha],
    startEnd: { start: '2026-10-22T09:00:00Z', end: '2026-10-22T11:00:00Z' } })
})

test('invalid YAML, extra fields, bad hour steps and dates remain ordinary discussion', () => {
  for (const body of [
    labour(0), labour(0.3), labour('abc'), labour(1, 'hours'),
    '```yaml\nlabour:\n  work: x\n  hr: ~1h\n  author: forged\n```',
    'prefix\n' + labour(1),
    '```yaml\nlabour:\n  hr: ~1h\n```',
    '```yaml\nlabour:\n  work: x\n  commits:\n    - not-a-sha\n  hr: ~1h\n```',
    '```yaml\nlabour:\n  work: x\n  hr: ~1h\n  start-end:\n    start: "2026-10-22T11:00:00Z"\n    end: "2026-10-22T09:00:00Z"\n```',
  ]) assert.equal(parseLabourComment(body), null, body)
  const result = summarizeIssueComments([comment(1, labour(0.3)), comment(2, '普通聊天')], true)
  assert.equal(result.records.length, 0)
  assert.equal(result.discussion.length, 2)
  assert.equal(result.complete, false)
})

test('one comment with multiple SHAs is one labour record; repeated SHA conflicts exclude hours', () => {
  const a = formatLabourComment({ work: '记录 A', hr: 2, commits: [sha, 'b'.repeat(40)] })
  const b = formatLabourComment({ work: '记录 B', hr: 3, commits: [sha] })
  const c = formatLabourComment({ work: '无 Commit', hr: 0.5 })
  const result = summarizeIssueComments([comment(1, a), comment(2, b),
    comment(3, c), comment(3, c)], true)
  assert.equal(result.records.length, 3)
  assert.deepEqual(result.conflicts, [sha])
  assert.equal(result.records.filter(r => r.conflicted).length, 2)
  assert.equal(result.hours, 0.5)
  assert.equal(result.complete, false)
})

test('URL, exact channel namespace and Open/Closed validation excludes PRs', () => {
  assert.equal(validIssueTarget('sample', 'repo', '28'), true)
  for (const number of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
    assert.equal(validIssueTarget('sample', 'repo', number), false)
  }
  assert.deepEqual(parseIssueLabels('channel: [wishlist, discussion]'),
    ['channel:wishlist', 'channel:discussion'])
  assert.deepEqual(parseIssueLabels('namespaces:\n  channel:\n    - discussion\n'),
    ['channel:discussion'])
  const issue = { number: 1, state: 'closed', labels: [{ name: 'channel:discussion' }] }
  assert.equal(validIssueForPage(issue, ['channel:discussion']), true)
  assert.equal(validIssueForPage({ ...issue, state: 'open' }, ['channel:discussion']), true)
  assert.equal(validIssueForPage({ ...issue, pull_request: {} }, ['channel:discussion']), false)
  assert.equal(validIssueForPage({ ...issue, labels: [{ name: 'channel:discussion' },
    { name: 'channel:other' }] }, ['channel:discussion']), false)
  assert.equal(validIssueForPage({ ...issue, labels: [{ name: 'channel:unknown' }] },
    ['channel:discussion']), false)
})
