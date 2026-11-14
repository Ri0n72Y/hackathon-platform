import test from 'node:test'
import assert from 'node:assert/strict'
import { readmeFields, parseTopicYaml, accumulateTopicProjects,
  validTopicRepository } from '../plugins/topic-page/src/domain.mjs'
import { createTopicPageEndpoint } from '../api/_topic-page.mjs'
import { createTopicProjectsEndpoint } from '../api/_topic-projects.mjs'

const ROOT = '/repos/sample/repo'
const config = 'topic: labourchain\nwhitelist: true\n'
const data = text => ({ type: 'file', encoding: 'base64', size: Buffer.byteLength(text),
  content: Buffer.from(text, 'utf8').toString('base64') })
const respond = (code, body, headers = {}) => Response.json(body, { status: code, headers })
function fixture(options = {}) {
  const calls = [], errors = []
  let projectFileCalls = 0
  const fetcher = async (url, init = {}) => {
    const u = new URL(url)
    calls.push({ path: u.pathname, query: u.search, auth: init.headers?.Authorization })
    assert.equal((init.method || 'GET'), 'GET', 'Topic source must stay read-only')
    if (u.pathname === ROOT) return respond(200, { full_name: 'sample/repo',
      private: options.private === true })
    if (u.pathname === ROOT + '/contents/README.md') return respond(200,
      data('Preamble\n# Real Title\nDescription one\nDescription two\nemail: hi@example.org\ndatetime: Friday'))
    if (u.pathname === ROOT + '/contents/topics.config.yaml') return respond(200,
      data(options.config || config))
    if (u.pathname === ROOT + '/contents/cover.jpg') return respond(404, {})
    if (u.pathname === ROOT + '/contents/projects') return respond(200, [
      { name: 'valid.yaml', path: 'projects/valid.yaml' },
      { name: 'broken.yml', path: 'projects/broken.yml' },
    ])
    if (u.pathname === ROOT + '/contents/projects/valid.yaml') {
      projectFileCalls++; return respond(200, data('repository: Member/Project\n'))
    }
    if (u.pathname === ROOT + '/contents/projects/broken.yml') {
      projectFileCalls++; return respond(503, { message: 'failure' })
    }
    if (u.pathname === '/search/repositories') {
      if (options.rateLimit) return respond(403, {}, { 'x-ratelimit-remaining': '0' })
      return respond(200, { total_count: options.totalCount ?? 1200,
        items: [{ full_name: 'Member/Project', name: 'Project',
          html_url: 'https://github.com/Member/Project', private: false }] })
    }
    throw Error('Unexpected endpoint ' + u.pathname)
  }
  return { calls, errors, fetcher, projectFileCalls: () => projectFileCalls,
    logger: { error: (...args) => errors.push(args) } }
}
const url = endpoint => 'https://example.test/api/' + endpoint + '?owner=sample&repo=repo'

test('#31 README description starts strictly below first H1 and removes only approved footnotes', () => {
  const fields = readmeFields('preamble\nfront matter\n# Actual title\nline A\nline B\nemail: a@example.org\ndatetime: 2026-11-12')
  assert.deepEqual(fields, { title: 'Actual title', description: 'line A\nline B',
    email: 'a@example.org', datetime: '2026-11-12' })
  assert.equal(readmeFields('no heading').description, '')
})

test('#31 Topic YAML is restricted, has whitelist enabled by default, and rejects unknown fields', () => {
  assert.deepEqual(parseTopicYaml('topic: labourchain\n'),
    { topic: 'labourchain', whitelist: true })
  assert.deepEqual(parseTopicYaml('topic: labourchain\nwhitelist: false\n'),
    { topic: 'labourchain', whitelist: false })
  assert.deepEqual(parseTopicYaml('repository: Me/Repo\n', 'project'), {
    repository: 'me/repo' })
  for(const source of ['topic: name\nother: unsafe\n','topic: abc\nwhitelist: yes\n',
    'topic: value\nwhitelist: false\nwhitelist: false\n']) {
    assert.throws(() => parseTopicYaml(source))
  }
  assert.equal(validTopicRepository('a','repo'), true)
  assert.equal(validTopicRepository('../escape', 'repo'), false)
})

test('#31 read-only metadata endpoint logs failed whitelist file without leaking headers', async () => {
  const m = fixture()
  const response = await createTopicPageEndpoint({
    fetcher: m.fetcher, logger: m.logger,
  }).fetch(new Request(url('topic-page')))
  assert.equal(response.status, 200)
  const value = await response.json()
  assert.deepEqual(value.allowedRepositories, ['member/project'])
  assert.equal(value.coverUrl, null)
  assert.equal(m.projectFileCalls(), 2)
  assert.equal(m.errors.length, 1)
  assert.ok(m.errors[0].join(' ').includes('projects/broken.yml'))
  assert.ok(!m.errors[0].join(' ').includes('Bearer'))
  assert.ok(m.calls.every(call => !call.auth), 'public GitHub fetch must not expose OAuth')
  assert.equal(m.calls.some(call => call.path.includes('/issues')), false)
})

test('#31 GitHub Search explicitly exposes 1000 window exhaustion without claiming true end', async () => {
  const m = fixture()
  const endpoint = createTopicProjectsEndpoint({ fetcher: m.fetcher })
  const response = await endpoint.fetch(new Request(url('topic-projects') + '&page=10'))
  assert.equal(response.status, 200)
  const page = await response.json()
  assert.equal(page.hasNext, false)
  assert.equal(page.perPage, 100)
  assert.equal(page.windowExhausted, true)
  assert.equal(page.totalCount, 1200)
  const end = fixture({ totalCount: 27 })
  const final = await createTopicProjectsEndpoint({ fetcher: end.fetcher })
    .fetch(new Request(url('topic-projects') + '&page=1'))
  assert.equal((await final.json()).windowExhausted, false)
})

test('#31 aggregate retries next candidate pages until ten eligible, deduping case-insensitively', () => {
  const meta = { repository: { full_name: 'sample/repo' },
    config: { whitelist: true }, allowedRepositories: Array.from(
      { length: 12 }, (_, i) => 'member/p' + i) }
  const make = name => ({ full_name: name, html_url: 'https://github.com/' + name })
  const pages = [{ hasNext: true, windowExhausted: false, items: [
    make('other/ignored'), make('member/p0'), make('MEMBER/P0'), make('sample/repo')] },
  { hasNext: false, windowExhausted: true, items: Array.from({ length: 8 },
    (_, i) => make('member/p' + (i + 1))) }]
  const result = accumulateTopicProjects(meta, pages)
  assert.equal(result.items.length, 9)
  assert.equal(result.windowExhausted, true)
  assert.equal(result.ended, true)
})

test('#31 source and Search failures remain retryable errors distinct from empty result', async () => {
  const m = fixture({ rateLimit: true })
  const endpoint = createTopicProjectsEndpoint({ fetcher: m.fetcher })
  const response = await endpoint.fetch(new Request(url('topic-projects') + '&page=2'))
  assert.equal(response.status, 429)
  const body = await response.json()
  assert.equal(body.stage, 'topic-search')
  assert.equal(body.retryable, true)
  assert.ok(body.error.includes('限流'))
  const privateRepo = fixture({ private: true })
  const invalid = await createTopicPageEndpoint({ fetcher: privateRepo.fetcher })
    .fetch(new Request(url('topic-page')))
  assert.equal(invalid.status, 404)
})

test('#31 Topic API POST is rejected and source target validation occurs before GitHub', async () => {
  const m = fixture()
  const p = createTopicPageEndpoint({ fetcher: m.fetcher })
  const get = createTopicProjectsEndpoint({ fetcher: m.fetcher })
  assert.equal((await p.fetch(new Request(url('topic-page'), { method: 'POST' }))).status, 405)
  assert.equal((await get.fetch(new Request(url('topic-projects'), { method: 'POST' }))).status, 405)
  const invalidUrl = new URL(url('topic-page'))
  invalidUrl.searchParams.set('repo', '../../evil')
  assert.equal((await p.fetch(new Request(invalidUrl))).status, 400)
  assert.equal((await get.fetch(new Request(url('topic-projects') + '&page=11'))).status, 400)
  assert.equal(m.calls.length, 0)
})
