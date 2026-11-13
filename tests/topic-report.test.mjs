import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, generateKeyPairSync } from 'node:crypto'
import { createTopicReportEndpoint } from '../api/_topic-report.mjs'
import { resolveInstalledRepository } from '../api/_installation-probe.mjs'

const SITE = 'https://topic.test'
const api = SITE + '/api/topic-report'
const ghRepo = '/repos/sample/repo'
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const appEnv = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
}
function setup(opts = {}) {
  const config = { origin: SITE, key: randomBytes(32) }
  const calls = []
  let now = 1_800_000_000_000
  let appInstalled = opts.appInstalled !== false
  const fetcher = async (url, init = {}) => {
    const path = new URL(url).pathname
    const authorization = init.headers?.Authorization
    const method = init.method || 'GET'
    calls.push({ path, method, authorization, body: init.body || null,
      cookie: init.headers?.cookie })
    const metadata = {
      id: 23, full_name: opts.fullName || 'sample/repo',
      private: opts.private === true,
      owner: { login: 'sample', type: 'User' },
    }
    if (path === ghRepo && !authorization) {
      assert.equal(method, 'GET')
      return Response.json(metadata)
    }
    if (path === ghRepo + '/installation') {
      assert.match(authorization, /^Bearer ey/, 'App JWT only for installation verification')
      assert.equal(method, 'GET')
      if (opts.installationNetworkFailure) throw Error('App installation network failure')
      if (opts.installationStatus) return Response.json({}, { status: opts.installationStatus })
      if (!appInstalled) return Response.json({}, { status: 404 })
      return Response.json({ id: 17, account: { login: 'sample' }, suspended_at: null })
    }
    assert.ok(authorization?.startsWith('Bearer user-'), 'only user token reads and writes')
    assert.ok(!authorization.includes('bot'), 'must not use bot token')
    if (path === '/user/installations/17/repositories') {
      throw Error('Installation list must include explicit pagination')
    }
    if (path === '/user/installations/17/repositories' ||
        path === '/user/installations/17/repositories/') throw Error('Unexpected list route')
    if (path.startsWith('/user/installations/17/repositories')) {
      assert.equal(method, 'GET')
      const page = Number(new URL(url).searchParams.get('page'))
      assert.equal(page, 1)
      if (opts.userInstallNetworkFailure) throw Error('user installation list timeout')
      if (opts.userInstallStatus) return Response.json({}, { status: opts.userInstallStatus })
      if (opts.userInstallMalformed) return Response.json({ repositories: null })
      const repositories = opts.userInstallMissing ? [] :
        [{ id: opts.userInstallWrongId ? 24 : 23,
          full_name: opts.userInstallWrongRepo ? 'other/repo' : 'sample/repo',
          private: false }]
      return Response.json({ total_count: repositories.length, repositories })
    }
    if (path.startsWith('/repos/')) {
      if (path.endsWith('/issues')) {
        assert.equal(method, 'POST')
        if (opts.writeNetworkFailure) throw Error('network timeout after POST')
        if (opts.writeStatus) return Response.json({ message: 'GitHub rejected' },
          { status: opts.writeStatus, headers: opts.writeHeaders || {} })
        if (opts.invalidCreated) return Response.json({
          number: 45, html_url: 'https://evil.test/sample/repo/issues/45',
        }, { status: 201 })
        if (opts.invalidCreatedJson) return new Response('broken json', { status: 201 })
        return Response.json({ number: 45,
          html_url: 'https://github.com/sample/repo/issues/45' }, { status: 201 })
      }
      assert.equal(path, ghRepo, 'must not probe unrelated repository')
      if (opts.repoStatus) return Response.json({ message: 'GitHub error' },
        { status: opts.repoStatus })
      return Response.json({
        ...metadata, has_issues: opts.hasIssues !== false,
        ...(opts.permissionsMissing ? {} : { permissions: {
          triage: opts.canWrite !== false, push: false, maintain: false, admin: false,
        } }),
      })
    }
    throw Error('Unexpected GitHub path ' + path)
  }
  const sessionReader = request => {
    const cookie = request.headers.get('cookie') || ''
    if (cookie.includes('session=alice')) return { token: 'user-alice' }
    if (cookie.includes('session=bob')) return { token: 'user-bob' }
    return null
  }
  const endpoint = createTopicReportEndpoint({ fetcher,
    sessionReader, configReader: () => config, clock: () => now,
    installationResolver: args => resolveInstalledRepository({ ...args, env: appEnv }),
  })
  const preflight = async (person = 'alice', owner = 'sample', repo = 'repo') => {
    const response = await endpoint.fetch(new Request(
      api + '?owner=' + owner + '&repo=' + repo,
      { headers: { cookie: 'session=' + person } }))
    return { response, data: await response.json() }
  }
  const submit = async (proof, changes = {}, headers = {}) => {
    const payload = { owner: 'sample', repo: 'repo', title: 'TopicPage report',
      body: 'Error stage: readme\nHTTP: 502', confirmed: true, proof, ...changes }
    return endpoint.fetch(new Request(api, { method: 'POST', headers: {
      origin: SITE, 'content-type': 'application/json',
      'x-labourchain-write': '1', 'sec-fetch-site': 'same-origin',
      referer: SITE + '/topic/sample/repo', cookie: 'session=alice', ...headers,
    }, body: JSON.stringify(payload) }))
  }
  return { endpoint, calls, preflight, submit, setNow: value => { now = value },
    setAppInstalled: value => { appInstalled = value } }
}

test('#31 OAuth Topic report uses only current user token and creates one verified Issue', async () => {
  const s = setup()
  const { response: pre, data } = await s.preflight()
  assert.equal(pre.status, 200)
  assert.equal(data.state, 'ready')
  assert.equal(typeof data.proof, 'string')
  const res = await s.submit(data.proof)
  const output = await res.json()
  assert.equal(res.status, 201)
  assert.deepEqual(output, { state: 'created', issue: {
    number: 45, html_url: 'https://github.com/sample/repo/issues/45',
  } })
  const writes = s.calls.filter(c => c.method === 'POST')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].path, ghRepo + '/issues')
  assert.equal(writes[0].authorization, 'Bearer user-alice')
  assert.equal(writes[0].cookie, undefined)
  assert.deepEqual(JSON.parse(writes[0].body), {
    title: 'TopicPage report', body: 'Error stage: readme\nHTTP: 502',
  })
})

test('#31 OAuth report requires existing user login; does not accept anonymous writes', async () => {
  const s = setup()
  const missing = await s.endpoint.fetch(new Request(api + '?owner=sample&repo=repo'))
  assert.equal(missing.status, 401)
  const noSession = await s.submit('any', {}, { cookie: '' })
  assert.equal(noSession.status, 401)
  assert.equal(s.calls.length, 0)
})

test('#31 CSRF guards require same-origin URL, Origin, write header, JSON and explicit confirmation', async () => {
  const s = setup()
  const { data } = await s.preflight()
  for (const [payload, headers] of [
    [{}, { origin: 'https://evil.test' }],
    [{}, { 'x-labourchain-write': '0' }],
    [{}, { 'sec-fetch-site': 'cross-site' }],
    [{}, { referer: 'https://topic.test/topic/other/repo' }],
    [{}, { 'content-type': 'text/plain' }],
    [{ confirmed: false }, {}],
    [{ title: '' }, {}],
    [{ body: '' }, {}],
  ]) {
    const res = await s.submit(data.proof, payload, headers)
    assert.ok([400, 403, 415].includes(res.status), 'CSRF/confirmation must fail')
  }
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 0)
})

test('#31 OAuth target proof binds route, expiry and the current user session', async () => {
  const s = setup()
  const { data } = await s.preflight()
  assert.equal((await s.submit(data.proof, {}, { cookie: 'session=bob' })).status, 403)
  assert.equal((await s.submit(data.proof, { owner: 'other' }, {
    referer: SITE + '/topic/other/repo',
  })).status, 403)
  assert.equal((await s.submit('forged-proof')).status, 403)
  s.setNow(1_800_000_601_000)
  assert.equal((await s.submit(data.proof)).status, 403)
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 0)
})

test('#31 OAuth rejects private repos, disabled Issues and absent user write permission', async () => {
  for (const opts of [{ private: true }, { hasIssues: false },
    { canWrite: false }, { permissionsMissing: true },
    { fullName: 'other/repository' }]) {
    const s = setup(opts)
    const pre = await s.preflight()
    assert.ok([403, 410].includes(pre.response.status))
    assert.equal(s.calls.filter(c => c.method === 'POST').length, 0)
  }
})

test('#31 repo/user permission HTTP failures are distinct from create failure', async () => {
  for (const status of [401,403,404,410,422,429,503]) {
    const s = setup({ repoStatus: status })
    const pre = await s.preflight()
    assert.equal(pre.response.status, status >= 500 ? 502 : status)
    assert.notEqual(pre.data.outcomeUnknown, true, 'GET cannot create an Issue')
    assert.equal(s.calls.filter(c => c.method === 'POST').length, 0)
  }
})

test('#31 OAuth rejects secrets, excessive size and arbitrary URLs without forwarding to GitHub', async () => {
  const s = setup()
  const { data } = await s.preflight()
  for (const body of ['Authorization: Bearer abcdef','Cookie: secret=value',
    'github_pat_abcdefghijklm', '__Host-lc-session=encrypted']) {
    const res = await s.submit(data.proof, { body })
    assert.equal(res.status, 422)
    assert.ok(!(await res.text()).includes(body))
  }
  assert.equal((await s.submit(data.proof, { body: 'x'.repeat(21000) })).status, 400)
  assert.equal((await s.submit(data.proof, { destination: 'https://evil.test' })).status, 400)
  assert.equal(s.calls.filter(c => c.method === 'POST').length, 0)
})

test('#31 user-token GitHub create statuses are explicit; 503 is unknown but 422 is rejected', async () => {
  for (const status of [401,403,404,410,422,429,503]) {
    const s = setup({ writeStatus: status,
      writeHeaders: status === 429 ? { 'retry-after': '60' } : {} })
    const { data } = await s.preflight()
    const res = await s.submit(data.proof)
    const body = await res.json()
    assert.equal(res.status, status >= 500 ? 502 : status)
    assert.equal(body.outcomeUnknown, status >= 500)
    if (status === 429) assert.equal(body.retryAfter, '60')
    assert.equal(s.calls.filter(c => c.method === 'POST').length, 1)
  }
})

test('#31 unknown timeout or invalid 201 result cannot trigger silent duplicate POST', async () => {
  for (const opts of [
    { writeNetworkFailure: true }, { invalidCreated: true },
    { invalidCreatedJson: true },
  ]) {
    const s = setup(opts)
    const { data } = await s.preflight()
    const res = await s.submit(data.proof)
    assert.equal(res.status, 502)
    assert.equal((await res.json()).outcomeUnknown, true)
    assert.equal(s.calls.filter(c => c.method === 'POST').length, 1)
  }
})

test('#31 cannot accept methods other than GET preflight or POST write', async () => {
  const s = setup()
  const res = await s.endpoint.fetch(new Request(api, { method: 'PUT' }))
  assert.equal(res.status, 405)
  assert.equal(s.calls.length, 0)
})


test('#31 secondary GitHub 403 with Retry-After is surfaced as 429 without write retry', async () => {
  const s = setup({ writeStatus: 403, writeHeaders: { 'retry-after': '45' } })
  const { data } = await s.preflight()
  const res = await s.submit(data.proof)
  assert.equal(res.status, 429)
  const body = await res.json()
  assert.equal(body.retryAfter, '45')
  assert.equal(body.outcomeUnknown, false)
  assert.equal(s.calls.filter(call => call.method === 'POST').length, 1)
})
