import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { FLOW_COOKIE, newFlow, readFlow, validLoginReturnPath } from '../api/_oauth.mjs'

test('OAuth return targets are explicitly allowlisted', () => {
  assert.equal(validLoginReturnPath('/installation-probe.html'), '/installation-probe.html')
  for (const input of ['//evil.example', 'https://evil.example', '/api/github-callback', '/installation-probe.html?next=evil', null]) {
    assert.equal(validLoginReturnPath(input), '/')
  }
})

test('OAuth flow preserves safe return path inside sealed cookie', () => {
  const key = randomBytes(32)
  const flow = newFlow(key, '/installation-probe.html')
  const request = new Request('https://example.test/api/github-callback', {
    headers: { cookie: FLOW_COOKIE + '=' + flow.cookie },
  })
  const details = readFlow(request, key, flow.state)
  assert.equal(details.returnPath, '/installation-probe.html')
  assert.equal(readFlow(request, key, 'invalid'), null)
})

test('default OAuth flow still returns to the home page', () => {
  const key = randomBytes(32)
  const flow = newFlow(key)
  const request = new Request('https://example.test/api/github-callback', {
    headers: { cookie: FLOW_COOKIE + '=' + flow.cookie },
  })
  assert.equal(readFlow(request, key, flow.state).returnPath, '/')
})
