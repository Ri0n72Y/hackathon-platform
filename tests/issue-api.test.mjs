import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { resolveInstalledRepository } from '../api/_installation-probe.mjs'
import { issueReadAccess, issueGitHubGet } from '../api/_issue-access.mjs'
import issueDetail from '../api/issue-detail.mjs'
import issueComments from '../api/issue-comments.mjs'
import issueConfig from '../api/issue-config.mjs'
import issuePost from '../api/github-issue-comment.mjs'
import { SESSION_COOKIE, sessionCookie } from '../api/_oauth.mjs'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const env = { GITHUB_APP_ID: '1234',
  GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) }
const repo = { id: 50, private: false, full_name: 'sample/repo',
  owner: { login: 'sample', type: 'User' } }
const installation = { id: 77, account: { login: 'sample' }, suspended_at: null }
const issue = { number: 1, title: 'Full original issue', body: 'Original body', state: 'closed',
  labels: [{ name: 'channel:discussion' }], comments: 101, html_url: 'https://github.com/sample/repo/issues/1',
  user: { login: 'sample' }, extra_field: { preserved: true } }
const result = (status, body, headers = {}) => new Response(
  body === undefined ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json', ...headers } })

function fakeGitHub({ install = true, membership = true, rate = false } = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    const u = new URL(url)
    const path = u.pathname
    const method = options?.method || 'GET'
    calls.push({ path, method, auth: options?.headers?.Authorization, body: options?.body,
      search: u.search })
    assert.equal(u.origin, 'https://api.github.com')
    if (path === '/repos/sample/repo' && method === 'GET') return result(200, repo)
    if (path === '/repos/sample/repo/installation') return install
      ? result(200, installation) : result(404)
    if (path === '/app/installations/77/access_tokens') {
      assert.equal(method, 'POST')
      assert.deepEqual(JSON.parse(options.body).repository_ids, [50])
      return result(201, { token: 'installation-read-token' })
    }
    if (path === '/repos/sample/repo/issues/1' && method === 'GET') {
      return rate ? result(403, { message: 'rate' }, { 'x-ratelimit-remaining': '0' }) :
        result(200, issue)
    }
    if (path === '/repos/sample/repo/issues/1/comments' && method === 'GET') {
      return result(200, [{ id: 111, body: 'Raw GitHub comment', extra: 'preserved' }], {
        link: '<https://api.github.com/repos/sample/repo/issues/1/comments?per_page=100&page=2>; rel="next"',
      })
    }
    if (path === '/repos/sample/repo/issues/1/comments' && method === 'POST') {
      assert.equal(options.headers.Authorization, 'Bearer user-oauth-token')
      return result(201, { id: 12, body: JSON.parse(options.body).body,
        html_url: 'https://github.com/sample/repo/issues/1#issuecomment-12',
        created_at: '2026-11-05T00:00:00Z', user: { login: 'worker' } })
    }
    if (path === '/repos/sample/repo/contents/labourchain.config.yaml') {
      return result(200, { type: 'file', encoding: 'base64',
        content: Buffer.from('channel: [discussion]').toString('base64') })
    }
    if (path === '/user/installations/77/repositories') {
      return result(200, { repositories: membership ? [repo] : [] })
    }
    if (path === '/user') return result(200, { id: 9, login: 'worker' })
    throw new Error('Unexpected GitHub request: ' + method + ' ' + u.href)
  }
  return { calls, fetcher }
}

test('anonymous read validates public repository and resolves dynamic installation', async () => {
  const mock = fakeGitHub()
  const resolved = await resolveInstalledRepository({ owner: 'sample', repo: 'repo',
    env, fetcher: mock.fetcher })
  assert.equal(resolved.installationId, 77)
  const access = await issueReadAccess({ owner: 'sample', repo: 'repo', env,
    fetcher: mock.fetcher })
  const response = await issueGitHubGet(access, '/repos/sample/repo/issues/1')
  assert.deepEqual(response.data, issue)
  assert.ok(mock.calls.some(call => call.path === '/app/installations/77/access_tokens'))
  assert.ok(!mock.calls.some(call => call.path.includes('/user')))
})

test('uninstalled public repository must not become an anonymous read authorization', async () => {
  const mock = fakeGitHub({ install: false })
  await assert.rejects(issueReadAccess({ owner: 'sample', repo: 'repo',
    env, fetcher: mock.fetcher }), error => error.status === 403)
  assert.ok(!mock.calls.some(call => call.path.includes('/access_tokens')))
})

test('raw issue, comments, configuration and pagination are passed through, not summarized', async () => {
  const original = globalThis.fetch
  const previousId = process.env.GITHUB_APP_ID, previousKey = process.env.GITHUB_APP_PRIVATE_KEY
  const mock = fakeGitHub()
  process.env.GITHUB_APP_ID = env.GITHUB_APP_ID
  process.env.GITHUB_APP_PRIVATE_KEY = env.GITHUB_APP_PRIVATE_KEY
  globalThis.fetch = mock.fetcher
  const url = 'https://example.test/api/issue-detail?owner=sample&repo=repo&number=1'
  try {
    const issueRes = await issueDetail.fetch(new Request(url))
    assert.equal(issueRes.status, 200)
    assert.deepEqual(await issueRes.json(), issue)
    const commentsRes = await issueComments.fetch(new Request(url.replace('issue-detail', 'issue-comments')))
    assert.equal(commentsRes.status, 200)
    assert.match(commentsRes.headers.get('link'), /rel="next"/)
    assert.deepEqual(await commentsRes.json(), [{ id: 111, body: 'Raw GitHub comment', extra: 'preserved' }])
    const configRes = await issueConfig.fetch(new Request(url.replace('issue-detail', 'issue-config')))
    assert.equal(configRes.status, 200)
    assert.equal((await configRes.json()).type, 'file')
  } finally {
    globalThis.fetch = original
    process.env.GITHUB_APP_ID = previousId
    process.env.GITHUB_APP_PRIVATE_KEY = previousKey
  }
})

test('429 rate limit is not returned as 404', async () => {
  const original = globalThis.fetch, id = process.env.GITHUB_APP_ID,
    key = process.env.GITHUB_APP_PRIVATE_KEY
  const mock = fakeGitHub({ rate: true })
  process.env.GITHUB_APP_ID = env.GITHUB_APP_ID
  process.env.GITHUB_APP_PRIVATE_KEY = env.GITHUB_APP_PRIVATE_KEY
  globalThis.fetch = mock.fetcher
  try {
    const response = await issueDetail.fetch(new Request(
      'https://example.test/api/issue-detail?owner=sample&repo=repo&number=1'))
    assert.equal(response.status, 429)
  } finally {
    globalThis.fetch = original
    process.env.GITHUB_APP_ID = id
    process.env.GITHUB_APP_PRIVATE_KEY = key
  }
})

test('OAuth comment write checks same origin, session and dynamic membership; uses only user token', async () => {
  const previous = { fetch: globalThis.fetch, ...Object.fromEntries(
    ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_CLIENT_ID',
      'GITHUB_APP_CLIENT_SECRET', 'GITHUB_OAUTH_CALLBACK_URL',
      'GITHUB_OAUTH_COOKIE_KEY', 'GITHUB_INSTALLATION_ID'].map(k => [k, process.env[k]])) }
  const key = randomBytes(32).toString('base64url')
  Object.assign(process.env, { ...env, GITHUB_APP_CLIENT_ID: 'Iv-example',
    GITHUB_APP_CLIENT_SECRET: 'testing-secret',
    GITHUB_OAUTH_CALLBACK_URL: 'https://example.test/api/github-callback',
    GITHUB_OAUTH_COOKIE_KEY: key })
  delete process.env.GITHUB_INSTALLATION_ID
  const cookie = sessionCookie('user-oauth-token', 3600, Buffer.from(key, 'base64url'))
  const request = () => new Request('https://example.test/api/github-issue-comment', {
    method: 'POST', headers: { origin: 'https://example.test',
      'content-type': 'application/json', 'x-labourchain-write': '1',
      cookie: SESSION_COOKIE + '=' + cookie.split('=')[1].split(';')[0] },
    body: JSON.stringify({ owner: 'sample', repo: 'repo', number: 1, body: 'Test comment' }),
  })
  try {
    let mock = fakeGitHub()
    globalThis.fetch = mock.fetcher
    const response = await issuePost.fetch(request())
    assert.equal(response.status, 201, await response.clone().text())
    assert.equal((await response.json()).comment.body, 'Test comment')
    assert.ok(mock.calls.some(call => call.path === '/user/installations/77/repositories'))
    assert.ok(mock.calls.some(call => call.method === 'POST' &&
      call.path === '/repos/sample/repo/issues/1/comments' &&
      call.auth === 'Bearer user-oauth-token'))

    mock = fakeGitHub({ membership: false })
    globalThis.fetch = mock.fetcher
    assert.equal((await issuePost.fetch(request())).status, 403)
    assert.ok(!mock.calls.some(call => call.method === 'POST' &&
      call.path === '/repos/sample/repo/issues/1/comments'))
    const wrongOrigin = request()
    wrongOrigin.headers.set('origin', 'https://evil.example')
    assert.equal((await issuePost.fetch(wrongOrigin)).status, 403)
  } finally {
    globalThis.fetch = previous.fetch
    for (const k of Object.keys(previous)) {
      if (k === 'fetch') continue
      if (previous[k] === undefined) delete process.env[k]
      else process.env[k] = previous[k]
    }
  }
})
