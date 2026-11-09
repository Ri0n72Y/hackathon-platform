import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = resolve(import.meta.dirname, '..')
let server, SafeMarkdown, validateVisibleFields

before(async () => {
  server = await createServer({
    root, configFile: false, logLevel: 'silent',
    plugins: [react()], server: { middlewareMode: true },
  })
  SafeMarkdown = (await server.ssrLoadModule('/plugins/repo-home/src/SafeMarkdown.tsx')).SafeMarkdown
  validateVisibleFields = (await server.ssrLoadModule(
    '/plugins/repo-home/src/MemberRegisterPage.tsx')).validateVisibleFields
})
after(async () => { await server?.close() })

const draft = () => ({
  name: 'Alice', githubUsername: '', role: '', bio: '', avatarUrl: '',
  links: [{ label: '', url: '' }, { label: '', url: '' }, { label: '', url: '' }],
})

test('#51 V1: safe Markdown exposes H1–H6 with distinct scoped level styles', () => {
  const markdown = ['# One', '## Two', '### Three', '#### Four', '##### Five', '###### Six'].join('\n\n')
  const html = renderToStaticMarkup(createElement(SafeMarkdown, { body: markdown }))
  const styles = readFileSync(resolve(root, 'plugins/repo-home/src/SafeMarkdown.module.css'), 'utf8')
  for (let level = 1; level <= 6; level++) {
    assert.match(html, new RegExp('role="heading" aria-level="' + level + '"'))
    assert.ok(styles.includes('.heading[aria-level="' + level + '"]'))
  }
  assert.ok(styles.includes('font-size:1.65em'))
  assert.ok(styles.includes('font-size:1em'))
  assert.doesNotMatch(html, /<script|<iframe/)
})

test('#51 V2: field errors point to name, avatar and the third personal link URL', () => {
  let value = draft()
  value.name = ' '
  assert.match(validateVisibleFields(value).name, /姓名/)
  value = draft()
  value.avatarUrl = 'http://example.com/avatar.png'
  assert.match(validateVisibleFields(value).avatarUrl, /HTTPS/)
  value = draft()
  value.links[2] = { label: 'Website', url: 'javascript:alert(1)' }
  assert.match(validateVisibleFields(value)['links.2.url'], /HTTPS/)
  assert.equal(validateVisibleFields(draft()).name, undefined)
  const valid = draft()
  valid.links[2] = { label: 'Website', url: 'https://example.com' }
  assert.deepEqual(validateVisibleFields(valid), {})
})

test('#51 V2: form keeps inline accessibility links and focuses first invalid input', () => {
  const src = readFileSync(resolve(root, 'plugins/repo-home/src/MemberRegisterPage.tsx'), 'utf8')
  assert.match(src, /fieldRefs\.current\[first\]\?\.focus\(\)/)
  assert.match(src, /aria-invalid=\{Boolean\(fieldErrors\.name\)\}/)
  assert.match(src, /aria-describedby=\{fieldErrors\.name/)
  assert.match(src, /aria-describedby=\{fieldErrors\[urlKey\]/)
  assert.match(src, /setFields\(initial\(\)\); setFieldErrors\(\{\}\); setResult\(null\)/)
  assert.match(src, /validateMemberInput\(fields\)/)
})
