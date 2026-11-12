import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '..')
let server, ChannelView, fixtureFactory
before(async () => {
  server = await createServer({ root, configFile: false, logLevel: 'silent',
    plugins: [react()], server: { middlewareMode: true } })
  ChannelView = (await server.ssrLoadModule('/plugins/channel/src/ChannelView.tsx')).default
  fixtureFactory = (await server.ssrLoadModule('/apps/playground/src/channel-fixture.ts'))
    .createChannelFixtureService
})
after(async () => { await server?.close() })

function render(snapshot, error = '') {
  return renderToStaticMarkup(createElement(MemoryRouter, {
    initialEntries: ['/sample/repo/channels'],
  }, createElement(ChannelView, {
    owner: 'sample', repo: 'repo', loading: false, snapshot, error, onRetry: () => {},
  })))
}

test('#28 Channel View navigates only to the selected issue and describes issue-local labour', () => {
  const snapshot = {
    state: 'ready', branch: 'main', headSha: 'a'.repeat(40),
    scannedIssues: 35,
    channels: [{ label: 'channel:discussion', name: 'discussion',
      issue: { number: 1, title: '讨论', createdAt: '2026-11-10T00:00:00Z',
        comments: 4, author: 'writer' } },
    { label: 'channel:wishlist', name: 'wishlist', issue: null }],
  }
  const html = render(snapshot)
  assert.match(html, /href="\/sample\/repo\/issues\/1"/)
  assert.match(html, /劳动历史/)
  assert.match(html, /仅汇总该 Issue/)
  assert.match(html, /当前标签没有有效的 Open Channel Issue/)
  assert.doesNotMatch(html, /issues\/null|issues\/undefined/)
  assert.match(html, /<button type="button"/)
})

test('#28 missing/invalid/incomplete Channel states render explicit safe errors', () => {
  for (const state of ['config_missing', 'invalid_config',
    'no_channels', 'sync_branch_missing', 'snapshot_incomplete']) {
    const html = render({ state, branch: 'main', channels: [] })
    assert.match(html, /频道暂不可用/)
    assert.doesNotMatch(html, /href="\/sample\/repo\/issues\//)
  }
  assert.match(render(null, 'Fixture 429 限流'), /role="alert"/)
})

test('#28 fixture covers success, missing Config, empty Channel, paging and permissions', async () => {
  for (const [mode, expected] of [
    ['ready', 'ready'], ['empty', 'ready'], ['missing', 'config_missing'],
    ['invalid', 'invalid_config'], ['no-channels', 'no_channels'],
    ['incomplete', 'snapshot_incomplete'],
  ]) {
    const api = fixtureFactory(new URLSearchParams({ channelCase: mode }))
    const snapshot = await api.getChannels('sample', 'repo', new AbortController().signal)
    assert.equal(snapshot.state, expected)
    if (mode === 'empty') assert.ok(snapshot.channels.every(c => c.issue === null))
    if (mode === 'ready') assert.equal(snapshot.channels[0].issue.number, 1)
  }
  for (const mode of ['denied', 'failure']) {
    const api = fixtureFactory(new URLSearchParams({ channelCase: mode }))
    await assert.rejects(() => api.getChannels('sample', 'repo',
      new AbortController().signal), { status: mode === 'denied' ? 403 : 429 })
  }
})

test('#28 abortable fixture stops late A response, and Channel Control resets by target key', async () => {
  const api = fixtureFactory(new URLSearchParams({ channelCase: 'slow' }))
  const abort = new AbortController()
  const promise = api.getChannels('sample', 'repo', abort.signal)
  abort.abort()
  await assert.rejects(promise, /Aborted/)
  const plugin = readFileSync(resolve(root, 'plugins/channel/src/index.tsx'), 'utf8')
  const control = readFileSync(resolve(root, 'plugins/channel/src/ChannelPage.tsx'), 'utf8')
  const runtime = readFileSync(resolve(root, 'apps/playground/src/runtime.tsx'), 'utf8')
  assert.match(plugin, /key=\{channelTargetKey\(owner, repo\)\}/)
  assert.match(control, /return \(\) => abort\.abort\(\)/)
  assert.match(control, /if \(!abort\.signal\.aborted\)/)
  assert.match(runtime, /channelFixture/)
  assert.match(runtime, /createIssueFixtureService/)
  assert.match(runtime, /if \(!channelFixture\)/)
})
