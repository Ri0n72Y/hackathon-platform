import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '..')
const source = path => readFileSync(resolve(root, path), 'utf8')
let vite, Home, fixture, SafeMarkdown

before(async () => {
  vite = await createServer({ root, configFile: false, logLevel: 'silent',
    plugins: [react()], server: { middlewareMode: true } })
  Home = (await vite.ssrLoadModule('/plugins/repo-home/src/RepoHomePage.tsx')).default
  fixture = (await vite.ssrLoadModule('/apps/playground/src/repo-fixture.ts'))
    .createRepoFixtureService
  SafeMarkdown = (await vite.ssrLoadModule('/plugins/repo-home/src/SafeMarkdown.tsx')).SafeMarkdown
})
after(async () => { await vite?.close() })

function renderHome(theme) {
  const api = fixture(new URLSearchParams({ repoFixture: '1', fixtureCase: 'description' }))
  return renderToStaticMarkup(createElement(MemoryRouter, {
    initialEntries: ['/sample/repo'],
  }, createElement(Routes, null, createElement(Route, {
    path: '/:owner/:repo', element: createElement(Home, { api, theme }),
  }))))
}

test('#67 Repo Home controlled SSR exposes isolated Dark/Lime variants, no invented selector', () => {
  for (const theme of ['dark', 'light']) {
    const html = renderHome(theme)
    assert.match(html, new RegExp('data-lc-theme="' + theme + '"'))
    assert.match(html, /团队成员/)
    assert.match(html, /Repo Issue 动态/)
    assert.match(html, /平台首页/)
    assert.doesNotMatch(html, /Pull Requests|功能开发|问题修复|投票|3D/)
  }
  const noTheme = renderHome(undefined)
  assert.doesNotMatch(noTheme, /data-lc-theme=/)
  const runtime = source('apps/playground/src/runtime.tsx')
  assert.match(runtime, /query\.get\('repoFixture'\) === '1'/)
  assert.match(runtime, /query\.get\('repoTheme'\) === 'dark'/)
  assert.match(runtime, /query\.get\('repoTheme'\) === 'light'/)
  assert.doesNotMatch(runtime, /localStorage\.setItem\([^\n]*[Tt]heme/)
})

test('#67 semantic theme tokens require dark white text and Lime dark text without mixed brand colors', () => {
  const css = source('plugins/repo-home/src/RepoHome.module.css')
  const dark = css.split('.homePage[data-lc-theme="dark"]')[1]
    .split('.homePage[data-lc-theme="light"]')[0]
  const lime = css.split('.homePage[data-lc-theme="light"]')[1]
    .split('.homeLayout')[0]
  assert.match(dark, /--lc-primary:#5368e9;/)
  assert.match(dark, /--lc-on-primary:#fff;/)
  assert.match(lime, /--lc-primary:#d3e985;/)
  assert.match(lime, /--lc-on-primary:#283327;/)
  assert.match(lime, /--lc-link:#4a661b;/)
  assert.doesNotMatch(lime, /#5368e9|#5865f2|#fbe13b|#92a6ff/i)
  assert.match(css, /\.homePage \.actions \.primaryLink/)
  assert.match(css, /var\(--lc-on-primary\)/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /max-width:1120px/)
  assert.match(css, /max-width:760px/)
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/)
  assert.match(css, /overflow-x:auto/)
  assert.match(css, /@media\(max-width:680px\)/)
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/)
})

test('#67 fixture theme parameters never change GitHub data or issue ordering', async () => {
  const signal = new AbortController().signal
  const q = name => new URLSearchParams({
    repoFixture: '1', repoTheme: name, fixtureCase: 'description', fixtureCount: '2',
  })
  const dark = fixture(q('dark')), light = fixture(q('light'))
  assert.deepEqual(await dark.getHome('sample','repo','main',signal),
    await light.getHome('sample','repo','main',signal))
  const a = await dark.getFeed('sample','repo',1,signal)
  const b = await light.getFeed('sample','repo',1,signal)
  assert.deepEqual(a,b)
  assert.deepEqual(a.items.map(x => x.state), ['open','closed'])
  assert.ok(a.items.every(x => !x.pull_request))
})

test('#67 Markdown stays in source sequence and uses responsive themed media surfaces', () => {
  const body = '# Real heading\n\nbody [link](https://github.com)\n\n' +
    '```js\nconst x=1\n```\n\n' +
    '![image](https://example.com/p.png)\n\n@[video](https://example.com/v)'
  const html = renderToStaticMarkup(createElement(SafeMarkdown, { body, article: true }))
  for(const label of ['Real heading','body','const x=1','查看图片来源','打开视频']) {
    assert.ok(html.includes(label))
  }
  const indexes = ['Real heading','body','const x=1','查看图片来源','打开视频']
    .map(label => html.indexOf(label))
  assert.deepEqual(indexes,[...indexes].sort((a,b) => a-b))
  assert.doesNotMatch(html, /<iframe|<script/)
  const css = source('plugins/repo-home/src/SafeMarkdown.module.css')
  assert.match(css, /var\(--lc-surface-input/)
  assert.match(css, /max-width:100%/)
  assert.match(css, /overflow-x:auto/)
  assert.match(css, /var\(--lc-link/)
})

test('#67 visual scope leaves GitHub business actions and mounted siblings unchanged', () => {
  const home = source('plugins/repo-home/src/RepoHomePage.tsx')
  const runtime = source('apps/playground/src/runtime.tsx')
  const plugin = source('plugins/repo-home/src/index.tsx')
  for(const pattern of [
    /api\.getHome\(/, /api\.getFeed\(/, /result\.items\.filter\(i => !i\.pull_request/,
    /Date\.parse\(b\.updated_at\)/, /IntersectionObserver/, /setGeneration/,
    /TeamStrip/, /RepoIssueActivityCard/, /完整 README/, /展示分支/,
    /刷新动态/, /加载更多/, /重试本页/,
  ]) assert.match(home,pattern)
  assert.match(plugin, /register\('repo-home-members'/)
  assert.match(plugin, /register\('repo-home-register'/)
  assert.match(runtime, /repoConfig/)
  assert.match(runtime, /channelPlugin/)
  assert.match(runtime, /createIssueDetailPlugin/)
  assert.doesNotMatch(home, /主题切换|localStorage\.setItem\(.*theme/i)
})
