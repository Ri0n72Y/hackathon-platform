import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import issueRead from '../api/issue-read.mjs'
import repoAccess from '../api/repo-access.mjs'

const issueRoutes = ['issue-detail', 'issue-comments', 'issue-config']
const repoRoutes = ['repo-home', 'repo-feed', 'repo-member-permission',
  'repo-member-register', 'github-installation-probe', 'repo-config', 'repo-channels']

const url = (gateway, route, query = '') =>
  'https://example.test/api/' + gateway + '?__lc_route=' + route + (query ? '&' + query : '')

test('Hobby Function budget: grouped handlers are helpers, only eleven public endpoints', () => {
  const names = readdirSync(new URL('../api/', import.meta.url))
    .filter(name => !name.startsWith('_') && name.endsWith('.mjs'))
  assert.equal(names.length, 11, names.join(', '))
  assert.ok(names.includes('issue-read.mjs'))
  assert.ok(names.includes('repo-access.mjs'))
  for (const name of [...issueRoutes, ...repoRoutes]) {
    assert.ok(!names.includes(name + '.mjs'), name + ' must not deploy independently')
    assert.ok(readdirSync(new URL('../api/', import.meta.url)).includes('_' + name + '.mjs'))
  }
})

test('Vercel rewrites retain each established public URL and the original SPA fallback', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const [spa, ...rewrites] = config.rewrites
  assert.equal(spa.destination, '/index.html')
  assert.equal(new RegExp('^' + spa.source + '$').test('/api/issue-detail'), false)
  assert.equal(new RegExp('^' + spa.source + '$').test('/octocat/repo/issues/1'), true)
  assert.equal(rewrites.length, 10)
  for (const name of issueRoutes) {
    assert.deepEqual(rewrites.find(r => r.source === '/api/' + name),
      { source: '/api/' + name, destination: '/api/issue-read?__lc_route=' + name })
  }
  for (const name of repoRoutes) {
    assert.deepEqual(rewrites.find(r => r.source === '/api/' + name),
      { source: '/api/' + name, destination: '/api/repo-access?__lc_route=' + name })
  }
})

test('grouped Issue handlers preserve their original method guard without GitHub calls', async () => {
  for (const name of issueRoutes) {
    const response = await issueRead.fetch(new Request(url('issue-read', name), { method: 'POST' }))
    assert.equal(response.status, 405, name)
  }
  assert.equal((await issueRead.fetch(new Request(url('issue-read', 'missing')))).status, 404)
})

test('grouped Repo handlers retain method restrictions, including protected writes', async () => {
  for (const name of repoRoutes.filter(name => name !== 'repo-config')) {
    const method = name === 'repo-member-register' ? 'GET' : 'POST'
    const response = await repoAccess.fetch(new Request(url('repo-access', name), { method }))
    assert.equal(response.status, 405, name)
  }
  const configMethod = await repoAccess.fetch(new Request(url('repo-access', 'repo-config'),
    { method: 'OPTIONS' }))
  assert.equal(configMethod.status, 405, 'repo-config')
  assert.equal((await repoAccess.fetch(new Request(url('repo-access', 'missing')))).status, 404)
})

test('grouped readers still pass unchanged target query to original validation', async () => {
  const issueResult = await issueRead.fetch(new Request(url('issue-read', 'issue-detail',
    'owner=wrong/name&repo=repo&number=2')))
  assert.equal(issueResult.status, 400)
  const repoResult = await repoAccess.fetch(new Request(url('repo-access', 'repo-home',
    'owner=wrong/name&repo=repo&branch=main')))
  assert.equal(repoResult.status, 400)
  const configResult = await repoAccess.fetch(new Request(url('repo-access', 'repo-config',
    'owner=wrong/name&repo=repo')))
  assert.equal(configResult.status, 400)
  const channels = await repoAccess.fetch(new Request(url('repo-access', 'repo-channels',
    'owner=wrong/name&repo=repo')))
  assert.equal(channels.status, 400)
})
