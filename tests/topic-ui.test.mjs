import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '..')
let server, View, factory
before(async () => {
  server = await createServer({ root, configFile: false, logLevel: 'silent',
    plugins: [react()], server: { middlewareMode: true } })
  View = (await server.ssrLoadModule('/plugins/topic-page/src/TopicPageView.tsx')).default
  factory = (await server.ssrLoadModule('/apps/playground/src/topic-fixture.ts'))
    .createTopicFixtureService
})
after(async () => { await server?.close() })

function render(options = {}) {
  return renderToStaticMarkup(createElement(View, {
    owner: 'sample', repo: 'repo', snapshot: options.snapshot || null,
    projects: options.projects || [], loading: options.loading || false,
    error: options.error || null, windowExhausted: options.windowExhausted || false,
    report: options.report || { open: false, title: '', body: '',
      message: '', pending: false, checking: false, uncertain: false, url: '' },
    canReport: options.canReport || false, writeEnabled: options.writeEnabled || false,
    onRetry() {}, onOpenReport() {}, onCloseReport() {},
    onReportTitleChange() {}, onReportBodyChange() {}, onSubmitReport() {},
  }))
}
const meta = {
  repository: { owner: 'sample', name: 'repo', full_name: 'sample/repo',
    html_url: 'https://github.com/sample/repo' },
  readme: 'Before H1\n# Real Topic\nDescription\nemail: team@example.org\ndatetime: November',
  coverUrl: null,
  config: { topic: 'labourchain', whitelist: true },
  allowedRepositories: ['member/project'],
}
const project = { full_name: 'member/project', name: 'project',
  owner: 'member', description: 'Project', html_url: 'https://github.com/member/project',
  stargazers_count: 1, language: 'TypeScript' }

test('#31 H1 text, footer order and safe public project attribution render in SSR', () => {
  const html = render({ snapshot: meta, projects: [project] })
  assert.match(html, /Real Topic/)
  assert.match(html, /Description/)
  assert.doesNotMatch(html, /Before H1/)
  assert.match(html, /邮箱：team@example.org/)
  assert.ok(html.indexOf('查看官方仓库') < html.indexOf('<footer'))
  assert.match(html, /未核验 LabourChain Installation/)
  assert.match(html, /https:\/\/github.com\/member\/project/)
})

test('#31 Search window exhaustion renders an explicit non-terminal warning', () => {
  const html = render({ snapshot: meta, projects: [project], windowExhausted: true })
  assert.match(html, /1000 条可访问窗口已耗尽/)
  assert.match(html, /无法确认是否还有更多候选/)
  assert.doesNotMatch(html, /当前可访问搜索范围没有符合配置/)
})

test('#31 report failure is visible inside dialog, retains the submitted draft', () => {
  const html = render({ error: Object.assign(new Error('README fetch failed'),
    { stage: 'readme', status: 502, observedAt: '2026-11-12T12:55:00Z' }), canReport: true, writeEnabled: true,
    report: { open: true, title: 'My draft', body: 'Keep this body',
      message: 'Fixture 403 permission denied', pending: false,
      checking: false, uncertain: false, url: '' } })
  const dialog = html.slice(html.indexOf('role="dialog"'))
  assert.match(dialog, /My draft/)
  assert.match(dialog, /Keep this body/)
  assert.match(dialog, /role="alert"/)
  assert.match(dialog, /Fixture 403 permission denied/)
  assert.match(html, /请求时间：2026-11-12T12:55:00Z/)
  assert.match(dialog, /确认提交 Issue/)
})

test('#31 unverified report permission keeps submit disabled with manual GitHub handoff', () => {
  const html = render({ canReport: true,
    report: { open: true, title: 'Draft', body: 'Details',
      message: '', pending: false, url: '' } })
  assert.match(html, /当前不能确认写入权限/)
  assert.match(html, /重新登录 GitHub/)
  assert.match(html, /disabled=""/)
  assert.match(html, /href="https:\/\/github.com\/sample\/repo\/issues\/new"/)
})

test('#31 isolated fixture exercises whitelist, multi-page, 1000-window, retry and report error', async () => {
  const signal = () => new AbortController().signal
  const ready = factory(new URLSearchParams({ topicCase: 'ready' }))
  const meta = await ready.getSnapshot({ owner: 'sample', repo: 'repo' }, signal())
  const first = await ready.getProjects({ owner: 'sample', repo: 'repo' }, 1, signal())
  const second = await ready.getProjects({ owner: 'sample', repo: 'repo' }, 2, signal())
  assert.equal(first.hasNext, true)
  assert.equal(second.hasNext, false)
  assert.equal(meta.config.whitelist, true)
  const empty = factory(new URLSearchParams({ topicCase: 'empty' }))
  assert.deepEqual((await empty.getProjects({ owner: 'sample', repo: 'repo' }, 1, signal())).items, [])
  const window = factory(new URLSearchParams({ topicCase: 'window' }))
  assert.equal((await window.getProjects({ owner: 'sample', repo: 'repo' }, 1, signal())).windowExhausted,false)
  assert.equal((await window.getProjects({ owner: 'sample', repo: 'repo' }, 10, signal())).windowExhausted,true)
  const fail = factory(new URLSearchParams({ topicCase: 'rate-limit' }))
  await assert.rejects(() => fail.getProjects({ owner: 'sample', repo: 'repo' }, 2, signal()),
    { status: 429 })
  const report = factory(new URLSearchParams({ topicCase: 'report-fail', fixtureAuth: '1' }))
  assert.equal(await report.getSession(signal()), true)
  const proof = await report.getReportTarget({ owner: 'sample', repo: 'repo' }, signal())
  await assert.rejects(() => report.submitReport({ owner: 'sample', repo: 'repo' },
    { title: 'Draft', body: 'Keep it' }, proof, signal()), { status: 403 })
})

test('#31 route remount, abort and separate plugin fixture wiring remain in main Runtime', () => {
  const entry = readFileSync(resolve(root, 'plugins/topic-page/src/index.tsx'), 'utf8')
  const control = readFileSync(resolve(root, 'plugins/topic-page/src/TopicPageContainer.tsx'), 'utf8')
  const runtime = readFileSync(resolve(root, 'apps/playground/src/runtime.tsx'), 'utf8')
  assert.match(entry, /path: '\/topic\/:owner\/:repo'/)
  assert.match(entry, /key=\{topicTargetKey\(owner, repo\)\}/)
  assert.match(entry, /ctx.effect/)
  assert.match(control, /return \(\) => abort.abort\(\)/)
  for (const name of ['repoHome', 'repoConfig', 'channelPlugin', 'createIssueDetailPlugin'])
    assert.ok(runtime.includes(name))
  assert.match(runtime, /topicFixture/)
})


test('#31 OAuth report unknown result forces a deliberate confirmation button, preserves draft', () => {
  const html = render({ error: Object.assign(new Error('API failed'),
    { stage: 'source', status: 503 }), canReport: true, writeEnabled: false,
    report: { open: true, pending: false, checking: false, uncertain: true,
      title: 'Keep this title', body: 'Keep this report',
      message: '创建结果未知，请先核查', url: '' } })
  assert.match(html, /我已在 GitHub 核查，允许再次提交/)
  assert.match(html, /Keep this title/)
  assert.match(html, /Keep this report/)
  assert.match(html, /disabled=""/)
  assert.match(html, /创建结果未知，请先核查/)
  assert.ok(html.includes('href="https://github.com/sample/repo/issues"'))
  assert.match(html, /查看现有 Issues/)
})
