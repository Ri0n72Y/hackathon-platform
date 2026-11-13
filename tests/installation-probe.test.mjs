import './repo-home.test.mjs'
import './config-preview.test.mjs'
import './config-api.test.mjs'
import './config-route.test.mjs'
import './channel-api.test.mjs'
import './channel-ui.test.mjs'
import './repo-ui.test.mjs'
import './repo-theme.test.mjs'
import './api-routing.test.mjs'
import './issue-api.test.mjs'
import './issue-domain.test.mjs'
import './issue-universal.test.mjs'
import './issue-view.test.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { inspectInstallation, appJwt, validRepository, ProbeError } from '../api/_installation-probe.mjs'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const env = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  GITHUB_APP_SLUG: 'labourchain-example',
}
const publicRepo = (owner = 'octocat', type = 'User') => ({
  id: 50, private: false, full_name: owner + '/hello', owner: { login: owner, type },
})
const install = (owner = 'octocat', extra = {}) => ({ id: 17, account: { login: owner },
  html_url: 'https://github.com/settings/installations/17', suspended_at: null, ...extra })
const respond = (status, data, headers = {}) => new Response(data == null ? null : JSON.stringify(data), {
  status, headers,
})
function mock(entries) {
  const calls = []
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname
    calls.push({ path, auth: options.headers.Authorization, redirect: options.redirect })
    assert.equal(new URL(url).origin, 'https://api.github.com')
    assert.equal(options.redirect, 'manual')
    if (!(path in entries)) throw Error('Unexpected GitHub path: ' + path)
    const value = entries[path]
    return typeof value === 'function' ? value() : value
  }
  return { calls, fetcher }
}

test('valid repo rejects slashes and unsafe names', () => {
  assert.equal(validRepository('octocat', 'hello'), true)
  for (const [owner, repo] of [['a/b', 'hello'], ['-bad', 'hello'], ['octocat', '../evil'], ['octocat', '']]) {
    assert.equal(validRepository(owner, repo), false)
  }
})

test('JWT uses App id and signs with RSA', () => {
  const token = appJwt(env, 1720000000000)
  const parts = token.split('.')
  assert.equal(parts.length, 3)
  assert.equal(JSON.parse(Buffer.from(parts[1], 'base64url')).iss, '123456')
  assert.equal(verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), publicKey,
    Buffer.from(parts[2], 'base64url')), true)
})

test('connected repository is found from repository Installation without fixed ID', async () => {
  const m = mock({
    '/repos/octocat/hello': respond(200, publicRepo()),
    '/repos/octocat/hello/installation': respond(200, install()),
  })
  const data = await inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher })
  assert.deepEqual(data, { state: 'connected', repository: 'octocat/hello', account: 'octocat', account_type: 'User' })
  assert.deepEqual(m.calls.map(c => c.path), ['/repos/octocat/hello', '/repos/octocat/hello/installation'])
  assert.ok(!m.calls[0].auth)
  assert.match(m.calls[1].auth, /^Bearer ey/)
  assert.ok(!JSON.stringify(data).includes('17'))
})

test('existing organization Installation but repo not selected uses GitHub manager', async () => {
  const m = mock({
    '/repos/team/hello': respond(200, publicRepo('team', 'Organization')),
    '/repos/team/hello/installation': respond(404),
    '/orgs/team/installation': respond(200, install('team', {
      html_url: 'https://github.com/organizations/team/settings/installations/17',
    })),
  })
  const data = await inspectInstallation({ owner: 'team', repo: 'hello', env, fetcher: m.fetcher })
  assert.equal(data.state, 'needs_repository_authorization')
  assert.equal(data.action_url, 'https://github.com/organizations/team/settings/installations/17')
  assert.deepEqual(m.calls.map(c => c.path), [
    '/repos/team/hello', '/repos/team/hello/installation', '/orgs/team/installation',
  ])
})

test('uninstalled account points at official GitHub App install page', async () => {
  const m = mock({
    '/repos/octocat/hello': respond(200, publicRepo()),
    '/repos/octocat/hello/installation': respond(404),
    '/users/octocat/installation': respond(404),
  })
  const data = await inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher })
  assert.equal(data.state, 'needs_installation')
  assert.equal(data.action_url, 'https://github.com/apps/labourchain-example/installations/new')
})

test('uninstalled account can retrieve app slug from JWT-authenticated /app', async () => {
  const { GITHUB_APP_SLUG, ...noSlug } = env
  const m = mock({
    '/repos/octocat/hello': respond(200, publicRepo()),
    '/repos/octocat/hello/installation': respond(404),
    '/users/octocat/installation': respond(404),
    '/app': respond(200, { slug: 'labourchain-real' }),
  })
  const data = await inspectInstallation({ owner: 'octocat', repo: 'hello', env: noSlug, fetcher: m.fetcher })
  assert.equal(data.action_url, 'https://github.com/apps/labourchain-real/installations/new')
})

test('never leak untrusted GitHub management URLs', async () => {
  const m = mock({
    '/repos/octocat/hello': respond(200, publicRepo()),
    '/repos/octocat/hello/installation': respond(404),
    '/users/octocat/installation': respond(200, install('octocat', {
      html_url: 'https://evil.example/settings/installations/17',
    })),
  })
  const data = await inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher })
  assert.equal(data.state, 'needs_repository_authorization')
  assert.equal(data.action_url, null)
})

test('suspended Installation never returns connected', async () => {
  const m = mock({
    '/repos/octocat/hello': respond(200, publicRepo()),
    '/repos/octocat/hello/installation': respond(200, install('octocat', {
      suspended_at: '2026-11-02T00:00:00Z',
    })),
  })
  const data = await inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher })
  assert.equal(data.state, 'installation_suspended')
})

test('private or missing public repository cannot be treated as connected', async () => {
  for (const first of [respond(200, { ...publicRepo(), private: true }), respond(404)]) {
    const m = mock({ '/repos/octocat/hello': first })
    const data = await inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher })
    assert.equal(data.state, 'repository_unavailable')
    assert.equal(m.calls.length, 1)
  }
})

test('GitHub 403/429 and redirect are not mistaken for no installation', async () => {
  for (const response of [respond(403, { message: 'Forbidden' }), respond(429), respond(301)]) {
    const m = mock({
      '/repos/octocat/hello': respond(200, publicRepo()),
      '/repos/octocat/hello/installation': response,
    })
    await assert.rejects(
      inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher }),
      error => error instanceof ProbeError && error.status >= 400,
    )
  }
})

test('installation response must belong to the requested owner', async () => {
  const m = mock({
    '/repos/octocat/hello': respond(200, publicRepo()),
    '/repos/octocat/hello/installation': respond(200, install('other')),
  })
  await assert.rejects(inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher }),
    error => error instanceof ProbeError && error.status === 502)
})

test('repository metadata must match the exact requested target', async () => {
  const m = mock({ '/repos/octocat/hello': respond(200, {
    ...publicRepo(), full_name: 'octocat/somewhere-else',
  }) })
  await assert.rejects(inspectInstallation({ owner: 'octocat', repo: 'hello', env, fetcher: m.fetcher }),
    error => error instanceof ProbeError && error.status === 502)
  assert.equal(m.calls.length, 1)
})
