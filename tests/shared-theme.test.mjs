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
const source = file => readFileSync(resolve(root, file), 'utf8')
let vite, theme, App
before(async () => {
  vite = await createServer({ root, configFile: false, logLevel: 'silent',
    plugins: [react()], server: { middlewareMode: true } })
  theme = await vite.ssrLoadModule('/plugins/react-ui/src/theme.ts')
  App = (await vite.ssrLoadModule('/plugins/react-ui/src/index.tsx')).App
})
after(async () => { await vite?.close() })

function mockStorage(initial) {
  const values = new Map(initial == null ? [] : [[theme.THEME_STORAGE_KEY, initial]])
  return {
    values,
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
  }
}

test('#69 Theme preference defaults dark, accepts only dark/light and saves one stable key', () => {
  assert.equal(theme.THEME_STORAGE_KEY, 'labourchain.theme')
  assert.equal(theme.readStoredTheme(null), 'dark')
  for (const [stored, expected] of [
    [undefined, 'dark'], ['light', 'light'], ['dark', 'dark'],
    ['LIGHT', 'dark'], ['system', 'dark'], ['invalid', 'dark'], ['', 'dark'],
  ]) {
    const storage = mockStorage(stored)
    assert.equal(theme.readStoredTheme(storage), expected)
    theme.persistTheme('light', storage)
    assert.equal(storage.values.get('labourchain.theme'), 'light')
    assert.equal(theme.readStoredTheme(storage), 'light')
    theme.persistTheme('dark', storage)
    assert.equal(theme.readStoredTheme(storage), 'dark')
    assert.deepEqual([...storage.values.keys()], ['labourchain.theme'])
  }
})

test('#69 Storage read/write failures fail safely; caller can keep in-memory state', () => {
  let readCount = 0, writeCount = 0
  const unavailable = {
    getItem() { readCount++; throw Error('SecurityError') },
    setItem() { writeCount++; throw Error('QuotaExceededError') },
  }
  assert.equal(theme.readStoredTheme(unavailable), 'dark')
  assert.doesNotThrow(() => theme.persistTheme('light', unavailable))
  assert.equal(readCount, 1)
  assert.equal(writeCount, 1)
  const src = source('plugins/react-ui/src/index.tsx')
  assert.match(src, /setTheme\(next\)/)
  assert.match(src, /persistTheme\(next\)/)
  assert.ok(src.indexOf('setTheme(next)') < src.indexOf('persistTheme(next)'))
})

const paths = ['/', '/sample/repo', '/sample/repo/members',
  '/sample/repo/members/register', '/sample/repo/issues/2',
  '/topic/sample/repo', '/sample/repo/config', '/sample/repo/channels',
  '/totally-missing']

function renderApp(path) {
  const registrations = paths.filter(x => x !== '/' && x !== '/totally-missing')
    .map((name, index) => ({ id: String(index), path: name,
      Component: () => createElement('p', null, '测试业务区域 ' + name) }))
  const ui = { subscribe: () => () => {}, getSnapshot: () => registrations }
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(App, { ui })))
}

test('#69 one Host renders keyboard theme control on all routes including NotFound', () => {
  for (const path of paths) {
    const html = renderApp(path)
    assert.match(html, /data-lc-theme="dark"/)
    assert.match(html, /type="button"/)
    assert.match(html, /当前：深色模式/)
    assert.match(html, /切换为浅色模式/)
    assert.match(html, /aria-label="当前为深色模式，切换为浅色模式"/)
    assert.match(html, /<main/)
    if (path === '/' || path === '/totally-missing') {
      assert.match(html, /页面不存在或暂未提供/)
    } else {
      assert.match(html, /测试业务区域/)
    }
  }
})

test('#69 only Host holds theme state; route, fixture and plugin lifecycles stay untouched', () => {
  const app = source('plugins/react-ui/src/index.tsx')
  const runtime = source('apps/playground/src/runtime.tsx')
  const repo = source('plugins/repo-home/src/RepoHomePage.tsx')
  const main = source('apps/playground/src/main.tsx')
  assert.match(app, /useState<ThemeMode>\(readStoredTheme\)/)
  assert.match(app, /data-lc-theme=\{theme\}/)
  assert.match(app, /useRoutes\(/)
  assert.match(app, /useSyncExternalStore\(/)
  assert.doesNotMatch(app, /window\.location|new Context\(|createRoot\(/)
  assert.match(runtime, /query\.get\('repoFixture'\) === '1'/)
  assert.match(runtime, /query\.get\('repoTheme'\) === 'dark'/)
  assert.match(runtime, /query\.get\('repoTheme'\) === 'light'/)
  assert.match(repo, /data-lc-theme=\{theme\}/)
  assert.doesNotMatch(runtime, /labourchain\.theme|persistTheme/)
  assert.doesNotMatch(repo, /labourchain\.theme|persistTheme/)
  assert.match(main, /createRoot\(/)
  assert.match(main, /<App ui=\{ui\}/)
})

test('#69 semantic palettes are centralized and shared UI uses CSS Modules', () => {
  const tokens = source('plugins/react-ui/src/theme.css')
  const app = source('plugins/react-ui/src/App.module.css')
  const repo = source('plugins/repo-home/src/RepoHome.module.css')
  const dark = tokens.split('[data-lc-theme="dark"]')[1].split('[data-lc-theme="light"]')[0]
  const light = tokens.split('[data-lc-theme="light"]')[1]
  const names = ['canvas', 'surface', 'surface-raised', 'surface-input', 'stroke',
    'stroke-strong', 'text', 'text-secondary', 'text-muted', 'primary',
    'primary-hover', 'on-primary', 'link', 'focus', 'accent-soft', 'accent-ink',
    'error', 'success', 'warning']
  for (const name of names) {
    assert.ok(dark.includes('--lc-' + name + ':'), name + ' missing in Dark')
    assert.ok(light.includes('--lc-' + name + ':'), name + ' missing in Light')
  }
  assert.match(dark, /--lc-primary: #5368e9;/)
  assert.match(dark, /--lc-on-primary: #fff;/)
  assert.match(light, /--lc-primary: #d3e985;/)
  assert.match(light, /--lc-on-primary: #283327;/)
  assert.match(light, /--lc-link: #4a661b;/)
  assert.match(app, /\.themeButton:focus-visible/)
  assert.match(app, /var\(--lc-on-primary\)/)
  assert.match(app, /var\(--lc-focus\)/)
  assert.match(app, /min-height: 44px/)
  assert.doesNotMatch(repo, /--lc-primary:/)
  assert.doesNotMatch(repo, /\.homePage\[data-lc-theme="dark"\]/)
  assert.doesNotMatch(repo, /\.homePage\[data-lc-theme="light"\]/)
})
