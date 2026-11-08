import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { parseTeamFile, validateMemberInput, appendMemberFile, summarizeReadme, safeHttps } from '../plugins/repo-home/src/domain.mjs'
import { paramsFor } from '../api/_repo-home-access.mjs'
import feedEndpoint from '../api/repo-feed.mjs'
import homeEndpoint from '../api/repo-home.mjs'
import permissionEndpoint from '../api/repo-member-permission.mjs'
import registerEndpoint from '../api/repo-member-register.mjs'
import { seal, SESSION_COOKIE } from '../api/_oauth.mjs'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const key = randomBytes(32)
const credentials = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  GITHUB_APP_CLIENT_ID: 'Iv1234567.mock',
  GITHUB_APP_CLIENT_SECRET: 'mock-secret',
  GITHUB_OAUTH_CALLBACK_URL: 'https://labour.example/api/github-callback',
  GITHUB_OAUTH_COOKIE_KEY: key.toString('base64url'),
}
const repo = { id: 50, private: false, full_name: 'octocat/hello',
  owner: { login: 'octocat', type: 'User' }, name: 'hello', default_branch: 'main',
  html_url: 'https://github.com/octocat/hello', description: null }
const headers = { 'Content-Type': 'application/json' }
const response = (status, data, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { ...headers, ...extra },
})
function makeGitHubMock(options = {}) {
  const calls = [], writes = []
  let conflicted = false
  const fetcher = async (url, init = {}) => {
    const u = new URL(url)
    assert.equal(u.host, 'api.github.com', 'all upstream GitHub calls are absolute API endpoints')
    const path = u.pathname, method = init.method || 'GET'
    calls.push({ method, path, query: u.search, auth: init.headers?.Authorization })
    if (['PUT','POST','PATCH','DELETE'].includes(method)) writes.push({ method, path, body: init.body ? JSON.parse(init.body) : undefined })
    if (method === 'GET' && path === '/repos/octocat/hello') return response(200, repo)
    if (method === 'GET' && path === '/repos/octocat/hello/installation') return response(200,
      { id: 17, account: { login: 'octocat' }, suspended_at: null })
    if (method === 'POST' && path === '/app/installations/17/access_tokens') return response(201,
      { token: method + '-installation-token' })
    if (method === 'GET' && path === '/repos/octocat/hello/branches/main') return response(200,
      { name: 'main', protected: options.protected !== false, commit: { sha: 'abc123' } })
    if (method === 'GET' && path === '/app/installations/17') return response(200,
      { permissions: { contents: options.contents || 'write',
        pull_requests: options.pull_requests || 'write', metadata: 'read' } })
    if (method === 'GET' && path === '/user') return response(200, { id: 100, login: 'operator' })
    if (method === 'GET' && path === '/user/installations/17/repositories') return response(200,
      { repositories: [{ ...repo, permissions: { push: options.push !== false } }] })
    if (method === 'GET' && path === '/repos/octocat/hello/readme') {
      const body = '# hello\n\n![badge](https://example.org/badge.svg)\n\nThis is the introduction.'
      return response(200, { type: 'file', path: 'README.md', size: body.length,
        encoding: 'base64', content: Buffer.from(body).toString('base64') })
    }
    if (method === 'GET' && path === '/repos/octocat/hello/contents/team-member.json') {
      const team = options.team
      if (!team) return response(404, { message: 'Not Found' })
      return response(200, { type: 'file', path: 'team-member.json', sha: 'file-sha',
        size: team.length, encoding: 'base64', content: Buffer.from(team).toString('base64') })
    }
    if (method === 'GET' && path === '/repos/octocat/hello/issues') {
      if (u.searchParams.get('page') === '1') return response(200,
        [{ id: 10, number: 10, pull_request: { url: 'https://example.org/pr' } }],
        { Link: '<https://api.github.com/repos/octocat/hello/issues?page=2>; rel="next"' })
      return response(200, [{ id: 20, number: 20, title: 'A normal issue', body: 'Hello' }])
    }
    if (method === 'POST' && path === '/repos/octocat/hello/git/refs') return response(201,
      { ref: 'refs/heads/labourchain/team-member-123' })
    if (method === 'PUT' && path === '/repos/octocat/hello/contents/team-member.json') {
      if (options.conflict && !conflicted) { conflicted = true; return response(409, { message: 'conflict' }) }
      return response(201, { commit: { sha: 'saved-commit' }, content: { sha: 'new-file-sha' } })
    }
    if (method === 'POST' && path === '/repos/octocat/hello/pulls') return response(201,
      { html_url: 'https://github.com/octocat/hello/pull/17' })
    throw Error('Unexpected request: ' + method + ' ' + url)
  }
  return { fetcher, calls, writes }
}
async function mocked(options, action) {
  const originalFetch = globalThis.fetch
  const previous = Object.fromEntries(Object.keys(credentials).map(k => [k, process.env[k]]))
  const mock = makeGitHubMock(options)
  Object.assign(process.env, credentials)
  globalThis.fetch = mock.fetcher
  try { return await action(mock) }
  finally {
    globalThis.fetch = originalFetch
    for (const [k, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[k]
      else process.env[k] = value
    }
  }
}
const origin = 'https://labour.example'
const session = () => SESSION_COOKIE + '=' + seal({ token: 'user-token', exp: Date.now() + 60_000 }, 'session', key)
const request = (path, init) => new Request(origin + path, init)

test('repo-home: v1 member file distinguishes missing, empty, invalid and duplicate identities', () => {
  assert.equal(parseTeamFile(null).state, 'missing')
  assert.equal(parseTeamFile('{"version":1,"members":[]}').state, 'empty')
  assert.equal(parseTeamFile('{broken').state, 'invalid')
  assert.equal(parseTeamFile('{"version":2,"members":[]}').state, 'invalid')
  assert.equal(parseTeamFile(JSON.stringify({ version: 1, members: [
    { id: 'a', name: 'Alice' }, { id: 'a', name: 'Bob' },
  ] })).state, 'invalid')
  assert.equal(parseTeamFile(JSON.stringify({ version: 1, members: [
    { id: 'a', name: 'Alice', avatarUrl: 'javascript:alert(1)' },
  ] })).state, 'invalid')
})
test('repo-home: registration validates HTTPS, trims fields and never overwrites the file', () => {
  assert.equal(safeHttps('https://example.org/a'), true)
  assert.equal(safeHttps('data:image/png;base64,123'), false)
  assert.throws(() => validateMemberInput({ name: ' ', links: [] }))
  assert.throws(() => validateMemberInput({ name: 'Alice', avatarUrl: 'http://example.org/' }))
  assert.throws(() => validateMemberInput({ name: 'Alice', links: [{ label: 'Bad', url: 'javascript:alert(1)' }] }))
  const input = validateMemberInput({ name: '  New Person  ', githubUsername: 'new-person', bio: ' Hi ' })
  const existing = JSON.stringify({ version: 1, members: [{ id: 'old', name: 'Old Person' }] })
  const next = JSON.parse(appendMemberFile(existing, input, 'uuid'))
  assert.equal(next.members.length, 2)
  assert.equal(next.members[0].id, 'old')
  assert.deepEqual(next.members[1], { id: 'uuid', name: 'New Person', bio: 'Hi', githubUsername: 'new-person' })
  assert.throws(() => appendMemberFile(existing, input, 'old'), /冲突/)
  assert.throws(() => appendMemberFile('{invalid', input, 'uuid'), /JSON/)
})
test('repo-home: README summary rejects title badge navigation and code', () => {
  const source = '# demo\n\n![badge](https://a.example/x.svg)\n\n## Table of Contents\n- [Section](#section)\n\n' +
    '## About\n\nReadable **introduction** with [link](https://example.org)\n\n' +
    '~~~js\nalert(1)\n~~~'
  const value = summarizeReadme(source, 'demo')
  assert.match(value, /Readable introduction with link/)
  assert.doesNotMatch(value, /badge|Section|alert|Table of Contents|# demo/)
  assert.equal(summarizeReadme('# demo\n\n![badge](https://a.example/x.svg)', 'demo'), '')
})
test('repo-home: display branch and page parameter validation is fail-closed', () => {
  assert.equal(paramsFor(request('/api/repo-feed?owner=octocat&repo=hello&page=2'), true).page, 2)
  assert.throws(() => paramsFor(request('/api/repo-home?owner=octocat&repo=hello&branch=../main')))
  assert.throws(() => paramsFor(request('/api/repo-feed?owner=octocat&repo=hello&page=0'), true))
})
test('repo-home: PR-only GitHub page still reports next cursor, followed by normal issue', async () => {
  await mocked({}, async mock => {
    const first = await feedEndpoint.fetch(request('/api/repo-feed?owner=octocat&repo=hello&page=1'))
    assert.equal(first.status, 200)
    assert.deepEqual((await first.json()).items, [])
    const next = await feedEndpoint.fetch(request('/api/repo-feed?owner=octocat&repo=hello&page=2'))
    assert.equal(next.status, 200)
    assert.deepEqual((await next.json()).items.map(i => i.id), [20])
    assert.ok(mock.calls.some(call => call.path === '/app/installations/17/access_tokens'))
  })
})
test('repo-home: README and team states are independent and anonymous GET is installed-scoped', async () => {
  await mocked({}, async () => {
    const result = await homeEndpoint.fetch(request('/api/repo-home?owner=octocat&repo=hello&branch=main'))
    assert.equal(result.status, 200)
    const data = await result.json()
    assert.equal(data.team.state, 'missing')
    assert.equal(data.readme.state, 'ready')
    assert.match(data.readme.content, /introduction/)
    assert.equal(data.repository.full_name, 'octocat/hello')
  })
})
test('repo-home: Bot missing Contents Write rejects an authenticated operator before any mutation', async () => {
  await mocked({ contents: 'read' }, async mock => {
    const result = await permissionEndpoint.fetch(request('/api/repo-member-permission?owner=octocat&repo=hello&branch=main', {
      headers: { Cookie: session() },
    }))
    assert.equal(result.status, 403)
    assert.match((await result.json()).error, /Contents/)
    assert.equal(mock.writes.filter(w => w.path.includes('git/refs') || w.path.endsWith('/pulls') ||
      w.method === 'PUT').length, 0)
  })
})
test('repo-home: protected branch Bot creates reviewable PR with verified OAuth requester', async () => {
  await mocked({ protected: true }, async mock => {
    const result = await registerEndpoint.fetch(request('/api/repo-member-register', {
      method: 'POST', headers: {
        Origin: origin, Cookie: session(), 'Content-Type': 'application/json', 'X-LabourChain-Write': '1',
      },
      body: JSON.stringify({ owner: 'octocat', repo: 'hello', branch: 'main',
        member: { name: 'New', role: 'Reviewer', links: [] }, user: 'spoofed-login' }),
    }))
    assert.equal(result.status, 202)
    const body = await result.json()
    assert.equal(body.status, 'pending_pr')
    assert.equal(body.requestedBy, 'operator')
    const file = mock.writes.find(w => w.method === 'PUT')
    assert.ok(file)
    assert.equal(file.body.branch.startsWith('labourchain/team-member-'), true)
    assert.match(file.body.message, /Requested by @operator/)
    assert.doesNotMatch(file.body.message, /spoofed-login/)
    assert.equal(JSON.parse(Buffer.from(file.body.content, 'base64').toString()).members.length, 1)
    assert.equal(mock.writes.find(w => w.path.endsWith('/pulls')).body.base, 'main')
  })
})
test('repo-home: SHA conflict re-reads and retries without dropping original members', async () => {
  const old = JSON.stringify({ version: 1, members: [{ id: 'old', name: 'Previously added' }] })
  await mocked({ protected: false, conflict: true, team: old }, async mock => {
    const result = await registerEndpoint.fetch(request('/api/repo-member-register', {
      method: 'POST', headers: { Origin: origin, Cookie: session(), 'Content-Type': 'application/json',
        'X-LabourChain-Write': '1' },
      body: JSON.stringify({ owner: 'octocat', repo: 'hello', branch: 'main',
        member: { name: 'New' } }),
    }))
    assert.equal(result.status, 201)
    assert.equal((await result.json()).status, 'committed')
    const attempts = mock.writes.filter(w => w.method === 'PUT')
    assert.equal(attempts.length, 2)
    assert.equal(attempts[0].body.sha, 'file-sha')
    assert.equal(attempts[1].body.sha, 'file-sha')
    const people = JSON.parse(Buffer.from(attempts[1].body.content, 'base64').toString()).members
    assert.equal(people[0].id, 'old')
    assert.equal(people.length, 2)
  })
})
test('repo-home: forged cross-origin submission is rejected before Bot write', async () => {
  await mocked({}, async mock => {
    const result = await registerEndpoint.fetch(request('/api/repo-member-register', {
      method: 'POST', headers: { Origin: 'https://attacker.example', Cookie: session(),
        'Content-Type': 'application/json', 'X-LabourChain-Write': '1' },
      body: JSON.stringify({ owner: 'octocat', repo: 'hello', branch: 'main',
        member: { name: 'N' } }),
    }))
    assert.equal(result.status, 403)
    assert.equal(mock.writes.length, 0)
  })
})
