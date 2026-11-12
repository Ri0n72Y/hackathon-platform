import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
let vite, TopicPageService
before(async () => {
  vite = await createServer({ root, configFile: false, logLevel: 'silent',
    plugins: [react()], server: { middlewareMode: true } })
  TopicPageService = (await vite.ssrLoadModule('/plugins/topic-page/src/service.ts'))
    .TopicPageService
})
after(async () => { await vite?.close() })

const route = { owner: 'sample', repo: 'repo' }
const report = { title: 'Fixture report', body: 'Read failed' }
const signal = () => new AbortController().signal

test('#31 user report frontend preflight and one explicit POST use only current Topic route', async () => {
  const calls = []
  const fetcher = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    if (url === '/api/github-session') return Response.json({ authenticated: true })
    if (String(url).startsWith('/api/topic-report?')) return Response.json({
      state: 'ready', proof: 'test-proof',
    })
    if (url === '/api/topic-report') return Response.json({
      state: 'created', issue: { number: 71,
        html_url: 'https://github.com/sample/repo/issues/71' },
    }, { status: 201 })
    throw Error('Unexpected URL')
  }
  const api = new TopicPageService(fetcher)
  assert.equal(api.reportAvailable, true)
  assert.equal(await api.getSession(signal()), true)
  const proof = await api.getReportTarget(route, signal())
  assert.equal(proof, 'test-proof')
  const url = await api.submitReport(route, report, proof, signal())
  assert.equal(url, 'https://github.com/sample/repo/issues/71')
  assert.equal(calls.filter(call => call.init.method === 'POST').length, 1)
  const post = calls.find(call => call.init.method === 'POST')
  assert.equal(post.init.headers['X-LabourChain-Write'], '1')
  assert.equal(post.init.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(post.init.body), {
    ...route, ...report, confirmed: true, proof: 'test-proof',
  })
})

test('#31 frontend handles user permission denial with no auto-retry', async () => {
  let posts = 0
  const api = new TopicPageService(async (url, init) => {
    if (init.method === 'POST') {
      posts++
      return Response.json({ state: 'rejected',
        error: '缺少仓库 Issues 写权限', outcomeUnknown: false }, { status: 403 })
    }
    return Response.json({ state: 'ready', proof: 'ok' })
  })
  await assert.rejects(api.submitReport(route, report, 'ok', signal()),
    { status: 403, outcomeUnknown: false })
  assert.equal(posts, 1)
})

test('#31 frontend marks network timeout and unknown server result; never silently replays', async () => {
  for (const errorMode of ['network', 'unknown', 'badCreated']) {
    let posts = 0
    const api = new TopicPageService(async (_url, init) => {
      posts++
      if (errorMode === 'network') throw Error('timeout')
      if (errorMode === 'unknown') return Response.json({
        state: 'unknown', outcomeUnknown: true, error: '请到 GitHub 检查',
      }, { status: 502 })
      return Response.json({ state: 'created', issue: {
        number: 71, html_url: 'https://evil.example/issues/71',
      } }, { status: 201 })
    })
    await assert.rejects(api.submitReport(route, report, 'proof', signal()),
      { outcomeUnknown: true })
    assert.equal(posts, 1)
  }
})

test('#31 frontend report preparation failure does not trigger write', async () => {
  let writes = 0
  const api = new TopicPageService(async (_url, init) => {
    if (init.method === 'POST') writes++
    return Response.json({ state: 'rejected',
      error: 'GitHub 授权失效' }, { status: 401 })
  })
  await assert.rejects(api.getReportTarget(route, signal()), { status: 401 })
  assert.equal(writes, 0)
})
