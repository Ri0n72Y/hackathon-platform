import test from 'node:test'
import assert from 'node:assert/strict'
import { createTopicProjectsEndpoint } from '../api/_topic-projects.mjs'
import { loadTopicProjectCandidates } from '../plugins/topic-page/src/domain.mjs'

const source = 'sample/repo', config = 'topic: labourchain\nwhitelist: true\n'
const github = text => ({ type: 'file', encoding: 'base64',
  size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64') })
const request = page => new Request(
  'https://labour.test/api/topic-projects?owner=sample&repo=repo&page=' + page)
const meta = {
  repository: { full_name: source }, config: { whitelist: true },
  allowedRepositories: ['member/project-1', 'member/project-2'],
}
function backend({ totalCount = 1400, failPage = 0, incompletePage = 0,
  emptyIncomplete = false } = {}) {
  const calls = [], errors = []
  const fetcher = async (url, opts = {}) => {
    const u = new URL(url)
    if (u.pathname === '/repos/sample/repo') return Response.json({
      private: false, full_name: 'sample/repo',
    })
    if (u.pathname === '/repos/sample/repo/contents/topics.config.yaml')
      return Response.json(github(config))
    if (u.pathname === '/search/repositories') {
      const page = Number(u.searchParams.get('page'))
      calls.push({ page, perPage: u.searchParams.get('per_page'),
        authorization: opts.headers?.Authorization })
      assert.equal(u.searchParams.get('per_page'), '100')
      if (page > 10) throw Error('Search must not request page beyond 10')
      if (page === failPage) return Response.json({}, {
        status: 403, headers: { 'x-ratelimit-remaining': '0' },
      })
      const count = Math.max(0, Math.min(100, totalCount - (page - 1) * 100))
      return Response.json({ total_count: totalCount,
        incomplete_results: page === incompletePage,
        items: Array.from({ length: page === incompletePage && emptyIncomplete ? 0 : count }, (_, index) => {
          const id = (page - 1) * 100 + index + 1
          const full_name = page === 1 && index === 0 ?
            'member/project-1' : 'outside/candidate-' + id
          return { full_name, name: full_name.split('/')[1],
            owner: { login: full_name.split('/')[0] },
            html_url: 'https://github.com/' + full_name,
            private: false, description: 'public', stargazers_count: 0,
            language: 'TypeScript' }
        }),
      })
    }
    errors.push(u.pathname);throw Error('Unexpected GitHub path')
  }
  const endpoint = createTopicProjectsEndpoint({ fetcher })
  const getPage = async page => {
    const res = await endpoint.fetch(request(page))
    const body = await res.json()
    if (!res.ok) throw Object.assign(new Error(body.error), {
      status: res.status, stage: body.stage,
    })
    return body
  }
  return { calls, errors, endpoint, getPage }
}

test('#31 B1 sparse whitelist reaches page 10 within anonymous Search budget and flags 1000 window', async () => {
  const api = backend()
  const result = await loadTopicProjectCandidates(meta, api.getPage,
    new AbortController().signal)
  assert.deepEqual(result.items.map(p => p.full_name), ['member/project-1'])
  assert.equal(result.windowExhausted, true)
  assert.equal(result.ended, true)
  assert.equal(result.pagesRead, 10)
  assert.deepEqual(api.calls.map(c => c.page), [1,2,3,4,5,6,7,8,9,10])
  assert.ok(api.calls.every(c => c.perPage === '100' && !c.authorization))
  assert.equal(api.errors.length, 0)
})

test('#31 B1 exactly 1000 total is true exhaustion, not Search window warning', async () => {
  const api = backend({ totalCount: 1000 })
  const result = await loadTopicProjectCandidates(meta, api.getPage,
    new AbortController().signal)
  assert.equal(result.pagesRead, 10)
  assert.equal(result.ended, true)
  assert.equal(result.windowExhausted, false)
  assert.equal(api.calls.length, 10)
})

test('#31 B1 actual result exhaustion after two pages stops at page 2', async () => {
  const api = backend({ totalCount: 170 })
  const result = await loadTopicProjectCandidates(meta, api.getPage,
    new AbortController().signal)
  assert.equal(result.pagesRead, 2)
  assert.equal(result.windowExhausted, false)
  assert.deepEqual(api.calls.map(c => c.page), [1, 2])
})

test('#31 B1 authenticated errors do not become empty or window-exhausted state', async () => {
  const api = backend({ failPage: 2 })
  await assert.rejects(
    loadTopicProjectCandidates(meta, api.getPage, new AbortController().signal),
    { stage: 'topic-search', status: 429 })
  assert.deepEqual(api.calls.map(c => c.page), [1, 2])
})

test('#31 B1 refuses page 11 before contacting GitHub; stops invalid page-10 hasNext', async () => {
  const api = backend()
  const resp = await api.endpoint.fetch(request(11))
  assert.equal(resp.status, 400)
  assert.deepEqual(api.calls, [])
  const calls = []
  await assert.rejects(
    loadTopicProjectCandidates(meta, async page => {
      calls.push(page)
      return { page, perPage: 100, hasNext: true, windowExhausted: false,
        items: [{ full_name: 'outside/ignored', html_url: 'https://github.com/outside/ignored' }] }
    }), { stage: 'topic-search', status: 502 })
  assert.deepEqual(calls, [1,2,3,4,5,6,7,8,9,10])
})

test('#31 B1-1 HTTP 200 incomplete Search fails closed for empty and nonempty candidate pages', async () => {
  for (const emptyIncomplete of [true, false]) {
    const api = backend({ totalCount: 1, incompletePage: 1, emptyIncomplete })
    const http = await api.endpoint.fetch(request(1))
    assert.equal(http.status, 502)
    const body = await http.json()
    assert.equal(body.stage, 'topic-search')
    assert.equal(body.retryable, true)
    assert.match(body.error, /结果不完整/)
    await assert.rejects(
      loadTopicProjectCandidates(meta, api.getPage, new AbortController().signal),
      { stage: 'topic-search', status: 502, message: /结果不完整/ })
    assert.deepEqual(api.calls.map(call => call.page), [1, 1])
  }
})

test('#31 B1-1 incomplete second Search page never returns first-page candidates', async () => {
  const api = backend({ totalCount: 170, incompletePage: 2 })
  await assert.rejects(
    loadTopicProjectCandidates(meta, api.getPage, new AbortController().signal),
    { stage: 'topic-search', status: 502, message: /结果不完整/ })
  assert.deepEqual(api.calls.map(call => call.page), [1, 2])
})

test('#31 B1-1 Control rejects incomplete pages even if a caller incorrectly returns HTTP success', async () => {
  const calls = []
  await assert.rejects(
    loadTopicProjectCandidates(meta, async page => {
      calls.push(page)
      return { page, perPage: 100, totalCount: 1, hasNext: false,
        windowExhausted: false, incompleteResults: true,
        items: [{ full_name: 'member/project-1',
          html_url: 'https://github.com/member/project-1' }] }
    }, new AbortController().signal),
    { stage: 'topic-search', status: 502, message: /结果不完整/ })
  assert.deepEqual(calls, [1])
})
