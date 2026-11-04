import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const rewrite = config.rewrites[0]
const matches = new RegExp(`^${rewrite.source}$`)

test('SPA routes fall back to the index without changing the URL', () => {
  assert.equal(rewrite.destination, '/index.html')
  for (const path of ['/alice/project', '/alice/project/kanban',
    '/alice/project/issues/12', '/__route-test/alice/project', '/unknown/route/path']) {
    assert.equal(matches.test(path), true, path)
  }
})

test('reserved API, callback and asset paths are not rewritten', () => {
  for (const path of ['/api', '/api/issues', '/api/github-callback',
    '/api/not-found', '/assets/index-abc123.js', '/installation-probe.html',
    '/favicon.ico', '/robots.txt']) {
    assert.equal(matches.test(path), false, path)
  }
})
