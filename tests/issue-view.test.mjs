import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '..')
const viewPath = resolve(root, 'plugins/issue-detail/src/IssueDetailView.tsx')
const controllerPath = resolve(root, 'plugins/issue-detail/src/IssueDetailPage.tsx')
const viewSource = readFileSync(viewPath, 'utf8')
const controllerSource = readFileSync(controllerPath, 'utf8')
let server, View
const actions = {
  onRetry() {}, onRefresh() {}, onLoadMore() {},
  onCommentChange() {}, onLabourChange() {}, onSubmitComment() {}, onSubmitLabour() {},
}
const model = {
  routeKey: 'sample/repo/issues/1',
  navigation: { homeHref: '/', repositoryHref: '/sample/repo', repository: 'sample/repo' },
  load: { phase: 'ready', error: null, statusCode: null },
  issue: {
    number: 1, title: '原始 Issue 标题', state: 'Open',
    author: 'issue-author', created: '2026-11-01T00:00:00Z', updated: '2026-11-03T00:00:00Z',
    body: '原始 Issue 正文', sourceUrl: 'https://github.com/sample/repo/issues/1',
    labourSummary: {
      hours: 1.5, complete: false,
      statusText: '仅为已读取的主观登记工时，非完整汇总。',
      outcome: { text: '实现了讨论组件', author: 'labour-author',
        time: '2026-11-02T00:00:00Z',
        sourceUrl: 'https://github.com/sample/repo/issues/1#issuecomment-7' },
      outcomeEmptyText: '暂无已确认成果',
    },
    pagination: {
      loaded: 1, expected: 101, hasMore: true, fetchingMore: false,
      error: '', lastRead: '2026-11-05T12:00:00Z', warnings: ['还有未加载的评论。'],
      complete: false,
    },
    discussion: {
      comments: [{
        id: 6, author: 'speaker', time: '2026-11-02T00:00:00Z',
        body: '普通评论',
        sourceUrl: 'https://github.com/sample/repo/issues/1#issuecomment-6',
      }],
      emptyText: '暂无讨论',
    },
    labour: {
      records: [{ id: 7, author: 'labour-author', time: '2026-11-02T00:00:00Z',
        work: '代码维护', hours: 1.5, outcome: '实现了讨论组件',
        conflicted: false, occurrence: '未登记',
        sourceUrl: 'https://github.com/sample/repo/issues/1#issuecomment-7', commits: [] }],
      emptyText: '暂无劳动历史', invalidCount: 0,
    },
  },
  form: {
    draft: '草稿不会自动提交',
    labour: { work: '', hours: '0.5', outcome: '', commits: '', start: '', end: '' },
    pending: false, pendingKind: null, notice: null,
    permission: { state: 'anonymous', allowed: false,
      reason: '匿名用户只能阅读，发表评论或登记劳动需登录 GitHub。',
      loginHref: '/api/github-login?return_to=%2Fsample%2Frepo%2Fissues%2F1',
      loginText: 'GitHub 登录' },
  },
}

before(async () => {
  server = await createServer({
    root, configFile: false, logLevel: 'silent',
    plugins: [react()], server: { middlewareMode: true },
  })
  const loaded = await server.ssrLoadModule('/plugins/issue-detail/src/IssueDetailView.tsx')
  View = loaded.default
})
after(async () => { await server?.close() })

test('View/Controller import boundary: View does not reference Router, Cordis, Service or labour domain', () => {
  const imports = [...viewSource.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1])
  assert.ok(imports.includes('./view-model'))
  for (const forbidden of ['react-router', '@deepseek-ai/cordis', './service', './domain.mjs']) {
    assert.ok(!imports.includes(forbidden), forbidden)
  }
  assert.doesNotMatch(viewSource, /\bfetch\s*\(|\buseParams\s*\(|\buseLocation\s*\(|\bservice\s*\./)
  assert.match(controllerSource, /useParams/)
  assert.match(controllerSource, /summarizeIssueComments/)
  assert.match(controllerSource, /service\.postComment/)
})

test('pure View renders identity, outcome, scoped hours and tab relationships without Router or API', () => {
  const html = renderToStaticMarkup(createElement(View, { model, actions }))
  assert.match(html, /原始 Issue 标题/)
  assert.match(html, /实现了讨论组件/)
  assert.match(html, /登记者：labour-author/)
  assert.match(html, /1\.5/)
  assert.match(html, /非完整汇总/)
  assert.match(html, /role="tablist"/)
  assert.match(html, /role="tab"/)
  assert.match(html, /role="tabpanel"/)
  assert.match(html, /aria-controls=/)
  assert.match(html, /aria-labelledby=/)
  assert.match(html, /aria-selected="true"/)
  assert.match(html, /tabindex="-1"/)
  assert.match(html, /hidden=""/)
  assert.match(html, /刷新 Issue 与评论/)
  assert.match(html, /加载下一页评论/)
})

test('pure View places disabled OAuth explanation and login near both forms and preserves draft', () => {
  const html = renderToStaticMarkup(createElement(View, { model, actions }))
  assert.match(html, /草稿不会自动提交/)
  assert.equal((html.match(/匿名用户只能阅读/g) || []).length, 2)
  assert.equal((html.match(/GitHub 登录/g) || []).length, 2)
  assert.equal((html.match(/disabled=""/g) || []).length, 2)
  assert.match(html, /未加载的评论/)
  assert.match(html, /role="status"/)
})

test('pure View renders authorized write controls and contextual failure status', () => {
  const ready = {
    ...model,
    form: { ...model.form, draft: '已经填写',
      labour: { ...model.form.labour, work: '修复表单' },
      notice: { kind: 'comment', tone: 'error', message: 'GitHub 提交失败，草稿已保留。' },
      permission: { state: 'authorized', allowed: true, reason: '',
        loginHref: null, loginText: '' } },
  }
  const html = renderToStaticMarkup(createElement(View, { model: ready, actions }))
  assert.match(html, /GitHub 提交失败，草稿已保留/)
  assert.match(html, /role="alert"/)
  assert.doesNotMatch(html, /匿名用户只能阅读/)
  assert.doesNotMatch(html, /disabled=""/)
})
